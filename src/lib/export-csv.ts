import type { PatientSummary, ScreeningResult, CriterionResult } from "@/types";

interface ExportRow {
  patient_id: string;
  age: number;
  gender: string;
  primary_diagnosis: string;
  eligibility_score: number;
  screening_status: string;
  review_decision: string;
  inclusion_met: string;
  exclusion_triggered: string;
  missing_data: number;
  screened_at: string;
  study_id: string;
}

export function buildScreeningCSV(
  patients: PatientSummary[],
  screeningResults: Map<string, ScreeningResult>,
  _criteriaResults: Map<string, CriterionResult[]>,
  filterStatus?: string,
): string {
  const filtered = filterStatus && filterStatus !== "all"
    ? patients.filter((p) => p.reviewStatus === filterStatus)
    : patients;

  const rows: ExportRow[] = filtered.map((p) => {
    const sr = screeningResults.get(p.id);
    return {
      patient_id: p.sitePatientId,
      age: p.age,
      gender: p.gender,
      primary_diagnosis: p.primaryDiagnosis ?? "",
      eligibility_score: p.score,
      screening_status: p.overallStatus,
      review_decision: p.reviewStatus,
      inclusion_met: `${p.inclusionMet}/${p.inclusionTotal}`,
      exclusion_triggered: `${p.exclusionTriggered}/${p.exclusionTotal}`,
      missing_data: p.missingDataCount,
      screened_at: sr?.screenedAt ?? "",
      study_id: sr?.studyId ?? "",
    };
  });

  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]!) as (keyof ExportRow)[];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => {
        const val = String(r[h]);
        return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(",")
    ),
  ];
  return lines.join("\r\n");
}

export function buildDetailedCSV(
  patients: PatientSummary[],
  screeningResults: Map<string, ScreeningResult>,
  criteriaResults: Map<string, CriterionResult[]>,
  filterStatus?: string,
): string {
  const filtered = filterStatus && filterStatus !== "all"
    ? patients.filter((p) => p.reviewStatus === filterStatus)
    : patients;

  const lines: string[] = [
    "patient_id,age,gender,primary_diagnosis,score,screening_status,review_decision,criterion_type,criterion_text,result,evidence,confidence",
  ];

  for (const p of filtered) {
    const sr = screeningResults.get(p.id);
    const criteria = sr ? (criteriaResults.get(sr.id) ?? []) : [];

    if (criteria.length === 0) {
      lines.push([
        p.sitePatientId, p.age, p.gender, csvEscape(p.primaryDiagnosis ?? ""),
        p.score, p.overallStatus, p.reviewStatus, "", "", "", "", "",
      ].join(","));
    } else {
      for (const c of criteria) {
        lines.push([
          p.sitePatientId, p.age, p.gender, csvEscape(p.primaryDiagnosis ?? ""),
          p.score, p.overallStatus, p.reviewStatus,
          c.criterionType, csvEscape(c.criterionText), c.result,
          csvEscape(c.evidence ?? ""), c.confidence,
        ].join(","));
      }
    }
  }

  return lines.join("\r\n");
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function downloadCSV(content: string, filename: string): Promise<string | undefined> {
  if (isTauri) {
    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const { downloadDir, join } = await import("@tauri-apps/api/path");

      const downloadsPath = await downloadDir();
      const filePath = await join(downloadsPath, filename);
      await writeTextFile(filePath, content);
      return filePath;
    } catch {
      // Fall through to web fallback
    }
  }

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return undefined;
}
