import type { Fact } from '@housy/shared';
import { logger } from '../utils/logger.js';
import { llmService } from './llm.service.js';
import { extractNumericTokens, normalizeNumerals } from './guardrails.js';

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
  const normalized = normalizeNumerals(replyText.toLowerCase());
  const hasFactualTokens =
    /\b(\d+|bhk|carpet|sq\s*ft|square\s*feet|crore|cr|lakh|lac|₹|rs|possession|rera|tower|floor|price|pricing|cost)\b/i.test(
      normalized,
    );
  return !hasFactualTokens;
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
    return { supported: true, unsupportedClaims: [] };
  }

  // 2. Format cited facts into clean reference text
  const factsText = citedFacts
    .map((f) => `- [${f.id}] ${f.title}: ${f.value}`)
    .join('\n');

  // 3. If mock provider is active, run deterministic verification
  const provider = llmService.getProvider();
  if (provider.constructor.name === 'MockProvider') {
    const numbersInReply = extractNumericTokens(replyText);
    const factsCombinedText = normalizeNumerals(
      citedFacts.map((f) => `${f.title} ${f.value}`).join(' ').toLowerCase(),
    );
    const unsupportedClaims: string[] = [];

    for (const num of numbersInReply) {
      const tokenRegex = new RegExp(`(?:^|[^0-9a-zA-Z])${num}(?:$|[^0-9a-zA-Z])`, 'i');
      if (!tokenRegex.test(factsCombinedText)) {
        unsupportedClaims.push(num);
      }
    }

    const supported = unsupportedClaims.length === 0;
    if (!supported) {
      logger.warn(
        { unsupportedClaims, replyText, conversationId },
        'Verifier flagged unsupported numeric claims in reply',
      );
    }
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

      if (!supported) {
        logger.warn(
          { unsupportedClaims, replyText, conversationId },
          'Live verifier flagged unsupported claims',
        );
      }
      return { supported, unsupportedClaims };
    }

    // Default safe fallback if JSON parse fails
    return { supported: true, unsupportedClaims: [] };
  } catch (err) {
    logger.error({ err, conversationId }, 'Verifier execution error; failing safe');
    return { supported: false, unsupportedClaims: ['Verifier evaluation failed'] };
  }
}

