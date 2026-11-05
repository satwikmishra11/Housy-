import {
  type HandoffSummary,
  type HandoffStatus,
  type HandoffItem,
  type ChatLanguage,
  HandoffSummarySchema,
} from '@housy/shared';
import { query } from '../db/index.js';
import { NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import { handoffRepository, type HandoffRepository } from '../repositories/handoff.repository.js';
import { leadRepository } from '../repositories/lead.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { llmService, type LLMService } from '../llm/llm.service.js';
import { logger } from '../utils/logger.js';

export interface CreateHandoffResult {
  handoffId: string;
  executiveId: string;
  executiveName: string;
  buyerMessage: string;
  summary: HandoffSummary;
}

export class HandoffService {
  constructor(
    private readonly handoffRepo: HandoffRepository = handoffRepository,
    private readonly llm: LLMService = llmService,
  ) {}

  /**
   * Creates a human handoff for a lead.
   * Executive assignment rule:
   *   1. Prefer the executive who owns the confirmed visit slot for this lead.
   *   2. Otherwise, assign the active executive with fewest open assigned leads.
   * Tells the buyer in their language:
   *   "<Executive name> from our sales team will contact you."
   * Generates a strict JSON summary with LLM, falling back to a deterministic template.
   */
  async createHandoff(
    leadId: string,
    reason: string,
    options?: { conversationId?: string; notifyBuyer?: boolean; skipLlm?: boolean },
  ): Promise<CreateHandoffResult> {
    const lead = await leadRepository.findById(leadId);
    if (!lead) {
      throw new NotFoundError(`Lead with ID ${leadId} not found`);
    }

    // 1. Assign executive according to assignment rules
    const executive = await this.handoffRepo.findBestExecutiveForLead(leadId);

    // 2. Resolve active conversation
    let conversationId = options?.conversationId;
    if (!conversationId) {
      const convRes = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [leadId],
      );
      if (convRes.rows[0]) {
        conversationId = convRes.rows[0].id;
      } else {
        const newConv = await chatRepository.createConversation(
          leadId,
          (lead.language as ChatLanguage) || 'en',
        );
        conversationId = newConv.id;
      }
    }

    // 3. Retrieve conversation history & context
    const messages = await chatRepository.getMessages(conversationId);
    const unansweredRes = await query<{ question: string }>(
      `SELECT question FROM unanswered_questions WHERE conversation_id = $1`,
      [conversationId],
    );
    const openQuestions = unansweredRes.rows.map((r) => r.question);

    // 4. Retrieve project info
    let projectName = 'The Palm Residences';
    if (lead.project_id) {
      const projRes = await query<{ name: string }>(
        `SELECT name FROM projects WHERE id = $1`,
        [lead.project_id],
      );
      if (projRes.rows[0]?.name) {
        projectName = projRes.rows[0].name;
      }
    }

    // 5. Retrieve confirmed visit time in Asia/Kolkata
    let visitTimeFormatted: string | null = null;
    const bookingRes = await query<{ starts_at: Date }>(
      `SELECT vs.starts_at
       FROM visit_bookings vb
       JOIN visit_slots vs ON vb.slot_id = vs.id
       WHERE vb.lead_id = $1 AND vb.status = 'confirmed'
       ORDER BY vs.starts_at ASC LIMIT 1`,
      [leadId],
    );

    if (bookingRes.rows[0]?.starts_at) {
      const d = new Date(bookingRes.rows[0].starts_at);
      visitTimeFormatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    }

    // 6. Generate Summary (LLM with strict schema + deterministic fallback)
    const summary = await this.generateSummary({
      lead,
      conversationId,
      projectName,
      visitTimeFormatted,
      openQuestions,
      messages,
      skipLlm: options?.skipLlm,
    });

    // 7. Persist handoff row
    const handoffId = await this.handoffRepo.insertHandoff(
      leadId,
      conversationId,
      executive.id,
      reason,
      summary,
    );

    // 8. Generate buyer notification in the buyer's language
    const lang: ChatLanguage = (lead.language as ChatLanguage) || 'en';
    const localizedBuyerMessages: Record<ChatLanguage, string> = {
      en: `${executive.name} from our sales team will contact you. I have connected you with our sales team.`,
      hi: `${executive.name} हमारी सेल्स टीम से जल्द ही आपसे संपर्क करेंगे। मैंने आपकी बात हमारी सेल्स टीम से जोड़ दी है।`,
      gu: `${executive.name} અમારી સેલ્સ ટીમમાંથી ટૂંક સમયમાં તમારો સંપર્ક કરશે. મેં તમને અમારી સેલ્સ ટીમ સાથે જોડી દીધા છે.`,
    };
    const buyerMessage = localizedBuyerMessages[lang] || localizedBuyerMessages.en;

    // Insert notification message in conversation thread unless suppressed
    if (options?.notifyBuyer !== false) {
      await chatRepository.insertMessage(
        conversationId,
        'assistant',
        buyerMessage,
        [],
        {
          isHandoff: true,
          handoffId,
          executiveId: executive.id,
          executiveName: executive.name,
        },
      );
    }

    logger.info(
      {
        handoffId,
        leadId,
        executiveId: executive.id,
        executiveName: executive.name,
        reason,
      },
      `Created handoff assigned to ${executive.name}`,
    );

    return {
      handoffId,
      executiveId: executive.id,
      executiveName: executive.name,
      buyerMessage,
      summary,
    };
  }

  /**
   * Helper to generate strict JSON summary using LLM, seamlessly falling back
   * to deterministic fields if LLM is unavailable, times out, or fails schema validation.
   */
  private async generateSummary(ctx: {
    lead: {
      name: string;
      phone_e164: string | null;
      language: string;
      wants: string;
      budget_min: string | number | null;
      budget_max: string | number | null;
      timeline: string | null;
    };
    conversationId: string;
    projectName: string;
    visitTimeFormatted: string | null;
    openQuestions: string[];
    messages: Array<{ role: string; content: string }>;
    skipLlm?: boolean;
  }): Promise<HandoffSummary> {
    const { lead, conversationId, projectName, visitTimeFormatted, openQuestions, messages, skipLlm } = ctx;

    const budgetStr =
      lead.budget_min && lead.budget_max
        ? `₹${(Number(lead.budget_min) / 100000).toFixed(0)}L - ₹${(Number(lead.budget_max) / 100000).toFixed(0)}L`
        : 'Not specified';

    const buyerQuestions = messages
      .filter((m) => m.role === 'buyer' && m.content.includes('?'))
      .map((m) => m.content.trim())
      .slice(-4);

    const fallbackSummary: HandoffSummary = {
      name: lead.name || 'Guest Buyer',
      phone: lead.phone_e164 || 'Not provided',
      language: (lead.language as ChatLanguage) || 'en',
      project: projectName,
      wants: lead.wants || '2/3 BHK Apartment',
      budgetRange: budgetStr,
      timeline: lead.timeline || 'Immediate (Next 30 days)',
      keyQuestionsAsked: buyerQuestions.length > 0 ? buyerQuestions : ['Project pricing and availability'],
      openQuestions,
      visitTime: visitTimeFormatted,
      sentiment: visitTimeFormatted ? 'positive' : 'neutral',
    };

    if (skipLlm) {
      return fallbackSummary;
    }

    // Attempt LLM generation
    try {
      const transcript = messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      const systemPrompt = `You are an AI assistant for a luxury real estate developer.
Summarize the buyer's inquiry for a human sales executive.
You MUST output valid JSON conforming strictly to this structure:
{
  "name": string,
  "phone": string,
  "language": "en" | "hi" | "gu",
  "project": string,
  "wants": string,
  "budgetRange": string,
  "timeline": string,
  "keyQuestionsAsked": string[],
  "openQuestions": string[],
  "visitTime": string or null,
  "sentiment": "positive" | "neutral" | "skeptical" | "urgent"
}`;

      const userPrompt = `Lead information:
- Name: ${lead.name}
- Phone: ${lead.phone_e164 || 'Not provided'}
- Language: ${lead.language}
- Project: ${projectName}
- Wants: ${lead.wants}
- Budget: ${budgetStr}
- Timeline: ${lead.timeline || 'Immediate'}
- Scheduled Visit: ${visitTimeFormatted || 'None'}
- Unresolved questions: ${JSON.stringify(openQuestions)}

Conversation transcript:
${transcript || 'No messages exchanged yet.'}

Output ONLY valid JSON.`;

      const response = await this.llm.chat(
        {
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          maxTokens: 500,
        },
        conversationId,
      );

      // Clean JSON formatting
      let rawJson = (response.text || '').trim();
      if (rawJson.startsWith('```')) {
        rawJson = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(rawJson);
      const validated = HandoffSummarySchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
    } catch {
      // Deterministic fallback on LLM failure or parse error
    }

    return fallbackSummary;
  }

  /**
   * List handoffs with role-based filtering.
   * Executive sees only handoffs assigned to them.
   * Sales head sees all handoffs.
   */
  async listHandoffs(
    user: { id: string; role: 'executive' | 'sales_head' },
    filters: { status?: HandoffStatus; limit?: number; offset?: number } = {},
  ): Promise<{ data: HandoffItem[]; totalCount: number }> {
    const executiveId = user.role === 'executive' ? user.id : undefined;

    const result = await this.handoffRepo.findHandoffs({
      executiveId,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });

    return {
      data: result.items,
      totalCount: result.totalCount,
    };
  }

  /**
   * Accept a handoff.
   */
  async acceptHandoff(
    handoffId: string,
    user: { id: string; role: 'executive' | 'sales_head' },
  ): Promise<{ success: boolean; handoff: HandoffItem }> {
    const handoff = await this.handoffRepo.findHandoffById(handoffId);
    if (!handoff) {
      throw new NotFoundError('Handoff not found');
    }

    if (user.role === 'executive' && handoff.executiveId !== user.id) {
      throw new UnauthorizedError('You are not authorized to accept a handoff assigned to another executive');
    }

    await this.handoffRepo.acceptHandoff(handoffId, user.role === 'executive' ? user.id : undefined);

    const updated = await this.handoffRepo.findHandoffById(handoffId);
    return {
      success: true,
      handoff: updated!,
    };
  }

  /**
   * Post a message into conversation thread as the executive.
   * Switches conversation status to 'human' (pauses AI).
   */
  async postMessage(
    handoffId: string,
    user: { id: string; role: 'executive' | 'sales_head'; name: string },
    content: string,
  ): Promise<{ success: boolean; messageId: string }> {
    const handoff = await this.handoffRepo.findHandoffById(handoffId);
    if (!handoff) {
      throw new NotFoundError('Handoff not found');
    }

    if (user.role === 'executive' && handoff.executiveId !== user.id) {
      throw new UnauthorizedError('You are not authorized to post to a handoff assigned to another executive');
    }

    const messageId = await this.handoffRepo.postExecutiveMessage(
      handoff.conversationId,
      user.id,
      content,
    );

    return {
      success: true,
      messageId,
    };
  }
}

export const handoffService = new HandoffService();
