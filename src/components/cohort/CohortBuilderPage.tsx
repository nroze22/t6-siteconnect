import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Sparkles,
  X,
  Plus,
  Download,
  FileText,
  Users,
  Filter,
  ChevronDown,
  Stethoscope,
  Calendar,
  FlaskConical,
  Pill,
  Scale,
  UserCircle,
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Trash2,
} from "lucide-react";
import { exportPrintableHTML } from "@/lib/pdf-export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { getPatients } from "@/lib/data-provider";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import {
  runFeasibilityQuery,
  PRESET_QUERIES,
  type FeasibilityQuery,
  type FeasibilityCriterion,
  type FeasibilityResult,
} from "@/lib/population-analytics";
import { formatNumber, calculateAge } from "@/lib/formatters";
import { useToast } from "@/components/ui/Toast";
import { useAnimatedNumber } from "@/hooks/use-animated-number";

// ============================================================
// DIAGNOSIS KEYWORD MAP
// ============================================================

const DIAGNOSIS_MAP: Record<string, string> = {
  diabetes: "E11",
  "type 2 diabetes": "E11",
  t2d: "E11",
  diabetic: "E11",
  "lung cancer": "C34",
  nsclc: "C34",
  "heart failure": "I50",
  hf: "I50",
  chf: "I50",
  obesity: "E66",
  obese: "E66",
  hypertension: "I10",
  htn: "I10",
  "high blood pressure": "I10",
  asthma: "J45",
  copd: "J44",
  ckd: "N18",
  "chronic kidney disease": "N18",
  "atrial fibrillation": "I48",
  afib: "I48",
  "a-fib": "I48",
  depression: "F32",
  anxiety: "F41",
  "rheumatoid arthritis": "M05",
  ra: "M05",
  "breast cancer": "C50",
  "prostate cancer": "C61",
  alzheimer: "G30",
  "alzheimer's": "G30",
  alzheimers: "G30",
  parkinson: "G20",
  "parkinson's": "G20",
  parkinsons: "G20",
  crohn: "K50",
  "crohn's": "K50",
  crohns: "K50",
  "ulcerative colitis": "K51",
  uc: "K51",
  "atopic dermatitis": "L20",
  eczema: "L20",
};

// ============================================================
// LAB NAME MAP
// ============================================================

const LAB_MAP: Record<string, string> = {
  a1c: "HbA1c",
  hba1c: "HbA1c",
  "hemoglobin a1c": "HbA1c",
  egfr: "eGFR",
  bmi: "__BMI__",
  ldl: "LDL",
  hdl: "HDL",
  crp: "CRP",
  bnp: "BNP",
  creatinine: "Creatinine",
  hemoglobin: "Hemoglobin",
  platelets: "Platelets",
  wbc: "WBC",
  "total cholesterol": "Total Cholesterol",
  triglycerides: "Triglycerides",
  potassium: "Potassium",
  bilirubin: "Total Bilirubin",
};

// ============================================================
// MEDICATION KEYWORDS
// ============================================================

const MEDICATION_KEYWORDS = [
  "metformin",
  "insulin",
  "semaglutide",
  "pembrolizumab",
  "carboplatin",
  "docetaxel",
  "pemetrexed",
  "lisinopril",
  "atorvastatin",
  "amlodipine",
  "metoprolol",
  "empagliflozin",
  "sacubitril",
  "furosemide",
  "spironolactone",
  "donepezil",
  "memantine",
  "adalimumab",
  "dupilumab",
  "gabapentin",
  "prednisone",
  "phentermine",
  "budesonide",
  "albuterol",
  "fluticasone",
];

// ============================================================
// EXAMPLE QUERIES
// ============================================================

const EXAMPLE_QUERIES = [
  "diabetic patients over 50 with A1c above 8",
  "lung cancer patients under 75",
  "heart failure with BMI over 30",
  "female patients with obesity",
  "patients on metformin with A1c above 7",
  "Alzheimer's patients age 50-85",
  "Crohn's disease with CRP above 5",
];

// ============================================================
// CRITERION TYPE CONFIG
// ============================================================

type CriterionTypeKey = "diagnosis" | "age_range" | "lab_range" | "medication" | "bmi_range" | "sex";

interface CriterionTypeConfig {
  key: CriterionTypeKey;
  label: string;
  icon: typeof Stethoscope;
  color: string;
}

const CRITERION_TYPES: CriterionTypeConfig[] = [
  { key: "diagnosis", label: "Diagnosis", icon: Stethoscope, color: "text-indigo-400" },
  { key: "age_range", label: "Age Range", icon: Calendar, color: "text-cyan-400" },
  { key: "lab_range", label: "Lab Value", icon: FlaskConical, color: "text-amber-400" },
  { key: "medication", label: "Medication", icon: Pill, color: "text-emerald-400" },
  { key: "bmi_range", label: "BMI Range", icon: Scale, color: "text-purple-400" },
  { key: "sex", label: "Sex", icon: UserCircle, color: "text-pink-400" },
];

// ============================================================
// NATURAL LANGUAGE PARSER
// ============================================================

function parseNaturalLanguage(input: string): FeasibilityCriterion[] {
  const criteria: FeasibilityCriterion[] = [];
  const lower = input.toLowerCase().trim();
  if (!lower) return criteria;

  // --- Parse diagnoses ---
  // Sort keys by length descending so longer matches take precedence
  const diagKeys = Object.keys(DIAGNOSIS_MAP).sort((a, b) => b.length - a.length);
  const usedDiagCodes = new Set<string>();
  for (const key of diagKeys) {
    if (lower.includes(key)) {
      const code = DIAGNOSIS_MAP[key];
      if (code && !usedDiagCodes.has(code)) {
        usedDiagCodes.add(code);
        criteria.push({
          type: "diagnosis",
          field: "",
          operator: "contains",
          value: code,
        });
      }
    }
  }

  // --- Parse age filters ---
  // "over X", "above X age", "older than X"
  const ageOverMatch = lower.match(/(?:over|above|older than|age\s*>\s*|aged?\s+(?:over|above)\s*)\s*(\d+)/);
  if (ageOverMatch?.[1]) {
    criteria.push({
      type: "age_range",
      field: "",
      operator: "between",
      value: ageOverMatch[1],
      valueTo: "120",
    });
  }

  // "under X", "below X age", "younger than X"
  const ageUnderMatch = lower.match(/(?:under|below|younger than|age\s*<\s*|aged?\s+(?:under|below)\s*)\s*(\d+)/);
  if (ageUnderMatch?.[1]) {
    criteria.push({
      type: "age_range",
      field: "",
      operator: "between",
      value: "0",
      valueTo: ageUnderMatch[1],
    });
  }

  // "age X-Y", "between X and Y", "aged X to Y"
  const ageRangeMatch = lower.match(/(?:age|aged?)\s+(\d+)\s*[-–to]+\s*(\d+)/);
  const betweenAgeMatch = lower.match(/between\s+(\d+)\s+and\s+(\d+)(?:\s+(?:years?\s+old|yo))?/);
  const rangeMatch = ageRangeMatch ?? betweenAgeMatch;
  if (rangeMatch?.[1] && rangeMatch[2] && !ageOverMatch && !ageUnderMatch) {
    criteria.push({
      type: "age_range",
      field: "",
      operator: "between",
      value: rangeMatch[1],
      valueTo: rangeMatch[2],
    });
  }

  // --- Parse lab values ---
  const labKeys = Object.keys(LAB_MAP).sort((a, b) => b.length - a.length);
  for (const labKey of labKeys) {
    const labField = LAB_MAP[labKey];
    if (!labField) continue;
    // Match patterns like "A1c above 8", "eGFR below 60", "BMI over 30", "LDL > 130"
    const labPatterns = [
      new RegExp(`${labKey}\\s*(?:above|over|>|>=|gte|greater than|at least)\\s*([\\d.]+)`, "i"),
      new RegExp(`${labKey}\\s*(?:below|under|<|<=|lte|less than|at most)\\s*([\\d.]+)`, "i"),
    ];

    const aboveMatch = lower.match(labPatterns[0]!);
    const belowMatch = lower.match(labPatterns[1]!);

    if (aboveMatch?.[1]) {
      if (labField === "__BMI__") {
        criteria.push({
          type: "bmi_range",
          field: "",
          operator: "gte",
          value: aboveMatch[1],
        });
      } else {
        criteria.push({
          type: "lab_range",
          field: labField,
          operator: "gte",
          value: aboveMatch[1],
        });
      }
    } else if (belowMatch?.[1]) {
      if (labField === "__BMI__") {
        criteria.push({
          type: "bmi_range",
          field: "",
          operator: "lte",
          value: belowMatch[1],
        });
      } else {
        criteria.push({
          type: "lab_range",
          field: labField,
          operator: "lte",
          value: belowMatch[1],
        });
      }
    }
  }

  // --- Parse sex ---
  if (/\b(male|men|man)\b/.test(lower) && !/\bfemale\b/.test(lower)) {
    criteria.push({ type: "sex", field: "", operator: "equals", value: "Male" });
  } else if (/\b(female|women|woman)\b/.test(lower)) {
    criteria.push({ type: "sex", field: "", operator: "equals", value: "Female" });
  }

  // --- Parse medications ---
  for (const med of MEDICATION_KEYWORDS) {
    const medPattern = new RegExp(`\\b(?:on|taking|using|prescribed)\\s+${med}\\b`, "i");
    const simpleMedPattern = new RegExp(`\\b${med}\\b`, "i");
    if (medPattern.test(lower) || simpleMedPattern.test(lower)) {
      criteria.push({
        type: "medication",
        field: "",
        operator: "contains",
        value: med,
      });
    }
  }

  return criteria;
}

// ============================================================
// DESCRIBE CRITERION (UI label)
// ============================================================

function describeCriterionUI(c: FeasibilityCriterion): string {
  switch (c.type) {
    case "diagnosis": {
      // Reverse lookup
      const name = Object.entries(DIAGNOSIS_MAP).find(([, v]) => v === c.value)?.[0];
      const displayName = name
        ? name.charAt(0).toUpperCase() + name.slice(1)
        : c.value;
      return `${c.operator === "not_contains" ? "No " : ""}Dx: ${displayName} (${c.value})`;
    }
    case "age_range": {
      if (c.valueTo === "120") return `Age >= ${c.value}`;
      if (c.value === "0") return `Age <= ${c.valueTo}`;
      return `Age ${c.value} - ${c.valueTo}`;
    }
    case "lab_range": {
      if (c.operator === "between") return `${c.field} ${c.value}-${c.valueTo}`;
      return `${c.field} ${c.operator === "gte" ? ">=" : "<="} ${c.value}`;
    }
    case "medication":
      return `${c.operator === "not_contains" ? "Not on " : "On "}${c.value}`;
    case "bmi_range": {
      if (c.operator === "between") return `BMI ${c.value}-${c.valueTo}`;
      return `BMI ${c.operator === "gte" ? ">=" : "<="} ${c.value}`;
    }
    case "sex":
      return `Sex: ${c.value}`;
    default:
      return "Unknown";
  }
}

// ============================================================
// COLOR CONSTANTS
// ============================================================

const PIE_COLORS = ["#6366f1", "#ec4899", "#a78bfa", "#6b7280"];
const RACE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#6b7280"];
const AGE_BAR_COLOR = "#6366f1";
const WATERFALL_PASS = "#10b981";
const WATERFALL_FAIL = "#ef4444";

// ============================================================
// INLINE FILTER EDITOR COMPONENT
// ============================================================

function InlineFilterEditor({
  type,
  onAdd,
  onCancel,
}: {
  type: CriterionTypeKey;
  onAdd: (c: FeasibilityCriterion) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [valueTo, setValueTo] = useState("");
  const [field, setField] = useState("");
  const [operator, setOperator] = useState<FeasibilityCriterion["operator"]>("contains");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit() {
    if (type === "diagnosis" && value.trim()) {
      onAdd({ type: "diagnosis", field: "", operator: "contains", value: value.trim().toUpperCase() });
    } else if (type === "age_range") {
      const v = value.trim();
      const vt = valueTo.trim();
      if (v && vt) {
        onAdd({ type: "age_range", field: "", operator: "between", value: v, valueTo: vt });
      } else if (v) {
        onAdd({ type: "age_range", field: "", operator: "between", value: v, valueTo: "120" });
      }
    } else if (type === "lab_range" && field.trim() && value.trim()) {
      onAdd({ type: "lab_range", field: field.trim(), operator, value: value.trim(), valueTo: valueTo.trim() || undefined });
    } else if (type === "medication" && value.trim()) {
      onAdd({ type: "medication", field: "", operator: "contains", value: value.trim() });
    } else if (type === "bmi_range" && value.trim()) {
      onAdd({ type: "bmi_range", field: "", operator, value: value.trim(), valueTo: valueTo.trim() || undefined });
    } else if (type === "sex" && value) {
      onAdd({ type: "sex", field: "", operator: "equals", value });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  const inputClass =
    "h-8 rounded-md bg-white/5 border border-white/10 px-2.5 text-sm text-body placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-2 rounded-lg border border-edge-2">
        {type === "diagnosis" && (
          <>
            <span className="text-xs text-dim whitespace-nowrap">ICD-10 or keyword:</span>
            <input
              ref={inputRef}
              className={`${inputClass} w-40`}
              placeholder="e.g. E11 or diabetes"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </>
        )}
        {type === "age_range" && (
          <>
            <span className="text-xs text-dim whitespace-nowrap">Age from:</span>
            <input
              ref={inputRef}
              className={`${inputClass} w-16`}
              placeholder="18"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <span className="text-xs text-dim">to:</span>
            <input
              className={`${inputClass} w-16`}
              placeholder="99"
              type="number"
              value={valueTo}
              onChange={(e) => setValueTo(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </>
        )}
        {type === "lab_range" && (
          <>
            <span className="text-xs text-dim whitespace-nowrap">Lab:</span>
            <input
              ref={inputRef}
              className={`${inputClass} w-24`}
              placeholder="e.g. HbA1c"
              value={field}
              onChange={(e) => setField(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <select
              className={`${inputClass} w-16`}
              value={operator}
              onChange={(e) => setOperator(e.target.value as FeasibilityCriterion["operator"])}
            >
              <option value="gte">&gt;=</option>
              <option value="lte">&lt;=</option>
              <option value="between">btw</option>
            </select>
            <input
              className={`${inputClass} w-16`}
              placeholder="val"
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {operator === "between" && (
              <>
                <span className="text-xs text-dim">-</span>
                <input
                  className={`${inputClass} w-16`}
                  placeholder="max"
                  type="number"
                  step="any"
                  value={valueTo}
                  onChange={(e) => setValueTo(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </>
            )}
          </>
        )}
        {type === "medication" && (
          <>
            <span className="text-xs text-dim whitespace-nowrap">Medication:</span>
            <input
              ref={inputRef}
              className={`${inputClass} w-40`}
              placeholder="e.g. metformin"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </>
        )}
        {type === "bmi_range" && (
          <>
            <span className="text-xs text-dim whitespace-nowrap">BMI</span>
            <select
              className={`${inputClass} w-16`}
              value={operator}
              onChange={(e) => setOperator(e.target.value as FeasibilityCriterion["operator"])}
            >
              <option value="gte">&gt;=</option>
              <option value="lte">&lt;=</option>
              <option value="between">btw</option>
            </select>
            <input
              ref={inputRef}
              className={`${inputClass} w-16`}
              placeholder="val"
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {operator === "between" && (
              <>
                <span className="text-xs text-dim">-</span>
                <input
                  className={`${inputClass} w-16`}
                  placeholder="max"
                  type="number"
                  step="any"
                  value={valueTo}
                  onChange={(e) => setValueTo(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </>
            )}
          </>
        )}
        {type === "sex" && (
          <>
            <span className="text-xs text-dim whitespace-nowrap">Sex:</span>
            <button
              ref={inputRef as unknown as React.Ref<HTMLButtonElement>}
              className={`${inputClass} px-3 ${value === "Male" ? "ring-1 ring-indigo-500" : ""}`}
              onClick={() => setValue("Male")}
            >
              Male
            </button>
            <button
              className={`${inputClass} px-3 ${value === "Female" ? "ring-1 ring-indigo-500" : ""}`}
              onClick={() => setValue("Female")}
            >
              Female
            </button>
          </>
        )}
        <button
          onClick={handleSubmit}
          className="h-8 px-3 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition-colors"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="h-8 px-2 rounded-md text-dim hover:text-body hover:bg-white/5 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ============================================================
// GENERATE FEASIBILITY REPORT PDF
// ============================================================

async function generateFeasibilityReportPDF(
  result: FeasibilityResult,
  criteria: FeasibilityCriterion[],
  _matchedPatients: ParsedPatient[],
): Promise<{ filePath?: string; fileName?: string } | undefined> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const criteriaRows = result.criterionBreakdown
    .map((cb, i) => {
      const pct = (cb.matchRate * 100).toFixed(1);
      const barWidth = Math.max(5, Math.round(cb.matchRate * 100));
      return `
        <tr>
          <td>${cb.criterion}</td>
          <td style="text-align: center">${cb.matchCount} / ${result.totalPatients}</td>
          <td style="text-align: center">${pct}%</td>
          <td>
            <div style="background: #f1f5f9; border-radius: 4px; height: 16px; overflow: hidden">
              <div style="height: 100%; width: ${barWidth}%; background: ${i === result.criterionBreakdown.length - 1 ? '#6366f1' : '#10b981'}; border-radius: 4px"></div>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const genderData = result.demographics.genderSplit;
  const genderTotal = genderData.male + genderData.female + genderData.other;
  const genderRows = [
    { label: "Male", count: genderData.male },
    { label: "Female", count: genderData.female },
    ...(genderData.other > 0 ? [{ label: "Other", count: genderData.other }] : []),
  ]
    .map((g) => `<tr><td>${g.label}</td><td>${g.count}</td><td>${genderTotal > 0 ? ((g.count / genderTotal) * 100).toFixed(1) : 0}%</td></tr>`)
    .join("");

  const raceRows = Object.entries(result.demographics.raceSplit)
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => {
      const pct = result.matchingPatients > 0 ? ((count / result.matchingPatients) * 100).toFixed(1) : "0";
      return `<tr><td>${label}</td><td>${count}</td><td>${pct}%</td></tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Feasibility Report — Cohort Analysis</title>
  <style>
    @page { size: letter; margin: 0.6in 0.75in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1a2e; line-height: 1.5; font-size: 11pt;
    }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px;
    }
    .header-left h1 { font-size: 20pt; font-weight: 800; color: #1e1b4b; }
    .header-left .subtitle { font-size: 10pt; color: #6366f1; font-weight: 600; margin-top: 2px; }
    .header-right { text-align: right; font-size: 9pt; color: #64748b; }
    .header-right .date { font-weight: 600; color: #334155; }
    .header-right .confidential {
      display: inline-block; margin-top: 4px; padding: 2px 8px; background: #fef3c7;
      color: #92400e; font-size: 8pt; font-weight: 700; border-radius: 3px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .metric-card {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; text-align: center;
    }
    .metric-card.highlight { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-color: #6ee7b7; }
    .metric-card .label { font-size: 8.5pt; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-card .value { font-size: 22pt; font-weight: 800; color: #1e1b4b; margin-top: 2px; }
    .metric-card.highlight .value { color: #059669; }
    .metric-card .note { font-size: 8.5pt; color: #94a3b8; margin-top: 2px; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 12pt; font-weight: 700; color: #1e1b4b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    td, th { padding: 6px 12px; border-bottom: 1px solid #f1f5f9; }
    th { text-align: left; font-weight: 600; color: #475569; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.3px; }
    .footer {
      margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between; font-size: 8.5pt; color: #94a3b8;
    }
    .footer .brand { font-weight: 700; color: #4f46e5; }
    .print-actions {
      position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 100;
    }
    .print-btn {
      padding: 8px 20px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
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
      <h1>Cohort Feasibility Report</h1>
      <div class="subtitle">Population Explorer Analysis</div>
    </div>
    <div class="header-right">
      <div class="date">${today}</div>
      <div>Prepared by TalOS SiteConnect</div>
      <div class="confidential">Confidential</div>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="label">Total Subjects</div>
      <div class="value">${result.totalPatients}</div>
      <div class="note">in local database</div>
    </div>
    <div class="metric-card highlight">
      <div class="label">Matching Subjects</div>
      <div class="value">${result.matchingPatients}</div>
      <div class="note">${(result.matchRate * 100).toFixed(1)}% match rate</div>
    </div>
    <div class="metric-card">
      <div class="label">Active Criteria</div>
      <div class="value">${criteria.length}</div>
      <div class="note">filters applied</div>
    </div>
  </div>

  <div class="section">
    <h2>Criteria Attrition Waterfall</h2>
    <table>
      <thead><tr><th>Criterion</th><th style="text-align:center">Passing</th><th style="text-align:center">Rate</th><th style="width:30%">Bar</th></tr></thead>
      <tbody>${criteriaRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Demographics — Gender</h2>
    <table>
      <thead><tr><th>Gender</th><th>Count</th><th>Percent</th></tr></thead>
      <tbody>${genderRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Demographics — Race</h2>
    <table>
      <thead><tr><th>Race</th><th>Count</th><th>Percent</th></tr></thead>
      <tbody>${raceRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Average Age of Matched Cohort</h2>
    <p style="font-size: 14pt; font-weight: 700; color: #1e1b4b; margin-top: 6px;">${result.demographics.avgAge} years</p>
  </div>

  <div class="footer">
    <div><span class="brand">TalOS SiteConnect</span> -- AI-Powered Clinical Trial Site Intelligence</div>
    <div>Page 1 of 1 -- ${today}</div>
  </div>

</body>
</html>`;

  return exportPrintableHTML(html, `feasibility-report-${Date.now()}`);
}

// ============================================================
// CSV EXPORT
// ============================================================

const isTauriEnv = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function exportCohortCSV(patients: ParsedPatient[]): Promise<string | undefined> {
  const headers = ["MRN", "Last Name", "First Name", "Age", "Sex", "Race", "Primary Diagnosis", "BMI", "Department"];
  const rows = patients.map((p) => {
    const primaryDx = p.diagnoses[0];
    return [
      p.mrn,
      p.lastName,
      p.firstName,
      String(calculateAge(p.dob)),
      p.sex,
      p.race,
      primaryDx ? `${primaryDx.icd10} ${primaryDx.name}` : "",
      p.vitals.bmi > 0 ? p.vitals.bmi.toFixed(1) : "",
      p.department,
    ];
  });

  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const filename = `cohort-export-${new Date().toISOString().slice(0, 10)}.csv`;

  if (isTauriEnv) {
    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const { downloadDir, join } = await import("@tauri-apps/api/path");
      const downloadsPath = await downloadDir();
      const filePath = await join(downloadsPath, filename);
      await writeTextFile(filePath, csv);
      return filePath;
    } catch {
      // Fall through to web approach
    }
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return undefined;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CohortBuilderPage() {
  const toast = useToast();
  const [patients, setPatients] = useState<ParsedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");
  const [criteria, setCriteria] = useState<FeasibilityCriterion[]>([]);
  const [addingFilterType, setAddingFilterType] = useState<CriterionTypeKey | null>(null);
  const [addFilterMenuOpen, setAddFilterMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [customQueries, setCustomQueries] = useState<FeasibilityQuery[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Load patients
  useEffect(() => {
    let cancelled = false;
    void getPatients().then((p) => {
      if (!cancelled) {
        setPatients(p);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Close add-filter menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddFilterMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Run feasibility
  const result = useMemo<FeasibilityResult | null>(() => {
    if (criteria.length === 0 || patients.length === 0) return null;
    const query: FeasibilityQuery = {
      id: "cohort-builder",
      name: "Cohort Builder Query",
      criteria,
    };
    return runFeasibilityQuery(patients, query);
  }, [criteria, patients]);

  const matchedPatientsList = useMemo<ParsedPatient[]>(() => {
    if (!result) return [];
    const ids = new Set(result.matchedPatientIds);
    return patients.filter((p) => ids.has(p.mrn));
  }, [result, patients]);

  const animatedMatch = useAnimatedNumber(result?.matchingPatients ?? 0);
  const animatedTotal = useAnimatedNumber(patients.length);
  const animatedRate = useAnimatedNumber(result ? Math.round(result.matchRate * 100) : 0);

  // Waterfall data: progressive attrition
  const waterfallData = useMemo(() => {
    if (!result || result.criterionBreakdown.length === 0) return [];
    // Sort by matchCount descending to show attrition
    const sorted = [...result.criterionBreakdown].sort((a, b) => b.matchCount - a.matchCount);
    const minCount = Math.min(...sorted.map((s) => s.matchCount));
    return sorted.map((cb) => ({
      criterion: cb.criterion,
      passing: cb.matchCount,
      failing: result.totalPatients - cb.matchCount,
      rate: cb.matchRate,
      isBottleneck: cb.matchCount === minCount,
    }));
  }, [result]);

  // Demographics for charts
  const genderChartData = useMemo(() => {
    if (!result) return [];
    const g = result.demographics.genderSplit;
    const data: { name: string; value: number }[] = [];
    if (g.male > 0) data.push({ name: "Male", value: g.male });
    if (g.female > 0) data.push({ name: "Female", value: g.female });
    if (g.other > 0) data.push({ name: "Other", value: g.other });
    return data;
  }, [result]);

  const raceChartData = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.demographics.raceSplit)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [result]);

  const ageDistData = useMemo(() => {
    if (matchedPatientsList.length === 0) return [];
    const buckets = [
      { range: "18-30", min: 18, max: 30, count: 0 },
      { range: "31-40", min: 31, max: 40, count: 0 },
      { range: "41-50", min: 41, max: 50, count: 0 },
      { range: "51-60", min: 51, max: 60, count: 0 },
      { range: "61-70", min: 61, max: 70, count: 0 },
      { range: "71-80", min: 71, max: 80, count: 0 },
      { range: "80+", min: 81, max: 200, count: 0 },
    ];
    for (const p of matchedPatientsList) {
      const age = calculateAge(p.dob);
      for (const b of buckets) {
        if (age >= b.min && age <= b.max) {
          b.count++;
          break;
        }
      }
    }
    return buckets.map((b) => ({ range: b.range, count: b.count }));
  }, [matchedPatientsList]);

  // Handlers
  const handleSearchSubmit = useCallback(
    (text: string) => {
      const parsed = parseNaturalLanguage(text);
      if (parsed.length === 0 && text.trim()) {
        toast.warning("Could not parse query", "Try using terms like diagnosis names, age ranges, or lab values.");
        return;
      }
      setCriteria(parsed);
      setActiveSavedId(null);
    },
    [toast],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchSubmit(queryText);
      }
    },
    [queryText, handleSearchSubmit],
  );

  const removeCriterion = useCallback((index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addCriterion = useCallback((c: FeasibilityCriterion) => {
    setCriteria((prev) => [...prev, c]);
    setAddingFilterType(null);
  }, []);

  const loadPresetQuery = useCallback((q: FeasibilityQuery) => {
    setCriteria([...q.criteria]);
    setActiveSavedId(q.id);
    setQueryText("");
  }, []);

  const clearAll = useCallback(() => {
    setCriteria([]);
    setQueryText("");
    setActiveSavedId(null);
  }, []);

  const handleSaveQuery = useCallback(() => {
    if (criteria.length === 0) return;
    const name = prompt("Name this query:");
    if (!name?.trim()) return;
    const q: FeasibilityQuery = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      criteria: [...criteria],
    };
    setCustomQueries((prev) => [...prev, q]);
    toast.success("Query saved", name.trim());
  }, [criteria, toast]);

  const handleDeleteCustomQuery = useCallback(
    (id: string) => {
      setCustomQueries((prev) => prev.filter((q) => q.id !== id));
      if (activeSavedId === id) {
        setActiveSavedId(null);
      }
    },
    [activeSavedId],
  );

  const handleExportCSV = useCallback(async () => {
    if (matchedPatientsList.length === 0) {
      toast.warning("No subjects to export");
      return;
    }
    const filePath = await exportCohortCSV(matchedPatientsList);
    if (filePath) {
      toast.success("CSV saved to Downloads", `${matchedPatientsList.length} subjects exported`);
    } else {
      toast.success("CSV exported", `${matchedPatientsList.length} subjects exported`);
    }
  }, [matchedPatientsList, toast]);

  const handleGenerateReport = useCallback(async () => {
    if (!result || matchedPatientsList.length === 0) {
      toast.warning("No results to report");
      return;
    }
    const exportResult = await generateFeasibilityReportPDF(result, criteria, matchedPatientsList);
    if (exportResult?.fileName) {
      toast.success("Report saved to Downloads", exportResult.fileName);
    } else {
      toast.success("Report generated", "Saved to Downloads");
    }
  }, [result, criteria, matchedPatientsList, toast]);

  // Icon lookup for criterion type
  function getCriterionIcon(type: CriterionTypeKey) {
    const config = CRITERION_TYPES.find((ct) => ct.key === type);
    if (!config) return Filter;
    return config.icon;
  }

  function getCriterionColor(type: CriterionTypeKey) {
    const config = CRITERION_TYPES.find((ct) => ct.key === type);
    return config?.color ?? "text-dim";
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-500" />
          <span className="text-sm text-dim">Loading patient data...</span>
        </div>
      </div>
    );
  }

  const hasFilters = criteria.length > 0;

  return (
    <div className="flex h-full">
      {/* ============================================================ */}
      {/* MAIN CONTENT */}
      {/* ============================================================ */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Status bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <span className="text-xs text-dim">
              {hasFilters ? (
                <>
                  <span className="text-indigo-400 font-semibold">{criteria.length} filter{criteria.length !== 1 ? "s" : ""} active</span>
                  {" -- "}
                  <span className="text-emerald-400 font-semibold">{formatNumber(result?.matchingPatients ?? 0)} subjects match</span>
                </>
              ) : (
                <>{formatNumber(patients.length)} subjects in database -- 0 filters active</>
              )}
            </span>
          </div>
          {hasFilters && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveQuery}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-dim hover:text-body hover:bg-white/5 transition-colors"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Save Query
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-dim hover:text-body hover:bg-white/5 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button
                onClick={handleGenerateReport}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                Feasibility Report
              </button>
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* HERO SEARCH BAR */}
        {/* ============================================================ */}
        <div className="mb-5">
          <div
            className={`relative rounded-xl transition-all duration-300 ${
              searchFocused
                ? "ring-2 ring-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.15)]"
                : "ring-1 ring-edge-3"
            }`}
            style={
              searchFocused
                ? {
                    background: "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))",
                  }
                : undefined
            }
          >
            <div className="flex items-center px-4 py-3.5 bg-card/80 rounded-xl backdrop-blur-sm">
              <div className="flex items-center gap-2 mr-3">
                {searchFocused ? (
                  <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                ) : (
                  <Search className="h-5 w-5 text-dim" />
                )}
              </div>
              <input
                ref={searchInputRef}
                type="text"
                className="flex-1 bg-transparent text-base text-body placeholder:text-dim focus:outline-none"
                placeholder="Describe your target population... e.g. 'diabetic patients over 50 with A1c above 8'"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
              {queryText && (
                <button
                  onClick={() => setQueryText("")}
                  className="mr-2 p-1 rounded-md text-dim hover:text-body hover:bg-white/5 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => handleSearchSubmit(queryText)}
                disabled={!queryText.trim()}
                className="h-9 px-4 rounded-lg bg-indigo-600 text-sm font-medium text-heading hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </button>
            </div>
          </div>

          {/* Parsed filter chips */}
          <AnimatePresence>
            {criteria.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-wrap gap-2 mt-3"
              >
                {criteria.map((c, i) => {
                  const Icon = getCriterionIcon(c.type);
                  const color = getCriterionColor(c.type);
                  return (
                    <motion.span
                      key={`${c.type}-${c.value}-${i}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-3 border border-edge-3 text-xs"
                    >
                      <Icon className={`h-3 w-3 ${color}`} />
                      <span className="text-body">{describeCriterionUI(c)}</span>
                      <button
                        onClick={() => removeCriterion(i)}
                        className="ml-0.5 p-0.5 rounded text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.span>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ============================================================ */}
        {/* FILTER BUILDER PANEL */}
        {/* ============================================================ */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => setAddFilterMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-2 border border-edge-3 text-xs text-body hover:bg-surface-4 hover:border-edge-4 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-400" />
                Add Filter
                <ChevronDown className="h-3 w-3 text-dim" />
              </button>
              <AnimatePresence>
                {addFilterMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1 z-50 w-52 rounded-xl bg-popover border border-edge-3 shadow-xl overflow-hidden"
                  >
                    {CRITERION_TYPES.map((ct) => {
                      const Icon = ct.icon;
                      return (
                        <button
                          key={ct.key}
                          onClick={() => {
                            setAddingFilterType(ct.key);
                            setAddFilterMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-body hover:bg-surface-3 transition-colors"
                        >
                          <Icon className={`h-4 w-4 ${ct.color}`} />
                          {ct.label}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Inline filter editor */}
          <AnimatePresence>
            {addingFilterType && (
              <InlineFilterEditor
                type={addingFilterType}
                onAdd={addCriterion}
                onCancel={() => setAddingFilterType(null)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ============================================================ */}
        {/* EMPTY STATE */}
        {/* ============================================================ */}
        {!hasFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8"
          >
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20 mb-4">
                <Search className="h-8 w-8 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-body mb-1">
                Define Your Target Population
              </h2>
              <p className="text-sm text-dim max-w-md mx-auto">
                Use the search bar above to describe your ideal cohort in plain language,
                or build criteria manually with the filter builder.
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              <h3 className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">
                Try an example query
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {EXAMPLE_QUERIES.map((eq) => (
                  <button
                    key={eq}
                    onClick={() => {
                      setQueryText(eq);
                      handleSearchSubmit(eq);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-surface-2 border border-edge-2 text-left text-sm text-body hover:bg-surface-3 hover:border-indigo-500/20 transition-all group"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400/50 group-hover:text-indigo-400 transition-colors" />
                    <span className="flex-1">{eq}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-dim group-hover:text-indigo-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================================ */}
        {/* RESULTS DASHBOARD */}
        {/* ============================================================ */}
        {hasFilters && result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Big match count */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl bg-card border border-edge-2 p-5">
                <div className="text-xs font-medium text-dim uppercase tracking-wider mb-1">
                  Matching Subjects
                </div>
                <div className="text-3xl font-bold text-emerald-400 tracking-tight">
                  {formatNumber(animatedMatch)}
                </div>
                <div className="text-xs text-dim mt-1">
                  of {formatNumber(animatedTotal)} total
                </div>
              </div>
              <div className="rounded-xl bg-card border border-edge-2 p-5">
                <div className="text-xs font-medium text-dim uppercase tracking-wider mb-1">
                  Match Rate
                </div>
                <div className="text-3xl font-bold text-indigo-400 tracking-tight">
                  {animatedRate}%
                </div>
                <div className="text-xs text-dim mt-1">
                  of population
                </div>
              </div>
              <div className="rounded-xl bg-card border border-edge-2 p-5">
                <div className="text-xs font-medium text-dim uppercase tracking-wider mb-1">
                  Avg Age
                </div>
                <div className="text-3xl font-bold text-body tracking-tight">
                  {result.demographics.avgAge}
                </div>
                <div className="text-xs text-dim mt-1">
                  years old
                </div>
              </div>
            </div>

            {/* Attrition Waterfall */}
            {waterfallData.length > 0 && (
              <div className="rounded-xl bg-card border border-edge-2 p-5 mb-6">
                <h3 className="text-sm font-semibold text-body mb-4 flex items-center gap-2">
                  <Filter className="h-4 w-4 text-indigo-400" />
                  Criterion Attrition
                </h3>
                <div className="space-y-3">
                  {waterfallData.map((w, i) => (
                    <div key={`waterfall-${i}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-medium ${
                            w.isBottleneck ? "text-amber-400" : "text-body"
                          }`}
                        >
                          {w.criterion}
                          {w.isBottleneck && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[12px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Bottleneck
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-dim">
                          {w.passing} / {result.totalPatients} ({(w.rate * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-5 rounded-md bg-surface-2 overflow-hidden flex">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(2, w.rate * 100)}%` }}
                          transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                          className="h-full rounded-md"
                          style={{
                            backgroundColor: w.isBottleneck ? WATERFALL_FAIL : WATERFALL_PASS,
                            opacity: w.isBottleneck ? 0.7 : 0.8,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Demographics Row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {/* Age Distribution */}
              <div className="rounded-xl bg-card border border-edge-2 p-5">
                <h3 className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">
                  Age Distribution
                </h3>
                {ageDistData.length > 0 && (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={ageDistData} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="range"
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e1b4b",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#e2e8f0",
                        }}
                      />
                      <Bar dataKey="count" fill={AGE_BAR_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Gender Split */}
              <div className="rounded-xl bg-card border border-edge-2 p-5">
                <h3 className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">
                  Gender Split
                </h3>
                {genderChartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={160}>
                    <RePieChart>
                      <Pie
                        data={genderChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={60}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {genderChartData.map((_, idx) => (
                          <Cell key={`gender-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e1b4b",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#e2e8f0",
                        }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                )}
                <div className="flex justify-center gap-4 mt-1">
                  {genderChartData.map((g, idx) => (
                    <div key={g.name} className="flex items-center gap-1.5 text-[12px] text-dim">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      {g.name} ({g.value})
                    </div>
                  ))}
                </div>
              </div>

              {/* Race Breakdown */}
              <div className="rounded-xl bg-card border border-edge-2 p-5">
                <h3 className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">
                  Race Breakdown
                </h3>
                <div className="space-y-2">
                  {raceChartData.map((r, idx) => {
                    const pct =
                      result.matchingPatients > 0
                        ? (r.value / result.matchingPatients) * 100
                        : 0;
                    return (
                      <div key={r.name}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12px] text-body truncate max-w-[140px]">
                            {r.name}
                          </span>
                          <span className="text-[12px] text-dim">
                            {r.value} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(2, pct)}%` }}
                            transition={{ duration: 0.5, delay: idx * 0.05 }}
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: RACE_COLORS[idx % RACE_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Matched Subjects Table */}
            <div className="rounded-xl bg-card border border-edge-2 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-edge-2">
                <h3 className="text-sm font-semibold text-body flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-400" />
                  Matched Subjects
                  <span className="text-xs font-normal text-dim">
                    ({matchedPatientsList.length})
                  </span>
                </h3>
              </div>
              <div className="overflow-y-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge-2">
                      <th className="text-left px-5 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        MRN
                      </th>
                      <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        Name
                      </th>
                      <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        Age
                      </th>
                      <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        Sex
                      </th>
                      <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        Primary Dx
                      </th>
                      <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        BMI
                      </th>
                      <th className="text-left px-3 py-2.5 text-[12px] font-semibold text-dim uppercase tracking-wider">
                        Dept
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedPatientsList.map((p) => {
                      const primaryDx = p.diagnoses[0];
                      return (
                        <tr
                          key={p.mrn}
                          className="border-b border-edge-1 hover:bg-surface-2 transition-colors"
                        >
                          <td className="px-5 py-2.5 text-body font-mono text-xs">
                            {p.mrn}
                          </td>
                          <td className="px-3 py-2.5 text-body">
                            {p.lastName}, {p.firstName}
                          </td>
                          <td className="px-3 py-2.5 text-dim">
                            {calculateAge(p.dob)}
                          </td>
                          <td className="px-3 py-2.5 text-dim">{p.sex}</td>
                          <td className="px-3 py-2.5 text-body text-xs max-w-[200px] truncate">
                            {primaryDx
                              ? `${primaryDx.icd10} ${primaryDx.name}`
                              : "--"}
                          </td>
                          <td className="px-3 py-2.5 text-dim">
                            {p.vitals.bmi > 0 ? p.vitals.bmi.toFixed(1) : "--"}
                          </td>
                          <td className="px-3 py-2.5 text-dim text-xs">
                            {p.department || "--"}
                          </td>
                        </tr>
                      );
                    })}
                    {matchedPatientsList.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-8 text-center text-sm text-dim"
                        >
                          No subjects match the current criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SAVED QUERIES SIDEBAR */}
      {/* ============================================================ */}
      <div className="w-64 shrink-0 border-l border-edge-2 bg-card/50 overflow-y-auto px-4 py-5">
        <h3 className="text-xs font-semibold text-dim uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <BookmarkCheck className="h-3.5 w-3.5" />
          Saved Queries
        </h3>

        {/* Preset queries */}
        <div className="space-y-1.5 mb-4">
          <div className="text-[12px] font-medium text-dim uppercase tracking-wider mb-1.5 px-1">
            Presets
          </div>
          {PRESET_QUERIES.map((q) => (
            <button
              key={q.id}
              onClick={() => loadPresetQuery(q)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                activeSavedId === q.id
                  ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
                  : "text-dim hover:bg-surface-2 hover:text-body"
              }`}
            >
              <div className="font-medium text-[12px] leading-tight mb-0.5">{q.name}</div>
              <div className="text-[12px] text-dim">
                {q.criteria.length} criteria
              </div>
            </button>
          ))}
        </div>

        {/* Custom queries */}
        {customQueries.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-dim uppercase tracking-wider mb-1.5 px-1">
              Custom
            </div>
            {customQueries.map((q) => (
              <div
                key={q.id}
                className={`flex items-center rounded-lg transition-colors ${
                  activeSavedId === q.id
                    ? "bg-indigo-500/15 ring-1 ring-indigo-500/30"
                    : "hover:bg-surface-2"
                }`}
              >
                <button
                  onClick={() => loadPresetQuery(q)}
                  className="flex-1 text-left px-3 py-2 text-xs"
                >
                  <div
                    className={`font-medium text-[12px] leading-tight mb-0.5 ${
                      activeSavedId === q.id ? "text-indigo-300" : "text-dim"
                    }`}
                  >
                    {q.name}
                  </div>
                  <div className="text-[12px] text-dim">
                    {q.criteria.length} criteria
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteCustomQuery(q.id)}
                  className="p-1.5 mr-1.5 rounded text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
