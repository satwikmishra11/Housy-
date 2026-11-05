import { describe, it, expect } from 'vitest';
import { canContact } from '../src/messaging.js';

describe('DPDP 2023 Consent & canContact Matrix', () => {
  it('returns false when lead is null or undefined', () => {
    expect(canContact(null)).toBe(false);
    expect(canContact(undefined)).toBe(false);
  });

  it('returns true when consent_status is granted and opted_out_at is null', () => {
    expect(canContact({ consent_status: 'granted', opted_out_at: null })).toBe(true);
    expect(canContact({ consentStatus: 'granted', optedOutAt: null })).toBe(true);
  });

  it('returns false when opted_out_at is present, regardless of consent_status', () => {
    expect(
      canContact({
        consent_status: 'granted',
        opted_out_at: '2026-11-06T00:00:00.000Z',
      }),
    ).toBe(false);

    expect(
      canContact({
        consentStatus: 'granted',
        optedOutAt: new Date(),
      }),
    ).toBe(false);
  });

  it('returns false when consent is unknown or withdrawn', () => {
    expect(canContact({ consent_status: 'unknown', opted_out_at: null })).toBe(false);
    expect(canContact({ consent_status: 'withdrawn', opted_out_at: null })).toBe(false);
    expect(canContact({ consentStatus: 'unknown' })).toBe(false);
  });
});

