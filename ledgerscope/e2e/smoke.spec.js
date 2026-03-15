const { test, expect } = require('@playwright/test');

function uniqueEmail() {
  return `ledgerscope+${Date.now()}@example.com`;
}

const password = 'Passw0rd!234';
const smokeUser = {
  email: uniqueEmail(),
  password,
};

async function completeOnboardingIfNeeded(page) {
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: /finish onboarding/i }).click();
  }

  await page.waitForURL('**/dashboard', { timeout: 60000 });
}

async function ensureSignedIn(page, user = smokeUser) {
  await page.goto('/login');
  if (page.url().includes('/dashboard')) {
    return;
  }

  const signInError = page.getByText(/invalid email or password|invalid credentials|failed to sign in/i);

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  const signedIn = await page
    .waitForURL(/\/dashboard|\/onboarding/, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (!signedIn) {
    const failed = await signInError.isVisible().catch(() => false);
    if (failed || page.url().includes('/login')) {
      await page.goto('/signup');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: /create account/i }).click();
      await page.waitForURL(/\/onboarding|\/dashboard/, { timeout: 60000 });
    }
  }

  await completeOnboardingIfNeeded(page);
}

test.describe.serial('LedgerScope smoke', () => {
  test('sign in and dashboard load', async ({ page }) => {
    await ensureSignedIn(page);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('transactions filter and edit', async ({ page }) => {
    await ensureSignedIn(page);

    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();

    await page.getByPlaceholder('Search merchant or description').fill('Trader');
    await page.getByRole('button', { name: /apply filters/i }).click();

    const detailsButton = page.getByRole('button', { name: /details/i }).first();
    if (await detailsButton.count()) {
      await detailsButton.click();
      await expect(page.getByRole('button', { name: /close/i })).toBeVisible();

      const purposeSelect = page.locator('label:has-text("Purpose") select').first();
      await purposeSelect.selectOption('personal');
      await expect(page.getByText(/purpose label updated\./i)).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: /close/i }).click();
    }

    await page.getByRole('button', { name: /reset/i }).click();
  });

  test('budget create, edit, delete', async ({ page }) => {
    await ensureSignedIn(page);

    await page.goto('/budgets');
    await expect(page.getByRole('heading', { name: /budgets/i })).toBeVisible();

    await page.getByRole('button', { name: /^create budget$/i }).first().click();
    await page.getByPlaceholder('Category').fill('Smoke Budget');
    await page.getByPlaceholder('Budget amount').fill('250');
    await page.getByPlaceholder('Actual spent').fill('25');
    await page.getByPlaceholder('Pending spent').fill('10');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/budget created\.|budget saved\./i)).toBeVisible({ timeout: 15000 });

    const smokeCard = page.locator('article', { hasText: 'Smoke Budget' }).first();
    await smokeCard.getByRole('button', { name: /edit budget/i }).click();
    await page.getByPlaceholder('Budget amount').fill('300');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/budget updated\.|budget saved\./i)).toBeVisible({ timeout: 15000 });

    await smokeCard.getByRole('button', { name: /^delete$/i }).click();
    await page.getByRole('button', { name: /delete budget/i }).click();
    await expect(page.getByText(/deleted budget/i)).toBeVisible({ timeout: 15000 });
  });

  test('export generate and download', async ({ page }) => {
    await ensureSignedIn(page);

    await page.goto('/exports');
    await expect(page.getByRole('heading', { name: /exports/i })).toBeVisible();

    await page.getByRole('button', { name: /generate export/i }).click();
    await expect(page.getByText(/export generated successfully\./i)).toBeVisible({ timeout: 30000 });

    const downloadButton = page.getByRole('button', { name: /download|open file/i }).first();
    if (await downloadButton.count()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await downloadButton.click();
      await downloadPromise;
    }
  });
});
