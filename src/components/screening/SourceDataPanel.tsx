import { useState, useEffect } from "react";
import { Table2, ArrowRight } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { getPatients } from "@/lib/data-provider";
import type { ParsedPatient } from "@/lib/epic-demo-data";
import type { Diagnosis, Medication, LabResult, VitalSign } from "@/types";

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
      ...(p.vitals.bmi ? [{ id: "v-bmi", patientId: p.mrn, measurementType: "bmi" as const, value: p.vitals.bmi, unit: "kg/m²", measurementDate: null }] : []),
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

export function SourceDataPanel() {
  const selectedPatientId = useScreeningStore((s) => s.selectedPatientId);
  const selectedCriterionId = useScreeningStore((s) => s.selectedCriterionId);
  const screeningResults = useScreeningStore((s) => s.screeningResults);
  const criteriaResults = useScreeningStore((s) => s.criteriaResults);
  const patients = useScreeningStore((s) => s.patients);
  const setStudyDetailOpen = useScreeningStore((s) => s.setStudyDetailOpen);
  const [activeTab, setActiveTab] = useState<TabId>("demographics");
  const [allParsedPatients, setAllParsedPatients] = useState<ParsedPatient[]>([]);

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

  useEffect(() => {
    if (selectedCriterion?.evidence && selectedCriterion.evidenceSource) {
      const targetTab = evidenceSourceToTab(selectedCriterion.evidenceSource);
      if (targetTab) setActiveTab(targetTab);
    }
  }, [selectedCriterionId, selectedCriterion?.evidence, selectedCriterion?.evidenceSource]);

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

  const highlightTab = selectedCriterion ? evidenceSourceToTab(selectedCriterion.evidenceSource) : null;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-background">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasHighlight = highlightTab === tab.id && !isActive;
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
                <span className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Criterion context bar — only show when there's actual evidence tied to a data source */}
      {selectedCriterion && selectedCriterion.evidence && highlightTab && (
        <div className="flex items-center gap-2 border-b border-border bg-indigo-500/5 px-3 py-2">
          <ArrowRight className="h-3 w-3 text-indigo-400" />
          <p className="truncate text-[12px] text-indigo-300/80">
            Evidence for: <span className="font-medium text-indigo-300">{selectedCriterion.criterionText.slice(0, 60)}{selectedCriterion.criterionText.length > 60 ? "..." : ""}</span>
          </p>
        </div>
      )}
      {selectedCriterion && (!selectedCriterion.evidence || !highlightTab) && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/5 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
          <p className="truncate text-[12px] text-amber-300/70">
            No structured evidence found for: <span className="font-medium text-amber-300/80">{selectedCriterion.criterionText.slice(0, 50)}{selectedCriterion.criterionText.length > 50 ? "..." : ""}</span>
          </p>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "demographics" && (
          <DemographicsTab patientId={selectedPatientId} isHighlighted={highlightTab === "demographics"} />
        )}
        {activeTab === "diagnoses" && (
          <DiagnosesTab diagnoses={clinicalData.diagnoses} isHighlighted={highlightTab === "diagnoses"} evidence={selectedCriterion?.evidence} />
        )}
        {activeTab === "medications" && (
          <MedicationsTab medications={clinicalData.medications} isHighlighted={highlightTab === "medications"} evidence={selectedCriterion?.evidence} />
        )}
        {activeTab === "labs" && (
          <LabsTab labs={clinicalData.labs} isHighlighted={highlightTab === "labs"} evidence={selectedCriterion?.evidence} />
        )}
        {activeTab === "vitals" && (
          <VitalsTab vitals={clinicalData.vitals} isHighlighted={highlightTab === "vitals"} />
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

// --- Tab Components (dark themed) ---

function DemographicsTab({ patientId, isHighlighted }: { patientId: string; isHighlighted: boolean }) {
  const patients = useScreeningStore((s) => s.patients);
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return null;

  const rows = [
    ["Subject ID", patient.sitePatientId],
    ["Age", `${patient.age} years`],
    ["Gender", patient.gender === "male" ? "Male" : "Female"],
    ["Primary Diagnosis", patient.primaryDiagnosis ?? "\u2014"],
  ];

  return (
    <div className="p-3">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className={`border-b border-edge-1 ${isHighlighted ? "bg-amber-500/5" : ""}`}>
              <td className="py-2.5 pr-3 font-medium text-dim">{label}</td>
              <td className="py-2.5 font-mono text-body">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagnosesTab({ diagnoses, isHighlighted, evidence }: { diagnoses: Diagnosis[]; isHighlighted: boolean; evidence: string | null | undefined }) {
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
            const isMatch = isHighlighted && evidence && (
              evidence.includes(dx.icd10Code ?? "") ||
              evidence.toLowerCase().includes(dx.description.toLowerCase().slice(0, 10))
            );
            return (
              <tr
                key={dx.id}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : ""}`}
              >
                <td className="px-3 py-2 font-mono font-semibold text-body">{dx.icd10Code}</td>
                <td className="px-3 py-2 text-body">{dx.description}</td>
                <td className="px-3 py-2 text-dim">{dx.onsetDate}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    dx.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-surface-2 text-dim"
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

function MedicationsTab({ medications, isHighlighted, evidence }: { medications: Medication[]; isHighlighted: boolean; evidence: string | null | undefined }) {
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
            const isMatch = isHighlighted && evidence &&
              evidence.toLowerCase().includes(med.drugName.toLowerCase());
            return (
              <tr
                key={med.id}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : ""}`}
              >
                <td className="px-3 py-2 font-semibold text-body">{med.drugName}</td>
                <td className="px-3 py-2 font-mono text-body">{med.dose}</td>
                <td className="px-3 py-2 text-dim">{med.frequency}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    med.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-surface-2 text-dim"
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

function LabsTab({ labs, isHighlighted, evidence }: { labs: LabResult[]; isHighlighted: boolean; evidence: string | null | undefined }) {
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
            const isMatch = isHighlighted && evidence &&
              evidence.toLowerCase().includes(lab.testName.toLowerCase());
            return (
              <tr
                key={lab.id}
                className={`border-b border-edge-1 transition-colors ${isMatch ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : ""}`}
              >
                <td className="px-3 py-2 font-semibold text-body">{lab.testName}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-body">
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

function VitalsTab({ vitals, isHighlighted }: { vitals: VitalSign[]; isHighlighted: boolean }) {
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
          {vitals.map((v) => (
            <tr
              key={v.id}
              className={`border-b border-edge-1 ${isHighlighted ? "bg-amber-500/5" : ""}`}
            >
              <td className="px-3 py-2 font-semibold text-body">
                {typeLabels[v.measurementType] ?? v.measurementType}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold text-body">{v.value}</td>
              <td className="px-3 py-2 text-dim">{v.unit}</td>
              <td className="px-3 py-2 text-dim">{v.measurementDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
