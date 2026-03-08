import { formatCurrency, formatCurrencyCompact } from "./formatters";
import { exportPrintableHTML } from "./pdf-export";

interface PitchStudy {
  nctNumber: string | null;
  shortTitle: string | null;
  title: string | null;
  sponsor: string;
  phase: string;
  therapeuticArea: string;
  indication: string;
  summary: string | null;
  eligibleCount: number;
  estimatedPerPatientValueCents: number | null;
  estimatedSiteStartupCents: number | null;
  paymentModel: string | null;
  financialDetails: string | null;
}

/**
 * Generate a professional sponsor pitch document and open it for print/PDF export.
 */
export function generatePitchPDF(study: PitchStudy): void {
  const projectedRevenue = Math.round(
    study.eligibleCount * (study.estimatedPerPatientValueCents ?? 0) * 0.3,
  );
  const enrollmentRate = 30;

  let financialBreakdown = "";
  try {
    const details = study.financialDetails ? JSON.parse(study.financialDetails) as Record<string, number> : null;
    if (details) {
      const rows: string[] = [];
      if (details["perVisitPayment"]) rows.push(`<tr><td>Per Visit Payment</td><td>${formatCurrency(details["perVisitPayment"])}</td></tr>`);
      if (details["estimatedVisits"]) rows.push(`<tr><td>Estimated Visits</td><td>${details["estimatedVisits"]}</td></tr>`);
      if (details["screeningPayment"]) rows.push(`<tr><td>Screening Payment</td><td>${formatCurrency(details["screeningPayment"])}</td></tr>`);
      if (details["screenFailurePayment"]) rows.push(`<tr><td>Screen Failure Payment</td><td>${formatCurrency(details["screenFailurePayment"])}</td></tr>`);
      if (details["screeningMilestone"]) rows.push(`<tr><td>Screening Milestone</td><td>${formatCurrency(details["screeningMilestone"])}</td></tr>`);
      if (details["randomizationMilestone"]) rows.push(`<tr><td>Randomization Milestone</td><td>${formatCurrency(details["randomizationMilestone"])}</td></tr>`);
      if (details["completionMilestone"]) rows.push(`<tr><td>Completion Milestone</td><td>${formatCurrency(details["completionMilestone"])}</td></tr>`);
      if (details["inductionMilestone"]) rows.push(`<tr><td>Induction Milestone</td><td>${formatCurrency(details["inductionMilestone"])}</td></tr>`);
      if (details["maintenanceMilestone"]) rows.push(`<tr><td>Maintenance Milestone</td><td>${formatCurrency(details["maintenanceMilestone"])}</td></tr>`);
      if (rows.length > 0) {
        financialBreakdown = `
          <div class="section">
            <h2>Payment Structure</h2>
            <table class="detail-table">
              <tbody>${rows.join("")}</tbody>
            </table>
          </div>`;
      }
    }
  } catch {
    // ignore parse errors
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Site Capability Pitch — ${study.shortTitle ?? study.title ?? "Study"}</title>
  <style>
    @page {
      size: letter;
      margin: 0.6in 0.75in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1a2e;
      line-height: 1.5;
      font-size: 11pt;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header-left h1 {
      font-size: 20pt;
      font-weight: 800;
      color: #1e1b4b;
      letter-spacing: -0.5px;
    }
    .header-left .subtitle {
      font-size: 10pt;
      color: #6366f1;
      font-weight: 600;
      margin-top: 2px;
    }
    .header-right {
      text-align: right;
      font-size: 9pt;
      color: #64748b;
    }
    .header-right .date { font-weight: 600; color: #334155; }
    .header-right .confidential {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 8px;
      background: #fef3c7;
      color: #92400e;
      font-size: 8pt;
      font-weight: 700;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Study info banner */
    .study-banner {
      background: linear-gradient(135deg, #eef2ff, #e0e7ff);
      border: 1px solid #c7d2fe;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    .study-banner .phase-badge {
      display: inline-block;
      padding: 2px 10px;
      background: #4f46e5;
      color: white;
      font-size: 9pt;
      font-weight: 700;
      border-radius: 4px;
      margin-right: 8px;
    }
    .study-banner .area-badge {
      display: inline-block;
      padding: 2px 10px;
      background: white;
      color: #4f46e5;
      font-size: 9pt;
      font-weight: 600;
      border-radius: 4px;
      border: 1px solid #c7d2fe;
    }
    .study-banner h2 {
      font-size: 14pt;
      font-weight: 700;
      color: #1e1b4b;
      margin-top: 8px;
    }
    .study-banner .nct {
      font-family: "SF Mono", Menlo, monospace;
      font-size: 9pt;
      color: #6366f1;
      margin-top: 2px;
    }
    .study-banner .sponsor {
      font-size: 10pt;
      color: #475569;
      margin-top: 4px;
    }
    .study-banner .summary {
      font-size: 10pt;
      color: #475569;
      margin-top: 8px;
      line-height: 1.6;
    }

    /* Key metrics grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }
    .metric-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      text-align: center;
    }
    .metric-card.highlight {
      background: linear-gradient(135deg, #ecfdf5, #d1fae5);
      border-color: #6ee7b7;
    }
    .metric-card .label {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-card .value {
      font-size: 22pt;
      font-weight: 800;
      color: #1e1b4b;
      margin-top: 2px;
    }
    .metric-card.highlight .value { color: #059669; }
    .metric-card .note {
      font-size: 8.5pt;
      color: #94a3b8;
      margin-top: 2px;
    }

    /* Sections */
    .section {
      margin-bottom: 20px;
    }
    .section h2 {
      font-size: 12pt;
      font-weight: 700;
      color: #1e1b4b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }

    /* Tables */
    .detail-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
    }
    .detail-table td {
      padding: 6px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .detail-table td:first-child {
      font-weight: 600;
      color: #475569;
      width: 55%;
    }
    .detail-table td:last-child {
      text-align: right;
      font-weight: 700;
      color: #1e1b4b;
    }

    /* Capabilities */
    .capabilities {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .capability {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 12px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #f1f5f9;
    }
    .capability .check {
      color: #059669;
      font-weight: 700;
      font-size: 12pt;
      flex-shrink: 0;
      line-height: 1;
    }
    .capability .text {
      font-size: 9.5pt;
      color: #334155;
    }
    .capability .text strong {
      display: block;
      font-size: 10pt;
      color: #1e1b4b;
    }

    /* Enrollment projection */
    .projection-bar {
      background: #f1f5f9;
      border-radius: 6px;
      height: 28px;
      overflow: hidden;
      margin-top: 8px;
      position: relative;
    }
    .projection-fill {
      height: 100%;
      background: linear-gradient(90deg, #4f46e5, #06b6d4);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 10px;
      color: white;
      font-size: 9pt;
      font-weight: 700;
    }
    .projection-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 8.5pt;
      color: #94a3b8;
    }

    /* Footer */
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #94a3b8;
    }
    .footer .brand { font-weight: 700; color: #4f46e5; }

    /* Print button - hidden in print */
    .print-actions {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      z-index: 100;
    }
    .print-btn {
      padding: 8px 20px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .print-btn.primary { background: #4f46e5; color: white; }
    .print-btn.primary:hover { background: #4338ca; }
    .print-btn.secondary { background: #f1f5f9; color: #334155; }
    .print-btn.secondary:hover { background: #e2e8f0; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-actions { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="print-btn primary" onclick="window.print()">Print / Save PDF</button>
    <button class="print-btn secondary" onclick="window.close()">Close</button>
  </div>
  <div class="header">
    <div class="header-left">
      <h1>Site Capability Assessment</h1>
      <div class="subtitle">Feasibility & Financial Intelligence Report</div>
    </div>
    <div class="header-right">
      <div class="date">${today}</div>
      <div>Prepared by TalOS SiteConnect</div>
      <div class="confidential">Confidential</div>
    </div>
  </div>

  <div class="study-banner">
    <span class="phase-badge">${study.phase}</span>
    <span class="area-badge">${study.therapeuticArea}</span>
    <h2>${study.shortTitle ?? study.title ?? ""}</h2>
    ${study.nctNumber ? `<div class="nct">${study.nctNumber}</div>` : ""}
    <div class="sponsor">Sponsor: ${study.sponsor}</div>
    <div class="summary">${study.summary ?? ""}</div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="label">Eligible Subjects</div>
      <div class="value">${study.eligibleCount}</div>
      <div class="note">identified at your site</div>
    </div>
    <div class="metric-card">
      <div class="label">Per-Subject Value</div>
      <div class="value">${formatCurrency(study.estimatedPerPatientValueCents ?? 0)}</div>
      <div class="note">${(study.paymentModel ?? "per_visit").replace("_", " ")} model</div>
    </div>
    <div class="metric-card highlight">
      <div class="label">Projected Revenue</div>
      <div class="value">${formatCurrencyCompact(projectedRevenue)}</div>
      <div class="note">at ${enrollmentRate}% enrollment rate</div>
    </div>
  </div>

  <div class="section">
    <h2>Enrollment Projection</h2>
    <table class="detail-table">
      <tbody>
        <tr><td>Eligible subjects identified</td><td>${study.eligibleCount}</td></tr>
        <tr><td>Estimated enrollment rate</td><td>${enrollmentRate}%</td></tr>
        <tr><td>Projected enrolled subjects</td><td>${Math.round(study.eligibleCount * enrollmentRate / 100)}</td></tr>
        <tr><td>Site startup costs (estimated)</td><td>${formatCurrency(study.estimatedSiteStartupCents ?? 0)}</td></tr>
        <tr><td>Projected gross revenue</td><td>${formatCurrency(projectedRevenue)}</td></tr>
        <tr><td>Projected net (after startup)</td><td>${formatCurrency(projectedRevenue - (study.estimatedSiteStartupCents ?? 0))}</td></tr>
      </tbody>
    </table>
    <div class="projection-bar">
      <div class="projection-fill" style="width: ${Math.min(100, Math.round(study.eligibleCount / 50 * 100))}%">${study.eligibleCount} subjects</div>
    </div>
    <div class="projection-labels">
      <span>0</span>
      <span>Enrollment target pool</span>
      <span>50</span>
    </div>
  </div>

  ${financialBreakdown}

  <div class="section">
    <h2>Site Capabilities</h2>
    <div class="capabilities">
      <div class="capability">
        <span class="check">&check;</span>
        <div class="text">
          <strong>EHR-Integrated Screening</strong>
          Automated eligibility screening against live patient data
        </div>
      </div>
      <div class="capability">
        <span class="check">&check;</span>
        <div class="text">
          <strong>Real-Time Feasibility</strong>
          Instant subject counts by inclusion/exclusion criteria
        </div>
      </div>
      <div class="capability">
        <span class="check">&check;</span>
        <div class="text">
          <strong>Predictive Lab Monitoring</strong>
          Track subjects approaching eligibility thresholds
        </div>
      </div>
      <div class="capability">
        <span class="check">&check;</span>
        <div class="text">
          <strong>Diversity Metrics</strong>
          FDA-compliant demographic breakdowns available
        </div>
      </div>
      <div class="capability">
        <span class="check">&check;</span>
        <div class="text">
          <strong>Rapid Study Startup</strong>
          Streamlined activation with pre-screened subject pools
        </div>
      </div>
      <div class="capability">
        <span class="check">&check;</span>
        <div class="text">
          <strong>Audit-Ready Data</strong>
          21 CFR Part 11 compliant screening documentation
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>
      <span class="brand">TalOS SiteConnect</span> &mdash; AI-Powered Clinical Trial Site Intelligence
    </div>
    <div>Page 1 of 1 &bull; ${today}</div>
  </div>

</body>
</html>`;

  const slug = (study.shortTitle ?? study.nctNumber ?? "study").replace(/\s+/g, "-").toLowerCase();
  void exportPrintableHTML(html, `pitch-${slug}`);
}
