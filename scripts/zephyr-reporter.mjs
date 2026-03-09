#!/usr/bin/env node

/**
 * Zephyr Scale Test Results Reporter
 *
 * Reads Vitest and Playwright JSON results, maps them to test case IDs,
 * and optionally uploads to Zephyr Scale via REST API.
 *
 * Usage:
 *   node scripts/zephyr-reporter.mjs                    # Generate local report
 *   node scripts/zephyr-reporter.mjs --upload            # Upload to Zephyr Scale
 *   ZEPHYR_TOKEN=xxx ZEPHYR_PROJECT=SC node scripts/zephyr-reporter.mjs --upload
 *
 * Environment variables:
 *   ZEPHYR_BASE_URL   - Zephyr Scale API base URL (default: https://api.zephyrscale.smartbear.com/v2)
 *   ZEPHYR_TOKEN      - API access token
 *   ZEPHYR_PROJECT     - Project key (e.g., "SC" for SiteConnect)
 *   ZEPHYR_CYCLE_NAME  - Test cycle name (default: auto-generated with timestamp)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_DIR = join(ROOT, "test-results");
const REPORT_PATH = join(RESULTS_DIR, "validation-report.json");
const REPORT_HTML_PATH = join(RESULTS_DIR, "validation-report.html");

// Configuration
const ZEPHYR_CONFIG = {
  baseUrl: process.env.ZEPHYR_BASE_URL || "https://api.zephyrscale.smartbear.com/v2",
  token: process.env.ZEPHYR_TOKEN || "",
  projectKey: process.env.ZEPHYR_PROJECT || "SC",
  cycleName: process.env.ZEPHYR_CYCLE_NAME || `Automated Run — ${new Date().toISOString().slice(0, 16)}`,
};

const shouldUpload = process.argv.includes("--upload");

// ═══════════════════════════════════════
// Test Case ID Mapping
// Maps test names to formal test case IDs from the RTM
// ═══════════════════════════════════════

const TEST_CASE_MAP = {
  // Store tests → TC IDs
  "useAppStore > navigation > defaults to screening page": "TC-UI-001",
  "useAppStore > navigation > navigates to a different page": "TC-UI-001",
  "useAppStore > navigation > navigates through all pages": "TC-UI-001",
  "useAppStore > session lock > locks the session": "TC-SEC-001",
  "useAppStore > session lock > unlocks the session": "TC-SEC-001",
  "useAppStore > theme > defaults to dark theme": "TC-UI-002",
  "useAppStore > theme > sets theme to light": "TC-UI-002",
  "useAppStore > theme > toggles theme": "TC-UI-002",
  "useAppStore > theme > persists theme to localStorage": "TC-UI-002",
  "useAppStore > status > partially updates status": "TC-UI-003",
  "useAppStore > status > sets LLM status with model": "TC-LLM-001",

  // Screening store tests
  "useScreeningStore > patient selection": "TC-SCR-001",
  "useScreeningStore > filtering > filters by eligible status": "TC-SCR-003",
  "useScreeningStore > filtering > filters by score range": "TC-SCR-003",
  "useScreeningStore > filtering > filters by search query": "TC-SCR-003",
  "useScreeningStore > status counts": "TC-SCR-004",
  "useScreeningStore > review actions": "TC-SCR-005",
  "useScreeningStore > override modal": "TC-SCR-006",

  // Analytics store tests
  "useAnalyticsStore > filters > sets a single filter": "TC-ANL-001",
  "useAnalyticsStore > filters > clears all filters": "TC-ANL-001",
  "useAnalyticsStore > drill-down": "TC-ANL-002",
  "useAnalyticsStore > snapshots": "TC-ANL-003",
  "useAnalyticsStore > compare mode": "TC-ANL-004",

  // Financial engine tests
  "financial-engine > detectArchetype": "TC-FIN-001",
  "financial-engine > archetype catalog": "TC-FIN-002",
  "financial-engine > procedure catalog": "TC-FIN-003",
  "financial-engine > modelStudyFinancials": "TC-FIN-004",
  "financial-engine > recalculateWithAssumptions": "TC-FIN-005",
  "financial-engine > formatRangeCurrency": "TC-FIN-006",
  "financial-engine > computeSiteFitScore": "TC-FIN-009",

  // Population analytics tests
  "population-analytics > runFeasibilityQuery": "TC-ANL-010",
  "population-analytics > forecastEnrollment": "TC-ANL-011",
  "population-analytics > computeDiversityProfile": "TC-ANL-012",
  "population-analytics > PRESET_QUERIES": "TC-ANL-013",

  // Export tests
  "export-csv > buildScreeningCSV": "TC-EXP-001",
  "export-csv > buildDetailedCSV": "TC-EXP-002",
  "pdf-export > wrapReport": "TC-EXP-010",
  "pdf-export > PRINT_STYLES": "TC-EXP-011",

  // Site profile tests
  "useSiteProfileStore > profile updates": "TC-UI-010",
  "useSiteProfileStore > onboarding": "TC-UI-011",
  "useSiteProfileStore > persistence": "TC-UI-012",
};

// ═══════════════════════════════════════
// Result Parsers
// ═══════════════════════════════════════

function parseVitestResults() {
  const vitestPath = join(RESULTS_DIR, "vitest-results.json");
  if (!existsSync(vitestPath)) {
    console.log("⚠  No Vitest results found at", vitestPath);
    return [];
  }

  const raw = JSON.parse(readFileSync(vitestPath, "utf-8"));
  const results = [];

  for (const file of raw.testResults || []) {
    for (const suite of file.assertionResults || []) {
      const fullName = suite.ancestorTitles
        ? [...suite.ancestorTitles, suite.title].join(" > ")
        : suite.fullName || suite.title;

      results.push({
        name: fullName,
        status: suite.status === "passed" ? "Pass" : suite.status === "failed" ? "Fail" : "Blocked",
        duration: suite.duration || 0,
        file: file.name,
        error: suite.failureMessages?.join("\n") || null,
        testCaseId: findTestCaseId(fullName),
        type: "unit",
      });
    }
  }

  return results;
}

function parsePlaywrightResults() {
  const pwPath = join(RESULTS_DIR, "playwright-results.json");
  if (!existsSync(pwPath)) {
    console.log("⚠  No Playwright results found at", pwPath);
    return [];
  }

  const raw = JSON.parse(readFileSync(pwPath, "utf-8"));
  const results = [];

  for (const suite of raw.suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const fullName = `${suite.title} > ${spec.title}`;
        results.push({
          name: fullName,
          status: test.status === "expected" ? "Pass" : "Fail",
          duration: test.results?.[0]?.duration || 0,
          file: suite.file,
          error: test.results?.[0]?.error?.message || null,
          testCaseId: findTestCaseId(fullName),
          type: "e2e",
        });
      }
    }
  }

  return results;
}

function findTestCaseId(testName) {
  // Direct match
  if (TEST_CASE_MAP[testName]) return TEST_CASE_MAP[testName];

  // Partial match
  for (const [pattern, id] of Object.entries(TEST_CASE_MAP)) {
    if (testName.includes(pattern) || pattern.includes(testName)) {
      return id;
    }
  }

  // Extract from test name if it contains TC-xxx pattern
  const tcMatch = testName.match(/TC-[A-Z]+-\d+/);
  if (tcMatch) return tcMatch[0];

  return null;
}

// ═══════════════════════════════════════
// Report Generation
// ═══════════════════════════════════════

function generateReport(vitestResults, playwrightResults) {
  const allResults = [...vitestResults, ...playwrightResults];
  const passed = allResults.filter((r) => r.status === "Pass").length;
  const failed = allResults.filter((r) => r.status === "Fail").length;
  const blocked = allResults.filter((r) => r.status === "Blocked").length;
  const total = allResults.length;

  const mappedCount = allResults.filter((r) => r.testCaseId).length;
  const unmappedCount = total - mappedCount;

  // Group by test case ID
  const byTestCase = {};
  for (const r of allResults) {
    const key = r.testCaseId || "UNMAPPED";
    if (!byTestCase[key]) byTestCase[key] = [];
    byTestCase[key].push(r);
  }

  const report = {
    metadata: {
      project: "TalOS SiteConnect",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      environment: "Development",
      runner: "Vitest + Playwright",
      cycleName: ZEPHYR_CONFIG.cycleName,
    },
    summary: {
      total,
      passed,
      failed,
      blocked,
      passRate: total > 0 ? ((passed / total) * 100).toFixed(1) + "%" : "0%",
      mappedToTestCases: mappedCount,
      unmapped: unmappedCount,
    },
    unitTests: {
      count: vitestResults.length,
      passed: vitestResults.filter((r) => r.status === "Pass").length,
      failed: vitestResults.filter((r) => r.status === "Fail").length,
    },
    e2eTests: {
      count: playwrightResults.length,
      passed: playwrightResults.filter((r) => r.status === "Pass").length,
      failed: playwrightResults.filter((r) => r.status === "Fail").length,
    },
    testCaseResults: byTestCase,
    details: allResults,
  };

  return report;
}

function generateHTMLReport(report) {
  const rows = report.details
    .map(
      (r) => `
    <tr class="${r.status === "Pass" ? "pass" : r.status === "Fail" ? "fail" : "blocked"}">
      <td>${r.testCaseId || "—"}</td>
      <td>${escapeHtml(r.name)}</td>
      <td><span class="badge badge-${r.type}">${r.type}</span></td>
      <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
      <td>${r.duration}ms</td>
      <td class="error">${r.error ? escapeHtml(r.error.slice(0, 200)) : "—"}</td>
    </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TalOS SiteConnect — Validation Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0c0f17; color: #e2e8f0; padding: 40px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 32px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 40px; }
    .card { background: #141824; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; text-align: center; }
    .card-value { font-size: 32px; font-weight: 800; }
    .card-label { font-size: 12px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .pass .card-value { color: #34d399; }
    .fail .card-value { color: #f87171; }
    .rate .card-value { color: #a5b4fc; }
    table { width: 100%; border-collapse: collapse; background: #141824; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b; }
    th { background: #1a1f2e; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; padding: 12px 16px; text-align: left; }
    td { padding: 10px 16px; font-size: 13px; border-top: 1px solid #1e293b; }
    tr.fail { background: rgba(239, 68, 68, 0.04); }
    .badge { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px; }
    .badge-pass { background: rgba(16,185,129,0.12); color: #34d399; }
    .badge-fail { background: rgba(239,68,68,0.12); color: #f87171; }
    .badge-blocked { background: rgba(245,158,11,0.12); color: #fbbf24; }
    .badge-unit { background: rgba(99,102,241,0.12); color: #a5b4fc; }
    .badge-e2e { background: rgba(6,182,212,0.12); color: #22d3ee; }
    .error { font-family: monospace; font-size: 11px; color: #f87171; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .section-title { font-size: 16px; font-weight: 600; margin: 32px 0 16px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <h1>TalOS SiteConnect — Validation Test Report</h1>
  <p class="subtitle">Generated ${report.metadata.timestamp} · ${report.metadata.cycleName}</p>

  <div class="summary">
    <div class="card"><div class="card-value">${report.summary.total}</div><div class="card-label">Total Tests</div></div>
    <div class="card pass"><div class="card-value">${report.summary.passed}</div><div class="card-label">Passed</div></div>
    <div class="card fail"><div class="card-value">${report.summary.failed}</div><div class="card-label">Failed</div></div>
    <div class="card rate"><div class="card-value">${report.summary.passRate}</div><div class="card-label">Pass Rate</div></div>
    <div class="card"><div class="card-value">${report.summary.mappedToTestCases}</div><div class="card-label">Mapped to RTM</div></div>
  </div>

  <div class="section-title">Test Results</div>
  <table>
    <thead>
      <tr>
        <th>Test Case ID</th>
        <th>Test Name</th>
        <th>Type</th>
        <th>Result</th>
        <th>Duration</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <p>TalOS SiteConnect v${report.metadata.version} · Environment: ${report.metadata.environment} · Runner: ${report.metadata.runner}</p>
    <p style="margin-top:8px">This report is generated for IQ/OQ/PQ validation purposes. Results are mapped to the Requirements Traceability Matrix (RTM) via test case IDs.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════
// Zephyr Scale Upload
// ═══════════════════════════════════════

async function uploadToZephyr(report) {
  if (!ZEPHYR_CONFIG.token) {
    console.log("⚠  ZEPHYR_TOKEN not set. Skipping upload.");
    console.log("   Set ZEPHYR_TOKEN, ZEPHYR_PROJECT, and optionally ZEPHYR_BASE_URL to enable.");
    return;
  }

  console.log(`\n📤 Uploading to Zephyr Scale...`);
  console.log(`   Project: ${ZEPHYR_CONFIG.projectKey}`);
  console.log(`   Cycle: ${ZEPHYR_CONFIG.cycleName}`);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ZEPHYR_CONFIG.token}`,
  };

  // 1. Create test cycle
  try {
    const cycleRes = await fetch(`${ZEPHYR_CONFIG.baseUrl}/testcycles`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        projectKey: ZEPHYR_CONFIG.projectKey,
        name: ZEPHYR_CONFIG.cycleName,
        description: `Automated validation run — ${report.summary.total} tests, ${report.summary.passRate} pass rate`,
        statusName: report.summary.failed > 0 ? "In Progress" : "Done",
      }),
    });

    if (!cycleRes.ok) {
      console.log(`   ❌ Failed to create test cycle: ${cycleRes.status} ${cycleRes.statusText}`);
      return;
    }

    const cycle = await cycleRes.json();
    console.log(`   ✓ Created test cycle: ${cycle.key}`);

    // 2. Post test executions
    let uploaded = 0;
    for (const result of report.details) {
      if (!result.testCaseId) continue;

      const execRes = await fetch(`${ZEPHYR_CONFIG.baseUrl}/testexecutions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectKey: ZEPHYR_CONFIG.projectKey,
          testCaseKey: `${ZEPHYR_CONFIG.projectKey}-${result.testCaseId}`,
          testCycleKey: cycle.key,
          statusName: result.status,
          executionTime: result.duration,
          comment: result.error || `Automated ${result.type} test`,
          environment: "Development — macOS",
        }),
      });

      if (execRes.ok) uploaded++;
    }

    console.log(`   ✓ Uploaded ${uploaded} test executions`);
  } catch (err) {
    console.log(`   ❌ Zephyr upload error: ${err.message}`);
  }
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════

async function main() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║  TalOS SiteConnect — Validation Reporter  ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  // Ensure output directory
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  // Parse results
  console.log("📊 Parsing test results...");
  const vitestResults = parseVitestResults();
  const playwrightResults = parsePlaywrightResults();

  console.log(`   Unit tests:  ${vitestResults.length} results`);
  console.log(`   E2E tests:   ${playwrightResults.length} results`);

  // Generate report
  const report = generateReport(vitestResults, playwrightResults);

  // Save JSON report
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n📄 JSON report: ${REPORT_PATH}`);

  // Save HTML report
  const html = generateHTMLReport(report);
  writeFileSync(REPORT_HTML_PATH, html);
  console.log(`📄 HTML report: ${REPORT_HTML_PATH}`);

  // Print summary
  console.log("\n┌────────────────────────────────┐");
  console.log(`│  Total:   ${String(report.summary.total).padStart(4)}                  │`);
  console.log(`│  Passed:  ${String(report.summary.passed).padStart(4)}  ✓              │`);
  console.log(`│  Failed:  ${String(report.summary.failed).padStart(4)}  ✗              │`);
  console.log(`│  Rate:    ${report.summary.passRate.padStart(6)}              │`);
  console.log(`│  Mapped:  ${String(report.summary.mappedToTestCases).padStart(4)} / ${report.summary.total}           │`);
  console.log("└────────────────────────────────┘");

  // Upload if requested
  if (shouldUpload) {
    await uploadToZephyr(report);
  } else {
    console.log("\n💡 Run with --upload to push results to Zephyr Scale");
  }

  // Exit with failure code if tests failed
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
