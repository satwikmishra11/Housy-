import {
  type ChatLanguage,
  type ChatStartPayload,
  type ChatStartResponse,
  type ChatMessagePayload,
  type ChatReply,
  type ChatBookPayload,
  type ChatHistoryItem,
  type VisitDetail,
  normalizePhone,
} from '@housy/shared';
import { NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { leadRepository, type LeadDbRow } from '../repositories/lead.repository.js';
import { chatRepository, type ConversationRecord } from '../repositories/chat.repository.js';
import { chatSessionRepository } from '../repositories/chat-session.repository.js';
import { factService } from './fact.service.js';
import { visitService } from './visit.service.js';
import { handoffService } from './handoff.service.js';
import { notificationService } from './notification.service.js';
import { signBuyerSession } from '../auth/tokens.js';
import { query } from '../db/index.js';
import {
  detectLanguage,
  runPreFilter,
  getLocalizedFallback,
  verifyPostChecks,
} from '../llm/guardrails.js';
import { verifyReplyClaims } from '../llm/verifier.js';
import { runAgentLoop } from '../llm/agent-loop.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

function detectProjectInterest(text: string): boolean {
  return (
    /\b(\d\s*bhk|bedroom|flat|apartment|penthouse|villa|luxury|price|pricing|cost|budget|amenities|location|possession|rera|floor\s*plan|tower|sqft|carpet|balcony|clubhouse|swimming\s*pool|parking|gym)\b/i.test(text) ||
    /(घर|फ्लैट|कीमत|बजट|किराया|सस्ता|सुविधाएं|स्थान|ભાવ|કિંમત|વિસ્તાર|સગવડ|મકાન)/i.test(text)
  );
}

export class ChatService {
  /**
   * Start a new anonymous chat session for a buyer without creating a ghost lead.
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
    let sessionId: string;

    try {
      // 1. Create anonymous chat session (no PII, no ghost lead created)
      const session = await chatSessionRepository.createSession({
        source: payload.source ?? 'website',
        projectId: payload.projectId ?? null,
        language,
      });
      sessionId = session.id;

      // 2. Create conversation attached to session with lead_id = null
      const conversation = await chatRepository.createConversation(null, language, session.id);
      conversationId = conversation.id;

      // 3. Record greeting assistant message (marked isGreeting: true so it's excluded from first-response timing)
      await chatRepository.insertMessage(
        conversation.id,
        'assistant',
        greeting,
        [],
        { quickReplies },
        true,
      );
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
      leadId: undefined,
    });

    return {
      success: true,
      conversationId,
      sessionId,
      leadId: null,
      sessionToken,
      language,
      greeting,
      quickReplies,
    };
  }

  /**
   * Lazily ensures or creates a real Lead only when conversion triggers fire:
   * 1. Buyer provides contact details + consent
   * 2. Buyer sends 2 or more messages with project interest
   * 3. Buyer requests a human sales executive (handoff)
   * 4. Buyer books a visit
   */
  private async getOrCreateLeadForConversation(
    conversation: ConversationRecord,
    _reason: 'project_interest' | 'human_requested' | 'booking' | 'contact',
    details?: { name?: string; phoneE164?: string; consent?: boolean },
  ): Promise<LeadDbRow> {
    if (conversation.lead_id) {
      const existing = await leadRepository.findById(conversation.lead_id);
      if (existing) {
        if (details?.phoneE164 && details.phoneE164 !== existing.phone_e164) {
          await chatRepository.updateLeadProfile(existing.id, {
            phoneE164: details.phoneE164,
            name: details.name ?? existing.name,
          });
        }
        if (details?.consent) {
          await chatRepository.reConsentLead(existing.id, 'web_chat');
        }
        return (await leadRepository.findById(existing.id))!;
      }
    }

    const session = await chatSessionRepository.findByConversationId(conversation.id);
    const firstTouchAt = session?.buyer_first_message_at ?? session?.first_touch_at ?? new Date().toISOString();

    // If phone provided, check if lead with this phone exists
    if (details?.phoneE164) {
      const existingByPhone = await leadRepository.findExactByPhone(details.phoneE164);
      if (existingByPhone) {
        await chatRepository.linkLeadToConversation(conversation.id, existingByPhone.id);
        if (session) {
          await chatSessionRepository.linkLead(session.id, existingByPhone.id);
        }
        if (details.consent) {
          await chatRepository.reConsentLead(existingByPhone.id, 'web_chat');
        }
        return existingByPhone;
      }
    }

    // Create new lead
    const newLead = await leadRepository.createLead({
      name: details?.name?.trim() || (details?.phoneE164 ? 'Website Buyer' : 'Interested Buyer'),
      phoneE164: details?.phoneE164 ?? null,
      email: null,
      source: session?.source ?? 'website',
      projectId: session?.project_id ?? null,
      wants: 'Exploring residential projects',
      language: (conversation.language as ChatLanguage) || session?.language || 'en',
      status: 'new',
      consentStatus: details?.consent ? 'granted' : 'unknown',
    });

    // Align first_touch_at with session's first buyer touchpoint
    await query(`UPDATE leads SET first_touch_at = $1 WHERE id = $2`, [firstTouchAt, newLead.id]);

    if (details?.consent) {
      await chatRepository.reConsentLead(newLead.id, 'web_chat');
    }

    await chatRepository.linkLeadToConversation(conversation.id, newLead.id);
    if (session) {
      await chatSessionRepository.linkLead(session.id, newLead.id);
    }

    return (await leadRepository.findById(newLead.id))!;
  }

  /**
   * Process a message sent by a buyer through pre-filters, agent loop, post-checks, and persistence.
   */
  async sendMessage(payload: ChatMessagePayload): Promise<ChatReply> {
    const conversation = await chatRepository.findConversationById(payload.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    let lead = conversation.lead_id ? await leadRepository.findById(conversation.lead_id) : null;

    const currentLang = (conversation.language as ChatLanguage) || 'en';
    const targetLang: ChatLanguage =
      payload.language ?? detectLanguage(payload.message, currentLang);

    if (targetLang !== currentLang) {
      await chatRepository.updateLanguage(conversation.id, targetLang);
    }

    // 1. Record incoming buyer message in messages table
    await chatRepository.insertMessage(
      conversation.id,
      'buyer',
      payload.message,
    );

    // Track buyer activity in chat_sessions
    const hasInterest = detectProjectInterest(payload.message);
    let session = await chatSessionRepository.findByConversationId(conversation.id);
    if (session) {
      session = await chatSessionRepository.recordBuyerMessage(session.id, hasInterest);
    }

    // Trigger 2: If buyer sends >= 2 messages with project interest and no lead yet, convert to lead!
    if (!lead && session && session.buyer_message_count >= 2 && session.has_project_interest) {
      lead = await this.getOrCreateLeadForConversation(conversation, 'project_interest');
      conversation.lead_id = lead.id;
    }

    // If conversation is taken over by a human executive, pause AI
    if (conversation.status === 'human') {
      if (lead?.assigned_to) {
        try {
          await notificationService.notify({
            userId: lead.assigned_to,
            type: 'handoff',
            title: 'New Buyer Message',
            message: `${lead.name}: "${payload.message.slice(0, 80)}"`,
            link: `/leads?id=${lead.id}`,
            leadId: lead.id,
          });
        } catch {
          // Non-blocking notification
        }
      }

      const humanStatusMessages: Record<ChatLanguage, string> = {
        en: 'Your message has been delivered to your sales executive, who will respond directly.',
        hi: 'आपका संदेश आपके सेल्स एग्जीक्यूटिव तक पहुँचा दिया गया है, वे जल्द ही आपसे सीधे बात करेंगे।',
        gu: 'તમારો સંદેશ તમારા સેલ્સ એક્ઝિક્યુટિવ સુધી પહોંચાડી દેવામાં આવ્યો છે, તેઓ ટૂંક સમયમાં તમારો સીધો સંપર્ક કરશે.',
      };

      return {
        text: humanStatusMessages[targetLang] ?? humanStatusMessages.en,
        language: targetLang,
        confidence: 1.0,
        citedFactIds: [],
        conversationId: conversation.id,
        isHandoff: true,
      };
    }

    // 2. Run Pre-Filter (detectIntent: cancel_visit | opt_out | human | negotiation | price_info | other)
    const preFilter = runPreFilter(payload.message, targetLang);
    if (preFilter.triggered) {
      if (preFilter.type === 'cancel_visit') {
        const reply: ChatReply = {
          text: preFilter.responseText!,
          language: preFilter.language ?? targetLang,
          confidence: 1.0,
          citedFactIds: [],
          conversationId: conversation.id,
          flagReasons: ['cancel_visit_requested'],
        };
        await chatRepository.insertMessage(
          conversation.id,
          'assistant',
          reply.text,
          [],
          { flagReasons: ['cancel_visit_requested'] },
        );
        return reply;
      }

      if (preFilter.type === 'opt_out') {
        if (lead) {
          await chatRepository.optOutLead(lead.id);
        }
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
        if (!lead) {
          lead = await this.getOrCreateLeadForConversation(conversation, 'human_requested');
          conversation.lead_id = lead.id;
        }
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
        // Persist human escalation reply (Requirement F)
        await chatRepository.insertMessage(
          conversation.id,
          'assistant',
          reply.text,
          [],
          { isHandoff: true, flagReasons: ['human_requested'] },
        );
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

    // 3. Retrieve Active Fact Sheet
    const activeFacts = await factService.listFacts({
      status: 'active',
      projectId: lead?.project_id ?? session?.project_id ?? undefined,
    });

    // 4. Strict Price-Info routing: if buyer enquired for pricing, require authorized price fact
    if (preFilter.intent === 'price_info') {
      const hasPriceFact = activeFacts.some(
        (f) =>
          f.category === 'pricing' ||
          /\b(price|pricing|cost|rate|rates|lakh|lac|crore|cr|₹)\b/i.test(`${f.title} ${f.value}`),
      );

      if (!hasPriceFact) {
        if (!lead) {
          lead = await this.getOrCreateLeadForConversation(conversation, 'human_requested');
          conversation.lead_id = lead.id;
        }
        const fallbackText = getLocalizedFallback(targetLang);
        await chatRepository.recordUnansweredQuestion(
          conversation.id,
          payload.message,
          targetLang,
        );
        await chatRepository.flagConversation(conversation.id, ['missing_fact', 'no_price_fact']);
        await handoffService.createHandoff(
          lead.id,
          'Buyer price enquiry but no authorized price-range fact exists',
          { conversationId: conversation.id },
        );
        await chatRepository.insertMessage(
          conversation.id,
          'assistant',
          fallbackText,
          [],
          { isFallback: true, reason: 'no_price_fact' },
        );
        return {
          text: fallbackText,
          language: targetLang,
          confidence: 0.5,
          citedFactIds: [],
          conversationId: conversation.id,
          isHandoff: true,
          flagReasons: ['missing_fact', 'no_price_fact'],
        };
      }
    }

    // 5. Retrieve conversation history
    const messageHistory = await chatRepository.getMessages(conversation.id);

    // 6. Execute Agent Loop
    const loopResult = await runAgentLoop({
      conversationId: conversation.id,
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            phone_e164: lead.phone_e164,
            consent_status: lead.consent_status,
            budget_min: lead.budget_min ? Number(lead.budget_min) : null,
            budget_max: lead.budget_max ? Number(lead.budget_max) : null,
            wants: lead.wants ?? undefined,
            timeline: lead.timeline ?? undefined,
            project_id: lead.project_id,
          }
        : {
            id: conversation.id,
            name: 'Visitor',
            phone_e164: null,
            consent_status: 'unknown' as const,
            budget_min: null,
            budget_max: null,
            wants: undefined,
            timeline: undefined,
            project_id: session?.project_id ?? null,
          },
      messageHistory,
      activeFacts,
      language: targetLang,
      projectId: lead?.project_id ?? session?.project_id ?? undefined,
    });

    // 7. Handle Fallback if agent loop failed (e.g. LLM timeout, LLM down, max rounds exceeded)
    if (!loopResult.success) {
      if (!lead) {
        lead = await this.getOrCreateLeadForConversation(conversation, 'human_requested');
        conversation.lead_id = lead.id;
      }
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
      if (!lead) {
        lead = await this.getOrCreateLeadForConversation(conversation, 'human_requested');
        conversation.lead_id = lead.id;
      }
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

    // 9. Independent claim verification behind VERIFY_REPLIES=true
    if (config.VERIFY_REPLIES || process.env.VERIFY_REPLIES === 'true') {
      const verifierResult = await verifyReplyClaims({
        replyText: reply.text,
        citedFacts: activeFacts.filter((f) => reply.cited_fact_ids.includes(f.id)),
        conversationId: conversation.id,
      });

      if (!verifierResult.supported) {
        if (!lead) {
          lead = await this.getOrCreateLeadForConversation(conversation, 'human_requested');
          conversation.lead_id = lead.id;
        }
        const fallbackText = getLocalizedFallback(targetLang);
        await chatRepository.recordUnansweredQuestion(
          conversation.id,
          payload.message,
          targetLang,
        );
        await chatRepository.flagConversation(conversation.id, [
          'unsupported_claim',
          'grounding_failed',
        ]);
        await handoffService.createHandoff(
          lead.id,
          `Claim verification rejected: ${verifierResult.unsupportedClaims.join(', ')}`,
          { conversationId: conversation.id },
        );
        await chatRepository.insertMessage(
          conversation.id,
          'assistant',
          fallbackText,
          [],
          { isFallback: true, verifierClaims: verifierResult.unsupportedClaims },
        );
        return {
          text: fallbackText,
          language: targetLang,
          confidence: 0.5,
          citedFactIds: [],
          conversationId: conversation.id,
          isHandoff: true,
          flagReasons: ['unsupported_claim', 'grounding_failed'],
        };
      }
    }

    // 10. Persist successful reply
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

    if (lead) {
      await chatRepository.setFirstResponseAt(lead.id, 'chat_substantive_answer');
    }
    if (session) {
      await chatSessionRepository.setFirstResponseAt(session.id);
    }

    // Trigger handoff if agent loop requested handoff
    if (isHandoff) {
      if (!lead) {
        lead = await this.getOrCreateLeadForConversation(conversation, 'human_requested');
        conversation.lead_id = lead.id;
      }
      await handoffService.createHandoff(
        lead.id,
        'Agent loop requested handoff',
        { conversationId: conversation.id },
      );
    } else if (lead) {
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
    executiveName?: string;
    executivePhone?: string;
    manageToken?: string;
    message: string;
    uiAction?: 'collect_contact';
  }> {
    const conversation = await chatRepository.findConversationById(payload.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    let lead = conversation.lead_id ? await leadRepository.findById(conversation.lead_id) : null;

    const currentLang = (conversation.language as ChatLanguage) || 'en';

    // Validate phone number
    const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : (lead?.phone_e164 ?? null);
    const hasConsent = payload.consent === true || lead?.consent_status === 'granted';

    if (!normalizedPhone || !hasConsent) {
      return {
        success: false,
        uiAction: 'collect_contact',
        message:
          'A verified Indian mobile number and DPDP consent are required before booking your site visit.',
      };
    }

    // If conversation didn't have a lead yet, create or link it now!
    if (!lead) {
      lead = await this.getOrCreateLeadForConversation(
        conversation,
        'booking',
        {
          name: payload.name,
          phoneE164: normalizedPhone,
          consent: payload.consent,
        },
      );
      conversation.lead_id = lead.id;
    } else {
      // If new phone or name provided, update lead
      if (payload.phone && normalizedPhone !== lead.phone_e164) {
        await chatRepository.updateLeadProfile(lead.id, {
          phoneE164: normalizedPhone,
          name: payload.name ?? lead.name,
          projectId: payload.projectId,
        });
      }

      // Record consent if explicitly granted (restores consent and clears opt-out if previously opted out)
      if (payload.consent === true) {
        await chatRepository.reConsentLead(lead.id, 'web_chat');
      }
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

    const execName = booking.executiveName;
    const execPhone = booking.executivePhone || '+91 90000 00002';

    const confirmationTemplates: Record<ChatLanguage, string> = {
      en: `Your site visit has been confirmed for ${formattedTimeStr} with your host ${execName} (${execPhone}). Our sales gallery team looks forward to welcoming you.`,
      hi: `आपकी साइट विज़िट ${formattedTimeStr} के लिए आपके होस्ट ${execName} (${execPhone}) के साथ सुनिश्चित हो गई है। हमारी टीम आपका स्वागत करने के लिए तत्पर है।`,
      gu: `તમારી સાઇટ વિઝિટ ${formattedTimeStr} માટે તમારા હોસ્ટ ${execName} (${execPhone}) સાથે સફળતાપૂર્વક કન્ફર્મ થઈ ગઈ છે. અમારી ટીમ આપનું સ્વાગત કરવા માટે તત્પર છે.`,
    };

    const templateMessage =
      confirmationTemplates[currentLang] ?? confirmationTemplates.en;

    await chatRepository.insertMessage(
      conversation.id,
      'assistant',
      templateMessage,
      [],
      {
        bookingId: booking.id,
        startsAt: payload.startsAt,
        executiveName: execName,
        executivePhone: execPhone,
        manageToken: booking.token,
      },
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
      executiveName: execName,
      executivePhone: execPhone,
      manageToken: booking.token,
      message: templateMessage,
    };
  }

  /**
   * Reschedules an appointment directly from chat.
   */
  async rescheduleVisitInChat(
    conversationId: string,
    bookingId: string,
    newStartsAt: string,
  ): Promise<{ success: boolean; message: string; visit: VisitDetail }> {
    const conversation = await chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const updated = await visitService.rescheduleVisit(bookingId, newStartsAt);
    const dateObj = new Date(updated.startsAt);
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

    const execName = updated.executiveName;
    const execPhone = updated.executivePhone || '+91 90000 00002';
    const confirmationText = `Your site visit has been rescheduled to ${formattedTimeStr} with your host ${execName} (${execPhone}).`;

    await chatRepository.insertMessage(
      conversation.id,
      'assistant',
      confirmationText,
      [],
      {
        bookingId: updated.id,
        startsAt: updated.startsAt,
        executiveName: execName,
        executivePhone: execPhone,
        manageToken: updated.token,
        isRescheduled: true,
      },
    );

    return {
      success: true,
      message: confirmationText,
      visit: updated,
    };
  }

  /**
   * Cancels a visit booking directly from chat.
   */
  async cancelVisitInChat(
    conversationId: string,
    bookingId: string,
  ): Promise<{ success: boolean; message: string }> {
    const conversation = await chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    await visitService.cancelVisit(bookingId, 'Cancelled from buyer chat');
    const cancellationText =
      'Your site visit appointment has been cancelled. Please let me know if you would like to select another time.';

    await chatRepository.insertMessage(
      conversation.id,
      'assistant',
      cancellationText,
      [],
      { isCancelled: true },
    );

    return {
      success: true,
      message: cancellationText,
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
