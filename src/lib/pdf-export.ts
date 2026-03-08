/**
 * PDF Export utility for generating printable reports.
 * In Tauri mode: saves HTML to a temp file and opens in default browser.
 * In web mode: opens in a new tab with auto-print.
 */

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Export an HTML document for printing/PDF saving.
 * Generates a clean, white-background printable document.
 */
export async function exportPrintableHTML(html: string, filename: string): Promise<void> {
  if (isTauri) {
    try {
      const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      const { appDataDir, join } = await import("@tauri-apps/api/path");
      const { open } = await import("@tauri-apps/plugin-shell");

      const dir = await appDataDir();
      const exportsDir = await join(dir, "exports");
      const filePath = await join(exportsDir, `${filename}.html`);

      // Ensure exports directory exists
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(exportsDir, { recursive: true }).catch(() => {});

      await writeTextFile(`exports/${filename}.html`, html, { baseDir: BaseDirectory.AppData });
      await open(filePath);
    } catch {
      // Fallback to web approach if Tauri APIs fail
      openPrintWindow(html);
    }
  } else {
    openPrintWindow(html);
  }
}

function openPrintWindow(html: string): void {
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

/**
 * Common CSS for all printable reports.
 * White background, professional typography, print-optimized.
 */
export const PRINT_STYLES = `
  @page {
    size: letter;
    margin: 0.6in 0.75in;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a2e;
    line-height: 1.55;
    font-size: 11pt;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Header bar */
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #4f46e5;
    padding-bottom: 14px;
    margin-bottom: 22px;
  }
  .report-header h1 {
    font-size: 18pt;
    font-weight: 800;
    color: #1e1b4b;
    letter-spacing: -0.5px;
  }
  .report-header .subtitle {
    font-size: 10pt;
    color: #6366f1;
    font-weight: 600;
    margin-top: 2px;
  }
  .report-header .meta {
    text-align: right;
    font-size: 9pt;
    color: #64748b;
  }
  .report-header .meta .date { font-weight: 600; color: #334155; }
  .report-header .meta .confidential {
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

  /* Metrics grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 22px;
  }
  .metric-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
    text-align: center;
  }
  .metric-card.accent {
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
    font-size: 20pt;
    font-weight: 800;
    color: #1e1b4b;
    margin-top: 2px;
  }
  .metric-card.accent .value { color: #059669; }
  .metric-card .note {
    font-size: 8.5pt;
    color: #94a3b8;
    margin-top: 2px;
  }

  /* Section headers */
  .section { margin-bottom: 20px; }
  .section h2 {
    font-size: 12pt;
    font-weight: 700;
    color: #1e1b4b;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }

  /* Tables */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .data-table th {
    padding: 8px 12px;
    text-align: left;
    font-size: 8.5pt;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #e2e8f0;
    background: #f8fafc;
  }
  .data-table td {
    padding: 7px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
  }
  .data-table tr:nth-child(even) { background: #fafbfc; }

  /* Key-value pairs */
  .kv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .kv-table td {
    padding: 6px 12px;
    border-bottom: 1px solid #f1f5f9;
  }
  .kv-table td:first-child {
    font-weight: 600;
    color: #475569;
    width: 55%;
  }
  .kv-table td:last-child {
    text-align: right;
    font-weight: 700;
    color: #1e1b4b;
  }

  /* Bar indicators */
  .bar-track {
    background: #f1f5f9;
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
    margin-top: 4px;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    background: #4f46e5;
  }
  .bar-fill.green { background: #059669; }
  .bar-fill.amber { background: #d97706; }
  .bar-fill.red { background: #dc2626; }

  /* Two-column layout */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  /* Capabilities / features */
  .capability-grid {
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

  /* Badge */
  .badge {
    display: inline-block;
    padding: 2px 10px;
    font-size: 9pt;
    font-weight: 700;
    border-radius: 4px;
  }
  .badge.indigo { background: #4f46e5; color: white; }
  .badge.blue { background: #2563eb; color: white; }
  .badge.green { background: #059669; color: white; }
  .badge.amber { background: #d97706; color: white; }
  .badge.outline { background: white; color: #4f46e5; border: 1px solid #c7d2fe; }

  /* Footer */
  .report-footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #94a3b8;
  }
  .report-footer .brand { font-weight: 700; color: #4f46e5; }

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
  .print-btn.primary {
    background: #4f46e5;
    color: white;
  }
  .print-btn.primary:hover { background: #4338ca; }
  .print-btn.secondary {
    background: #f1f5f9;
    color: #334155;
  }
  .print-btn.secondary:hover { background: #e2e8f0; }
  @media print {
    .print-actions { display: none !important; }
  }
`;

/**
 * Wrap report body HTML in a complete printable document with action buttons.
 */
export function wrapReport(title: string, bodyHTML: string): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} — TalOS SiteConnect</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <!-- Print actions (visible on screen, hidden in print) -->
  <div class="print-actions">
    <button class="print-btn primary" onclick="window.print()">🖨 Print / Save PDF</button>
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
}
