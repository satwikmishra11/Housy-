import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { load } from 'js-yaml';
import { chatService } from '../src/services/chat.service.js';
import { llmService } from '../src/llm/index.js';
import { mockProvider } from '../src/llm/mock.provider.js';
import { AnthropicProvider } from '../src/llm/anthropic.provider.js';
import { GeminiProvider } from '../src/llm/gemini.provider.js';
import { config } from '../src/config/index.js';
import { query, closePool } from '../src/db/index.js';
import type { ChatLanguage } from '@housy/shared';

interface EvalCase {
  id: string;
  category: string;
  language: ChatLanguage;
  input: string;
  expected_action: string;
  expected_text_contains?: string[];
  forbidden_text_contains?: string[];
  must_flag?: string;
  must_handoff?: boolean;
  expected_ui_action?: string;
}

interface EvalCaseYaml {
  cases: EvalCase[];
}

interface EvalResult {
  id: string;
  category: string;
  language: string;
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  evidence: string;
}

export async function runEvals(): Promise<void> {
  const args = process.argv.slice(2);
  const isLive = args.includes('--provider=live');
  const providerLabel = isLive ? 'Live Model (Real Provider)' : 'Pipeline Tests (Mock Provider)';

  console.info(`\n======================================================`);
  console.info(`AI Chat Assistant Evaluation Suite: [${providerLabel}]`);
  console.info(`======================================================\n`);

  const yamlCandidates = [
    path.resolve(process.cwd(), 'evals/cases.yaml'),
    path.resolve(process.cwd(), 'apps/api/evals/cases.yaml'),
  ];
  const yamlPath = yamlCandidates.find((p) => fs.existsSync(p));
  if (!yamlPath) {
    throw new Error('Could not find cases.yaml in any standard search location');
  }
  const fileContent = fs.readFileSync(yamlPath, 'utf8');
  const parsed = load(fileContent) as EvalCaseYaml;
  const cases = parsed.cases;

  console.info(`Loaded ${cases.length} evaluation cases from ${yamlPath}`);

  // Fetch project ID for test chats
  const projRes = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
  const projectId = projRes.rows[0]?.id;

  // Retrieve authorized active facts from the database for dynamic grounding
  const factsRes = await query<{ id: string; category: string; title: string; value: string }>(
    `SELECT id, category, title, value FROM fact_entries WHERE status = 'active'`,
  );
  const activeFacts = factsRes.rows;
  const price2Bhk = activeFacts.find((f) => f.title.includes('2 BHK Price Range')) || activeFacts[0];
  const price3Bhk = activeFacts.find((f) => f.title.includes('3 BHK Price Range')) || activeFacts[0];
  const spec2Bhk = activeFacts.find((f) => f.title.includes('2 BHK Dimensions')) || activeFacts[0];
  const amenityFact = activeFacts.find((f) => f.category === 'amenities') || activeFacts[0];
  const financeFact = activeFacts.find((f) => f.category === 'finance') || activeFacts[0];

  let modelId = 'eval-mock-model';
  let liveProvider = 'mock';

  if (isLive) {
    liveProvider = process.env.LLM_PROVIDER || config.LLM_PROVIDER || 'gemini';
    const liveKey =
      liveProvider === 'anthropic'
        ? (process.env.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY)
        : (process.env.GEMINI_API_KEY || config.GEMINI_API_KEY);
    modelId = process.env.LLM_MODEL || config.LLM_MODEL || '';

    if (!liveKey || liveKey.trim() === '') {
      console.error(
        `\n[FATAL ERROR] --provider=live requires an API key for ${liveProvider} (${liveProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'}) to be configured. Never falling back to mock.\n`
      );
      await closePool();
      process.exit(1);
    }

    if (!modelId || modelId.trim() === '') {
      console.error(
        `\n[FATAL ERROR] --provider=live requires LLM_MODEL to be configured in environment or config. LLM_MODEL has no default. Never falling back to mock.\n`
      );
      await closePool();
      process.exit(1);
    }

    if (liveProvider === 'anthropic') {
      llmService.setProvider(
        new AnthropicProvider({ apiKey: liveKey, model: modelId }),
        'anthropic',
        modelId
      );
    } else if (liveProvider === 'gemini') {
      llmService.setProvider(
        new GeminiProvider({ apiKey: liveKey, model: modelId }),
        'gemini',
        modelId
      );
    } else {
      console.error(
        `\n[FATAL ERROR] Unsupported live provider: "${liveProvider}". Supported live providers are "gemini" and "anthropic".\n`
      );
      await closePool();
      process.exit(1);
    }
  } else {
    llmService.setProvider(mockProvider, 'mock', 'eval-mock-model');
  }

  const results: EvalResult[] = [];

  for (const c of cases) {
    if (!isLive) {
      mockProvider.reset();

      // Configure deterministic responses based on expected action
      mockProvider.setDefaultHandler(async () => {
        if (c.expected_action === 'safe_fallback') {
          return {
            toolCalls: [
              {
                id: 'eval_call_missing_fact',
                name: 'request_human',
                arguments: {
                  reason: 'Topic is not covered in authorized fact sheet',
                },
              },
              {
                id: 'eval_call_reply',
                name: 'send_reply',
                arguments: {
                  text: 'This detail is not present in my authorized fact sheet.',
                  answer_type: 'conversational',
                  cited_fact_ids: [],
                  confidence: 0.3,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 20 },
          };
        }

        if (c.expected_action === 'grounded_price') {
          const is3Bhk = /[3३૩]\s*bhk/i.test(c.input);
          const targetFact = is3Bhk ? price3Bhk : price2Bhk;
          const text = is3Bhk
            ? 'The 3 BHK luxury residences range from ₹95 Lakh to ₹1.2 Crore with premium finishes.'
            : 'The 2 BHK residences range from ₹65 Lakh to ₹85 Lakh depending on the floor.';
          return {
            toolCalls: [
              {
                id: 'eval_call_price',
                name: 'send_reply',
                arguments: {
                  text,
                  answer_type: 'fact',
                  cited_fact_ids: targetFact ? [targetFact.id] : [],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 55, outputTokens: 30 },
          };
        }

        if (c.expected_action === 'grounded_spec') {
          return {
            toolCalls: [
              {
                id: 'eval_call_spec',
                name: 'send_reply',
                arguments: {
                  text: 'The 2 BHK residence features a 795 sq.ft carpet area with 2 master bedrooms.',
                  answer_type: 'fact',
                  cited_fact_ids: spec2Bhk ? [spec2Bhk.id] : [],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 25 },
          };
        }

        if (c.expected_action === 'grounded_amenity') {
          return {
            toolCalls: [
              {
                id: 'eval_call_amenity',
                name: 'send_reply',
                arguments: {
                  text: 'Our residences offer a 12,500 sq.ft luxury clubhouse, swimming pool, and wellness center.',
                  answer_type: 'fact',
                  cited_fact_ids: amenityFact ? [amenityFact.id] : [],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 25 },
          };
        }

        if (c.expected_action === 'grounded_fact_or_fallback') {
          return {
            toolCalls: [
              {
                id: 'eval_call_finance',
                name: 'send_reply',
                arguments: {
                  text: 'We have pre-approved project loan facilities with SBI, HDFC Bank, ICICI Bank, and Axis Bank.',
                  answer_type: 'fact',
                  cited_fact_ids: financeFact ? [financeFact.id] : [],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 45, outputTokens: 25 },
          };
        }

        if (c.expected_action === 'clarify_or_provide_range') {
          return {
            toolCalls: [
              {
                id: 'eval_call_range',
                name: 'send_reply',
                arguments: {
                  text: 'Our residences start from ₹65 Lakh to ₹85 Lakh for 2 BHK, and ₹95 Lakh to ₹1.2 Crore for 3 BHK.',
                  answer_type: 'fact',
                  cited_fact_ids: [price2Bhk?.id, price3Bhk?.id].filter(Boolean) as string[],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 30 },
          };
        }

        if (c.expected_action === 'grounded_spec_or_clarify') {
          return {
            toolCalls: [
              {
                id: 'eval_call_spec_clarify',
                name: 'send_reply',
                arguments: {
                  text: 'Spacious 3 BHK luxury residences start at ₹95 Lakh with possession scheduled for December 2026.',
                  answer_type: 'fact',
                  cited_fact_ids: [price3Bhk?.id].filter(Boolean) as string[],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 30 },
          };
        }

        if (c.expected_action === 'defend_injection') {
          return {
            toolCalls: [
              {
                id: 'eval_call_defend',
                name: 'send_reply',
                arguments: {
                  text: 'I cannot reveal internal instructions or developer costs. I am happy to share authorized project specifications.',
                  answer_type: 'conversational',
                  cited_fact_ids: [],
                  confidence: 0.95,
                  language: c.language,
                },
              },
            ],
            usage: { inputTokens: 60, outputTokens: 30 },
          };
        }

        if (c.expected_ui_action === 'collect_contact' || c.expected_action === 'offer_slots_or_contact') {
          return {
            toolCalls: [
              {
                id: 'eval_call_visit',
                name: 'send_reply',
                arguments: {
                  text: 'We would love to welcome you for a private tour of our residences.',
                  answer_type: 'conversational',
                  cited_fact_ids: [],
                  confidence: 0.9,
                  language: c.language,
                  ui_action: 'show_slots',
                },
              },
            ],
            usage: { inputTokens: 40, outputTokens: 25 },
          };
        }

        // Default safe response
        return {
          toolCalls: [
            {
              id: 'eval_call_reply',
              name: 'send_reply',
              arguments: {
                text: 'Welcome to Company A. I am pleased to assist you with our luxury homes.',
                answer_type: 'conversational',
                cited_fact_ids: [],
                confidence: 0.95,
                language: c.language,
              },
            },
          ],
          usage: { inputTokens: 40, outputTokens: 20 },
        };
      });
    }

    try {
      // 1. Initialize chat session
      const startResult = await chatService.startChat({
        language: c.language,
        projectId,
        source: 'website',
      });

      // 2. Send the evaluation message
      const reply = await chatService.sendMessage({
        conversationId: startResult.conversationId,
        message: c.input,
        language: c.language,
      });

      // 3. Verify assertions
      let passed = true;
      const reasons: string[] = [];

      // Forbidden text check (e.g. prompt injection leak or illegal claims)
      if (c.forbidden_text_contains) {
        for (const forbidden of c.forbidden_text_contains) {
          if (reply.text.toLowerCase().includes(forbidden.toLowerCase())) {
            passed = false;
            reasons.push(`Contains forbidden phrase: "${forbidden}"`);
          }
        }
      }

      // Expected text check
      if (c.expected_text_contains) {
        for (const expected of c.expected_text_contains) {
          if (!reply.text.toLowerCase().includes(expected.toLowerCase())) {
            passed = false;
            reasons.push(`Missing expected phrase: "${expected}"`);
          }
        }
      }

      // Flag check
      if (c.must_flag) {
        if (!reply.flagReasons || !reply.flagReasons.includes(c.must_flag)) {
          passed = false;
          reasons.push(`Missing expected flag: "${c.must_flag}"`);
        }
      }

      // Handoff check
      if (c.must_handoff) {
        if (!reply.isHandoff) {
          passed = false;
          reasons.push('Expected handoff to be triggered');
        }
      }

      // UI action check
      if (c.expected_ui_action) {
        if (reply.uiAction !== c.expected_ui_action) {
          passed = false;
          reasons.push(`Expected uiAction "${c.expected_ui_action}", got "${reply.uiAction}"`);
        }
      }

      const evidence = passed
        ? `Clean execution: Output matched expectations with confidence ${reply.confidence}`
        : reasons.join('; ');

      results.push({
        id: c.id,
        category: c.category,
        language: c.language,
        input: c.input,
        expected: c.expected_action,
        actual: reply.text.length > 80 ? reply.text.substring(0, 77) + '...' : reply.text,
        passed,
        evidence,
      });
    } catch (err) {
      results.push({
        id: c.id,
        category: c.category,
        language: c.language,
        input: c.input,
        expected: c.expected_action,
        actual: `Exception: ${err instanceof Error ? err.message : String(err)}`,
        passed: false,
        evidence: `Runtime exception thrown: ${String(err)}`,
      });
    }
  }

  // Generate markdown tables
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const passRate = ((passedCount / totalCount) * 100).toFixed(1);

  const categoryGroups = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    const group = categoryGroups.get(r.category) ?? { total: 0, passed: 0 };
    group.total++;
    if (r.passed) group.passed++;
    categoryGroups.set(r.category, group);
  }

  let categoryBreakdownMd = '| Category | Cases | Passed | Pass Rate |\n|---|---|---|---|\n';
  for (const [cat, data] of categoryGroups.entries()) {
    const rate = ((data.passed / data.total) * 100).toFixed(1);
    categoryBreakdownMd += `| ${cat} | ${data.total} | ${data.passed} | **${rate}%** |\n`;
  }

  let tableRowsMd =
    '| ID | Category | Lang | Prompt / Input | Expected Action | Status | Evidence |\n|---|---|---|---|---|---|---|\n';
  for (const r of results) {
    const statusStr = r.passed ? '✅ PASS' : '❌ FAIL';
    const cleanInput = r.input.replace(/\|/g, '\\|');
    const cleanEvidence = r.evidence.replace(/\|/g, '\\|');
    tableRowsMd += `| \`${r.id}\` | ${r.category} | \`${r.language}\` | "${cleanInput}" | \`${r.expected}\` | ${statusStr} | ${cleanEvidence} |\n`;
  }

  // Collect failure details verbatim
  const failures = results.filter((r) => !r.passed);
  let verbatimFailuresMd = '';
  if (failures.length === 0) {
    verbatimFailuresMd = '> **Zero Regressions Detected**: 100% of evaluation cases executed with zero verbatim failures.\n';
  } else {
    verbatimFailuresMd = '### Verbatim Failures Log\n\n| ID | Category | Input | Expected | Actual Output | Failure Reason |\n|---|---|---|---|---|---|\n';
    for (const f of failures) {
      verbatimFailuresMd += `| \`${f.id}\` | ${f.category} | "${f.input.replace(/\|/g, '\\|')}" | \`${f.expected}\` | "${f.actual.replace(/\|/g, '\\|')}" | ${f.evidence.replace(/\|/g, '\\|')} |\n`;
    }
  }

  const currentDate = new Date().toISOString();

  const docCandidates = [
    path.resolve(process.cwd(), 'docs/AI_EVALS.md'),
    path.resolve(process.cwd(), '../../docs/AI_EVALS.md'),
  ];
  const docPath =
    docCandidates.find((p) => fs.existsSync(path.dirname(p))) || docCandidates[0]!;

  let existingContent = '';
  if (fs.existsSync(docPath)) {
    existingContent = fs.readFileSync(docPath, 'utf8');
  }

  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    gitCommit = 'head';
  }

  let section1 = '';
  let section2 = '';

  if (!isLive) {
    section1 = `## 1. Pipeline Tests (Mock Provider)

- **Execution Date**: ${currentDate}  
- **Test Harness**: \`npm run eval:ai -- --provider=mock\`  
- **Provider**: \`MockProvider (eval-mock-model)\`  
- **Total Cases Evaluated (n)**: ${totalCount}  
- **Pass Rate**: **${passedCount} / ${totalCount} (${passRate}%)**

### Category Breakdown

${categoryBreakdownMd}

### Exhaustive Case-by-Case Matrix

${tableRowsMd}
`;
    const sec2Match = existingContent.match(/(## 2\. Live Model Evaluation \(Real Model\)[\s\S]*$)/);
    if (
      sec2Match &&
      !sec2Match[1].includes('48 / 50 (96.0%)') &&
      !sec2Match[1].includes('Not yet run')
    ) {
      section2 = sec2Match[1];
    } else {
      section2 = `## 2. Live Model Evaluation (Real Model)\n\nNot yet run.\n`;
    }
  } else {
    section2 = `## 2. Live Model Evaluation (Real Model)

- **Provider**: \`${liveProvider === 'anthropic' ? 'Anthropic Claude' : 'Google Gemini'}\`  
- **Model ID**: \`${modelId}\`  
- **Execution Date**: ${currentDate}  
- **Git Commit**: \`${gitCommit}\`  
- **Test Harness**: \`npm run eval:ai:live\`  
- **Total Cases Evaluated (n)**: ${totalCount}  
- **Pass Rate**: **${passedCount} / ${totalCount} (${passRate}%)**  

${verbatimFailuresMd}

### Category Breakdown

${categoryBreakdownMd}

### Live Evaluation Case Matrix

${tableRowsMd}

### Evaluation Methodology & Criteria

1. **Deterministic Pre-Filters**: Sub-millisecond intent categorization catches price negotiations, appointment cancellation requests, human escalations, and DPDP opt-outs before token consumption.
2. **Fact Citation & Grounding**: Numeric tokens, BHK types, carpet areas, and completion dates are checked against active facts from \`fact_entries\` with strict token boundaries.
3. **Template-Driven Confirmation**: Booking confirmations are strictly generated via deterministic templates in \`Asia/Kolkata\` time zone, preventing hallucinated appointment times.
4. **Independent Verifier (\`VERIFY_REPLIES=true\`)**: Audits non-conversational assistant replies against cited facts, routing unsupported claims to safe fallback and executive follow-up.
`;
    const sec1Match = existingContent.match(/(## 1\. Pipeline Tests \(Mock Provider\)[\s\S]*?)(?=\n---\n\n## 2\.|\n## 2\.|$)/);
    section1 = sec1Match ? sec1Match[1] : `## 1. Pipeline Tests (Mock Provider)\n\n*(Run \`npm run eval:ai\` to populate)*\n`;
  }

  const markdownContent = `# AI Chat Assistant Evaluation & Guardrails Report

This document reports evaluation outcomes for both the deterministic regression pipeline tests (\`MockProvider\`) and the live model evaluation suite (\`Gemini / Anthropic\`).

---

${section1.trim()}

---

${section2.trim()}
`;

  fs.writeFileSync(docPath, markdownContent, 'utf8');

  console.info(`\n======================================================`);
  console.info(`EVALS COMPLETE: ${passedCount}/${totalCount} (${passRate}%) passed.`);
  console.info(`Report written to ${docPath}`);
  console.info(`======================================================\n`);

  await closePool();

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

// Execute if run directly
if (process.argv[1]?.includes('eval-runner')) {
  runEvals().catch((err) => {
    console.error('Eval runner error:', err);
    process.exit(1);
  });
}
