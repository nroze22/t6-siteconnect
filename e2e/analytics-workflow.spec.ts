import { test, expect } from "@playwright/test";

test.describe("TC-E2E-ANL: Analytics & Intelligence Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for demo data to load and app to render
    await page.waitForTimeout(2000);
    // Dismiss onboarding if present
    const skipBtn = page.getByRole("button", { name: /skip|close|dismiss|get started/i }).first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(300);
    }
  });

  // TC-E2E-ANL-001: Navigate to analytics page
  test("navigates to analytics page with summary metrics", async ({ page }) => {
    // Press "6" for analytics (pipeline is "5")
    await page.keyboard.press("6");
    await page.waitForTimeout(500);

    const analyticsContent = page
      .getByText(/analytics|population|overview|summary|metrics/i)
      .first();
    await expect(analyticsContent).toBeVisible({ timeout: 5000 });
  });

  // TC-E2E-ANL-002: Analytics page shows summary metric cards
  test("analytics page displays summary metrics", async ({ page }) => {
    await page.keyboard.press("6");
    await page.waitForTimeout(500);

    // Look for metric values (numbers, percentages, counts)
    const metricElements = page.locator(
      "[class*='metric'], [class*='stat'], [class*='card'], [class*='summary']"
    );
    const metricCount = await metricElements.count();

    // Also check for numeric content that looks like metrics
    const numbers = page.locator("text=/\\d+/").first();
    const hasNumbers = await numbers.isVisible().catch(() => false);

    expect(metricCount > 0 || hasNumbers).toBe(true);
  });

  // TC-E2E-ANL-003: Analytics page has filter controls
  test("analytics page has filter controls", async ({ page }) => {
    await page.keyboard.press("6");
    await page.waitForTimeout(500);

    // Look for filter buttons, dropdowns, or tab controls
    const filterBtn = page.getByRole("button", { name: /filter|all|week|month|year/i }).first();
    const selectEl = page.locator("select, [role='combobox'], [class*='filter'], [class*='tab']").first();

    const hasFilter = await filterBtn.isVisible().catch(() => false);
    const hasSelect = await selectEl.isVisible().catch(() => false);

    // Accept either filter buttons or select controls
    expect(hasFilter || hasSelect).toBe(true);
  });

  // TC-E2E-ANL-004: Navigate to trials page
  test("navigates to trials page with study information", async ({ page }) => {
    // Press "3" for trials
    await page.keyboard.press("3");
    await page.waitForTimeout(500);

    const trialsContent = page
      .getByText(/trial|study|discovery|protocol/i)
      .first();
    await expect(trialsContent).toBeVisible({ timeout: 5000 });
  });

  // TC-E2E-ANL-005: Trial cards load with study data
  test("trial cards display study information", async ({ page }) => {
    await page.keyboard.press("3");
    await page.waitForTimeout(500);

    // Look for trial card elements
    const trialCards = page.locator(
      "[class*='card'], [class*='trial'], [class*='study']"
    );
    const cardCount = await trialCards.count();

    // Also look for typical study identifiers (NCT numbers, study names)
    const studyId = page.getByText(/NCT|KEYNOTE|Phase|Study/i).first();
    const hasStudyId = await studyId.isVisible().catch(() => false);

    expect(cardCount > 0 || hasStudyId).toBe(true);
  });

  // TC-E2E-ANL-006: Financial data is displayed on trials page
  test("trials page shows financial data", async ({ page }) => {
    await page.keyboard.press("3");
    await page.waitForTimeout(500);

    // Look for dollar amounts or financial indicators
    const dollarAmount = page.locator("text=/\\$[\\d,]+/").first();
    const financialText = page
      .getByText(/budget|revenue|cost|payment|per.patient|reimbursement/i)
      .first();

    const hasDollar = await dollarAmount.isVisible().catch(() => false);
    const hasFinancial = await financialText.isVisible().catch(() => false);

    expect(hasDollar || hasFinancial).toBe(true);
  });

  // TC-E2E-ANL-007: Trials page has search/filter controls
  test("trials page has search or filter controls", async ({ page }) => {
    await page.keyboard.press("3");
    await page.waitForTimeout(500);

    const searchInput = page.getByPlaceholder(/search|filter|find/i).first();
    const filterBtn = page.getByRole("button", { name: /filter|sort|search/i }).first();
    const inputEl = page.locator("input[type='search'], input[type='text']").first();

    const hasSearch = await searchInput.isVisible().catch(() => false);
    const hasFilter = await filterBtn.isVisible().catch(() => false);
    const hasInput = await inputEl.isVisible().catch(() => false);

    expect(hasSearch || hasFilter || hasInput).toBe(true);
  });

  // TC-E2E-ANL-008: Navigate to intelligence page
  test("navigates to intelligence page", async ({ page }) => {
    // Press "8" for intelligence
    await page.keyboard.press("8");
    await page.waitForTimeout(500);

    const intelligenceContent = page
      .getByText(/intelligence|insight|competitive|landscape|market/i)
      .first();
    await expect(intelligenceContent).toBeVisible({ timeout: 5000 });
  });

  // TC-E2E-ANL-009: Navigate to cohort builder
  test("navigates to cohort builder page", async ({ page }) => {
    // Press "7" for cohort builder
    await page.keyboard.press("7");
    await page.waitForTimeout(500);

    const cohortContent = page
      .getByText(/cohort|builder|population|segment|group/i)
      .first();
    await expect(cohortContent).toBeVisible({ timeout: 5000 });
  });

  // TC-E2E-ANL-010: Navigate to performance dashboard
  test("navigates to performance dashboard", async ({ page }) => {
    // Press "9" for performance
    await page.keyboard.press("9");
    await page.waitForTimeout(500);

    const performanceContent = page
      .getByText(/performance|benchmark|site|kpi|metric/i)
      .first();
    await expect(performanceContent).toBeVisible({ timeout: 5000 });
  });

  // TC-E2E-ANL-011: Pipeline page loads
  test("navigates to enrollment pipeline", async ({ page }) => {
    // Press "5" for pipeline
    await page.keyboard.press("5");
    await page.waitForTimeout(500);

    const pipelineContent = page
      .getByText(/pipeline|enrollment|funnel|stage/i)
      .first();
    await expect(pipelineContent).toBeVisible({ timeout: 5000 });
  });

  // TC-E2E-ANL-012: Full analytics navigation round-trip
  test("completes full analytics workflow navigation", async ({ page }) => {
    // 6 → Analytics
    await page.keyboard.press("6");
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/analytics|population|overview/i).first()
    ).toBeVisible({ timeout: 5000 });

    // 3 → Trials
    await page.keyboard.press("3");
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/trial|study|discovery/i).first()
    ).toBeVisible({ timeout: 5000 });

    // 8 → Intelligence
    await page.keyboard.press("8");
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/intelligence|insight|competitive/i).first()
    ).toBeVisible({ timeout: 5000 });

    // 7 → Cohort
    await page.keyboard.press("7");
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/cohort|builder|population/i).first()
    ).toBeVisible({ timeout: 5000 });

    // 9 → Performance
    await page.keyboard.press("9");
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/performance|benchmark|site/i).first()
    ).toBeVisible({ timeout: 5000 });

    // 5 → Pipeline
    await page.keyboard.press("5");
    await page.waitForTimeout(300);
    await expect(
      page.getByText(/pipeline|enrollment|funnel/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
