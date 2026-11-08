import { slotRepository, type SlotRepository } from '../repositories/slot.repository.js';
import { visitRepository, type VisitRepository, type DbVisitDetailsRow } from '../repositories/visit.repository.js';
import { signMagicLinkToken, verifyMagicLinkToken } from '../auth/tokens.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  SlotUnavailableError,
} from '../errors/index.js';
import { getKolkataDateString } from './slot-generator.js';
import { handoffService } from './handoff.service.js';
import type {
  DaySlots,
  SlotItem,
  VisitDetail,
  ProjectSlotsResponse,
  ExecutiveVisitItem,
  ExecutiveVisitsResponse,
  VisitOutcomePayload,
} from '@housy/shared';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function formatTimeInKolkata(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);

  let hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : String(minutes);
  return `${hours}:${minutesStr} ${ampm}`;
}

function getDayName(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0));
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

export class VisitService {
  constructor(
    private readonly slotRepo: SlotRepository = slotRepository,
    private readonly visitRepo: VisitRepository = visitRepository,
  ) { }

  /**
   * Returns open slots grouped by calendar day in Asia/Kolkata for a project.
   * Multiple executives available at the same time collapse into a single chip.
   */
  async getSlotsForProject(
    projectId: string,
    fromStr?: string,
    toStr?: string,
  ): Promise<ProjectSlotsResponse['data']> {
    const now = new Date();
    const todayKolkata = getKolkataDateString(now);

    const fromDateStr = fromStr && /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? fromStr : todayKolkata;

    // Default window: 21 days
    let toDateStr = toStr;
    if (!toDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(toDateStr)) {
      const [y, m, d] = fromDateStr.split('-').map(Number);
      const toCal = new Date(Date.UTC(y!, m! - 1, d! + 21, 12, 0, 0));
      toDateStr = `${toCal.getUTCFullYear()}-${String(toCal.getUTCMonth() + 1).padStart(2, '0')}-${String(toCal.getUTCDate()).padStart(2, '0')}`;
    }

    // Convert calendar date boundaries in IST to UTC range
    // 00:00:00 IST = UTC - 5h30m
    const [fy, fm, fd] = fromDateStr.split('-').map(Number);
    const fromUtc = new Date(Date.UTC(fy!, fm! - 1, fd!, 0, 0, 0) - IST_OFFSET_MS);

    // 23:59:59.999 IST
    const [ty, tm, td] = toDateStr.split('-').map(Number);
    const toUtc = new Date(Date.UTC(ty!, tm! - 1, td!, 23, 59, 59, 999) - IST_OFFSET_MS);

    const groupedSummaries = await this.slotRepo.findOpenSlotsGrouped(
      projectId,
      fromUtc,
      toUtc,
      3, // minimum 3 hours lead time
    );

    // Group into days
    const dayMap = new Map<string, SlotItem[]>();

    for (const item of groupedSummaries) {
      const dateKey = getKolkataDateString(item.starts_at);
      const startDisplay = formatTimeInKolkata(item.starts_at);
      const endDisplay = formatTimeInKolkata(item.ends_at);
      const displayTime = `${startDisplay} - ${endDisplay}`;

      const slotItem: SlotItem = {
        startsAt: new Date(item.starts_at).toISOString(),
        endsAt: new Date(item.ends_at).toISOString(),
        displayTime,
        availableCount: item.available_count,
      };

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, []);
      }
      dayMap.get(dateKey)!.push(slotItem);
    }

    const days: DaySlots[] = [];
    for (const [date, slots] of dayMap.entries()) {
      days.push({
        date,
        dayName: getDayName(date),
        slots,
      });
    }

    days.sort((a, b) => a.date.localeCompare(b.date));

    // If no slots available in the requested range, find next available date
    let nextAvailableDate: string | undefined = undefined;
    if (days.length === 0) {
      const nextUtc = await this.slotRepo.findNextAvailableDate(projectId, toUtc, 3);
      if (nextUtc) {
        nextAvailableDate = getKolkataDateString(nextUtc);
      }
    }

    return {
      days,
      nextAvailableDate,
    };
  }

  /**
   * Atomically books an open slot for a lead inside a single database transaction.
   * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent double-booking.
   * Preferring the executive with lowest active booking load.
   */
  async bookVisit(
    leadId: string,
    projectId: string,
    startsAtIso: string,
    idempotencyKey: string,
  ): Promise<VisitDetail> {
    const startsAt = new Date(startsAtIso);
    if (isNaN(startsAt.getTime())) {
      throw new ValidationError('Invalid startsAt timestamp');
    }

    // Minimum lead time requirement: 3 hours
    const minLeadTimeMs = 3 * 60 * 60 * 1000;
    if (startsAt.getTime() < Date.now() + minLeadTimeMs) {
      throw new ValidationError('Slots must be booked with at least 3 hours lead time.');
    }

    const bookingResult = await this.visitRepo.transaction(async (client) => {
      // 1. Idempotency Check
      const existing = await this.visitRepo.findByIdempotencyKey(idempotencyKey, client);
      if (existing) {
        const details = await this.visitRepo.findDetailsByBookingId(existing.id, client);
        if (details) {
          const token = await signMagicLinkToken({ bookingId: existing.id, leadId });
          return this.formatVisitDetail(details, token);
        }
      }

      // 2. Lead active booking constraint: A lead can have only one confirmed visit
      const activeBooking = await this.visitRepo.findActiveBookingByLeadId(leadId, client);
      if (activeBooking) {
        throw new ConflictError(
          'Lead already has an active confirmed site visit. Please reschedule or cancel the existing visit.',
        );
      }

      // 3. Acquire open slot with SELECT ... FOR UPDATE SKIP LOCKED (preferring lowest load)
      const slot = await this.slotRepo.lockBestSlotForBooking(client, projectId, startsAt, 3);
      if (!slot) {
        const alternatives = await this.slotRepo.findAlternativeSlots(projectId, startsAt, 3, 3, client);
        throw new SlotUnavailableError(
          'The requested slot is no longer available.',
          alternatives,
        );
      }

      // 4. Mark slot booked
      await this.slotRepo.markSlotBooked(client, slot.id);

      // 5. Insert booking
      const booking = await this.visitRepo.insertBooking(client, leadId, slot.id, idempotencyKey);

      // 6. Update lead status to visit_booked and assign to executive
      await client.query(
        `UPDATE leads
         SET status = 'visit_booked', assigned_to = $1, last_activity_at = NOW()
         WHERE id = $2`,
        [slot.executive_id, leadId],
      );

      // 7. Create pre-visit reminders (T-24h and T-2h)
      const visitTimeMs = startsAt.getTime();
      const nowMs = Date.now();

      const tMinus24hMs = visitTimeMs - 24 * 60 * 60 * 1000;
      if (tMinus24hMs > nowMs) {
        await this.visitRepo.insertReminder(client, booking.id, '24h', new Date(tMinus24hMs), 'pending');
      } else {
        // Skip 24h reminder if visit is less than 24h away
        await this.visitRepo.insertReminder(client, booking.id, '24h', new Date(tMinus24hMs), 'skipped');
      }

      const tMinus2hMs = visitTimeMs - 2 * 60 * 60 * 1000;
      await this.visitRepo.insertReminder(client, booking.id, '2h', new Date(tMinus2hMs), 'pending');

      // 8. Sign magic link token
      const token = await signMagicLinkToken({ bookingId: booking.id, leadId });

      // 9. Queue approved outbound confirmation template with RERA registration number
      const projRes = await client.query<{ name: string; display_name?: string; rera_number: string }>(
        `SELECT name, COALESCE(display_name, name) as display_name, rera_number FROM projects WHERE id = $1`,
        [projectId],
      );
      const execRes = await client.query<{ name: string; phone: string | null }>(
        `SELECT name, phone FROM users WHERE id = $1`,
        [slot.executive_id],
      );
      const rawName = projRes.rows[0]?.display_name || projRes.rows[0]?.name || 'The Palm Serene';
      const projectName =
        rawName === 'Project 1'
          ? 'The Palm Serene'
          : rawName === 'Project 2'
            ? 'Skyline Greens'
            : rawName;
      const reraNumber = projRes.rows[0]?.rera_number || 'PR/GJ/AHMEDABAD/AUDA/RAA01234/011126';
      const executiveName = execRes.rows[0]?.name || 'Harshil Mehta';
      const executivePhone = execRes.rows[0]?.phone || '+91 90000 00002';

      const confirmationBody = `Your private residence tour for ${projectName} is confirmed for ${formatTimeInKolkata(startsAt)} with your dedicated host ${executiveName} (${executivePhone}). Sales Gallery: SG Highway, Ahmedabad. Manage your visit: /visit/${token}. RERA Reg: ${reraNumber}`;

      await client.query(
        `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status, sent_at)
         VALUES ($1, 'whatsapp', 'visit_confirmation', $2, 'sent', NOW())`,
        [leadId, confirmationBody],
      );

      // 10. Fetch full formatted details
      const details = await this.visitRepo.findDetailsByBookingId(booking.id, client);
      if (!details) {
        throw new NotFoundError('Failed to load created visit details');
      }

      return this.formatVisitDetail(details, token);
    });

    // 11. Trigger handoff to assigned executive
    try {
      await handoffService.createHandoff(leadId, 'Site visit scheduled');
    } catch {
      // Handoff creation non-blocking for booking return
    }

    return bookingResult;
  }

  /**
   * Reschedules a visit booking in a single atomic swap.
   * Frees old slot, claims new slot, and schedules updated reminders.
   */
  async rescheduleVisit(
    bookingId: string,
    newStartsAtIso: string,
  ): Promise<VisitDetail> {
    const newStartsAt = new Date(newStartsAtIso);
    if (isNaN(newStartsAt.getTime())) {
      throw new ValidationError('Invalid newStartsAt timestamp');
    }

    const minLeadTimeMs = 3 * 60 * 60 * 1000;
    if (newStartsAt.getTime() < Date.now() + minLeadTimeMs) {
      throw new ValidationError('Slots must be booked with at least 3 hours lead time.');
    }

    return this.visitRepo.transaction(async (client) => {
      // 1. Lock current booking
      const booking = await this.visitRepo.findByIdForUpdate(bookingId, client);
      if (!booking || booking.status !== 'confirmed') {
        throw new NotFoundError('Active confirmed booking not found for rescheduling.');
      }

      // Fetch current slot to get project_id
      const currentDetails = await this.visitRepo.findDetailsByBookingId(bookingId, client);
      if (!currentDetails) {
        throw new NotFoundError('Current visit details could not be found.');
      }

      // 2. Free old slot
      await this.slotRepo.markSlotOpen(client, booking.slot_id);

      // 3. Cancel pending reminders from old visit time
      await this.visitRepo.cancelPendingReminders(client, bookingId);

      // 4. Lock candidate new slot
      const newSlot = await this.slotRepo.lockBestSlotForBooking(
        client,
        currentDetails.project_id,
        newStartsAt,
        3,
      );

      if (!newSlot) {
        // Find alternatives for the client
        const alternatives = await this.slotRepo.findAlternativeSlots(
          currentDetails.project_id,
          newStartsAt,
          3,
          3,
          client,
        );
        throw new SlotUnavailableError(
          'The requested new slot is not available.',
          alternatives,
        );
      }

      // 5. Mark new slot booked
      await this.slotRepo.markSlotBooked(client, newSlot.id);

      // 6. Atomically update booking with new slot_id
      await this.visitRepo.updateBookingSlot(client, bookingId, newSlot.id);

      // 7. Update lead's assigned executive and last activity
      await client.query(
        `UPDATE leads
         SET assigned_to = $1, last_activity_at = NOW()
         WHERE id = $2`,
        [newSlot.executive_id, booking.lead_id],
      );

      // 8. Create new reminders for updated visit time
      const newVisitTimeMs = newStartsAt.getTime();
      const nowMs = Date.now();

      const tMinus24hMs = newVisitTimeMs - 24 * 60 * 60 * 1000;
      if (tMinus24hMs > nowMs) {
        await this.visitRepo.insertReminder(client, bookingId, '24h', new Date(tMinus24hMs), 'pending');
      } else {
        await this.visitRepo.insertReminder(client, bookingId, '24h', new Date(tMinus24hMs), 'skipped');
      }

      const tMinus2hMs = newVisitTimeMs - 2 * 60 * 60 * 1000;
      await this.visitRepo.insertReminder(client, bookingId, '2h', new Date(tMinus2hMs), 'pending');

      // 9. Sign token and queue message
      const token = await signMagicLinkToken({ bookingId, leadId: booking.lead_id });
      await client.query(
        `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status)
         VALUES ($1, 'whatsapp', 'visit_rescheduled', $2, 'pending')`,
        [
          booking.lead_id,
          `Your site visit has been rescheduled to ${formatTimeInKolkata(newStartsAt)}. Manage: /visit/${token}`,
        ],
      );

      // 10. Fetch updated details
      const updatedDetails = await this.visitRepo.findDetailsByBookingId(bookingId, client);
      if (!updatedDetails) {
        throw new NotFoundError('Failed to load rescheduled visit details');
      }

      return this.formatVisitDetail(updatedDetails, token);
    });
  }

  /**
   * Cancels a visit booking: frees slot, cancels pending reminders, and updates lead status.
   */
  async cancelVisit(bookingId: string, reason?: string): Promise<VisitDetail> {
    return this.visitRepo.transaction(async (client) => {
      const booking = await this.visitRepo.findByIdForUpdate(bookingId, client);
      if (!booking || booking.status !== 'confirmed') {
        throw new NotFoundError('Active confirmed booking not found for cancellation.');
      }

      // 1. Free the slot
      await this.slotRepo.markSlotOpen(client, booking.slot_id);

      // 2. Cancel pending reminders
      await this.visitRepo.cancelPendingReminders(client, bookingId);

      // 3. Mark booking cancelled
      await this.visitRepo.updateBookingStatus(client, bookingId, 'cancelled');

      // 4. Update lead status back to engaged if no other visit is booked
      await client.query(
        `UPDATE leads
         SET status = 'engaged', last_activity_at = NOW()
         WHERE id = $1 AND status = 'visit_booked'`,
        [booking.lead_id],
      );

      // 5. Outbound message
      await client.query(
        `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status)
         VALUES ($1, 'whatsapp', 'visit_cancelled', $2, 'pending')`,
        [
          booking.lead_id,
          `Your site visit has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
        ],
      );

      const token = await signMagicLinkToken({ bookingId, leadId: booking.lead_id });
      const details = await this.visitRepo.findDetailsByBookingId(bookingId, client);
      if (!details) {
        throw new NotFoundError('Failed to load cancelled visit details');
      }

      return this.formatVisitDetail(details, token);
    });
  }

  /**
   * Validates a buyer magic link token and fetches visit details.
   */
  async getManageDetailsByToken(token: string): Promise<VisitDetail> {
    const payload = await verifyMagicLinkToken(token);
    if (!payload || payload.purpose !== 'manage_visit') {
      throw new UnauthorizedError('Invalid or expired visit link token');
    }

    const details = await this.visitRepo.findDetailsByBookingId(payload.bookingId);
    if (!details) {
      throw new NotFoundError('Visit appointment not found');
    }

    return this.formatVisitDetail(details, token);
  }

  /**
   * Records visit outcome (Visited or No-show).
   * Executives can only record this after the scheduled start time.
   */
  async recordOutcome(
    bookingId: string,
    payload: VisitOutcomePayload,
    userId: string,
    userRole: string,
  ): Promise<VisitDetail> {
    const details = await this.visitRepo.findDetailsByBookingId(bookingId);
    if (!details) {
      throw new NotFoundError('Visit booking not found');
    }

    // Role check: executive can only mark outcome for their own visits; sales_head can mark for all
    if (userRole === 'executive' && details.executive_id !== userId) {
      throw new UnauthorizedError('Executives can only record outcomes for visits assigned to them');
    }

    // Cannot record outcome before start time
    const startsAtMs = new Date(details.starts_at).getTime();
    if (startsAtMs > Date.now()) {
      throw new ValidationError('Cannot record visit outcome before the scheduled visit start time.');
    }

    const newBookingStatus = payload.outcome === 'visited' ? 'completed' : 'no_show';
    const newLeadStatus = payload.outcome === 'visited' ? 'visited' : 'no_show';

    await this.visitRepo.transaction(async (client) => {
      await this.visitRepo.updateBookingStatus(client, bookingId, newBookingStatus);

      await client.query(
        `UPDATE leads
         SET status = $1, last_activity_at = NOW()
         WHERE id = $2`,
        [newLeadStatus, details.lead_id],
      );

      // Add touchpoint recording the visit outcome
      await client.query(
        `INSERT INTO lead_touchpoints (lead_id, source, channel, raw)
         VALUES ($1, 'website', 'visit', $2)`,
        [
          details.lead_id,
          JSON.stringify({
            event: payload.outcome === 'visited' ? 'visit_completed' : 'visit_no_show',
            bookingId,
            recordedBy: userId,
            notes: payload.notes || null,
          }),
        ],
      );
    });

    const updated = await this.visitRepo.findDetailsByBookingId(bookingId);
    const token = await signMagicLinkToken({ bookingId, leadId: details.lead_id });
    return this.formatVisitDetail(updated!, token);
  }

  /**
   * Lists upcoming and awaiting-outcome visits for the staff "My Visits" screen.
   */
  async listStaffVisits(userId: string, role: string): Promise<ExecutiveVisitsResponse['data']> {
    const executiveId = role === 'executive' ? userId : undefined;
    const rows = await this.visitRepo.listVisitsForStaff(executiveId);

    const now = Date.now();
    const upcoming: ExecutiveVisitItem[] = [];
    const awaitingOutcome: ExecutiveVisitItem[] = [];

    for (const row of rows) {
      const startsAtMs = new Date(row.starts_at).getTime();
      const isPast = startsAtMs <= now;

      // Confirmed bookings in the past are awaiting outcome
      const isAwaitingOutcome = isPast && row.status === 'confirmed';

      const item: ExecutiveVisitItem = {
        id: row.booking_id,
        bookingId: row.booking_id,
        leadId: row.lead_id,
        leadName: row.lead_name,
        leadPhone: row.lead_phone,
        leadPublicId: row.lead_public_id,
        projectId: row.project_id,
        projectName: row.project_name,
        projectAddress: row.project_address,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: new Date(row.ends_at).toISOString(),
        status: row.status,
        executiveId: row.executive_id,
        executiveName: row.executive_name,
        isAwaitingOutcome,
        createdAt: new Date(row.created_at).toISOString(),
      };

      if (isAwaitingOutcome) {
        awaitingOutcome.push(item);
      } else if (!isPast && row.status === 'confirmed') {
        upcoming.push(item);
      }
    }

    // Sort upcoming soonest first, awaiting outcome soonest first
    upcoming.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    awaitingOutcome.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    return {
      upcoming,
      awaitingOutcome,
    };
  }

  private formatVisitDetail(row: DbVisitDetailsRow, token: string): VisitDetail {
    const rawName = row.project_name || 'The Palm Serene';
    const resolvedProjectName =
      rawName === 'Project 1'
        ? 'The Palm Serene'
        : rawName === 'Project 2'
          ? 'Skyline Greens'
          : rawName;

    return {
      id: row.booking_id,
      leadId: row.lead_id,
      leadName: row.lead_name,
      leadPhone: row.lead_phone,
      leadPublicId: row.lead_public_id,
      projectId: row.project_id,
      projectName: resolvedProjectName,
      projectAddress: row.project_address,
      lat: Number(row.project_lat),
      lng: Number(row.project_lng),
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: new Date(row.ends_at).toISOString(),
      status: row.status,
      executiveId: row.executive_id,
      executiveName: row.executive_name,
      executivePhone: row.executive_phone,
      token,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}

export const visitService = new VisitService();