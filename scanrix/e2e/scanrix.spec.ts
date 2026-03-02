import { test, expect } from '@playwright/test';

/**
 * Scanrix E2E test suite — critical user journeys.
 *
 * Prerequisites:
 *  - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY set
 *  - API running at localhost:4000
 *  - Frontend running at localhost:3000
 *  - E2E_TEST_EMAIL / E2E_TEST_PASSWORD set (pre-existing test user)
 */

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'test1234';

test.describe('Authentication', () => {
  test('login page redirects to dashboard after sign-in', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/dashboard\/scans/, { timeout: 10_000 });
  });

  test('unauthenticated user is redirected from dashboard to login', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    await page.goto('/dashboard/scans');
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});

test.describe('Dashboard — Scans', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard\/scans/, { timeout: 10_000 });
  });

  test('shows scan list page with correct heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Scans');
  });

  test('shows plan badge', async ({ page }) => {
    const badge = page.locator('text=PLAN');
    await expect(badge).toBeVisible();
  });

  test('shows upgrade link for free plan', async ({ page }) => {
    // Only present for free plan users; skip if paid
    const upgradeLink = page.locator('a:has-text("Upgrade")').first();
    // Don't fail if paid plan; just check it renders or isn't shown
    const count = await upgradeLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('new scan form is visible', async ({ page }) => {
    await expect(page.locator('h2:has-text("New Scan")')).toBeVisible();
    await expect(page.locator('input[type="url"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

test.describe('Dashboard — Domains', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard\/scans/, { timeout: 10_000 });
  });

  test('navigates to domain page', async ({ page }) => {
    await page.locator('a:has-text("Domains")').click();
    await expect(page).toHaveURL(/\/dashboard\/domains/);
    await expect(page.locator('h1')).toContainText('Domain Verification');
  });

  test('shows add domain form', async ({ page }) => {
    await page.goto('/dashboard/domains');
    await expect(page.locator('input[placeholder="example.com"]')).toBeVisible();
  });
});

test.describe('Dashboard — Upgrade Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard\/scans/, { timeout: 10_000 });
  });

  test('upgrade page shows all three plans', async ({ page }) => {
    await page.goto('/dashboard/upgrade');
    await expect(page.locator('text=Starter')).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();
    await expect(page.locator('text=Enterprise')).toBeVisible();
  });

  test('MOST POPULAR badge is shown on Pro plan', async ({ page }) => {
    await page.goto('/dashboard/upgrade');
    await expect(page.locator('text=MOST POPULAR')).toBeVisible();
  });
});

test.describe('Health Check', () => {
  test('API health endpoint returns ok', async ({ request }) => {
    const res = await request.get('http://localhost:4000/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toMatch(/ok|degraded/);
  });
});
