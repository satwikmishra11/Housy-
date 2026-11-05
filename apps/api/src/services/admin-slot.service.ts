import {
  adminSlotRepository,
  type AdminSlotRepository,
} from '../repositories/admin-slot.repository.js';
import { slotRepository, type SlotRepository } from '../repositories/slot.repository.js';
import { runSlotGeneration } from '../jobs/slot-generator.job.js';
import { NotFoundError, ConflictError } from '../errors/index.js';
import type {
  AdminAvailabilityRule,
  AdminBlackoutDate,
  AdminSlotItem,
  CreateAvailabilityRulePayload,
  CreateBlackoutDatePayload,
} from '@housy/shared';

export interface RuleOperationResult {
  rule: AdminAvailabilityRule;
  createdSlotsCount: number;
}

export interface BlackoutOperationResult {
  blackoutDate: AdminBlackoutDate;
  createdSlotsCount: number;
}

export class AdminSlotService {
  constructor(
    private readonly adminSlotRepo: AdminSlotRepository = adminSlotRepository,
    private readonly slotRepo: SlotRepository = slotRepository,
  ) {}

  async listRules(projectId?: string): Promise<AdminAvailabilityRule[]> {
    return this.adminSlotRepo.listAvailabilityRules(projectId);
  }

  async createRule(payload: CreateAvailabilityRulePayload): Promise<RuleOperationResult> {
    const rule = await this.adminSlotRepo.insertAvailabilityRule(payload);
    // Automatically trigger slot generation to materialize new slots immediately
    const createdSlotsCount = await runSlotGeneration(this.slotRepo, 21);
    return { rule, createdSlotsCount };
  }

  async deleteRule(id: string): Promise<{ success: boolean; createdSlotsCount: number }> {
    const deleted = await this.adminSlotRepo.deleteAvailabilityRule(id);
    if (!deleted) {
      throw new NotFoundError(`Availability rule with ID '${id}' not found`);
    }
    const createdSlotsCount = await runSlotGeneration(this.slotRepo, 21);
    return { success: true, createdSlotsCount };
  }

  async listBlackoutDates(projectId?: string): Promise<AdminBlackoutDate[]> {
    return this.adminSlotRepo.listBlackoutDates(projectId);
  }

  async createBlackoutDate(payload: CreateBlackoutDatePayload): Promise<BlackoutOperationResult> {
    const blackoutDate = await this.adminSlotRepo.insertBlackoutDate(payload);
    const createdSlotsCount = await runSlotGeneration(this.slotRepo, 21);
    return { blackoutDate, createdSlotsCount };
  }

  async deleteBlackoutDate(id: string): Promise<{ success: boolean; createdSlotsCount: number }> {
    const deleted = await this.adminSlotRepo.deleteBlackoutDate(id);
    if (!deleted) {
      throw new NotFoundError(`Blackout date record with ID '${id}' not found`);
    }
    const createdSlotsCount = await runSlotGeneration(this.slotRepo, 21);
    return { success: true, createdSlotsCount };
  }

  async listSlotsPreview(filters: {
    projectId?: string;
    executiveId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AdminSlotItem[]> {
    return this.adminSlotRepo.listSlotsPreview(filters);
  }

  async blockSlot(
    slotId: string,
  ): Promise<{ success: boolean; slotId: string; status: 'blocked' }> {
    const slot = await this.adminSlotRepo.getSlotWithBooking(slotId);
    if (!slot) {
      throw new NotFoundError(`Slot with ID '${slotId}' not found`);
    }

    if (slot.status === 'booked' || slot.booking) {
      const visitor = slot.booking?.leadName || 'a visitor';
      const ref = slot.booking?.leadPublicId ? ` (${slot.booking.leadPublicId})` : '';
      throw new ConflictError(
        `Cannot block slot: an active site visit is booked for ${visitor}${ref}. Please reschedule or cancel the appointment before blocking.`,
      );
    }

    await this.adminSlotRepo.updateSlotStatus(slotId, 'blocked');
    return { success: true, slotId, status: 'blocked' };
  }

  async unblockSlot(
    slotId: string,
  ): Promise<{ success: boolean; slotId: string; status: 'open' }> {
    const slot = await this.adminSlotRepo.getSlotWithBooking(slotId);
    if (!slot) {
      throw new NotFoundError(`Slot with ID '${slotId}' not found`);
    }

    if (slot.status === 'booked' || slot.booking) {
      throw new ConflictError('Cannot unblock a booked slot');
    }

    await this.adminSlotRepo.updateSlotStatus(slotId, 'open');
    return { success: true, slotId, status: 'open' };
  }

  async triggerSlotGeneration(days = 21): Promise<{ success: boolean; createdSlotsCount: number }> {
    const createdSlotsCount = await runSlotGeneration(this.slotRepo, days);
    return { success: true, createdSlotsCount };
  }
}

export const adminSlotService = new AdminSlotService();

