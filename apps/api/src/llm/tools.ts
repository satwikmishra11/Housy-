import { z } from 'zod';
import type { LLMToolDefinition } from './llm.types.js';

export const UpdateLeadProfileArgsSchema = z.object({
  budget_min: z.number().int().nonnegative().optional(),
  budget_max: z.number().int().nonnegative().optional(),
  wants: z.string().optional(),
  project: z.string().optional(),
  timeline: z.string().optional(),
  language: z.enum(['en', 'hi', 'gu']).optional(),
});
export type UpdateLeadProfileArgs = z.infer<typeof UpdateLeadProfileArgsSchema>;

export const GetOpenSlotsArgsSchema = z.object({
  project: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type GetOpenSlotsArgs = z.infer<typeof GetOpenSlotsArgsSchema>;

export const RequestHumanArgsSchema = z.object({
  reason: z.string().min(2),
});
export type RequestHumanArgs = z.infer<typeof RequestHumanArgsSchema>;

export const SendReplyArgsSchema = z.object({
  text: z.string().min(1),
  cited_fact_ids: z.array(z.string().uuid()).default([]),
  confidence: z.number().min(0).max(1).default(0.9),
  language: z.enum(['en', 'hi', 'gu']).default('en'),
  quick_replies: z.array(z.string()).optional(),
  ui_action: z.enum(['show_slots', 'collect_contact']).optional(),
});
export type SendReplyArgs = z.infer<typeof SendReplyArgsSchema>;

export const CHAT_TOOLS: LLMToolDefinition[] = [
  {
    name: 'update_lead_profile',
    description:
      'Update the qualification profile for the current lead (budget min/max, BHK/wants, preferred project, timeline, language).',
    parameters: {
      type: 'object',
      properties: {
        budget_min: {
          type: 'integer',
          description: 'Minimum budget in INR (e.g. 9500000 for ₹95 Lakh)',
        },
        budget_max: {
          type: 'integer',
          description: 'Maximum budget in INR (e.g. 12000000 for ₹1.2 Cr)',
        },
        wants: {
          type: 'string',
          description: 'Buyer preferences, e.g. "3 BHK high floor garden facing"',
        },
        project: {
          type: 'string',
          description: 'Project ID or name if known',
        },
        timeline: {
          type: 'string',
          description: 'Possession timeline, e.g. "Late 2026" or "Immediate"',
        },
        language: {
          type: 'string',
          enum: ['en', 'hi', 'gu'],
          description: 'Preferred communication language',
        },
      },
    },
  },
  {
    name: 'get_open_slots',
    description:
      'Query real open site visit slots for a project. Returns availability grouped by date in Asia/Kolkata.',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project UUID to fetch available slots for',
        },
        from: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (defaults to today)',
        },
        to: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (defaults to 14 days out)',
        },
      },
    },
  },
  {
    name: 'request_human',
    description:
      'Trigger an escalation / handoff to a sales executive when the buyer requests human contact or asks for details absent from the fact sheet.',
    parameters: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          description: 'Detailed reason for human handoff',
        },
      },
    },
  },
  {
    name: 'send_reply',
    description:
      'Emit the final reply to the buyer. You MUST invoke this tool to send your message. You MUST cite fact IDs for all specific facts stated.',
    parameters: {
      type: 'object',
      required: ['text', 'cited_fact_ids', 'confidence', 'language'],
      properties: {
        text: {
          type: 'string',
          description: 'The polished final response text to the buyer',
        },
        cited_fact_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'UUIDs of facts from the FACT SHEET that ground the information in text',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score between 0.0 and 1.0 that the reply is completely accurate and grounded',
        },
        language: {
          type: 'string',
          enum: ['en', 'hi', 'gu'],
          description: 'Language code matching the buyer message',
        },
        quick_replies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional 2-3 short suggestion chips for the buyer',
        },
        ui_action: {
          type: 'string',
          enum: ['show_slots', 'collect_contact'],
          description: 'UI action: show_slots to present visit booking picker, collect_contact to prompt for phone and consent',
        },
      },
    },
  },
];
