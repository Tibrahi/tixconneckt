import { expect, test } from "@playwright/test";

/**
 * Public smoke journeys — no database required.
 * Authenticated journeys run when PLAYWRIGHT_BASE_URL points at a seeded environment.
 */

test("entry point renders authentication first", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.locator("input[type=email]")).toBeVisible();
});

test("registration shows legal gates", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  // Checkboxes stay disabled until each document is read.
  await expect(page.locator("#acceptPrivacy")).toBeDisabled();
  await expect(page.locator("#acceptTerms")).toBeDisabled();
  await expect(page.locator("#acceptAgreement")).toBeDisabled();
});

test("registration validates input", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: /create account/i }).last().click();
  await expect(page.getByText(/full name is required|valid email is required/i).first()).toBeVisible();
});

test("protected routes redirect to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("legal documents render", async ({ page }) => {
  for (const type of ["privacy", "terms", "agreement"]) {
    await page.goto(`/legal/${type}`);
    await expect(page.getByText(/version 1\.0\.0/i)).toBeVisible();
  }
});

test("health endpoint reports status", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.data.service).toBe("tixconneckt");
});

test("landing page stays separate at /welcome", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.locator("main")).toBeVisible();
});
