import { query } from '../db/index.js';

export interface LogLlmCallParams {
  conversationId?: string | null;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  outcome: 'success' | 'error' | 'timeout' | 'cap_exceeded' | string;
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

  /**
   * Return the ISO 8601 timestamp of the most recent successful LLM call, or null.
   */
  async getLastSuccessTime(): Promise<string | null> {
    try {
      const res = await query<{ created_at: string | Date }>(
        `SELECT created_at
         FROM llm_calls
         WHERE outcome = 'success'
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      if (!res.rows[0]) return null;
      const val = res.rows[0].created_at;
      return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Return the error kind/outcome of the most recent failed LLM call, or null.
   */
  async getLastErrorKind(): Promise<string | null> {
    try {
      const res = await query<{ outcome: string }>(
        `SELECT outcome
         FROM llm_calls
         WHERE outcome != 'success'
         ORDER BY created_at DESC
         LIMIT 1`,
      );
      if (!res.rows[0]) return null;
      const outcome = res.rows[0].outcome;
      return outcome.startsWith('error:') ? outcome.replace('error:', '') : outcome;
    } catch {
      return null;
    }
  }
}

export const llmCallRepository = new LlmCallRepository();
