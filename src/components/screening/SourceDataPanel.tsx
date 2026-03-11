import { useState, useEffect, useRef } from "react";
import { Table2, ArrowRight, AlertTriangle } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { getPatients } from "@/lib/data-provider";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import type { Diagnosis, Medication, LabResult, VitalSign, CriterionResult } from "@/types";

/** Convert ParsedPatient clinical data to the typed format used by tabs */
function parsedPatientToClinical(p: ParsedPatient): { diagnoses: Diagnosis[]; medications: Medication[]; labs: LabResult[]; vitals: VitalSign[] } {
  return {
    diagnoses: p.diagnoses.map((d, i) => ({
      id: `dx-${i}`,
      patientId: p.mrn,
      icd10Code: d.icd10 || null,
      description: d.name,
      onsetDate: d.onset || null,
      status: "active" as const,
      source: "structured" as const,
      confidence: 1.0,
      rawText: null,
    })),
    medications: p.medications.map((m, i) => ({
      id: `med-${i}`,
      patientId: p.mrn,
      rxnormCode: null,
      drugName: m.name,
      dose: m.dose || null,
      frequency: null,
      startDate: null,
      endDate: null,
      status: (m.status?.toLowerCase() === "active" ? "active" : "historical") as "active" | "discontinued" | "historical",
      source: "structured" as const,
      confidence: 1.0,
    })),
    labs: p.labs.map((l, i) => ({
      id: `lab-${i}`,
      patientId: p.mrn,
      loincCode: null,
      testName: l.test,
      value: l.value ? parseFloat(l.value) || null : null,
      unit: l.unit || null,
      referenceRange: l.ref || null,
      resultDate: l.date || null,
      abnormalFlag: l.abnormal ? "Y" : null,
      source: "structured",
    })),
    vitals: [
      ...(p.vitals.systolic ? [{ id: "v-sys", patientId: p.mrn, measurementType: "bp_systolic" as const, value: p.vitals.systolic, unit: "mmHg", measurementDate: null }] : []),
      ...(p.vitals.diastolic ? [{ id: "v-dia", patientId: p.mrn, measurementType: "bp_diastolic" as const, value: p.vitals.diastolic, unit: "mmHg", measurementDate: null }] : []),
      ...(p.vitals.pulse ? [{ id: "v-hr", patientId: p.mrn, measurementType: "hr" as const, value: p.vitals.pulse, unit: "bpm", measurementDate: null }] : []),
      ...(p.vitals.weight ? [{ id: "v-wt", patientId: p.mrn, measurementType: "weight" as const, value: p.vitals.weight, unit: "kg", measurementDate: null }] : []),
      ...(p.vitals.height ? [{ id: "v-ht", patientId: p.mrn, measurementType: "height" as const, value: p.vitals.height, unit: "cm", measurementDate: null }] : []),
      ...(p.vitals.bmi ? [{ id: "v-bmi", patientId: p.mrn, measurementType: "bmi" as const, value: p.vitals.bmi, unit: "kg/m\u00B2", measurementDate: null }] : []),
    ],
  };
}

const tabs = [
  { id: "demographics", label: "Demographics" },
  { id: "diagnoses", label: "Diagnoses" },
  { id: "medications", label: "Meds" },
  { id: "labs", label: "Labs" },
  { id: "vitals", label: "Vitals" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function evidenceSourceToTab(source: string | null): TabId | null {
  if (!source) return null;
  if (source === "demographics") return "demographics";
  if (source === "diagnoses") return "diagnoses";
  if (source === "medications") return "medications";
  if (source === "labs") return "labs";
  if (source === "vitals") return "vitals";
  return null;
}

// ============================================================
// Improved matching: extract searchable terms from criterion
// ============================================================

/** Infer which tab to show based on criterion text + evidence when evidenceSource is null */
function inferTabFromContent(criterion: CriterionResult): TabId | null {
  const text = `${criterion.criterionText} ${criterion.evidence ?? ""} ${criterion.reasoning ?? ""}`.toLowerCase();

  // Lab keywords
  if (/\b(hgb|plt|anc|wbc|egfr|creatinine|bilirubin|ast|alt|a1c|hemoglobin|platelet|neutrophil|lab|g\/dl|u\/l|ml\/min|mg\/dl|\/ul|hematologic|hepatic|renal function)\b/.test(text)) return "labs";

  // Medication keywords
  if (/\b(therap|medication|drug|regimen|chemo|immunosup|systemic treatment|prior.*therapy|immunotherapy|checkpoint|pembrolizumab|nivolumab|methotrexate|chemotherapy)\b/.test(text)) return "medications";

  // Diagnosis keywords (ICD codes or diagnosis terms)
  if (/\b(icd-?10|diagnosis|diagnosed|autoimmune|hiv|hepatitis|metastas|infection|c\d{2}\.\d|e\d{2}\.\d|i\d{2}\.\d|j\d{2}\.\d|m\d{2}\.\d|nsclc|lung cancer|heart failure|alzheimer|crohn|atopic|diabetes)\b/.test(text)) return "diagnoses";

  // Vitals keywords
  if (/\b(bmi|ecog|performance status|weight|bp|heart rate|vital|blood pressure)\b/.test(text)) return "vitals";

  // Age/demographics
  if (/\b(age|gender|sex|years old|patient age|pregnant|male|female)\b/.test(text)) return "demographics";

  return null;
}

/** Build a set of search terms from criterion text + evidence for row matching.
 *  We focus on extracting *specific clinical identifiers* (ICD codes, drug names, lab test names)
 *  rather than generic words from sentences. */
function buildSearchTerms(criterion: CriterionResult): string[] {
  const terms: string[] = [];
  const combined = `${criterion.evidence ?? ""} ${criterion.criterionText} ${criterion.reasoning ?? ""}`;

  // 1. Extract ICD-10 codes (e.g., C34.1, E11.9, M06.0) and also prefix codes (C34, E11)
  const icdMatches = combined.match(/[A-Z]\d{2}(?:\.\d{1,2})?/g);
  if (icdMatches) {
    for (const m of icdMatches) {
      terms.push(m.toLowerCase());
      // Also add the prefix (e.g., "c34" for "C34.1") for broader matching
      const prefix = m.slice(0, 3).toLowerCase();
      terms.push(prefix);
    }
  }

  // 2. Extract known drug names — match capitalized words that look like drug names
  const knownDrugs = combined.match(/\b(Carboplatin|Cisplatin|Pemetrexed|Docetaxel|Paclitaxel|Pembrolizumab|Nivolumab|Atezolizumab|Durvalumab|Avelumab|Cemiplimab|Methotrexate|Azathioprine|Mycophenolate|Cyclophosphamide|Dapagliflozin|Semaglutide|Lecanemab|Trastuzumab|Letrozole|Tamoxifen|Lisinopril|Metoprolol|Atorvastatin|Amlodipine|Metformin|Donepezil|Memantine|Insulin|Aspirin|Warfarin|Omeprazole|Pantoprazole|Furosemide|Prednisone|Rituximab|Adalimumab|Infliximab|Dupilumab|Budesonide|Fluticasone|Albuterol|Montelukast|Topiramate|Phentermine|Orlistat)\b/gi);
  if (knownDrugs) terms.push(...knownDrugs.map((d) => d.toLowerCase()));

  // 3. Extract lab test names from "TestName: value unit" patterns in evidence
  if (criterion.evidence) {
    const labPairs = criterion.evidence.match(/(\w[\w\s]*?)\s*:\s*[\d.]+\s*\w*/g);
    if (labPairs) {
      for (const pair of labPairs) {
        const name = pair.split(":")[0]?.trim();
        if (name && name.length > 1) terms.push(name.toLowerCase());
      }
    }
    // Also extract known lab abbreviations
    const labAbbrevs = criterion.evidence.match(/\b(HgB|Plt|ANC|WBC|eGFR|ALT|AST|Creatinine|Bilirubin|A1C|HbA1c|TSH|BNP|NT-proBNP|Albumin|Platelets|Hemoglobin|Neutrophil)\b/gi);
    if (labAbbrevs) terms.push(...labAbbrevs.map((l) => l.toLowerCase()));
  }

  // 4. Extract specific vitals terms
  const vitalTerms = combined.match(/\b(BMI|ECOG|blood pressure|weight|heart rate|systolic|diastolic)\b/gi);
  if (vitalTerms) terms.push(...vitalTerms.map((v) => v.toLowerCase()));

  // 5. Extract demographic terms for age matching
  const ageMatch = combined.match(/\bage[:\s]+(\d+)/i);
  if (ageMatch) terms.push(`${ageMatch[1]} years`);

  // 6. For medication-related criteria, also extract drug names from the criterion text
  const criterionDrugs = criterion.criterionText.match(/\b(chemotherapy|immunotherapy|anti-PD-[1L]|checkpoint inhibitor|systemic therapy)\b/gi);
  if (criterionDrugs) {
    // When criterion mentions drug classes, we want to match those drug rows
    // Add a flag so medication tab knows to highlight active chemo drugs
    terms.push("__match_active_meds__");
  }

  return [...new Set(terms)];
}

/** Check if a text matches any of the search terms */
function matchesTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

// ============================================================
// Component
// ============================================================

export function SourceDataPanel() {
  const selectedPatientId = useScreeningStore((s) => s.selectedPatientId);
  const selectedCriterionId = useScreeningStore((s) => s.selectedCriterionId);
  const screeningResults = useScreeningStore((s) => s.screeningResults);
  const criteriaResults = useScreeningStore((s) => s.criteriaResults);
  const patients = useScreeningStore((s) => s.patients);
  const setStudyDetailOpen = useScreeningStore((s) => s.setStudyDetailOpen);
  const [activeTab, setActiveTab] = useState<TabId>("demographics");
  const [allParsedPatients, setAllParsedPatients] = useState<ParsedPatient[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load actual patient data (from DB or demo) for clinical data display
  useEffect(() => {
    getPatients().then(setAllParsedPatients);
  }, []);

  // Look up clinical data by matching the patient's sitePatientId (MRN) against ParsedPatient.mrn
  const selectedPatient = selectedPatientId ? patients.find((p) => p.id === selectedPatientId) : null;
  const matchedParsed = selectedPatient
    ? allParsedPatients.find((pp) => pp.mrn === selectedPatient.sitePatientId)
    : null;
  const clinicalData = matchedParsed ? parsedPatientToClinical(matchedParsed) : null;
  const screening = selectedPatientId ? screeningResults.get(selectedPatientId) : null;
  const criteria = screening ? criteriaResults.get(screening.id) ?? [] : [];
  const selectedCriterion = criteria.find((c) => c.id === selectedCriterionId);

  // Resolve the target tab: explicit evidenceSource, or infer from content
  const resolvedTab = selectedCriterion
    ? evidenceSourceToTab(selectedCriterion.evidenceSource) ?? inferTabFromContent(selectedCriterion)
    : null;

  // Build search terms for row highlighting
  const searchTerms = selectedCriterion ? buildSearchTerms(selectedCriterion) : [];

  // Auto-switch tab when a criterion is selected and we know which tab to show
  useEffect(() => {
    if (resolvedTab) {
      setActiveTab(resolvedTab);
    }
  }, [selectedCriterionId, resolvedTab]);

  // Scroll to first highlighted row when tab switches
  useEffect(() => {
    if (!resolvedTab || !selectedCriterionId) return;
    // Small delay to let the tab content render
    const timer = setTimeout(() => {
      const highlighted = scrollRef.current?.querySelector("[data-highlighted='true']");
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedCriterionId, activeTab, resolvedTab]);

  if (!selectedPatientId || !clinicalData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-card p-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 ring-1 ring-edge-2">
          <Table2 className="h-6 w-6 text-dim" />
        </div>
        <p className="text-[13px] font-semibold text-body">Source Data</p>
        <p className="mt-1.5 max-w-[200px] text-[12px] leading-relaxed text-dim">
          When you select a subject, their clinical records appear here. Click any criterion to highlight matching evidence.
        </p>
      </div>
    );
  }

  const hasEvidence = selectedCriterion && (selectedCriterion.evidence || resolvedTab);

  // Determine if the criterion has no evidence at all (null evidence + no resolved tab)
  const criterionHasNoEvidence = selectedCriterion && !selectedCriterion.evidence && !resolvedTab;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-background">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasHighlight = resolvedTab === tab.id && !isActive;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 px-1 py-2.5 text-[12px] font-medium transition-colors ${
                isActive
                  ? "text-indigo-400 border-b-2 border-indigo-500"
                  : "text-dim hover:text-body"
              }`}
            >
              {tab.label}
              {hasHighlight && (
                <span className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_4px_rgba(129,140,248,0.5)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Criterion context bar — evidence found */}
      {selectedCriterion && hasEvidence && (
        <div className="flex items-center gap-2 border-b border-border bg-indigo-500/5 px-3 py-2">
          <ArrowRight className="h-3 w-3 shrink-0 text-indigo-400" />
          <p className="truncate text-[12px] text-indigo-300/80">
            Evidence for: <span className="font-medium text-indigo-300">{selectedCriterion.criterionText.slice(0, 60)}{selectedCriterion.criterionText.length > 60 ? "..." : ""}</span>
          </p>
        </div>
      )}

      {/* Criterion context bar — no evidence */}
      {criterionHasNoEvidence && (
        <div className="flex flex-col gap-2 border-b border-border bg-amber-100 dark:bg-amber-500/5 px-3 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[12px] font-medium text-indigo-700 dark:text-indigo-300">
              No evidence found in patient record
            </p>
          </div>
          <p className="text-[11px] text-amber-700/70 dark:text-amber-300/60 leading-relaxed pl-5.5">
            {selectedCriterion.reasoning ?? "This criterion could not be evaluated from the available structured data. Manual chart review may be needed."}
          </p>
        </div>
      )}

      {/* Tab content */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
        {activeTab === "demographics" && (
          <DemographicsTab
            patientId={selectedPatientId}
            isHighlighted={resolvedTab === "demographics"}
            searchTerms={searchTerms}
          />
        )}
        {activeTab === "diagnoses" && (
          <DiagnosesTab
            diagnoses={clinicalData.diagnoses}
            isHighlighted={resolvedTab === "diagnoses"}
            searchTerms={searchTerms}
          />
        )}
        {activeTab === "medications" && (
          <MedicationsTab
            medications={clinicalData.medications}
            isHighlighted={resolvedTab === "medications"}
            searchTerms={searchTerms}
          />
        )}
        {activeTab === "labs" && (
          <LabsTab
            labs={clinicalData.labs}
            isHighlighted={resolvedTab === "labs"}
            searchTerms={searchTerms}
          />
        )}
        {activeTab === "vitals" && (
          <VitalsTab
            vitals={clinicalData.vitals}
            isHighlighted={resolvedTab === "vitals"}
            searchTerms={searchTerms}
          />
        )}
      </div>

      {/* View Study button */}
      <div className="border-t border-border p-3">
        <button
          onClick={() => setStudyDetailOpen(true)}
          className="w-full rounded-lg border border-edge-3 bg-surface-2 py-2.5 text-[12px] font-medium text-dim transition-all hover:bg-surface-3 hover:text-body"
        >
          View Study Details
        </button>
      </div>
    </div>
  );
}

// --- Tab Components ---

function DemographicsTab({ patientId, isHighlighted, searchTerms }: { patientId: string; isHighlighted: boolean; searchTerms: string[] }) {
  const patients = useScreeningStore((s) => s.patients);
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return null;

  const rows: [string, string, string][] = [
    ["Subject ID", patient.sitePatientId, "id"],
    ["Age", `${patient.age} years`, "age"],
    ["Gender", patient.gender === "male" ? "Male" : "Female", "gender"],
    ["Primary Diagnosis", patient.primaryDiagnosis ?? "\u2014", "diagnosis"],
  ];

  return (
    <div className="p-3">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map(([label, value, key]) => {
            const isMatch = isHighlighted && matchesTerms(`${label} ${value} ${key}`, searchTerms);
            return (
              <tr
                key={label}
                data-highlighted={isMatch ? "true" : undefined}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-indigo-500/8 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30 dark:ring-indigo-500/25" : ""}`}
              >
                <td className={`py-2.5 pr-3 font-medium ${isMatch ? "text-indigo-700 dark:text-indigo-300" : "text-dim"}`}>{label}</td>
                <td className={`py-2.5 font-mono ${isMatch ? "text-indigo-800 dark:text-indigo-200 font-semibold" : "text-body"}`}>{value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DiagnosesTab({ diagnoses, isHighlighted, searchTerms }: { diagnoses: Diagnosis[]; isHighlighted: boolean; searchTerms: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-edge-2 bg-surface-1">
            <th className="px-3 py-2 text-left font-semibold text-dim">ICD-10</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Description</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Date</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Status</th>
          </tr>
        </thead>
        <tbody>
          {diagnoses.map((dx) => {
            // Match against ICD code (exact and prefix) + description
            const rowText = `${dx.icd10Code ?? ""} ${dx.description}`.toLowerCase();
            const icdLower = (dx.icd10Code ?? "").toLowerCase();
            const isMatch = isHighlighted && (
              // Direct text match
              searchTerms.some((term) => rowText.includes(term)) ||
              // ICD prefix matching: "c34" matches "C34.1", "C34.9", etc.
              (icdLower && searchTerms.some((t) => /^[a-z]\d{2}/.test(t) && icdLower.startsWith(t)))
            );
            return (
              <tr
                key={dx.id}
                data-highlighted={isMatch ? "true" : undefined}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-indigo-500/8 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30 dark:ring-indigo-500/25" : ""}`}
              >
                <td className={`px-3 py-2 font-mono font-semibold ${isMatch ? "text-indigo-700 dark:text-indigo-300" : "text-body"}`}>{dx.icd10Code}</td>
                <td className={`px-3 py-2 ${isMatch ? "text-indigo-800 dark:text-indigo-200 font-medium" : "text-body"}`}>{dx.description}</td>
                <td className="px-3 py-2 text-dim">{dx.onsetDate}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    dx.status === "active" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20" : "bg-surface-2 text-dim"
                  }`}>
                    {dx.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MedicationsTab({ medications, isHighlighted, searchTerms }: { medications: Medication[]; isHighlighted: boolean; searchTerms: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-edge-2 bg-surface-1">
            <th className="px-3 py-2 text-left font-semibold text-dim">Drug</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Dose</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Freq</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Status</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((med) => {
            const isMatch = isHighlighted && (
              matchesTerms(med.drugName, searchTerms) ||
              // When criterion is about drug classes (chemotherapy, immunotherapy), match active meds in those classes
              (searchTerms.includes("__match_active_meds__") && med.status === "active")
            );
            return (
              <tr
                key={med.id}
                data-highlighted={isMatch ? "true" : undefined}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-indigo-500/8 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30 dark:ring-indigo-500/25" : ""}`}
              >
                <td className={`px-3 py-2 font-semibold ${isMatch ? "text-indigo-700 dark:text-indigo-300" : "text-body"}`}>{med.drugName}</td>
                <td className="px-3 py-2 font-mono text-body">{med.dose}</td>
                <td className="px-3 py-2 text-dim">{med.frequency}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    med.status === "active" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20" : "bg-surface-2 text-dim"
                  }`}>
                    {med.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LabsTab({ labs, isHighlighted, searchTerms }: { labs: LabResult[]; isHighlighted: boolean; searchTerms: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-edge-2 bg-surface-1">
            <th className="px-3 py-2 text-left font-semibold text-dim">Test</th>
            <th className="px-3 py-2 text-right font-semibold text-dim">Value</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Unit</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Ref</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Date</th>
          </tr>
        </thead>
        <tbody>
          {labs.map((lab) => {
            // Match against test name + common aliases (e.g., "HgB" matches "Hemoglobin")
            const labAliases: Record<string, string[]> = {
              hemoglobin: ["hgb", "hb"],
              platelets: ["plt", "platelet"],
              "white blood cell": ["wbc"],
              "absolute neutrophil count": ["anc", "neutrophil"],
              creatinine: ["cr", "scr"],
              "total bilirubin": ["bilirubin", "tbili"],
              "alt": ["sgpt", "alanine"],
              "ast": ["sgot", "aspartate"],
              albumin: ["alb"],
              egfr: ["gfr"],
            };
            const nameL = lab.testName.toLowerCase();
            const aliases = Object.entries(labAliases).find(([key, vals]) => nameL.includes(key) || vals.some((v) => nameL.includes(v)));
            const searchable = aliases ? `${lab.testName} ${aliases[0]} ${aliases[1].join(" ")}` : lab.testName;
            const isMatch = isHighlighted && matchesTerms(searchable, searchTerms);
            return (
              <tr
                key={lab.id}
                data-highlighted={isMatch ? "true" : undefined}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-indigo-500/8 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30 dark:ring-indigo-500/25" : ""}`}
              >
                <td className={`px-3 py-2 font-semibold ${isMatch ? "text-indigo-700 dark:text-indigo-300" : "text-body"}`}>{lab.testName}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${isMatch ? "text-indigo-800 dark:text-indigo-200" : "text-body"}`}>
                  {lab.value != null ? lab.value.toLocaleString() : "\u2014"}
                </td>
                <td className="px-3 py-2 text-dim">{lab.unit}</td>
                <td className="px-3 py-2 text-[12px] text-dim">{lab.referenceRange}</td>
                <td className="px-3 py-2 text-dim">{lab.resultDate}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VitalsTab({ vitals, isHighlighted, searchTerms }: { vitals: VitalSign[]; isHighlighted: boolean; searchTerms: string[] }) {
  const typeLabels: Record<string, string> = {
    bp_systolic: "BP Systolic",
    bp_diastolic: "BP Diastolic",
    hr: "Heart Rate",
    weight: "Weight",
    height: "Height",
    bmi: "BMI",
    temp: "Temperature",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-edge-2 bg-surface-1">
            <th className="px-3 py-2 text-left font-semibold text-dim">Measurement</th>
            <th className="px-3 py-2 text-right font-semibold text-dim">Value</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Unit</th>
            <th className="px-3 py-2 text-left font-semibold text-dim">Date</th>
          </tr>
        </thead>
        <tbody>
          {vitals.map((v) => {
            const label = typeLabels[v.measurementType] ?? v.measurementType;
            // Build searchable text including aliases (e.g., "bmi" matches "BMI" row, "ecog" matches via "performance status")
            const searchable = `${label} ${v.measurementType} ${v.value}`;
            const isMatch = isHighlighted && matchesTerms(searchable, searchTerms);
            return (
              <tr
                key={v.id}
                data-highlighted={isMatch ? "true" : undefined}
                className={`border-b border-edge-1 ${isMatch ? "bg-indigo-500/8 dark:bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/30 dark:ring-indigo-500/25" : ""}`}
              >
                <td className={`px-3 py-2 font-semibold ${isMatch ? "text-indigo-700 dark:text-indigo-300" : "text-body"}`}>
                  {label}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${isMatch ? "text-indigo-800 dark:text-indigo-200" : "text-body"}`}>{v.value}</td>
                <td className="px-3 py-2 text-dim">{v.unit}</td>
                <td className="px-3 py-2 text-dim">{v.measurementDate}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
