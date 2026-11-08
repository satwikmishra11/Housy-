import type { Fact } from '@housy/shared';
import { logger } from '../utils/logger.js';
import { llmService } from './llm.service.js';
import {
  normalizeNumerals,
  statesPropertyDetails,
  getLocalClause,
  detectNumberCategory,
} from './guardrails.js';

export interface VerifyReplyClaimsParams {
  replyText: string;
  citedFacts: Fact[];
  conversationId?: string;
}

export interface VerifierResult {
  supported: boolean;
  unsupportedClaims: string[];
}

/**
 * Identify whether a reply is purely conversational (greeting, general clarification)
 * without making factual real-estate or numeric property claims.
 */
export function isConversationalReply(replyText: string, citedFacts: Fact[]): boolean {
  if (citedFacts.length > 0) {
    return false;
  }
  return !statesPropertyDetails(replyText);
}

/**
 * Verify factual claims in the assistant reply against cited facts.
 * Receives ONLY the reply plus cited facts.
 * Returns { supported: boolean, unsupportedClaims: string[] }.
 */
export async function verifyReplyClaims(params: VerifyReplyClaimsParams): Promise<VerifierResult> {
  const { replyText, citedFacts, conversationId } = params;

  // 1. Skip purely conversational replies
  if (isConversationalReply(replyText, citedFacts)) {
    logger.info(
      { conversationId, replyText },
      'Verifier skipped for purely conversational reply (no facts cited or claimed)',
    );
    return { supported: true, unsupportedClaims: [] };
  }

  // 2. Format cited facts into clean reference text
  const factsText = citedFacts
    .map((f) => `- [${f.id}] ${f.title}: ${f.value}`)
    .join('\n');

  // 3. If mock provider is active, run deterministic verification
  const provider = llmService.getProvider();
  if (provider.constructor.name === 'MockProvider') {
    const normalizedReply = normalizeNumerals(replyText);
    const replyMatches = [...normalizedReply.matchAll(/\b\d+(?:\.\d+)?\b/g)];
    const unsupportedClaims: string[] = [];

    const factsWithNormalized = citedFacts.map((fact) => ({
      fact,
      text: normalizeNumerals(`${fact.title}: ${fact.value}`),
    }));

    for (const match of replyMatches) {
      const num = match[0];
      const matchIndex = match.index ?? 0;
      const replyClause = getLocalClause(normalizedReply, matchIndex, num.length);
      const replyCategory = detectNumberCategory(replyClause);

      let found = false;
      for (const { text: factText } of factsWithNormalized) {
        const factTokenRegex = new RegExp(`(?:^|[^0-9a-zA-Z])(${num})(?:$|[^0-9a-zA-Z])`, 'gi');
        const factMatches = [...factText.matchAll(factTokenRegex)];

        for (const fMatch of factMatches) {
          const fMatchIndex = (fMatch.index ?? 0) + (fMatch[0].startsWith(num) ? 0 : 1);
          const factClause = getLocalClause(factText, fMatchIndex, num.length);
          const factCategory = detectNumberCategory(factClause);

          if (!replyCategory || !factCategory || replyCategory === factCategory) {
            found = true;
            break;
          }
        }
        if (found) {
          break;
        }
      }

      if (!found) {
        unsupportedClaims.push(
          `Number token "${num}" (${replyCategory ?? 'unclassified'}) not grounded in cited facts`,
        );
      }
    }

    const supported = unsupportedClaims.length === 0;
    logger.info(
      { supported, unsupportedClaims, conversationId, replyText },
      supported
        ? 'Verifier evaluation passed: claims grounded in cited facts'
        : 'Verifier flagged unsupported claims in reply',
    );
    return { supported, unsupportedClaims };
  }

  // 4. Live LLM Verification call
  try {
    const prompt = `CITED FACTS:
${factsText || 'No facts cited.'}

ASSISTANT REPLY:
${replyText}

Analyze whether all factual claims in the ASSISTANT REPLY are strictly supported by CITED FACTS.
Return ONLY a valid JSON object in this exact format:
{ "supported": true, "unsupportedClaims": [] }
or
{ "supported": false, "unsupportedClaims": ["claim description 1", ...] }`;

    const response = await llmService.chat(
      {
        system:
          'You are an independent factual verifier for a real estate developer. Evaluate the provided reply strictly against cited facts. Do not invent facts or accept claims not present in cited facts.',
        messages: [{ role: 'user', content: prompt }],
      },
      conversationId,
    );

    const text = response.text?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        supported?: boolean;
        unsupportedClaims?: string[];
      };
      const supported = Boolean(parsed.supported);
      const unsupportedClaims = Array.isArray(parsed.unsupportedClaims)
        ? parsed.unsupportedClaims
        : [];

      logger.info(
        { supported, unsupportedClaims, conversationId, replyText },
        supported
          ? 'Live verifier passed: all claims supported by cited facts'
          : 'Live verifier flagged unsupported claims',
      );
      return { supported, unsupportedClaims };
    }

    // Default safe fallback if JSON parse fails
    logger.warn({ conversationId, text }, 'Verifier response not JSON parseable; failing safe');
    return { supported: false, unsupportedClaims: ['Verifier response could not be verified'] };
  } catch (err) {
    logger.error({ err, conversationId }, 'Verifier execution error; failing safe');
    return { supported: false, unsupportedClaims: ['Verifier evaluation failed'] };
  }
}

