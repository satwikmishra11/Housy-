import { describe, it, expect } from 'vitest';
import i18n, { changeAppLanguage } from '../src/i18n/index.js';

describe('i18n Configuration', () => {
  it('initializes with fallback language en', () => {
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('hi', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('gu', 'translation')).toBe(true);
  });

  it('translates common keys correctly in English', async () => {
    await changeAppLanguage('en');
    expect(i18n.t('common.appName')).toBe('Housy');
    expect(i18n.t('buyer.bookVisit')).toBe('Book a Site Visit');
  });

  it('translates common keys in Hindi', async () => {
    await changeAppLanguage('hi');
    expect(i18n.t('buyer.bookVisit')).toBe('साइट विज़िट बुक करें');
  });

  it('translates common keys in Gujarati', async () => {
    await changeAppLanguage('gu');
    expect(i18n.t('buyer.bookVisit')).toBe('સાઇટ મુલાકાત બુક કરો');
  });
});
