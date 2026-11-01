import { expect, test } from "@playwright/test";

/**
 * Public smoke journeys — no database required.
 * Authenticated journeys run when PLAYWRIGHT_BASE_URL points at a seeded environment.
 */

test("entry point shows the landing page to visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Turn skills and ideas into work that moves forward." })).toBeVisible();
  await expect(page.getByRole("link", { name: /create your account/i }).first()).toBeVisible();
});

test("landing buttons lead to sign in and registration", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^sign in$/i }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: /create your account/i }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test("legacy /welcome redirects to the landing page", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Turn skills and ideas into work that moves forward." })).toBeVisible();
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

test("registration inputs keep focus through fast typing, edits, validation, and keyboard navigation", async ({ page }) => {
  await page.goto("/register");
  const name = page.getByRole("textbox", { name: "Full name" });
  const email = page.getByRole("textbox", { name: "Email" });

  await name.focus();
  await page.keyboard.type("hello");
  await expect(name).toHaveValue("hello");
  await expect(name).toBeFocused();

  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.insertText("X");
  await expect(name).toHaveValue("hXello");
  await expect(name).toBeFocused();

  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("pasted text");
  await expect(name).toHaveValue("pasted text");
  await expect(name).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();

  await page.getByRole("button", { name: /create account/i }).last().click();
  await expect(page.getByText(/valid email is required/i).first()).toBeVisible();
  await email.fill("hello@example.com");
  await expect(email).toBeFocused();
  await page.keyboard.type("2");
  await expect(email).toHaveValue("hello@example.com2");
  await expect(email).toBeFocused();
});

test("protected routes redirect to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("legal documents render", async ({ page }) => {
  for (const type of ["privacy", "terms", "agreement"]) {
    await page.goto(`/legal/${type}`);
    await expect(page.getByText("Version 1.0.0", { exact: true })).toBeVisible();
  }
});

test("health endpoint reports status", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.data.service).toBe("tixconneckt");
});

test("landing page is honest", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
  // States the build status and in-development features…
  await expect(page.getByText(/tixconneckt is being built/i)).toBeVisible();
  await expect(page.getByText(/in development/i).first()).toBeVisible();
  // …and contains no fabricated statistics or testimonials.
  await expect(page.getByText(/120K\+|120,000\+|850\+|12K\+|\$3\.2M\+/)).toHaveCount(0);
  await expect(page.getByText(/you’re on the list|request received/i)).toHaveCount(0);
});
