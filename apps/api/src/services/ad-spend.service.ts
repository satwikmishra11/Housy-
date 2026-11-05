import {
  adSpendRepository,
  type AdSpendRepository,
} from '../repositories/ad-spend.repository.js';
import type {
  LeadSource,
  MonthSpendRecord,
  UpdateMonthlySpendPayload,
} from '@housy/shared';

export const DEFAULT_MONTHLY_SPEND_INR: Record<LeadSource, number> = {
  property_portal: 1200000, // ₹12 Lakh
  social_ad: 1000000,       // ₹10 Lakh
  hoarding_call: 500000,    // ₹5 Lakh
  website: 300000,          // ₹3 Lakh
};

export function normalizeMonthDate(monthInput: string): string {
  // Input may be "YYYY-MM" or "YYYY-MM-DD"
  const parts = monthInput.split('-');
  if (parts.length >= 2) {
    const year = parts[0];
    const month = parts[1]!.padStart(2, '0');
    return `${year}-${month}-01`;
  }
  return monthInput;
}

export interface MonthlySpendResult {
  month: string;
  allocations: MonthSpendRecord[];
  totalInr: number;
  isDefault: boolean;
}

export class AdSpendService {
  constructor(private readonly repo: AdSpendRepository = adSpendRepository) {}

  async getSpendForMonth(monthInput: string): Promise<MonthlySpendResult> {
    const normalizedMonth = normalizeMonthDate(monthInput);
    const recorded = await this.repo.getSpendForMonth(normalizedMonth);

    if (recorded.length > 0) {
      const totalInr = recorded.reduce((sum, r) => sum + r.amountInr, 0);
      return {
        month: normalizedMonth,
        allocations: recorded,
        totalInr,
        isDefault: false,
      };
    }

    // Fall back to defaults summing to ₹30 Lakh (Assumption A7)
    const sources: LeadSource[] = ['property_portal', 'social_ad', 'hoarding_call', 'website'];
    const defaultRecords: MonthSpendRecord[] = sources.map((source) => ({
      month: normalizedMonth,
      source,
      amountInr: DEFAULT_MONTHLY_SPEND_INR[source],
    }));

    const totalInr = defaultRecords.reduce((sum, r) => sum + r.amountInr, 0);

    return {
      month: normalizedMonth,
      allocations: defaultRecords,
      totalInr,
      isDefault: true,
    };
  }

  async updateSpend(payload: UpdateMonthlySpendPayload): Promise<MonthlySpendResult> {
    const normalizedMonth = normalizeMonthDate(payload.month);
    const updatedRecords: MonthSpendRecord[] = [];

    for (const alloc of payload.allocations) {
      const record = await this.repo.upsertSpend(
        normalizedMonth,
        alloc.source,
        alloc.amountInr,
      );
      updatedRecords.push(record);
    }

    const totalInr = updatedRecords.reduce((sum, r) => sum + r.amountInr, 0);

    return {
      month: normalizedMonth,
      allocations: updatedRecords,
      totalInr,
      isDefault: false,
    };
  }

  async listAvailableMonths(): Promise<string[]> {
    return this.repo.listRecordedMonths();
  }
}

export const adSpendService = new AdSpendService();

