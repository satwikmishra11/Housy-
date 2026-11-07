import {
  type ChatLanguage,
  type ChatStartPayload,
  type ChatStartResponse,
  type ChatMessagePayload,
  type ChatReply,
  type ChatBookPayload,
  type ChatHistoryItem,
  normalizePhone,
} from '@housy/shared';
import { NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { leadRepository } from '../repositories/lead.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { factService } from './fact.service.js';
import { visitService } from './visit.service.js';
import { handoffService } from './handoff.service.js';
import { signBuyerSession } from '../auth/tokens.js';
import {
  detectLanguage,
  runPreFilter,
  getLocalizedFallback,
  verifyPostChecks,
} from '../llm/guardrails.js';
import { runAgentLoop } from '../llm/agent-loop.js';
import { logger } from '../utils/logger.js';

export class ChatService {
  /**
   * Start a new chat session for a buyer, creating or attaching a lead and conversation.
   */
  async startChat(payload: ChatStartPayload): Promise<ChatStartResponse> {
    const language: ChatLanguage = payload.language ?? 'en';

    const greetings: Record<ChatLanguage, string> = {
      en: 'Namaste! Welcome to Company A. How may I assist you with your luxury home search today?',
      hi: 'नमस्ते! कंपनी ए में आपका स्वागत है। आज मैं आपके गृह अनुसंधान में किस प्रकार सहायता कर सकता हूँ?',
      gu: 'નમસ્તે! કંપની એ માં આપનું સ્વાગત છે. આજે હું આપની ઘરની શોધમાં કેવી રીતે મદદ કરી શકું?',
    };

    const quickRepliesMap: Record<ChatLanguage, string[]> = {
      en: ['Explore 2 BHK', 'Explore 3 BHK Luxury', 'Schedule a Site Visit'],
      hi: ['2 BHK देखें', '3 BHK लक्ज़री देखें', 'साइट विज़िट बुक करें'],
      gu: ['2 BHK જુઓ', '3 BHK લક્ઝરી જુઓ', 'સાઇટ વિઝિટ બુક કરો'],
    };

    const greeting = greetings[language] ?? greetings.en;
    const quickReplies = quickRepliesMap[language] ?? quickRepliesMap.en;

    let conversationId: string;
    let leadId: string;

    try {
      // Create an anonymous guest lead for the web session
      const lead = await leadRepository.createLead({
        name: 'Guest Buyer',
        phoneE164: null,
        email: null,
        source: payload.source ?? 'website',
        projectId: payload.projectId ?? null,
        wants: 'Exploring residential projects',
        language,
        status: 'new',
        consentStatus: 'unknown',
      });

      const conversation = await chatRepository.createConversation(lead.id, language);
      conversationId = conversation.id;
      leadId = lead.id;

      // Record greeting assistant message
      await chatRepository.insertMessage(
        conversation.id,
        'assistant',
        greeting,
        [],
        { quickReplies },
      );

      await chatRepository.setFirstResponseAt(lead.id);
    } catch (err) {
      logger.error({ err }, 'Database error during chat start');
      const serviceUnavailableMessages: Record<ChatLanguage, string> = {
        en: 'Our chat advisory service is temporarily unavailable. Please try again shortly.',
        hi: 'हमारी चैट परामर्श सेवा अस्थायी रूप से अनुपलब्ध है। कृपया कुछ समय बाद पुनः प्रयास करें।',
        gu: 'અમારી ચેટ સલાહકાર સેવા અસ્થાયી રૂપે અનુપલબ્ધ છે. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.',
      };
      throw new ServiceUnavailableError(serviceUnavailableMessages[language] ?? serviceUnavailableMessages.en);
    }

    const sessionToken = await signBuyerSession({
      conversationId,
      leadId,
    });

    return {
      success: true,
      conversationId,
      leadId,
      sessionToken,
      language,
      greeting,
      quickReplies,
    };
  }

  /**
   * Process a message sent by a buyer through pre-filters, agent loop, post-checks, and persistence.
   */
  async sendMessage(payload: ChatMessagePayload): Promise<ChatReply> {
    const conversation = await chatRepository.findConversationById(payload.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const lead = await leadRepository.findById(conversation.lead_id);
    if (!lead) {
      throw new NotFoundError('Lead not found for conversation');
    }

    const currentLang = (conversation.language as ChatLanguage) || 'en';
    const targetLang: ChatLanguage =
      payload.language ?? detectLanguage(payload.message, currentLang);

    if (targetLang !== currentLang) {
      await chatRepository.updateLanguage(conversation.id, targetLang);
    }

    // 1. Record incoming buyer message
    await chatRepository.insertMessage(
      conversation.id,
      'buyer',
      payload.message,
    );

    // 2. Check Opt-Out Status
    if (lead.opted_out_at) {
      const optOutReply: ChatReply = {
        text: 'You have unsubscribed from automated messages. A human representative will assist you if needed.',
        language: targetLang,
        confidence: 1.0,
        citedFactIds: [],
        conversationId: conversation.id,
      };
      await chatRepository.insertMessage(
        conversation.id,
        'assistant',
        optOutReply.text,
      );
      return optOutReply;
    }

    // 3. Run Pre-Filter
    const preFilter = runPreFilter(payload.message, targetLang);
    if (preFilter.triggered) {
      if (preFilter.type === 'opt_out') {
        await chatRepository.optOutLead(lead.id);
        const reply: ChatReply = {
          text: preFilter.responseText!,
          language: preFilter.language ?? targetLang,
          confidence: 1.0,
          citedFactIds: [],
          conversationId: conversation.id,
        };
        await chatRepository.insertMessage(
          conversation.id,
          'assistant',
          reply.text,
        );
        return reply;
      }

      if (preFilter.type === 'human_requested') {
        await chatRepository.flagConversation(conversation.id, ['human_requested']);
        const handoff = await handoffService.createHandoff(
          lead.id,
          'Buyer requested human sales executive',
          { conversationId: conversation.id, skipLlm: true },
        );
        const reply: ChatReply = {
          text: handoff.buyerMessage,
          language: preFilter.language ?? targetLang,
          confidence: 1.0,
          citedFactIds: [],
          conversationId: conversation.id,
          isHandoff: true,
          flagReasons: ['human_requested'],
        };
        return reply;
      }

      if (preFilter.type === 'price_ask') {
        await chatRepository.flagConversation(conversation.id, ['price_ask']);
        const reply: ChatReply = {
          text: preFilter.responseText!,
          language: preFilter.language ?? targetLang,
          confidence: 1.0,
          citedFactIds: [],
          quickReplies: preFilter.quickReplies,
          conversationId: conversation.id,
          flagReasons: ['price_ask'],
        };
        await chatRepository.insertMessage(
          conversation.id,
          'assistant',
          reply.text,
          [],
          { quickReplies: preFilter.quickReplies, flagReasons: ['price_ask'] },
        );
        return reply;
      }
    }

    // 4. Retrieve Active Fact Sheet
    const activeFacts = await factService.listFacts({
      status: 'active',
      projectId: lead.project_id ?? undefined,
    });

    // 5. Retrieve conversation history
    const messageHistory = await chatRepository.getMessages(conversation.id);

    // 6. Execute Agent Loop
    const loopResult = await runAgentLoop({
      conversationId: conversation.id,
      lead: {
        id: lead.id,
        name: lead.name,
        phone_e164: lead.phone_e164,
        consent_status: lead.consent_status,
        budget_min: lead.budget_min ? Number(lead.budget_min) : null,
        budget_max: lead.budget_max ? Number(lead.budget_max) : null,
        wants: lead.wants,
        timeline: lead.timeline,
        project_id: lead.project_id,
      },
      messageHistory,
      activeFacts,
      language: targetLang,
      projectId: lead.project_id ?? undefined,
    });

    // 7. Handle Fallback if agent loop failed (e.g. LLM timeout, LLM down, max rounds exceeded)
    if (!loopResult.success) {
      const fallbackText = getLocalizedFallback(targetLang);
      await chatRepository.recordUnansweredQuestion(
        conversation.id,
        payload.message,
        targetLang,
      );
      await chatRepository.flagConversation(conversation.id, [
        'missing_fact',
        loopResult.reason,
      ]);
      await handoffService.createHandoff(
        lead.id,
        `AI assistant fallback: ${loopResult.reason}`,
        { conversationId: conversation.id },
      );

      await chatRepository.insertMessage(
        conversation.id,
        'assistant',
        fallbackText,
        [],
        { isFallback: true, reason: loopResult.reason },
      );

      return {
        text: fallbackText,
        language: targetLang,
        confidence: 0.5,
        citedFactIds: [],
        conversationId: conversation.id,
        isHandoff: true,
        flagReasons: ['missing_fact', loopResult.reason],
      };
    }

    const { reply, isHandoff } = loopResult;

    // 8. Deterministic Post-Check (Banned claims, fact verification, grounding)
    const postCheck = verifyPostChecks({
      replyText: reply.text,
      citedFactIds: reply.cited_fact_ids,
      activeFacts,
      confidence: reply.confidence,
    });

    if (!postCheck.passed) {
      const fallbackText = getLocalizedFallback(targetLang);
      const flagReason = postCheck.reason ?? 'grounding_failed';

      await chatRepository.recordUnansweredQuestion(
        conversation.id,
        payload.message,
        targetLang,
      );
      await chatRepository.flagConversation(conversation.id, [flagReason, 'missing_fact']);
      await handoffService.createHandoff(
        lead.id,
        `Guardrail check failed: ${flagReason}`,
        { conversationId: conversation.id },
      );

      await chatRepository.insertMessage(
        conversation.id,
        'assistant',
        fallbackText,
        [],
        { isFallback: true, postCheckReason: flagReason },
      );

      return {
        text: fallbackText,
        language: targetLang,
        confidence: 0.5,
        citedFactIds: [],
        conversationId: conversation.id,
        isHandoff: true,
        flagReasons: [flagReason, 'missing_fact'],
      };
    }

    // 9. Persist successful reply
    await chatRepository.insertMessage(
      conversation.id,
      'assistant',
      reply.text,
      reply.cited_fact_ids,
      {
        confidence: reply.confidence,
        uiAction: reply.ui_action,
        quickReplies: reply.quick_replies,
      },
    );

    await chatRepository.setFirstResponseAt(lead.id);

    // Trigger handoff if agent loop requested handoff
    if (isHandoff) {
      await handoffService.createHandoff(
        lead.id,
        'Agent loop requested handoff',
        { conversationId: conversation.id },
      );
    } else {
      // Trigger handoff on serious intent (budget and BHK known plus interest)
      const hasSeriousIntent =
        Boolean(lead.budget_min) &&
        Boolean(lead.wants) &&
        /(visit|site|tour|book|when can i|આવી શકું|विज़िट)/i.test(payload.message);

      if (hasSeriousIntent && lead.status !== 'visit_booked') {
        await handoffService.createHandoff(
          lead.id,
          'Serious intent (budget and BHK known plus interest)',
          { conversationId: conversation.id },
        );
      }
    }

    return {
      text: reply.text,
      language: reply.language,
      confidence: reply.confidence,
      citedFactIds: reply.cited_fact_ids,
      quickReplies: reply.quick_replies,
      uiAction: reply.ui_action,
      conversationId: conversation.id,
      isHandoff: isHandoff || false,
    };
  }

  /**
   * Book a visit initiated by a buyer selecting a real slot in chat.
   * Enforces verified phone number and DPDP consent. Confirmation is generated by template.
   */
  async bookVisit(payload: ChatBookPayload): Promise<{
    success: boolean;
    bookingId?: string;
    message: string;
    uiAction?: 'collect_contact';
  }> {
    const conversation = await chatRepository.findConversationById(payload.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const lead = await leadRepository.findById(conversation.lead_id);
    if (!lead) {
      throw new NotFoundError('Lead not found for conversation');
    }

    const currentLang = (conversation.language as ChatLanguage) || 'en';

    // Validate phone number
    const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : lead.phone_e164;
    const hasConsent = payload.consent === true || lead.consent_status === 'granted';

    if (!normalizedPhone || !hasConsent) {
      return {
        success: false,
        uiAction: 'collect_contact',
        message:
          'A verified Indian mobile number and DPDP consent are required before booking your site visit.',
      };
    }

    // If new phone or name provided, update lead
    if (payload.phone && normalizedPhone !== lead.phone_e164) {
      await chatRepository.updateLeadProfile(lead.id, {
        phoneE164: normalizedPhone,
        name: payload.name ?? lead.name,
        projectId: payload.projectId,
      });
    }

    // Record consent if explicitly granted
    if (payload.consent === true) {
      await chatRepository.recordConsent(
        lead.id,
        'site_visit_booking',
        true,
        'v1.0',
        'web_chat',
      );
      await chatRepository.updateLeadProfile(lead.id, {
        consentStatus: 'granted',
      });
    }

    // Execute booking via visitService
    const booking = await visitService.bookVisit(
      lead.id,
      payload.projectId,
      payload.startsAt,
      payload.idempotencyKey,
    );

    // Generate template confirmation message in Asia/Kolkata timezone
    const dateObj = new Date(payload.startsAt);
    const istTime = new Date(dateObj.getTime() + (5 * 60 + 30) * 60 * 1000);
    const formattedDate = istTime.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const minuteStr = minutes < 10 ? `0${minutes}` : String(minutes);
    const formattedTimeStr = `${formattedDate} at ${hour12}:${minuteStr} ${ampm}`;

    const confirmationTemplates: Record<ChatLanguage, string> = {
      en: `Your site visit has been confirmed for ${formattedTimeStr}. Our sales gallery team looks forward to welcoming you.`,
      hi: `आपकी साइट विज़िट ${formattedTimeStr} के लिए सफलतापूर्वक सुनिश्चित हो गई है। हमारी टीम आपका स्वागत करने के लिए तत्पर है।`,
      gu: `તમારી સાઇટ વિઝિટ ${formattedTimeStr} માટે સફળતાપૂર્વક કન્ફર્મ થઈ ગઈ છે. અમારી સેલ્સ ટીમ આપનું સ્વાગત કરવા માટે તત્પર છે.`,
    };

    const templateMessage =
      confirmationTemplates[currentLang] ?? confirmationTemplates.en;

    await chatRepository.insertMessage(
      conversation.id,
      'assistant',
      templateMessage,
      [],
      { bookingId: booking.id, startsAt: payload.startsAt },
    );

    // Trigger handoff for site visit booking
    await handoffService.createHandoff(
      lead.id,
      'Site visit scheduled',
      { conversationId: conversation.id, notifyBuyer: false, skipLlm: true },
    );

    return {
      success: true,
      bookingId: booking.id,
      message: templateMessage,
    };
  }

  /**
   * Return message history for a conversation.
   */
  async getHistory(conversationId: string): Promise<ChatHistoryItem[]> {
    const conversation = await chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const messages = await chatRepository.getMessages(conversationId);
    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      role: m.role,
      content: m.content,
      citedFactIds: m.cited_fact_ids,
      meta: m.meta,
      createdAt: m.created_at,
    }));
  }
}

export const chatService = new ChatService();
