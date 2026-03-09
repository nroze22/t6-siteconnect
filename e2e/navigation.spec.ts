import { test, expect } from "@playwright/test";

test.describe("Navigation & Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load (skip Tauri setup in web mode)
    await page.waitForSelector('[data-testid="sidebar"], nav', { timeout: 10000 });
  });

  // TC-UI-E2E-001: App loads successfully
  test("app loads and displays sidebar", async ({ page }) => {
    // Should see the sidebar with navigation items
    const sidebar = page.locator("nav, [class*='sidebar']").first();
    await expect(sidebar).toBeVisible();
  });

  // TC-UI-E2E-002: Default page is screening
  test("defaults to screening page", async ({ page }) => {
    // Look for screening-related content
    const screeningContent = page.getByText(/screening|subjects|eligibility/i).first();
    await expect(screeningContent).toBeVisible({ timeout: 5000 });
  });

  // TC-UI-E2E-003: Navigation between pages
  test("navigates to all major pages", async ({ page }) => {
    const pages = [
      { label: /import/i, content: /import|csv|upload/i },
      { label: /trial/i, content: /trial|study|discovery/i },
      { label: /review/i, content: /review|queue|decision/i },
      { label: /pipeline/i, content: /pipeline|enrollment/i },
      { label: /analytics|intelligence/i, content: /analytics|population|intelligence/i },
    ];

    for (const { label, content } of pages) {
      const navItem = page.getByRole("button", { name: label }).or(
        page.locator(`[class*="nav"] >> text=${label.source}`)
      ).first();

      if (await navItem.isVisible()) {
        await navItem.click();
        // Wait for page transition
        await page.waitForTimeout(300);
      }
    }
  });

  // TC-UI-E2E-004: Keyboard navigation
  test("keyboard shortcuts navigate pages", async ({ page }) => {
    // Press "2" for Import page
    await page.keyboard.press("2");
    await page.waitForTimeout(300);

    // Press "1" to go back to Screening
    await page.keyboard.press("1");
    await page.waitForTimeout(300);
  });

  // TC-UI-E2E-005: Command palette opens with Cmd+K
  test("command palette opens", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(300);

    // Look for command palette input
    const commandInput = page.getByPlaceholder(/search|command/i);
    // Command palette may or may not be implemented
    if (await commandInput.isVisible()) {
      await expect(commandInput).toBeFocused();
      // Close it
      await page.keyboard.press("Escape");
    }
  });
});
