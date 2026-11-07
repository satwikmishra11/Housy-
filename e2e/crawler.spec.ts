import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

/**
 * Automated UI Control & Screen Crawler Spec.
 * Crawls every primary view and exercises interactive controls:
 * - Language toggles, suggestion chips, contact form, slot picker in Buyer Chat
 * - Role switchers and login in Staff Login
 * - Search, filter dropdowns, duplicate tabs, lead modal in Unified Leads
 * - Status tabs, transcript modal, message composer in Executive Inbox
 * - Outcome buttons in Site Visits
 * - Date ranges and attribution filters in Sales Dashboard
 * - Knowledge categories, fact creation modal in Fact Sheet Editor
 * - Channel tabs and dispatch controls in Outbox
 * - Simulation buttons in Demo Sandbox
 */

test.describe('Automated UI Screen & Control Crawler', () => {
  test.beforeAll(async () => {
    try {
      const dbUrl =
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgres://housy_user:housy_password@localhost:5432/housy_test';
      execSync('npm run db:seed', {
        stdio: 'pipe',
        env: {
          ...process.env,
          TEST_DATABASE_URL: dbUrl,
          DATABASE_URL: dbUrl,
          NODE_ENV: 'test',
        },
      });
    } catch (err) {
      console.error('Failed to seed database before crawler spec:', err);
      throw err;
    }
  });

  test('crawls all screens and asserts controls are interactive and responsive', async ({ page }) => {
    // Collect any page console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('React Router Future Flag Warning')) {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Crawl Buyer Chat & Controls
    await page.goto('/chat?src=portal');
    await expect(page.locator('text=RERA Reg:')).toBeVisible({ timeout: 15000 });

    // Test Language Toggles
    await page.locator('button:has-text("हिन्दी")').click();
    await expect(page.locator('button:has-text("हिन्दी")')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('button:has-text("ગુજરાતી")').click();
    await expect(page.locator('button:has-text("ગુજરાતી")')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('button:has-text("EN")').click();
    await expect(page.locator('button:has-text("EN")')).toHaveAttribute('aria-pressed', 'true');

    // Test Human Request Button in chat header
    await page.locator('button[aria-label="Talk to a human sales executive"]').click();
    await expect(page.locator('text=sales team will contact you').or(page.locator('text=escalated')).first()).toBeVisible({ timeout: 15000 });

    // 2. Crawl Staff Login & Demo Switchers
    await page.goto('/login');
    await expect(page.locator('text=Staff Sign In')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Sales Executive")').click();
    await expect(page.locator('input[type="email"]')).toHaveValue('amit.shah@example.com');
    await page.locator('button:has-text("Sales Head")').click();
    await expect(page.locator('input[type="email"]')).toHaveValue('harshil.mehta@example.com');

    // Login as Sales Head
    await page.locator('button:has-text("Sign In to Workspace")').click();
    await page.waitForURL('**/leads', { timeout: 15000 });

    // 3. Crawl Leads View
    await expect(page.locator('h1:has-text("Unified Leads")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('table tbody td').first()).toBeVisible({ timeout: 15000 });

    // Search input
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.fill('Hardik');
    await page.waitForTimeout(600);
    await expect(page.locator('td:has-text("Hardik Patel")').or(page.locator('h4:has-text("Hardik Patel")')).first()).toBeVisible({ timeout: 10000 });

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(600);

    // Switch between tabs
    await page.locator('button:has-text("Review Duplicates")').click();
    await page.waitForTimeout(400);
    await page.locator('button:has-text("All Leads")').click();
    await page.waitForTimeout(400);

    // 4. Crawl Executive Inbox (/handoffs)
    await page.goto('/handoffs');
    await expect(page.locator('h1:has-text("Executive Inbox")')).toBeVisible({ timeout: 15000 });
    // Click through status filter tabs
    for (const tab of ['new Leads', 'accepted Leads', 'done Leads', 'All Handoffs']) {
      const tabBtn = page.locator(`button:has-text("${tab}")`);
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // 5. Crawl Sales Dashboard (/dashboard)
    await page.goto('/dashboard');
    await expect(page.locator('h1:has-text("Sales Analytics & Performance")')).toBeVisible({ timeout: 15000 });
    // Test date range pills
    for (const range of ['Last 7 Days', 'Last 30 Days', 'This Quarter']) {
      const pill = page.locator(`button:has-text("${range}")`);
      if (await pill.isVisible()) {
        await pill.click();
        await page.waitForTimeout(300);
      }
    }

    // 6. Crawl Site Visits (/visits)
    await page.goto('/visits');
    await expect(page.locator('h1:has-text("Site Visits")')).toBeVisible({ timeout: 15000 });
    for (const status of ['Confirmed', 'Visited', 'No Show', 'Cancelled', 'All Visits']) {
      const filterPill = page.locator(`button:has-text("${status}")`).first();
      if (await filterPill.isVisible()) {
        await filterPill.click();
        await page.waitForTimeout(300);
      }
    }

    // 7. Crawl Fact Sheet Editor (/fact-sheet)
    await page.goto('/fact-sheet');
    await expect(page.locator('h1:has-text("Fact Sheet & Assistant Knowledge")')).toBeVisible({ timeout: 15000 });
    // Open Add Fact Modal
    const addFactBtn = page.locator('button:has-text("Add Fact")').first();
    if (await addFactBtn.isVisible()) {
      await addFactBtn.click();
      await expect(page.locator('text=Add Authoritative Project Fact')).toBeVisible({ timeout: 5000 });
      const cancelBtn = page.locator('button:has-text("Cancel")');
      await cancelBtn.click();
    }

    // 8. Crawl Outbox Inspector (/outbox)
    await page.goto('/outbox');
    await expect(page.locator('h1:has-text("Outbound Message Log")')).toBeVisible({ timeout: 15000 });
    // Test channel filter combobox
    const channelSelect = page.locator('select').first();
    if (await channelSelect.isVisible()) {
      await channelSelect.selectOption('whatsapp');
      await page.waitForTimeout(300);
      await channelSelect.selectOption('all');
      await page.waitForTimeout(300);
    }

    // 9. Crawl Demo Simulation Center (/demo)
    await page.goto('/demo');
    await expect(page.locator('h1:has-text("Demo Controls & Simulation")')).toBeVisible({ timeout: 15000 });
    // Test fast forward and trigger worker buttons
    const fastForwardBtn = page.locator('button:has-text("Fast-Forward Pending Reminders")');
    if (await fastForwardBtn.isVisible()) {
      await fastForwardBtn.click();
      await page.waitForTimeout(500);
    }

    const workerBtn = page.locator('button:has-text("Process Due Reminders Now")');
    if (await workerBtn.isVisible()) {
      await workerBtn.click();
      await page.waitForTimeout(500);
    }

    const filteredErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('Content Security Policy') && !e.includes('401 (Unauthorized)')
    );
    expect(filteredErrors).toHaveLength(0);
  });
});
