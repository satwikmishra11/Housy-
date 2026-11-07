import { test, expect } from '@playwright/test';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/assets/screenshots');

test.describe('TDD Screenshot Captures', () => {
  test.beforeAll(async () => {
    try {
      execSync('npm run db:seed', { stdio: 'pipe' });
    } catch (err) {
      console.error('Failed to seed database before screenshots test:', err);
      throw err;
    }
  });

  test('capture all primary screens across desktop and phone viewports', async ({ browser }) => {
    // 1. Phone Viewport Context (390x844, iPhone 14 style)
    const phoneContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const phonePage = await phoneContext.newPage();

    // 2. Desktop Viewport Context (1280x800)
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const desktopPage = await desktopContext.newPage();

    // --- Buyer Chat (Fresh Greeting) ---
    await phonePage.goto('/chat?src=portal');
    await phonePage.waitForSelector('input[aria-label="Your message to the AI residence advisor"]', { timeout: 15000 });
    await phonePage.waitForTimeout(600);
    await phonePage.screenshot({ path: path.join(SCREENSHOT_DIR, '01-chat-greeting-phone.png') });

    await desktopPage.goto('/chat?src=portal');
    await desktopPage.waitForSelector('input[aria-label="Your message to the AI residence advisor"]', { timeout: 15000 });
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01-chat-greeting-desktop.png') });

    // --- Buyer Chat Interactive Booking Flow (Phone) ---
    const chatInput = phonePage.locator('input[aria-label="Your message to the AI residence advisor"]');
    await chatInput.fill('नमस्ते, मुझे 2 BHK फ्लैट देखने के लिए साइट विज़िट बुक करनी है।');
    await phonePage.locator('button[aria-label="Send message"]').click();
    await phonePage.waitForSelector('#contact-name', { timeout: 15000 });
    await phonePage.locator('#contact-name').fill('राकेश पटेल');
    await phonePage.locator('#contact-phone').fill('9825123456');
    const consent = phonePage.locator('#dpdp-consent');
    if (!(await consent.isChecked())) {
      await consent.check();
    }
    await phonePage.locator('button:has-text("Continue to Select Slots")').click();
    await phonePage.waitForSelector('[aria-label="Available Site Visit Slots"]', { timeout: 15000 });
    const slotButtons = phonePage.locator('[aria-label="Available time slots"] button');
    await expect(slotButtons.first()).toBeVisible({ timeout: 10000 });
    await slotButtons.first().click();
    await phonePage.locator('button:has-text("Confirm Site Visit")').click();
    await phonePage.waitForSelector('text=Visit Confirmed', { timeout: 15000 });
    await phonePage.waitForTimeout(600);
    await phonePage.screenshot({ path: path.join(SCREENSHOT_DIR, '02-chat-booking-confirmed-phone.png') });

    // --- Staff Login Page ---
    await desktopPage.goto('/login');
    await desktopPage.waitForSelector('text=Staff Sign In', { timeout: 15000 });
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03-login-desktop.png') });

    await phonePage.goto('/login');
    await phonePage.waitForSelector('text=Staff Sign In', { timeout: 15000 });
    await phonePage.waitForTimeout(600);
    await phonePage.screenshot({ path: path.join(SCREENSHOT_DIR, '03-login-phone.png') });

    // --- Log in as Sales Head on Desktop ---
    await desktopPage.locator('button:has-text("Sales Head")').click();
    await expect(desktopPage.locator('input[type="email"]')).toHaveValue('harshil.mehta@example.com');
    await desktopPage.locator('button:has-text("Sign In to Workspace")').click();
    await desktopPage.waitForURL('**/leads', { timeout: 15000 });
    await desktopPage.waitForSelector('table tbody td', { timeout: 15000 });
    await desktopPage.waitForTimeout(800);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '04-leads-desktop.png') });

    // --- Log in as Sales Head on Phone ---
    await phonePage.locator('button:has-text("Sales Head")').click();
    await expect(phonePage.locator('input[type="email"]')).toHaveValue('harshil.mehta@example.com');
    await phonePage.locator('button:has-text("Sign In to Workspace")').click();
    await phonePage.waitForURL('**/leads', { timeout: 15000 });
    await phonePage.waitForSelector('h1:has-text("Unified Leads")', { timeout: 15000 });
    await phonePage.waitForTimeout(800);
    await phonePage.screenshot({ path: path.join(SCREENSHOT_DIR, '04-leads-phone.png') });

    // --- Executive Inbox / Handoffs ---
    await desktopPage.goto('/handoffs');
    await desktopPage.waitForSelector('h1:has-text("Executive Inbox")', { timeout: 15000 });
    await desktopPage.waitForTimeout(800);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '05-handoffs-desktop.png') });

    await phonePage.goto('/handoffs');
    await phonePage.waitForSelector('h1:has-text("Executive Inbox")', { timeout: 15000 });
    await phonePage.waitForTimeout(800);
    await phonePage.screenshot({ path: path.join(SCREENSHOT_DIR, '05-handoffs-phone.png') });

    // --- Sales Analytics Dashboard ---
    await desktopPage.goto('/dashboard');
    await desktopPage.waitForSelector('h1:has-text("Sales Analytics & Performance")', { timeout: 15000 });
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '06-dashboard-desktop.png') });

    await phonePage.goto('/dashboard');
    await phonePage.waitForSelector('h1:has-text("Sales Analytics & Performance")', { timeout: 15000 });
    await phonePage.waitForTimeout(1000);
    await phonePage.screenshot({ path: path.join(SCREENSHOT_DIR, '06-dashboard-phone.png') });

    // --- Fact Sheet Knowledge Base Editor (Desktop) ---
    await desktopPage.goto('/fact-sheet');
    await desktopPage.waitForSelector('h1:has-text("Fact Sheet & Assistant Knowledge")', { timeout: 15000 });
    await desktopPage.waitForTimeout(800);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07-factsheet-desktop.png') });

    // --- Site Visits & Calendar (Desktop) ---
    await desktopPage.goto('/visits');
    await desktopPage.waitForSelector('h1:has-text("Site Visits")', { timeout: 15000 });
    await desktopPage.waitForTimeout(800);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08-visits-desktop.png') });

    await phoneContext.close();
    await desktopContext.close();
  });
});
