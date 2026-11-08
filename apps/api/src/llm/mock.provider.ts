import type { LLMProvider, LLMChatParams, LLMChatResult } from './llm.types.js';

type MockResponseItem =
  | Partial<LLMChatResult>
  | Error
  | ((params: LLMChatParams) => Promise<LLMChatResult> | LLMChatResult);

export class MockProvider implements LLMProvider {
  private queue: MockResponseItem[] = [];
  private calls: LLMChatParams[] = [];
  private defaultHandler: ((params: LLMChatParams) => Promise<LLMChatResult> | LLMChatResult) | null = null;

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    this.calls.push(params);

    if (params.signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next instanceof Error) {
        throw next;
      }
      if (typeof next === 'function') {
        return next(params);
      }
      return {
        text: next.text,
        toolCalls: next.toolCalls,
        usage: next.usage ?? { inputTokens: 50, outputTokens: 25 },
      };
    }

    if (this.defaultHandler) {
      return this.defaultHandler(params);
    }

    // Default intelligent fallback for tests & mock environments
    const lastUserMessage =
      [...params.messages].reverse().find((m) => m.role === 'user')?.content || '';
    const lowerMsg = lastUserMessage.toLowerCase();
    const isHindi = /[\u0900-\u097F]/.test(lastUserMessage) || lowerMsg.includes('namaste');
    const isGujarati = /[\u0A80-\u0AFF]/.test(lastUserMessage);

    const isVisitRequest =
      lowerMsg.includes('visit') ||
      lowerMsg.includes('વિઝિટ') ||
      lowerMsg.includes('વિઝીટ') ||
      lowerMsg.includes('विज़िट') ||
      lowerMsg.includes('विजिट') ||
      lowerMsg.includes('book') ||
      lowerMsg.includes('બુક') ||
      lowerMsg.includes('बुक') ||
      lowerMsg.includes('slot') ||
      lowerMsg.includes('स्लॉट') ||
      lowerMsg.includes('tour') ||
      lowerMsg.includes('appointment');

    if (isVisitRequest) {
      const replyText = isHindi
        ? 'हम आपके लिए साइट विज़िट निर्धारित करने में प्रसन्न होंगे। कृपया अपना विवरण और समय चुनें।'
        : isGujarati
          ? 'અમે આપના માટે સાઇટ વિઝિટ સુનિશ્ચિત કરવામાં આનંદ અનુભવીશું. કૃપા કરીને આપની વિગતો અને અનુકૂળ સમય પસંદ કરો.'
          : 'I would be delighted to arrange a private site visit for you. Please confirm your details and choose an available time slot below.';

      return {
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'send_reply',
            arguments: {
              text: replyText,
              answer_type: 'conversational',
              ui_action: 'show_slots',
              quick_replies: isHindi
                ? ['2 BHK देखें', '3 BHK लक्ज़री देखें']
                : isGujarati
                  ? ['2 BHK જુઓ', '3 BHK લક્ઝરી જુઓ']
                  : ['Explore 2 BHK', 'Explore 3 BHK Luxury'],
              confidence: 0.95,
              cited_fact_ids: [],
              language: isHindi ? 'hi' : isGujarati ? 'gu' : 'en',
            },
          },
        ],
        usage: { inputTokens: 50, outputTokens: 30 },
      };
    }

    const defaultText = isHindi
      ? 'नमस्ते! कंपनी ए में आपका स्वागत है। आज मैं आपके गृह अनुसंधान में किस प्रकार सहायता कर सकता हूँ?'
      : isGujarati
        ? 'નમસ્તે! કંપની એ માં આપનું સ્વાગત છે. આજે હું આપની ઘરની શોધમાં કેવી રીતે મદદ કરી શકું?'
        : 'Namaste! Welcome to our luxury residences. How may I assist you with your home search today?';

    return {
      text: defaultText,
      usage: { inputTokens: 40, outputTokens: 20 },
    };
  }

  enqueueResponse(item: MockResponseItem): this {
    this.queue.push(item);
    return this;
  }

  setDefaultHandler(handler: (params: LLMChatParams) => Promise<LLMChatResult> | LLMChatResult): this {
    this.defaultHandler = handler;
    return this;
  }

  getCalls(): LLMChatParams[] {
    return [...this.calls];
  }

  clearCalls(): void {
    this.calls = [];
  }

  reset(): void {
    this.queue = [];
    this.calls = [];
    this.defaultHandler = null;
  }
}

export const mockProvider = new MockProvider();
