import { query } from '../db/index.js';

export interface LogLlmCallParams {
  conversationId?: string | null;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  outcome: 'success' | 'error' | 'timeout' | 'cap_exceeded';
}

export class LlmCallRepository {
  /**
   * Log telemetry for an LLM call. Does NOT store message contents.
   */
  async logCall(params: LogLlmCallParams): Promise<void> {
    await query(
      `INSERT INTO llm_calls (conversation_id, provider, model, latency_ms, input_tokens, output_tokens, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.conversationId ?? null,
        params.provider,
        params.model,
        Math.max(0, Math.round(params.latencyMs)),
        Math.max(0, params.inputTokens),
        Math.max(0, params.outputTokens),
        params.outcome,
      ],
    );
  }

  /**
   * Return the count of LLM calls made today (UTC).
   */
  async getTodayCallCount(): Promise<number> {
    const res = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM llm_calls
       WHERE created_at >= CURRENT_DATE`,
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}

export const llmCallRepository = new LlmCallRepository();
