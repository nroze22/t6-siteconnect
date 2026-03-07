import { useState, useEffect } from "react";
import { Table2, ArrowRight } from "lucide-react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { getPatientClinicalData } from "@/lib/demo-data";
import type { Diagnosis, Medication, LabResult, VitalSign } from "@/types";

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
  const setStudyDetailOpen = useScreeningStore((s) => s.setStudyDetailOpen);
  const [activeTab, setActiveTab] = useState<TabId>("demographics");

  const clinicalData = selectedPatientId ? getPatientClinicalData(selectedPatientId) : null;
  const screening = selectedPatientId ? screeningResults.get(selectedPatientId) : null;
  const criteria = screening ? criteriaResults.get(screening.id) ?? [] : [];
  const selectedCriterion = criteria.find((c) => c.id === selectedCriterionId);

  useEffect(() => {
    if (selectedCriterion?.evidenceSource) {
      const targetTab = evidenceSourceToTab(selectedCriterion.evidenceSource);
      if (targetTab) setActiveTab(targetTab);
    }
  }, [selectedCriterionId, selectedCriterion?.evidenceSource]);

  if (!selectedPatientId || !clinicalData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-card p-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]">
          <Table2 className="h-6 w-6 text-slate-600" />
        </div>
        <p className="text-[13px] font-semibold text-slate-300">Source Data</p>
        <p className="mt-1.5 max-w-[200px] text-[11px] leading-relaxed text-slate-500">
          When you select a patient, their clinical records appear here. Click any criterion to highlight matching evidence.
        </p>
      </div>
    );
  }

  const highlightTab = selectedCriterion ? evidenceSourceToTab(selectedCriterion.evidenceSource) : null;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-[#0e1119]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasHighlight = highlightTab === tab.id && !isActive;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 px-1 py-2.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-indigo-400 border-b-2 border-indigo-500"
                  : "text-slate-500 hover:text-slate-300"
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

      {/* Criterion context bar */}
      {selectedCriterion && (
        <div className="flex items-center gap-2 border-b border-border bg-indigo-500/5 px-3 py-2">
          <ArrowRight className="h-3 w-3 text-indigo-400" />
          <p className="truncate text-[10px] text-indigo-300/80">
            Showing evidence for: <span className="font-medium text-indigo-300">{selectedCriterion.criterionText.slice(0, 60)}...</span>
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
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2.5 text-[11px] font-medium text-slate-400 transition-all hover:bg-white/[0.06] hover:text-slate-200"
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
    ["Patient ID", patient.sitePatientId],
    ["Age", `${patient.age} years`],
    ["Gender", patient.gender === "male" ? "Male" : "Female"],
    ["Primary Diagnosis", patient.primaryDiagnosis ?? "\u2014"],
  ];

  return (
    <div className="p-3">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className={`border-b border-white/[0.04] ${isHighlighted ? "bg-amber-500/5" : ""}`}>
              <td className="py-2.5 pr-3 font-medium text-slate-500">{label}</td>
              <td className="py-2.5 font-mono text-slate-200">{value}</td>
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
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">ICD-10</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Description</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Date</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Status</th>
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
                className={`border-b border-white/[0.04] transition-colors ${isMatch ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : ""}`}
              >
                <td className="px-3 py-2 font-mono font-semibold text-slate-200">{dx.icd10Code}</td>
                <td className="px-3 py-2 text-slate-300">{dx.description}</td>
                <td className="px-3 py-2 text-slate-500">{dx.onsetDate}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    dx.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.04] text-slate-500"
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
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Drug</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Dose</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Freq</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((med) => {
            const isMatch = isHighlighted && evidence &&
              evidence.toLowerCase().includes(med.drugName.toLowerCase());
            return (
              <tr
                key={med.id}
                className={`border-b border-white/[0.04] transition-colors ${isMatch ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : ""}`}
              >
                <td className="px-3 py-2 font-semibold text-slate-200">{med.drugName}</td>
                <td className="px-3 py-2 font-mono text-slate-300">{med.dose}</td>
                <td className="px-3 py-2 text-slate-500">{med.frequency}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                    med.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.04] text-slate-500"
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
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Test</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Value</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Unit</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Ref</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Date</th>
          </tr>
        </thead>
        <tbody>
          {labs.map((lab) => {
            const isMatch = isHighlighted && evidence &&
              evidence.toLowerCase().includes(lab.testName.toLowerCase());
            return (
              <tr
                key={lab.id}
                className={`border-b border-white/[0.04] transition-colors ${isMatch ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : ""}`}
              >
                <td className="px-3 py-2 font-semibold text-slate-200">{lab.testName}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">
                  {lab.value != null ? lab.value.toLocaleString() : "\u2014"}
                </td>
                <td className="px-3 py-2 text-slate-500">{lab.unit}</td>
                <td className="px-3 py-2 text-[10px] text-slate-600">{lab.referenceRange}</td>
                <td className="px-3 py-2 text-slate-500">{lab.resultDate}</td>
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
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Measurement</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Value</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Unit</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Date</th>
          </tr>
        </thead>
        <tbody>
          {vitals.map((v) => (
            <tr
              key={v.id}
              className={`border-b border-white/[0.04] ${isHighlighted ? "bg-amber-500/5" : ""}`}
            >
              <td className="px-3 py-2 font-semibold text-slate-200">
                {typeLabels[v.measurementType] ?? v.measurementType}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">{v.value}</td>
              <td className="px-3 py-2 text-slate-500">{v.unit}</td>
              <td className="px-3 py-2 text-slate-500">{v.measurementDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
