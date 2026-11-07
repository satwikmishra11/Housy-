import {
  normalizePhone,
  normalizeEmail,
  type LeadSource,
  type LeadIngestInput,
  type LeadIngestOutcome,
  type CsvPreviewRow,
  type CsvCommitPayload,
} from '@housy/shared';
import { leadRepository, type LeadDbRow } from '../repositories/lead.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { chatSessionRepository } from '../repositories/chat-session.repository.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../errors/index.js';
import { query } from '../db/index.js';

export class LeadIngestService {
  /**
   * Core lead ingestion pipeline:
   * 1. Idempotency check on external_id.
   * 2. Exact phone or email match -> records touchpoint, updates last activity, returns merged.
   * 3. Same project + name similarity >= 0.85 -> creates lead with possible_duplicate_of set.
   * 4. Otherwise -> creates a new lead.
   * 5. Consent check: if consent granted -> queues first_response_link outbox message & records first_response_at;
   *    if no consent -> records consent withdrawn and never messages.
   */
  async ingest(payload: LeadIngestInput, source: LeadSource): Promise<LeadIngestOutcome> {
    // 1. Idempotency check on external_id
    if (payload.externalId) {
      const existingTouchpoint = await leadRepository.findTouchpointBySourceAndExternalId(
        source,
        payload.externalId,
      );
      if (existingTouchpoint) {
        return {
          outcome: 'idempotent',
          leadId: existingTouchpoint.lead_id,
          message: 'Lead previously ingested with this external_id',
        };
      }
    }

    const phoneE164 = normalizePhone(payload.phone);
    const email = normalizeEmail(payload.email);

    // 2. Exact Deduplication
    let exactMatch: LeadDbRow | null = null;
    if (phoneE164) {
      exactMatch = await leadRepository.findExactByPhone(phoneE164);
    }
    if (!exactMatch && email) {
      exactMatch = await leadRepository.findExactByEmail(email);
    }

    if (exactMatch) {
      // Record new touchpoint
      await leadRepository.addTouchpoint({
        leadId: exactMatch.id,
        source,
        channel: source,
        externalId: payload.externalId,
        raw: payload.meta,
      });

      // Update last activity
      await leadRepository.updateLastActivity(exactMatch.id);

      // If existing lead lacked phone or email, update them
      if (!exactMatch.phone_e164 && phoneE164) {
        await leadRepository.updatePhone(exactMatch.id, phoneE164);
      }

      // Check consent
      if (payload.consent !== undefined) {
        await leadRepository.recordConsent(exactMatch.id, payload.consent, source);
        if (payload.consent && !exactMatch.first_response_at) {
          await this.sendFirstResponseLink(exactMatch.id, exactMatch.name);
        }
      }

      return {
        outcome: 'merged',
        leadId: exactMatch.id,
        publicId: exactMatch.public_id,
        message: 'Matched existing lead by phone or email; added touchpoint',
      };
    }

    // 3. Fuzzy Deduplication (Same project + name similarity >= 0.85 via pg_trgm)
    let possibleDuplicateOf: string | null = null;
    const fuzzyMatch = await leadRepository.findFuzzyByNameAndProject(
      payload.name,
      payload.projectId ?? null,
    );

    if (fuzzyMatch) {
      possibleDuplicateOf = fuzzyMatch.id;
    }

    // 4. Create Lead
    const newLead = await leadRepository.createLead({
      name: payload.name.trim(),
      phoneE164,
      email,
      source,
      projectId: payload.projectId ?? null,
      wants: payload.wants ?? '2 BHK',
      budgetMin: payload.budgetMin ?? null,
      budgetMax: payload.budgetMax ?? null,
      timeline: payload.timeline ?? null,
      language: payload.language ?? 'en',
      status: 'new',
      possibleDuplicateOf,
      consentStatus: payload.consent === false ? 'withdrawn' : 'granted',
    });

    // Record initial touchpoint
    await leadRepository.addTouchpoint({
      leadId: newLead.id,
      source,
      channel: source,
      externalId: payload.externalId,
      raw: payload.meta,
    });

    // 5. Consent & Outbox Handling
    if (payload.consent !== false) {
      await leadRepository.recordConsent(newLead.id, true, source);
      await this.sendFirstResponseLink(newLead.id, newLead.name);
    } else {
      await leadRepository.recordConsent(newLead.id, false, source);
    }

    if (possibleDuplicateOf) {
      return {
        outcome: 'possible_duplicate',
        leadId: newLead.id,
        publicId: newLead.public_id,
        duplicateOf: possibleDuplicateOf,
        message: 'Created lead flagged as possible duplicate for human review',
      };
    }

    return {
      outcome: 'created',
      leadId: newLead.id,
      publicId: newLead.public_id,
      message: 'New lead created successfully',
    };
  }

  /**
   * Helper to queue outbound first response message with chat link.
   */
  private async sendFirstResponseLink(leadId: string, buyerName: string): Promise<void> {
    const chatUrl = `https://housy.example.com/chat/${leadId}`;
    const body = `Namaste ${buyerName}, thank you for contacting us regarding our residential properties in Ahmedabad. Connect with our digital sales assistant here: ${chatUrl}`;
    await leadRepository.queueOutboundFirstResponse(leadId, 'whatsapp', 'first_response_link', body);
  }

  /**
   * Late phone arrival for anonymous web chat leads.
   */
  async attachPhoneToConversation(
    conversationId: string,
    rawPhone: string,
    rawName?: string,
  ): Promise<{ outcome: 'attached' | 'merged'; leadId: string }> {
    const phoneE164 = normalizePhone(rawPhone);
    if (!phoneE164) {
      throw new ValidationError('Invalid Indian mobile phone number');
    }

    // Find conversation and its lead
    const res = await query<{ lead_id: string | null }>(
      `SELECT lead_id FROM conversations WHERE id = $1 LIMIT 1`,
      [conversationId],
    );
    const convRow = res.rows[0];
    if (!convRow) {
      throw new NotFoundError('Conversation not found');
    }

    const currentLeadId = convRow.lead_id;

    // Check if another lead already exists with this phone
    const existingLead = await leadRepository.findExactByPhone(phoneE164);
    if (existingLead) {
      if (currentLeadId && currentLeadId !== existingLead.id) {
        // Merge conversation into existing lead
        await leadRepository.mergeAnonymousConversation(currentLeadId, existingLead.id, conversationId);
      } else {
        await chatRepository.linkLeadToConversation(conversationId, existingLead.id);
        const session = await chatSessionRepository.findByConversationId(conversationId);
        if (session) {
          await chatSessionRepository.linkLead(session.id, existingLead.id);
        }
      }
      return { outcome: 'merged', leadId: existingLead.id };
    }

    if (!currentLeadId) {
      const session = await chatSessionRepository.findByConversationId(conversationId);
      const newLead = await leadRepository.createLead({
        name: rawName?.trim() || 'Website Buyer',
        phoneE164,
        email: null,
        source: session?.source ?? 'website',
        projectId: session?.project_id ?? null,
        wants: 'Exploring residential projects',
        language: session?.language ?? 'en',
        status: 'new',
        consentStatus: 'granted',
      });
      await chatRepository.linkLeadToConversation(conversationId, newLead.id);
      if (session) {
        await chatSessionRepository.linkLead(session.id, newLead.id);
      }
      return { outcome: 'attached', leadId: newLead.id };
    }

    // Update phone on the current lead
    await leadRepository.updatePhone(currentLeadId, phoneE164);
    if (rawName && rawName.trim().length > 0) {
      await query(`UPDATE leads SET name = $1, last_activity_at = NOW() WHERE id = $2`, [
        rawName.trim(),
        currentLeadId,
      ]);
    }

    return { outcome: 'attached', leadId: currentLeadId };
  }

  /**
   * Manual lead merge: moves touchpoints, conversations, bookings, handoffs,
   * consents, outbound messages, and deletes the secondary lead.
   */
  async mergeLeads(
    primaryLeadId: string,
    secondaryLeadId: string,
    actor: { id: string; role: string },
  ): Promise<void> {
    if (primaryLeadId === secondaryLeadId) {
      throw new BadRequestError('Cannot merge a lead into itself');
    }

    const [primary, secondary] = await Promise.all([
      leadRepository.findById(primaryLeadId),
      leadRepository.findById(secondaryLeadId),
    ]);

    if (!primary || !secondary) {
      throw new NotFoundError('One or both leads not found');
    }

    // Role-based permission check
    if (actor.role === 'executive') {
      if (primary.assigned_to !== actor.id) {
        throw new ForbiddenError('Executives can only merge leads assigned to themselves');
      }
      if (secondary.assigned_to !== null && secondary.assigned_to !== actor.id) {
        throw new ForbiddenError(
          'Cannot merge lead assigned to another executive without Sales Head permission',
        );
      }
    }

    await leadRepository.mergeLeadsTransaction(primaryLeadId, secondaryLeadId);
  }

  /**
   * Keep separate: dismisses a possible duplicate flag.
   */
  async keepSeparate(leadId: string, actor: { id: string; role: string }): Promise<void> {
    const lead = await leadRepository.findById(leadId);
    if (!lead) {
      throw new NotFoundError('Lead not found');
    }

    if (actor.role === 'executive' && lead.assigned_to !== actor.id) {
      throw new ForbiddenError('Cannot modify a lead assigned to another executive');
    }

    await leadRepository.clearPossibleDuplicate(leadId);
  }

  /**
   * Preview CSV rows before committing import.
   * Matches columns case-insensitively and classifies each row as new, duplicate, possible_duplicate, or invalid.
   */
  async previewCsv(
    rawRows: Record<string, string>[],
    defaultSource: LeadSource,
  ): Promise<{
    total: number;
    validCount: number;
    invalidCount: number;
    rows: CsvPreviewRow[];
  }> {
    const previewRows: CsvPreviewRow[] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      const keys = Object.keys(row);

      const findVal = (patterns: string[]): string => {
        for (const pattern of patterns) {
          const matchKey = keys.find((k) => k.toLowerCase().trim() === pattern);
          if (matchKey && row[matchKey]) {
            return row[matchKey]!.trim();
          }
        }
        return '';
      };

      const name = findVal(['name', 'full name', 'lead name', 'buyer name']);
      const rawPhone = findVal(['phone', 'mobile', 'contact', 'phone number', 'phone_e164']);
      const rawEmail = findVal(['email', 'e-mail', 'email address']);
      const projectName = findVal(['project', 'project name', 'property']);
      const wants = findVal(['wants', 'bhk', 'requirement', 'type']) || '2 BHK';
      const consentStr = findVal(['consent', 'optin', 'opt-in', 'opt_in']);
      const consent = consentStr ? !['false', 'no', '0'].includes(consentStr.toLowerCase()) : true;

      const phone = normalizePhone(rawPhone);
      const email = normalizeEmail(rawEmail);
      const errors: string[] = [];

      if (!name) {
        errors.push('Name is required');
      }
      if (rawPhone && !phone) {
        errors.push('Invalid Indian mobile phone number (must be 10 digits starting 6-9)');
      }
      if (rawEmail && !email) {
        errors.push('Invalid email address');
      }
      if (!phone && !email) {
        errors.push('Either a valid mobile phone number or email address is required');
      }

      if (errors.length > 0) {
        invalidCount++;
        previewRows.push({
          rowIndex: i + 1,
          raw: row,
          normalized: {
            name,
            phone,
            email,
            source: defaultSource,
            projectName: projectName || undefined,
            wants,
            consent,
          },
          classification: 'invalid',
          errors,
        });
        continue;
      }

      // Check for exact duplicate in database
      let match: LeadDbRow | null = null;
      if (phone) {
        match = await leadRepository.findExactByPhone(phone);
      }
      if (!match && email) {
        match = await leadRepository.findExactByEmail(email);
      }

      if (match) {
        validCount++;
        previewRows.push({
          rowIndex: i + 1,
          raw: row,
          normalized: {
            name,
            phone,
            email,
            source: defaultSource,
            projectName: projectName || undefined,
            wants,
            consent,
          },
          classification: 'duplicate',
          matchedLeadId: match.id,
          matchedLeadName: match.name,
          errors: [],
        });
        continue;
      }

      // Check for fuzzy name similarity in database
      const fuzzy = await leadRepository.findFuzzyByNameAndProject(name, null);
      if (fuzzy) {
        validCount++;
        previewRows.push({
          rowIndex: i + 1,
          raw: row,
          normalized: {
            name,
            phone,
            email,
            source: defaultSource,
            projectName: projectName || undefined,
            wants,
            consent,
          },
          classification: 'possible_duplicate',
          matchedLeadId: fuzzy.id,
          matchedLeadName: fuzzy.name,
          errors: [],
        });
        continue;
      }

      // Otherwise new lead
      validCount++;
      previewRows.push({
        rowIndex: i + 1,
        raw: row,
        normalized: {
          name,
          phone,
          email,
          source: defaultSource,
          projectName: projectName || undefined,
          wants,
          consent,
        },
        classification: 'new',
        errors: [],
      });
    }

    return {
      total: rawRows.length,
      validCount,
      invalidCount,
      rows: previewRows,
    };
  }

  /**
   * Commit verified CSV rows.
   */
  async commitCsv(
    source: LeadSource,
    rows: CsvCommitPayload['rows'],
  ): Promise<{ imported: number; merged: number; possibleDuplicates: number }> {
    let imported = 0;
    let merged = 0;
    let possibleDuplicates = 0;

    for (const r of rows) {
      const outcome = await this.ingest(
        {
          name: r.name,
          phone: r.phone,
          email: r.email,
          projectId: r.projectId,
          wants: r.wants,
          budgetMin: r.budgetMin,
          budgetMax: r.budgetMax,
          consent: r.consent,
          externalId: r.externalId,
        },
        source,
      );

      if (outcome.outcome === 'created') {
        imported++;
      } else if (outcome.outcome === 'merged' || outcome.outcome === 'idempotent') {
        merged++;
      } else if (outcome.outcome === 'possible_duplicate') {
        possibleDuplicates++;
      }
    }

    return { imported, merged, possibleDuplicates };
  }
}

export const leadIngestService = new LeadIngestService();
