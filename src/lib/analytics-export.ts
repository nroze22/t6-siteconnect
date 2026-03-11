/**
 * Multi-Format Export Engine for the Analytics Platform.
 * Supports CSV, Excel-compatible (HTML table), and PDF report deck exports.
 * All exports run locally — no data leaves the device.
 */

import { exportPrintableHTML, PRINT_STYLES } from "@/lib/pdf-export";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import type {
  FeasibilityResult,
  FeasibilityCriterion,
  DiversityProfile,
} from "@/lib/population-analytics";

// ============================================================
// Types for Monte Carlo / Site Performance (not in population-analytics)
// ============================================================

export interface MonteCarloConfig {
  targetEnrollment: number;
  simulationCount: number;
  consentRate: number;
  screenFailureRate: number;
  monthlyNewPatientRate: number;
  startDate: string;
}

export interface MonteCarloResult {
  medianMonths: number;
  p10Months: number;
  p90Months: number;
  completionProbability: number;
  monthlyProjection: { month: string; p10: number; p50: number; p90: number; target: number }[];
  simulations: number;
}

export interface StudyMetric {
  studyName: string;
  sponsor: string;
  indication: string;
  enrolled: number;
  target: number;
  screenFailRate: number;
  avgCycleTimeDays: number;
  revenue: number;
}

// ============================================================
// 1. CSV EXPORT
// ============================================================

export interface CSVExportOptions {
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
  includeTimestamp?: boolean;
}

function escapeCSVValue(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportCSV(options: CSVExportOptions): Promise<string | undefined> {
  const { filename, headers, rows, includeTimestamp } = options;

  const lines: string[] = [];

  if (includeTimestamp) {
    lines.push(`# Exported: ${new Date().toISOString()}`);
  }

  lines.push(headers.map(escapeCSVValue).join(","));

  for (const row of rows) {
    lines.push(row.map(escapeCSVValue).join(","));
  }

  const csvContent = lines.join("\r\n");
  // BOM for Excel compatibility with UTF-8
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });

  return triggerDownload(blob, `${filename}.csv`);
}

// ============================================================
// 2. EXCEL-COMPATIBLE EXPORT (HTML table with .xls extension)
// ============================================================

export interface ExcelExportOptions {
  filename: string;
  sheets: {
    name: string;
    headers: string[];
    rows: (string | number | null)[][];
  }[];
}

function escapeHTML(val: string | number | null): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportExcel(options: ExcelExportOptions): Promise<string | undefined> {
  const { filename, sheets } = options;

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>`;

  for (const sheet of sheets) {
    html += `
        <x:ExcelWorksheet>
          <x:Name>${escapeHTML(sheet.name)}</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet>`;
  }

  html += `
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table { border-collapse: collapse; }
    th { background: #4f46e5; color: white; font-weight: bold; padding: 8px 12px; text-align: left; }
    td { padding: 6px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>`;

  for (const sheet of sheets) {
    html += `
  <table>
    <thead>
      <tr>${sheet.headers.map((h) => `<th>${escapeHTML(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>`;

    for (const row of sheet.rows) {
      html += `
      <tr>${row.map((v) => `<td>${escapeHTML(v)}</td>`).join("")}</tr>`;
    }

    html += `
    </tbody>
  </table>`;
  }

  html += `
</body>
</html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  return triggerDownload(blob, `${filename}.xls`);
}

// ============================================================
// 3. REPORT DECK BUILDER
// ============================================================

export interface ReportSection {
  type: "title" | "metrics" | "table" | "text" | "divider";
  title?: string;
  subtitle?: string;
  metrics?: { label: string; value: string; note?: string; accent?: boolean }[];
  headers?: string[];
  rows?: (string | number)[][];
  text?: string;
  columns?: number; // for metrics grid: 2, 3, or 4
}

export interface ReportDeckOptions {
  title: string;
  subtitle?: string;
  confidential?: boolean;
  sections: ReportSection[];
}

function renderSection(section: ReportSection): string {
  switch (section.type) {
    case "title":
      return `
      <div class="section">
        <h2>${escapeHTML(section.title ?? "")}</h2>
        ${section.subtitle ? `<p style="color:#64748b;font-size:10pt;margin-top:-6px;">${escapeHTML(section.subtitle)}</p>` : ""}
      </div>`;

    case "metrics": {
      const cols = section.columns ?? 3;
      const gridStyle = `grid-template-columns: repeat(${cols}, 1fr)`;
      const metrics = section.metrics ?? [];
      return `
      ${section.title ? `<div class="section"><h2>${escapeHTML(section.title)}</h2></div>` : ""}
      <div class="metrics-grid" style="${gridStyle}">
        ${metrics.map((m) => `
          <div class="metric-card${m.accent ? " accent" : ""}">
            <div class="label">${escapeHTML(m.label)}</div>
            <div class="value">${escapeHTML(m.value)}</div>
            ${m.note ? `<div class="note">${escapeHTML(m.note)}</div>` : ""}
          </div>
        `).join("")}
      </div>`;
    }

    case "table": {
      const headers = section.headers ?? [];
      const rows = section.rows ?? [];
      return `
      ${section.title ? `<div class="section"><h2>${escapeHTML(section.title)}</h2></div>` : ""}
      <table class="data-table">
        <thead>
          <tr>${headers.map((h) => `<th>${escapeHTML(h)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>${row.map((v) => `<td>${escapeHTML(v)}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
      <div style="margin-bottom:20px;"></div>`;
    }

    case "text":
      return `
      ${section.title ? `<div class="section"><h2>${escapeHTML(section.title)}</h2></div>` : ""}
      <div style="font-size:10pt;color:#334155;margin-bottom:20px;line-height:1.6;">
        ${escapeHTML(section.text ?? "")}
      </div>`;

    case "divider":
      return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />`;

    default:
      return "";
  }
}

export async function exportReportDeck(options: ReportDeckOptions): Promise<{ filePath?: string; fileName?: string }> {
  const { title, subtitle, confidential, sections } = options;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const bodyHTML = `
    <div class="report-header">
      <div>
        <h1>${escapeHTML(title)}</h1>
        ${subtitle ? `<div class="subtitle">${escapeHTML(subtitle)}</div>` : ""}
      </div>
      <div class="meta">
        <div class="date">${today}</div>
        ${confidential ? `<div class="confidential">Confidential</div>` : ""}
      </div>
    </div>

    ${sections.map(renderSection).join("\n")}
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHTML(title)} — TalOS SiteConnect</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="print-actions">
    <button class="print-btn primary" onclick="window.print()">Print / Save PDF</button>
    <button class="print-btn secondary" onclick="window.close()">Close</button>
  </div>

  ${bodyHTML}

  <div class="report-footer">
    <div>
      <span class="brand">TalOS SiteConnect</span> — AI-Powered Clinical Trial Site Intelligence
    </div>
    <div>${today}</div>
  </div>
</body>
</html>`;

  const safeFilename = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();
  const result = await exportPrintableHTML(html, safeFilename);
  return { filePath: result.filePath, fileName: result.fileName };
}

// ============================================================
// 4. DATA GRID EXPORT HELPER
// ============================================================

export function objectsToExportData<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string; formatter?: (val: unknown) => string }[],
): { headers: string[]; rows: (string | number | null)[][] } {
  const headers = columns.map((c) => c.header);
  const rows = data.map((item) =>
    columns.map((col) => {
      const raw = item[col.key];
      if (col.formatter) return col.formatter(raw);
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "number") return raw;
      return String(raw);
    }),
  );
  return { headers, rows };
}

// ============================================================
// 5. QUICK EXPORT PRESETS
// ============================================================

export const EXPORT_PRESETS = {
  feasibilityReport(result: FeasibilityResult, criteria: FeasibilityCriterion[]): ReportDeckOptions {
    return {
      title: `Feasibility Report: ${result.queryName}`,
      subtitle: "Protocol Feasibility Analysis",
      confidential: true,
      sections: [
        {
          type: "metrics",
          title: "Overview",
          columns: 4,
          metrics: [
            { label: "Total Patients", value: String(result.totalPatients) },
            { label: "Matching", value: String(result.matchingPatients), accent: true },
            { label: "Match Rate", value: `${(result.matchRate * 100).toFixed(1)}%`, accent: true },
            { label: "Avg Age", value: String(result.demographics.avgAge) },
          ],
        },
        {
          type: "table",
          title: "Criterion Breakdown",
          headers: ["Criterion", "Matches", "Rate"],
          rows: result.criterionBreakdown.map((cb) => [
            cb.criterion,
            cb.matchCount,
            `${(cb.matchRate * 100).toFixed(1)}%`,
          ]),
        },
        {
          type: "metrics",
          title: "Gender Distribution",
          columns: 3,
          metrics: [
            { label: "Male", value: String(result.demographics.genderSplit.male) },
            { label: "Female", value: String(result.demographics.genderSplit.female) },
            { label: "Other", value: String(result.demographics.genderSplit.other) },
          ],
        },
        {
          type: "table",
          title: "Race Distribution",
          headers: ["Race", "Count"],
          rows: Object.entries(result.demographics.raceSplit)
            .sort(([, a], [, b]) => b - a)
            .map(([race, count]) => [race, count]),
        },
        {
          type: "text",
          title: "Applied Criteria",
          text: criteria
            .map((c, i) => `${i + 1}. ${c.type}: ${c.field || c.value} (${c.operator} ${c.value}${c.valueTo ? ` to ${c.valueTo}` : ""})`)
            .join("\n"),
        },
      ],
    };
  },

  diversityProfile(profile: DiversityProfile): ReportDeckOptions {
    return {
      title: "Patient Diversity Profile",
      subtitle: "FDA Diversity Guidance Compliance Assessment",
      confidential: true,
      sections: [
        {
          type: "metrics",
          title: "Summary",
          columns: 3,
          metrics: [
            { label: "Total Patients", value: String(profile.totalPatients) },
            { label: "Diversity Score", value: String(profile.diversityScore), accent: profile.diversityScore >= 60 },
            { label: "Race Groups", value: String(profile.raceBreakdown.length) },
          ],
        },
        {
          type: "table",
          title: "Race Breakdown",
          headers: ["Race", "Count", "Percent"],
          rows: profile.raceBreakdown.map((r) => [r.label, r.count, `${r.percent.toFixed(1)}%`]),
        },
        {
          type: "table",
          title: "Gender Breakdown",
          headers: ["Gender", "Count", "Percent"],
          rows: profile.genderBreakdown.map((g) => [g.label, g.count, `${g.percent.toFixed(1)}%`]),
        },
        {
          type: "table",
          title: "Age Distribution",
          headers: ["Range", "Count", "Percent"],
          rows: profile.ageBreakdown.map((a) => [a.range, a.count, `${a.percent.toFixed(1)}%`]),
        },
        {
          type: "table",
          title: "Ethnicity",
          headers: ["Ethnicity", "Count", "Percent"],
          rows: profile.ethnicityBreakdown.map((e) => [e.label, e.count, `${e.percent.toFixed(1)}%`]),
        },
        { type: "divider" },
        {
          type: "text",
          title: "FDA Compliance Notes",
          text: profile.fdaComplianceNotes.length > 0
            ? profile.fdaComplianceNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")
            : "No compliance notes generated.",
        },
      ],
    };
  },

  enrollmentForecast(forecast: MonteCarloResult, config: MonteCarloConfig): ReportDeckOptions {
    return {
      title: "Enrollment Forecast",
      subtitle: `Monte Carlo Simulation (n=${forecast.simulations})`,
      confidential: true,
      sections: [
        {
          type: "metrics",
          title: "Projection Summary",
          columns: 4,
          metrics: [
            { label: "Target Enrollment", value: String(config.targetEnrollment) },
            { label: "Median Time", value: `${forecast.medianMonths} mo`, accent: true },
            { label: "Optimistic (P10)", value: `${forecast.p10Months} mo` },
            { label: "Pessimistic (P90)", value: `${forecast.p90Months} mo` },
          ],
        },
        {
          type: "metrics",
          title: "Parameters",
          columns: 3,
          metrics: [
            { label: "Consent Rate", value: `${(config.consentRate * 100).toFixed(0)}%` },
            { label: "Screen Fail Rate", value: `${(config.screenFailureRate * 100).toFixed(0)}%` },
            { label: "Completion Prob.", value: `${(forecast.completionProbability * 100).toFixed(0)}%`, accent: forecast.completionProbability >= 0.8 },
          ],
        },
        {
          type: "table",
          title: "Monthly Projection",
          headers: ["Month", "P10", "Median (P50)", "P90", "Target"],
          rows: forecast.monthlyProjection.map((m) => [
            m.month,
            m.p10,
            m.p50,
            m.p90,
            m.target,
          ]),
        },
      ],
    };
  },

  sitePerformance(metrics: StudyMetric[]): ReportDeckOptions {
    const totalEnrolled = metrics.reduce((s, m) => s + m.enrolled, 0);
    const totalTarget = metrics.reduce((s, m) => s + m.target, 0);
    const avgScreenFail = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.screenFailRate, 0) / metrics.length
      : 0;
    const avgCycleTime = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.avgCycleTimeDays, 0) / metrics.length
      : 0;

    return {
      title: "Site Performance Report",
      subtitle: `${metrics.length} Active Studies`,
      confidential: true,
      sections: [
        {
          type: "metrics",
          title: "Aggregate Metrics",
          columns: 4,
          metrics: [
            { label: "Total Enrolled", value: String(totalEnrolled), accent: true },
            { label: "Total Target", value: String(totalTarget) },
            { label: "Avg Screen Fail", value: `${(avgScreenFail * 100).toFixed(1)}%` },
            { label: "Avg Cycle Time", value: `${avgCycleTime.toFixed(0)}d` },
          ],
        },
        {
          type: "table",
          title: "Study Breakdown",
          headers: ["Study", "Sponsor", "Indication", "Enrolled", "Target", "Screen Fail", "Cycle Time"],
          rows: metrics.map((m) => [
            m.studyName,
            m.sponsor,
            m.indication,
            m.enrolled,
            m.target,
            `${(m.screenFailRate * 100).toFixed(1)}%`,
            `${m.avgCycleTimeDays}d`,
          ]),
        },
      ],
    };
  },

  cohortSummary(patients: ParsedPatient[], criteria: FeasibilityCriterion[]): ReportDeckOptions {
    const totalPatients = patients.length;
    const avgAge = totalPatients > 0
      ? Math.round(patients.reduce((s, p) => s + calcAge(p.dob), 0) / totalPatients)
      : 0;

    const genderCounts: Record<string, number> = {};
    for (const p of patients) {
      genderCounts[p.sex] = (genderCounts[p.sex] ?? 0) + 1;
    }

    const raceCounts: Record<string, number> = {};
    for (const p of patients) {
      const key = p.race || "Unknown";
      raceCounts[key] = (raceCounts[key] ?? 0) + 1;
    }

    return {
      title: "Cohort Summary",
      subtitle: `${totalPatients} Patients${criteria.length > 0 ? ` | ${criteria.length} Criteria Applied` : ""}`,
      confidential: true,
      sections: [
        {
          type: "metrics",
          title: "Demographics",
          columns: 3,
          metrics: [
            { label: "Patients", value: String(totalPatients), accent: true },
            { label: "Avg Age", value: String(avgAge) },
            { label: "Gender Groups", value: String(Object.keys(genderCounts).length) },
          ],
        },
        {
          type: "table",
          title: "Gender Distribution",
          headers: ["Gender", "Count", "Percent"],
          rows: Object.entries(genderCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([gender, count]) => [
              gender,
              count,
              `${totalPatients > 0 ? ((count / totalPatients) * 100).toFixed(1) : "0.0"}%`,
            ]),
        },
        {
          type: "table",
          title: "Race Distribution",
          headers: ["Race", "Count", "Percent"],
          rows: Object.entries(raceCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([race, count]) => [
              race,
              count,
              `${totalPatients > 0 ? ((count / totalPatients) * 100).toFixed(1) : "0.0"}%`,
            ]),
        },
        {
          type: "table",
          title: "Patient List",
          headers: ["MRN", "Name", "DOB", "Sex", "Race", "Insurance"],
          rows: patients.slice(0, 100).map((p) => [
            p.mrn,
            `${p.lastName}, ${p.firstName}`,
            p.dob,
            p.sex,
            p.race || "Unknown",
            p.insurance,
          ]),
        },
        ...(criteria.length > 0
          ? [
              {
                type: "text" as const,
                title: "Applied Criteria",
                text: criteria
                  .map((c, i) => `${i + 1}. ${c.type}: ${c.field || c.value} (${c.operator} ${c.value}${c.valueTo ? ` to ${c.valueTo}` : ""})`)
                  .join("\n"),
              },
            ]
          : []),
      ],
    };
  },
} as const;

// ============================================================
// INTERNAL HELPERS
// ============================================================

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function triggerDownload(blob: Blob, filename: string): Promise<string | undefined> {
  if (isTauri) {
    try {
      const { writeTextFile, writeFile } = await import("@tauri-apps/plugin-fs");
      const { downloadDir, join } = await import("@tauri-apps/api/path");

      const downloadsPath = await downloadDir();
      const filePath = await join(downloadsPath, filename);

      if (blob.type.includes("text") || blob.type.includes("csv")) {
        const text = await blob.text();
        await writeTextFile(filePath, text);
      } else {
        const buffer = await blob.arrayBuffer();
        await writeFile(filePath, new Uint8Array(buffer));
      }

      return filePath;
    } catch {
      // Fall through to web approach if Tauri APIs fail
    }
  }

  // Web fallback: blob URL + anchor click
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  }, 100);
  return undefined;
}

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
