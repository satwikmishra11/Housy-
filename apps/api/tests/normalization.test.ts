import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail, nameSimilarity } from '@housy/shared';

describe('Lead Data Normalization & Similarity Utilities', () => {
  describe('normalizePhone', () => {
    it('normalizes 10-digit Indian mobile number to E.164 format', () => {
      expect(normalizePhone('9825012345')).toBe('+919825012345');
    });

    it('strips spaces, dashes, dots, and parentheses', () => {
      expect(normalizePhone('+91 98250-12345')).toBe('+919825012345');
      expect(normalizePhone('+91 (982) 501-2345')).toBe('+919825012345');
      expect(normalizePhone('98250.12345')).toBe('+919825012345');
    });

    it('handles +91, 91, and leading 0 country/trunk prefixes', () => {
      expect(normalizePhone('+919825012345')).toBe('+919825012345');
      expect(normalizePhone('919825012345')).toBe('+919825012345');
      expect(normalizePhone('09825012345')).toBe('+919825012345');
    });

    it('validates that mobile number starts with 6, 7, 8, or 9', () => {
      expect(normalizePhone('6825012345')).toBe('+916825012345');
      expect(normalizePhone('7825012345')).toBe('+917825012345');
      expect(normalizePhone('8825012345')).toBe('+918825012345');
      expect(normalizePhone('9825012345')).toBe('+919825012345');

      // Invalid start digits (0-5)
      expect(normalizePhone('5825012345')).toBeNull();
      expect(normalizePhone('4825012345')).toBeNull();
      expect(normalizePhone('1825012345')).toBeNull();
    });

    it('rejects numbers with invalid digit counts', () => {
      expect(normalizePhone('982501234')).toBeNull(); // 9 digits
      expect(normalizePhone('98250123456')).toBeNull(); // 11 digits
      expect(normalizePhone('123')).toBeNull();
    });

    it('returns null for missing, non-string, or non-numeric inputs', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone('not-a-number')).toBeNull();
    });
  });

  describe('normalizeEmail', () => {
    it('lowercases and trims email addresses', () => {
      expect(normalizeEmail('  HARDIK.PATEL@Example.COM ')).toBe('hardik.patel@example.com');
      expect(normalizeEmail('buyer+test@ahmedabad-properties.in')).toBe('buyer+test@ahmedabad-properties.in');
    });

    it('returns null for invalid email formats', () => {
      expect(normalizeEmail('invalid-email')).toBeNull();
      expect(normalizeEmail('@domain.com')).toBeNull();
      expect(normalizeEmail('user@')).toBeNull();
      expect(normalizeEmail('user@domain')).toBeNull();
      expect(normalizeEmail('')).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail(undefined)).toBeNull();
    });
  });

  describe('nameSimilarity', () => {
    it('returns 1.0 for identical names regardless of case and whitespace', () => {
      expect(nameSimilarity('Hardik Patel', 'Hardik Patel')).toBe(1.0);
      expect(nameSimilarity('HARDIK PATEL', 'hardik patel')).toBe(1.0);
      expect(nameSimilarity('  Hardik   Patel  ', 'Hardik Patel')).toBe(1.0);
    });

    it('calculates high similarity (>= 0.85) for minor variations like middle initials', () => {
      const similarity = nameSimilarity('Hardik Patel', 'Hardik V Patel');
      expect(similarity).toBeGreaterThanOrEqual(0.85);
      expect(similarity).toBeCloseTo(0.8666, 2);
    });

    it('returns 0 for completely different names', () => {
      expect(nameSimilarity('Hardik Patel', 'Nidhi Shah')).toBe(0);
      expect(nameSimilarity('Amit Shah', 'Priya Patel')).toBe(0);
    });

    it('handles empty or missing inputs gracefully', () => {
      expect(nameSimilarity(null, 'Hardik')).toBe(0);
      expect(nameSimilarity('Hardik', undefined)).toBe(0);
      expect(nameSimilarity('', '')).toBe(0);
      expect(nameSimilarity('   ', 'Patel')).toBe(0);
    });
  });
});
