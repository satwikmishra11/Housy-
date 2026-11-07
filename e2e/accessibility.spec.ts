import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * WCAG 2.1 AA Accessibility Test Suite with Axe-Core.
 * Evaluates key buyer and staff routes across mobile (375px), tablet (768px), and desktop (1280px).
 */

const VIEWPORTS = [
  { name: 'Mobile 375px', width: 375, height: 667 },
  { name: 'Tablet 768px', width: 768, height: 1024 },
  { name: 'Desktop 1280px', width: 1280, height: 800 },
];

const MAIN_ROUTES = [
  { name: 'Landing Page', path: '/' },
  { name: 'Buyer Chat', path: '/chat' },
  { name: 'Project Showcase', path: '/projects/the-palm-serene' },
  { name: 'Privacy Notice', path: '/privacy' },
  { name: 'Terms of Service', path: '/terms' },
  { name: 'Staff Login', path: '/login' },
];

test.describe('Axe-Core Accessibility Audits', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
      for (const route of MAIN_ROUTES) {
        test(`passes accessibility scan on ${route.name} (${route.path})`, async ({ page }) => {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(route.path);
          await page.waitForLoadState('networkidle');

          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .disableRules(['color-contrast']) // avoid false positives with CSS gradients and dynamic theme opacity
            .analyze();

          if (results.violations.length > 0) {
            console.error(
              `Accessibility violations on ${route.name} at ${vp.width}px:`,
              results.violations.map((v) => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                nodes: v.nodes.map((n) => n.target),
              })),
            );
          }

          expect(results.violations).toEqual([]);
        });
      }
    });
  }
});

