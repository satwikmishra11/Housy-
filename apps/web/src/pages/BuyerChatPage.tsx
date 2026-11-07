import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Building2,
  ShieldCheck,
  Headphones,
  AlertCircle,
  Sparkles,
  UserCheck,
  Lock,
} from 'lucide-react';
import type { LeadSource, ChatLanguage } from '@housy/shared';
import {
  startChat,
  sendChatMessage,
  bookChatVisit,
  fetchChatHistory,
  rescheduleChatVisit,
  cancelChatVisit,
  fetchProjects,
  type ProjectItem,
  type ApiError,
} from '../lib/api.js';
import { ChatBubble } from '../components/ChatBubble.js';
import { Button } from '../components/Button.js';
import { Skeleton } from '../components/Skeleton.js';
import { ErrorState } from '../components/ErrorState.js';
import { CollectContactCard, type CollectContactData } from '../components/CollectContactCard.js';
import { InlineSlotPickerCard } from '../components/InlineSlotPickerCard.js';
import { BookingConfirmationCard } from '../components/BookingConfirmationCard.js';
import { supportedLanguages, changeAppLanguage, type SupportedLanguageCode } from '../i18n/index.js';

interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'executive' | 'system';
  content: string;
  createdAt?: string;
  quickReplies?: string[];
  uiAction?: 'show_slots' | 'collect_contact';
  bookingId?: string;
  startsAt?: string;
  executiveName?: string;
  executivePhone?: string;
  manageToken?: string;
  meta?: Record<string, unknown>;
  isHandoff?: boolean;
  flagReasons?: string[];
}

interface ActiveBookingState {
  bookingId: string;
  startsAt: string;
  executiveName?: string;
  executivePhone?: string;
  manageToken?: string;
}

export const BuyerChatPage: React.FC = () => {
  const { i18n } = useTranslation();
  const [searchParams] = useSearchParams();

  const currentLang = (i18n.language?.slice(0, 2) as ChatLanguage) || 'en';

  // Map URL source parameter ?src=portal|social|website|hoarding
  const rawSrc = searchParams.get('src') || '';
  const mappedSource: LeadSource =
    rawSrc === 'portal'
      ? 'property_portal'
      : rawSrc === 'social'
        ? 'social_ad'
        : rawSrc === 'hoarding'
          ? 'hoarding_call'
          : 'website';

  const [conversationId, setConversationId] = useState<string | null>(() => {
    return typeof window !== 'undefined'
      ? sessionStorage.getItem('housy_chat_conversation_id')
      : null;
  });

  const [_leadId, setLeadId] = useState<string | null>(() => {
    return typeof window !== 'undefined'
      ? sessionStorage.getItem('housy_chat_lead_id')
      : null;
  });

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [activeQuickReplies, setActiveQuickReplies] = useState<string[]>([]);
  const [activeUiAction, setActiveUiAction] = useState<'show_slots' | 'collect_contact' | null>(null);
  const [activeBooking, setActiveBooking] = useState<ActiveBookingState | null>(null);
  const [reschedulingBookingId, setReschedulingBookingId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<'ai' | 'human' | 'closed'>('ai');

  const [contactData, setContactData] = useState<CollectContactData | null>(null);
  const [isHandoff, setIsHandoff] = useState(false);

  const [isInitializing, setIsInitializing] = useState(true);
  const [isSlowStart, setIsSlowStart] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isBookingVisit, setIsBookingVisit] = useState(false);

  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll to bottom smoothly
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, activeUiAction, activeBooking]);

  // Load project roster
  useEffect(() => {
    fetchProjects()
      .then((data) => {
        setProjects(data);
        if (data.length > 0) {
          const requestedProj = searchParams.get('project');
          const matched = data.find((p) => p.id === requestedProj || p.name.includes(requestedProj || ''));
          setSelectedProjectId(matched ? matched.id : data[0]!.id);
        }
      })
      .catch(() => {
        // Fallback default
      });
  }, [searchParams]);

  // Session resume or initialize fresh chat
  useEffect(() => {
    let isCancelled = false;
    const slowStartTimer = setTimeout(() => {
      if (!isCancelled) {
        setIsSlowStart(true);
      }
    }, 3500);

    async function initializeSession() {
      setIsInitializing(true);
      setInitError(null);

      try {
        const storedConvId = sessionStorage.getItem('housy_chat_conversation_id');

        // Attempt resume if stored conversation ID exists
        if (storedConvId) {
          try {
            const history = await fetchChatHistory(storedConvId);
            if (!isCancelled && history && history.length > 0) {
              setConversationId(storedConvId);
              if (history.some((m) => m.role === 'executive')) {
                setConversationStatus('human');
              }
              const mapped: UiChatMessage[] = history.map((item) => ({
                id: item.id,
                role: item.role === 'buyer' ? 'user' : (item.role as UiChatMessage['role']),
                content: item.content,
                createdAt: item.createdAt,
                quickReplies: (item.meta?.['quickReplies'] as string[]) || undefined,
                uiAction: (item.meta?.['uiAction'] as 'show_slots' | 'collect_contact') || undefined,
                bookingId: (item.meta?.['bookingId'] as string) || undefined,
                startsAt: (item.meta?.['startsAt'] as string) || undefined,
                executiveName: (item.meta?.['executiveName'] as string) || undefined,
                executivePhone: (item.meta?.['executivePhone'] as string) || undefined,
                manageToken: (item.meta?.['manageToken'] as string) || undefined,
                meta: item.meta,
                isHandoff: Boolean(item.meta?.['isHandoff']),
              }));

              setMessages(mapped);

              // Set active quick replies from latest assistant turn
              const lastAssistant = [...mapped].reverse().find((m) => m.role === 'assistant');
              if (lastAssistant?.quickReplies) {
                setActiveQuickReplies(lastAssistant.quickReplies);
              }
              if (lastAssistant?.uiAction) {
                setActiveUiAction(lastAssistant.uiAction);
              }
              if (lastAssistant?.bookingId && lastAssistant?.startsAt) {
                setActiveBooking({
                  bookingId: lastAssistant.bookingId,
                  startsAt: lastAssistant.startsAt,
                  executiveName: lastAssistant.executiveName,
                  executivePhone: lastAssistant.executivePhone,
                  manageToken: lastAssistant.manageToken,
                });
              }

              setIsInitializing(false);
              return;
            }
          } catch {
            // History fetch failed, start fresh session
            sessionStorage.removeItem('housy_chat_conversation_id');
            sessionStorage.removeItem('housy_chat_lead_id');
            sessionStorage.removeItem('housy_chat_buyer_token');
          }
        }

        // Initialize new chat session
        const startRes = await startChat({
          language: currentLang,
          projectId: selectedProjectId || undefined,
          source: mappedSource,
        });

        if (!isCancelled) {
          setConversationId(startRes.conversationId);
          setLeadId(startRes.leadId ?? null);
          sessionStorage.setItem('housy_chat_conversation_id', startRes.conversationId);
          if (startRes.leadId) {
            sessionStorage.setItem('housy_chat_lead_id', startRes.leadId);
          } else {
            sessionStorage.removeItem('housy_chat_lead_id');
          }
          sessionStorage.setItem('housy_chat_buyer_token', startRes.sessionToken);

          const greetingMsg: UiChatMessage = {
            id: `msg_init_${Date.now()}`,
            role: 'assistant',
            content: startRes.greeting,
            createdAt: new Date().toISOString(),
            quickReplies: startRes.quickReplies,
          };

          setMessages([greetingMsg]);
          setActiveQuickReplies(startRes.quickReplies || []);
          setIsInitializing(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setInitError(err instanceof Error ? err.message : 'Unable to connect to assistant');
          setIsInitializing(false);
        }
      }
    }

    void initializeSession();

    return () => {
      isCancelled = true;
      clearTimeout(slowStartTimer);
    };
  }, []);

  // Poll conversation every 5s when in human takeover mode or handed off
  useEffect(() => {
    if (!conversationId) return;
    if (!isHandoff && conversationStatus !== 'human') return;

    const interval = setInterval(async () => {
      try {
        const history = await fetchChatHistory(conversationId);
        if (history && history.length > 0) {
          if (history.some((m) => m.role === 'executive')) {
            setConversationStatus('human');
          }
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newItems: UiChatMessage[] = [];
            for (const h of history) {
              if (!existingIds.has(h.id)) {
                newItems.push({
                  id: h.id,
                  role: h.role === 'buyer' ? 'user' : (h.role as UiChatMessage['role']),
                  content: h.content,
                  createdAt: h.createdAt,
                  meta: h.meta,
                });
              }
            }
            if (newItems.length > 0) {
              return [...prev, ...newItems];
            }
            return prev;
          });
        }
      } catch {
        // Silent error during background poll
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isHandoff, conversationStatus, conversationId]);

  // Language switch handler
  const handleLanguageChange = async (code: SupportedLanguageCode) => {
    await changeAppLanguage(code);
  };

  // Send message handler
  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || !conversationId || isSending) return;

    setRateLimitMessage(null);
    setFallbackWarning(null);
    setInputMessage('');
    setActiveQuickReplies([]);

    const userMsg: UiChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);
    setIsTyping(true);

    let shouldFocusInput = true;
    try {
      const reply = await sendChatMessage({
        conversationId,
        message: text,
        language: currentLang,
      });

      setIsTyping(false);
      setIsSending(false);

      const assistantMsg: UiChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: reply.text,
        createdAt: new Date().toISOString(),
        quickReplies: reply.quickReplies,
        uiAction: reply.uiAction,
        isHandoff: reply.isHandoff,
        flagReasons: reply.flagReasons,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (reply.quickReplies && reply.quickReplies.length > 0) {
        setActiveQuickReplies(reply.quickReplies);
      } else {
        setActiveQuickReplies([]);
      }

      if (reply.uiAction) {
        shouldFocusInput = false;
        setActiveUiAction(reply.uiAction);
      }

      if (reply.isHandoff) {
        setIsHandoff(true);
        setFallbackWarning(
          'Your inquiry has been escalated. A dedicated executive from our sales team has been assigned and will follow up shortly.',
        );
      }
    } catch (err: unknown) {
      setIsTyping(false);
      setIsSending(false);

      const apiErr = err as ApiError;
      setLastFailedMessage(text);
      if (apiErr.statusCode === 429) {
        setRateLimitMessage('You have sent several messages recently. Please wait a moment before sending another message.');
      } else if (apiErr.statusCode === 503) {
        setFallbackWarning(apiErr.message || 'Our chat advisory service is temporarily unavailable. Please retry shortly.');
      } else {
        setFallbackWarning(apiErr.message || 'Unable to deliver message. Please retry.');
      }
    } finally {
      if (shouldFocusInput && !activeUiAction) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };

  // "Talk to a Person" Header Button Handler
  const handleTalkToPerson = async () => {
    await handleSendMessage('I would like to speak directly with a sales executive.');
  };

  // Submit Collect Contact Form
  const handleContactSubmit = (data: CollectContactData) => {
    setContactData(data);
    setActiveUiAction('show_slots');

    // Add confirmation bubble
    setMessages((prev) => [
      ...prev,
      {
        id: `sys_contact_${Date.now()}`,
        role: 'system',
        content: `Contact confirmed for ${data.name} (${data.phone}) under DPDP Act 2023 consent.`,
        createdAt: new Date().toISOString(),
      },
      {
        id: `asst_select_slot_${Date.now()}`,
        role: 'assistant',
        content: 'Thank you. Please choose your preferred date and time slot for the private tour.',
        createdAt: new Date().toISOString(),
        uiAction: 'show_slots',
      },
    ]);
  };

  // Reschedule existing visit inside chat
  const handleChatRescheduleRequest = (bookingId: string) => {
    setReschedulingBookingId(bookingId);
    setActiveUiAction('show_slots');
  };

  // Cancel existing visit inside chat
  const handleChatCancel = async (bookingId: string) => {
    if (!conversationId) return;
    try {
      const res = await cancelChatVisit(conversationId, bookingId);
      if (res.success) {
        setActiveBooking(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_cancelled_${Date.now()}`,
            role: 'system',
            content: 'Your scheduled site visit has been cancelled. You can select a new slot whenever you are ready.',
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setFallbackWarning(err instanceof Error ? err.message : 'Unable to cancel visit. Please retry.');
    }
  };

  // Submit Slot Booking or Reschedule
  const handleBookSlot = async (startsAt: string) => {
    if (!conversationId) return;

    if (reschedulingBookingId) {
      setIsBookingVisit(true);
      try {
        const res = await rescheduleChatVisit(conversationId, reschedulingBookingId, startsAt);
        setIsBookingVisit(false);
        setReschedulingBookingId(null);
        setActiveUiAction(null);
        const resolvedPhone =
          (res.visit?.executivePhone ?? activeBooking?.executivePhone) || undefined;
        const resolvedToken =
          (res.visit?.token ?? activeBooking?.manageToken) || undefined;

        setActiveBooking({
          bookingId: reschedulingBookingId,
          startsAt,
          executiveName: res.visit?.executiveName || activeBooking?.executiveName,
          executivePhone: resolvedPhone,
          manageToken: resolvedToken,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `asst_reschedule_${Date.now()}`,
            role: 'assistant',
            content: res.message || 'Your site visit has been rescheduled successfully.',
            createdAt: new Date().toISOString(),
            bookingId: reschedulingBookingId,
            startsAt,
            executiveName: res.visit?.executiveName,
            executivePhone: resolvedPhone,
            manageToken: resolvedToken,
          },
        ]);
      } catch (err) {
        setIsBookingVisit(false);
        setFallbackWarning(err instanceof Error ? err.message : 'Unable to reschedule visit slot. Please try another time.');
      }
      return;
    }

    if (!contactData?.phone) {
      setActiveUiAction('collect_contact');
      return;
    }

    setIsBookingVisit(true);

    try {
      const res = await bookChatVisit({
        conversationId,
        projectId: selectedProjectId || projects[0]?.id || '',
        startsAt,
        idempotencyKey: `chat_book_${Date.now()}_${Math.random()}`,
        name: contactData.name,
        phone: contactData.phone,
        consent: contactData.consent,
      });

      setIsBookingVisit(false);

      if (res.success && res.bookingId) {
        setActiveUiAction(null);
        setActiveBooking({
          bookingId: res.bookingId,
          startsAt,
          executiveName: res.executiveName,
          executivePhone: res.executivePhone,
          manageToken: res.manageToken,
        });

        // Add assistant confirmation message
        setMessages((prev) => [
          ...prev,
          {
            id: `asst_confirm_${Date.now()}`,
            role: 'assistant',
            content: res.message,
            createdAt: new Date().toISOString(),
            bookingId: res.bookingId,
            startsAt,
            executiveName: res.executiveName,
            executivePhone: res.executivePhone,
            manageToken: res.manageToken,
          },
        ]);
      } else if (res.uiAction === 'collect_contact') {
        setActiveUiAction('collect_contact');
      }
    } catch (err) {
      setIsBookingVisit(false);
      const apiErr = err as ApiError;
      if (apiErr.code === 'SLOT_UNAVAILABLE') {
        const altTimes = apiErr.alternatives?.map((a) => a.displayTime || a.startsAt) || [];
        const altMessage =
          altTimes.length > 0
            ? `That slot was just booked by another visitor. Here are the nearest available times: ${altTimes.join(', ')}. Please choose an alternative slot below.`
            : 'That slot was just booked by another visitor. Please select an alternative slot below.';

        setMessages((prev) => [
          ...prev,
          {
            id: `asst_slot_conflict_${Date.now()}`,
            role: 'assistant',
            content: altMessage,
            createdAt: new Date().toISOString(),
            quickReplies: altTimes.slice(0, 3),
            uiAction: 'show_slots',
          },
        ]);
        if (altTimes.length > 0) {
          setActiveQuickReplies(altTimes.slice(0, 3));
        }
        setActiveUiAction('show_slots');
        setFallbackWarning('The selected slot was just taken. Please choose an alternative time slot.');
      } else {
        setFallbackWarning(err instanceof Error ? err.message : 'Unable to confirm slot. Please try another time.');
      }
    }
  };

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ||
    projects[0] || {
      name: 'The Palm Residences',
      rera_number: 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126',
    };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-background text-ink antialiased">
      {/* 1. TOP HEADER */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-hairline px-4 py-3 flex-shrink-0 shadow-subtle">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          {/* Brand & Project Info */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-serif font-bold text-base shadow-sm select-none flex-shrink-0 hover:opacity-90 transition-opacity"
              title="Return to Home"
            >
              H
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink text-sm sm:text-base leading-none truncate">
                  {activeProject.name}
                </span>
                <span className="text-muted text-xs hidden sm:inline">·</span>
                {conversationStatus === 'human' ? (
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Agent
                  </span>
                ) : (
                  <span className="text-[11px] text-accent font-medium bg-accent-soft px-1.5 py-0.5 rounded-md hidden sm:inline-block">
                    Verified Fact Sheet
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted flex items-center gap-1 mt-0.5 truncate">
                <Building2 className="w-3 h-3 text-accent flex-shrink-0" />
                Company A, Ahmedabad
              </span>
            </div>
          </div>

          {/* Controls: Language Switcher, Staff Link & Persistent "Talk to a Person" Button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Language Selector */}
            <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
              {supportedLanguages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => handleLanguageChange(l.code)}
                  aria-pressed={currentLang === l.code}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${currentLang === l.code
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted hover:text-ink'
                    }`}
                >
                  {l.code === 'en' ? 'EN' : l.code === 'hi' ? 'हिन्दी' : 'ગુજરાતી'}
                </button>
              ))}
            </div>

            {/* Staff Portal Link */}
            <Link
              to="/login"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink bg-surface border border-hairline hover:bg-background transition-colors"
              title="Staff Workspace Sign In"
            >
              <Lock className="w-3.5 h-3.5 text-muted" />
              <span className="hidden sm:inline">Staff</span>
            </Link>

            {/* Always Visible "Talk to a person" Button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTalkToPerson}
              disabled={isSending || conversationStatus === 'human'}
              className="text-xs font-semibold px-2.5 py-1.5 text-accent border-accent/25 hover:bg-accent-soft"
              aria-label="Talk to a human sales executive"
            >
              <Headphones className="w-3.5 h-3.5 sm:mr-1.5 text-accent" />
              <span className="hidden sm:inline">
                {conversationStatus === 'human' ? 'Connected' : 'Talk to a person'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. CHAT MESSAGE STREAM AREA */}
      <main
        className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl w-full mx-auto"
        role="log"
        aria-live="polite"
        aria-label="Chat messages with AI residence advisor"
      >
        {/* Loading Initial State */}
        {isInitializing && (
          <div className="space-y-4 my-6" aria-busy="true" aria-label="Connecting to residence assistant">
            <div className="flex gap-3">
              <Skeleton variant="circular" width="32px" height="32px" />
              <div className="space-y-2 flex-1 max-w-md">
                <Skeleton variant="rectangular" width="80%" height="56px" className="rounded-xl" />
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton variant="rectangular" width="60%" height="42px" className="rounded-xl" />
            </div>
            {isSlowStart && (
              <p className="text-xs text-amber-800 bg-amber-50/90 border border-amber-200/80 rounded-lg px-3.5 py-2.5 text-center max-w-md mx-auto shadow-subtle animate-pulse">
                Connecting to AI advisor... Free-tier cloud backend may be spinning up from idle (~30–45s). Thank you for your patience!
              </p>
            )}
          </div>
        )}

        {/* Init Error State */}
        {initError && (
          <ErrorState
            title="Connection Issue"
            message={initError}
            onRetry={() => window.location.reload()}
            className="my-8"
          />
        )}

        {/* Message Stream */}
        {!isInitializing && (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-2">
                <ChatBubble
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.createdAt}
                  avatar={
                    msg.role === 'assistant' ? (
                      <Sparkles className="w-4 h-4 text-accent" />
                    ) : msg.role === 'executive' ? (
                      <UserCheck className="w-4 h-4 text-accent" />
                    ) : undefined
                  }
                  senderName={
                    msg.role === 'assistant'
                      ? 'Residence Advisor'
                      : msg.role === 'executive'
                        ? `${(msg.meta?.['executiveFirstName'] as string) || 'Executive'} · Sales team`
                        : undefined
                  }
                />

                {/* Inline Confirmation Card attached to specific message */}
                {msg.bookingId && msg.startsAt && (
                  <div className="pl-9 pr-2 my-2">
                    <BookingConfirmationCard
                      bookingId={msg.bookingId}
                      startsAt={msg.startsAt}
                      projectName={activeProject.name}
                      executiveName={msg.executiveName || activeBooking?.executiveName}
                      executivePhone={msg.executivePhone || activeBooking?.executivePhone}
                      manageToken={msg.manageToken || activeBooking?.manageToken}
                      onReschedule={() => handleChatRescheduleRequest(msg.bookingId!)}
                      onCancel={() => handleChatCancel(msg.bookingId!)}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Active Inline Cards */}
            {activeUiAction === 'collect_contact' && (
              <div className="pl-0 sm:pl-9 my-3">
                <CollectContactCard
                  initialName={contactData?.name}
                  initialPhone={contactData?.phone}
                  onSubmit={handleContactSubmit}
                />
              </div>
            )}

            {activeUiAction === 'show_slots' && (
              <div className="pl-0 sm:pl-9 my-3">
                <InlineSlotPickerCard
                  projectId={selectedProjectId || projects[0]?.id || ''}
                  onBookSlot={handleBookSlot}
                  isBooking={isBookingVisit}
                />
              </div>
            )}

            {activeBooking && activeUiAction === null && !messages.some((m) => m.bookingId === activeBooking.bookingId) && (
              <div className="pl-0 sm:pl-9 my-3">
                <BookingConfirmationCard
                  bookingId={activeBooking.bookingId}
                  startsAt={activeBooking.startsAt}
                  projectName={activeProject.name}
                  executiveName={activeBooking.executiveName}
                  executivePhone={activeBooking.executivePhone}
                  manageToken={activeBooking.manageToken}
                  onReschedule={() => handleChatRescheduleRequest(activeBooking.bookingId)}
                  onCancel={() => handleChatCancel(activeBooking.bookingId)}
                />
              </div>
            )}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex items-center gap-2 text-muted text-xs pl-2 py-2" aria-label="Advisor is typing">
                <div className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="flex gap-1 items-center px-3 py-2 rounded-xl bg-surface border border-hairline shadow-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* 3. QUICK REPLIES BAR (Assistant Suggestions) */}
      {activeQuickReplies.length > 0 && !isSending && !isTyping && (
        <div className="px-4 py-2 bg-surface/80 border-t border-hairline flex-shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider select-none flex-shrink-0">
              Suggestions:
            </span>
            {activeQuickReplies.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(chip)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full border border-accent/25 bg-surface hover:bg-accent-soft text-accent text-xs font-medium transition-colors shadow-subtle hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. WARNING & STATUS NOTICES */}
      {(fallbackWarning || rateLimitMessage || isHandoff || conversationStatus === 'human') && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="flex-1 leading-relaxed">
              {rateLimitMessage || fallbackWarning || (conversationStatus === 'human' ? 'You are speaking directly with a dedicated sales executive.' : null)}
            </span>
            {lastFailedMessage && !isSending && (
              <button
                type="button"
                onClick={() => {
                  const retryText = lastFailedMessage;
                  setLastFailedMessage(null);
                  setFallbackWarning(null);
                  void handleSendMessage(retryText);
                }}
                className="font-semibold underline text-amber-900 hover:text-amber-950 px-2 py-0.5 rounded hover:bg-amber-500/20 transition-colors flex-shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5. COMPOSER INPUT BAR */}
      <div className="p-3 sm:p-4 bg-surface border-t border-hairline flex-shrink-0 shadow-lg">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputMessage);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                currentLang === 'hi'
                  ? 'बजट, 2/3 BHK या साइट विज़िट के बारे में पूछें...'
                  : currentLang === 'gu'
                    ? 'બજેટ, 2/3 BHK અથવા સાઇટ વિઝિટ વિશે પૂછો...'
                    : 'Ask about 2/3 BHK, amenities, pricing, or schedule a visit...'
              }
              disabled={isSending || isInitializing}
              className="flex-1 px-4 py-2.5 rounded-xl border border-hairline bg-background text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
              aria-label="Your message to the AI residence advisor"
            />

            <Button
              type="submit"
              variant="primary"
              disabled={!inputMessage.trim() || isSending || isInitializing}
              className="px-4 py-2.5 rounded-xl justify-center flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>

          {/* Regulatory Footer */}
          <div className="mt-2 text-center flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              RERA Reg: {activeProject.rera_number || 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126'}
            </span>
            <span>Protected under Digital Personal Data Protection (DPDP) Act 2023</span>
          </div>
        </div>
      </div>
    </div>
  );
};
