import { ValidationError } from '../errors/AppError.js';

export interface MessageTemplate {
  key: string;
  requiredVars: string[];
  render: (vars: Record<string, string | number>) => string;
}

export const TEMPLATES: Record<string, MessageTemplate> = {
  visit_confirmation: {
    key: 'visit_confirmation',
    requiredVars: ['projectName', 'startsAt', 'executiveName', 'reraNumber', 'manageUrl'],
    render: (vars) =>
      `Your private residence tour for ${vars.projectName} is confirmed for ${vars.startsAt} with your dedicated host ${vars.executiveName}. Sales Gallery: SG Highway, Ahmedabad. Manage your visit: ${vars.manageUrl}. RERA Reg: ${vars.reraNumber}`,
  },
  reminder_24h: {
    key: 'reminder_24h',
    requiredVars: ['projectName', 'startsAt', 'executiveName', 'reraNumber', 'manageUrl'],
    render: (vars) =>
      `Reminder: Your private residence tour for ${vars.projectName} is scheduled for tomorrow at ${vars.startsAt} with ${vars.executiveName}. Sales Gallery: SG Highway, Ahmedabad. Need to reschedule? Visit: ${vars.manageUrl}. RERA Reg: ${vars.reraNumber}`,
  },
  reminder_2h: {
    key: 'reminder_2h',
    requiredVars: ['projectName', 'startsAt', 'executiveName', 'reraNumber', 'mapsUrl'],
    render: (vars) =>
      `Your private tour of ${vars.projectName} begins in 2 hours at ${vars.startsAt}. Your residence host ${vars.executiveName} will meet you at the Sales Gallery. Directions: ${vars.mapsUrl}. RERA Reg: ${vars.reraNumber}`,
  },
  first_response_link: {
    key: 'first_response_link',
    requiredVars: ['projectName', 'brochureUrl', 'reraNumber'],
    render: (vars) =>
      `Thank you for your inquiry about ${vars.projectName}. Explore our RERA-approved digital brochure and verified residence floor plans: ${vars.brochureUrl}. RERA Reg: ${vars.reraNumber}`,
  },
};

export function renderTemplate(
  templateName: string,
  payload: Record<string, unknown>,
): { templateKey: string; body: string } {
  const template = TEMPLATES[templateName];
  if (!template) {
    throw new ValidationError(`Unknown template key: '${templateName}'. Approved templates: ${Object.keys(TEMPLATES).join(', ')}`);
  }

  // Check required variables
  for (const reqVar of template.requiredVars) {
    if (payload[reqVar] === undefined || payload[reqVar] === null || payload[reqVar] === '') {
      throw new ValidationError(`Missing required template variable: '${reqVar}' for template '${templateName}'`);
    }
  }

  const stringVars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string' || typeof v === 'number') {
      stringVars[k] = v;
    }
  }

  const renderedBody = template.render(stringVars);
  return {
    templateKey: template.key,
    body: renderedBody,
  };
}
