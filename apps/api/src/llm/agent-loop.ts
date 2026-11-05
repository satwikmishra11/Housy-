import type { ChatLanguage, Fact } from '@housy/shared';
import { logger } from '../utils/logger.js';
import { llmService } from './llm.service.js';
import type { LLMMessage } from './llm.types.js';
import { buildSystemPrompt } from './prompts.js';
import {
  CHAT_TOOLS,
  UpdateLeadProfileArgsSchema,
  GetOpenSlotsArgsSchema,
  RequestHumanArgsSchema,
  SendReplyArgsSchema,
  type SendReplyArgs,
} from './tools.js';
import { chatRepository, type MessageRecord } from '../repositories/chat.repository.js';
import { visitService } from '../services/visit.service.js';

export interface LeadProfileContext {
  id: string;
  name?: string;
  phone_e164?: string | null;
  consent_status?: string;
  budget_min?: number | null;
  budget_max?: number | null;
  wants?: string;
  timeline?: string | null;
  project_id?: string | null;
  projectName?: string;
}

export interface AgentLoopParams {
  conversationId: string;
  lead: LeadProfileContext;
  messageHistory: MessageRecord[];
  activeFacts: Fact[];
  language: ChatLanguage;
  projectId?: string;
}

export type AgentLoopResult =
  | { success: true; reply: SendReplyArgs; isHandoff?: boolean }
  | { success: false; reason: string; error?: unknown };

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const { conversationId, lead, messageHistory, activeFacts, language, projectId } = params;

  const systemPrompt = buildSystemPrompt({
    activeFacts,
    language,
    leadProfile: {
      name: lead.name,
      budgetMin: lead.budget_min ?? undefined,
      budgetMax: lead.budget_max ?? undefined,
      wants: lead.wants,
      timeline: lead.timeline ?? undefined,
      projectName: lead.projectName,
    },
  });

  const messages: LLMMessage[] = messageHistory.map((m) => ({
    role: m.role === 'buyer' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system',
    content: m.content,
  }));

  const maxRounds = 4;
  let finalReply: SendReplyArgs | null = null;
  let handoffTriggered = false;

  try {
    for (let round = 1; round <= maxRounds; round++) {
      const response = await llmService.chat(
        {
          system: systemPrompt,
          messages,
          tools: CHAT_TOOLS,
        },
        conversationId,
      );

      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Record assistant turn in message history for conversation continuity
        messages.push({
          role: 'assistant',
          content: response.text ?? '',
          toolCalls: response.toolCalls,
        });

        for (const call of response.toolCalls) {
          if (call.name === 'send_reply') {
            const parsed = SendReplyArgsSchema.safeParse(call.arguments);
            if (parsed.success) {
              const reply = { ...parsed.data };

              // Check if show_slots was requested but phone or consent is missing
              if (reply.ui_action === 'show_slots') {
                const hasPhone = Boolean(lead.phone_e164);
                const hasConsent = lead.consent_status === 'granted';

                if (!hasPhone || !hasConsent) {
                  reply.ui_action = 'collect_contact';
                }
              }

              finalReply = reply;
              break;
            } else {
              logger.warn(
                { errors: parsed.error.issues, arguments: call.arguments },
                'Invalid send_reply arguments from LLM',
              );
              // Supply error to tool result
              messages.push({
                role: 'tool',
                toolCallId: call.id,
                name: call.name,
                content: JSON.stringify({
                  error: 'Validation failed for send_reply arguments',
                  details: parsed.error.issues,
                }),
              });
            }
          } else if (call.name === 'update_lead_profile') {
            const parsed = UpdateLeadProfileArgsSchema.safeParse(call.arguments);
            let toolResult: Record<string, unknown>;

            if (parsed.success) {
              await chatRepository.updateLeadProfile(lead.id, {
                budgetMin: parsed.data.budget_min,
                budgetMax: parsed.data.budget_max,
                wants: parsed.data.wants,
                projectId: parsed.data.project,
                timeline: parsed.data.timeline,
                language: parsed.data.language,
              });
              toolResult = { success: true, updated: parsed.data };
            } else {
              toolResult = { success: false, error: parsed.error.issues };
            }

            messages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify(toolResult),
            });
          } else if (call.name === 'get_open_slots') {
            const parsed = GetOpenSlotsArgsSchema.safeParse(call.arguments);
            let toolResult: Record<string, unknown>;

            if (parsed.success) {
              const targetProject = parsed.data.project || projectId || lead.project_id;
              if (!targetProject) {
                toolResult = {
                  success: false,
                  error: 'Project ID is required to fetch site visit slots',
                };
              } else {
                try {
                  const slots = await visitService.getSlotsForProject(
                    targetProject,
                    parsed.data.from,
                    parsed.data.to,
                  );
                  toolResult = { success: true, slots };
                } catch (err) {
                  toolResult = {
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                  };
                }
              }
            } else {
              toolResult = { success: false, error: parsed.error.issues };
            }

            messages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify(toolResult),
            });
          } else if (call.name === 'request_human') {
            const parsed = RequestHumanArgsSchema.safeParse(call.arguments);
            let toolResult: Record<string, unknown>;

            if (parsed.success) {
              handoffTriggered = true;
              await chatRepository.flagConversation(conversationId, ['human_requested']);
              await chatRepository.createHandoff(lead.id, conversationId, parsed.data.reason, {
                source: 'ai_tool_call',
              });
              toolResult = { success: true, message: 'Sales executive notified' };
            } else {
              toolResult = { success: false, error: parsed.error.issues };
            }

            messages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify(toolResult),
            });
          } else {
            messages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
            });
          }
        }

        if (finalReply) {
          return {
            success: true,
            reply: finalReply,
            isHandoff: handoffTriggered,
          };
        }
      } else if (response.text) {
        // Plain text response without tool call
        return {
          success: true,
          reply: {
            text: response.text,
            cited_fact_ids: [],
            confidence: 0.85,
            language,
          },
          isHandoff: handoffTriggered,
        };
      }
    }

    return {
      success: false,
      reason: 'max_rounds_exceeded',
    };
  } catch (err) {
    logger.error({ error: err, conversationId }, 'Agent loop failure');
    return {
      success: false,
      reason: 'llm_error',
      error: err,
    };
  }
}
