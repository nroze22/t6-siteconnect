import { useState, useMemo } from "react";
import {
  Users,
  Phone,
  Heart,
  FileSignature,
  UserCheck,
  ChevronDown,
  Clock,
  ArrowRight,
  Search,
  MessageSquare,
  PhoneCall,
  XCircle,
  TrendingUp,
  Info,
  X as XIcon,
  Zap,
  Target,
  Timer,
} from "lucide-react";
import { parseEpicRows, screenPatientsForStudy, STUDY_SCREENING_DEFS } from "@/lib/epic-demo-data";

// Pipeline stages
type PipelineStage = "identified" | "contacted" | "interested" | "consented" | "enrolled" | "screen_failed";

interface PipelinePatient {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: string;
  diagnosis: string;
  stage: PipelineStage;
  score: number;
  studyId: string;
  studyName: string;
  daysInStage: number;
  lastContact: string | null;
  contactAttempts: number;
  notes: string | null;
  nextAction: string | null;
  assignedTo: string;
}

const STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  identified: { label: "Identified", color: "text-blue-400", bgColor: "bg-blue-500/8", borderColor: "border-blue-500/20", icon: <Users className="h-4 w-4" /> },
  contacted: { label: "Contacted", color: "text-amber-400", bgColor: "bg-amber-500/8", borderColor: "border-amber-500/20", icon: <Phone className="h-4 w-4" /> },
  interested: { label: "Interested", color: "text-purple-400", bgColor: "bg-purple-500/8", borderColor: "border-purple-500/20", icon: <Heart className="h-4 w-4" /> },
  consented: { label: "Consented", color: "text-cyan-400", bgColor: "bg-cyan-500/8", borderColor: "border-cyan-500/20", icon: <FileSignature className="h-4 w-4" /> },
  enrolled: { label: "Enrolled", color: "text-emerald-400", bgColor: "bg-emerald-500/8", borderColor: "border-emerald-500/20", icon: <UserCheck className="h-4 w-4" /> },
  screen_failed: { label: "Screen Failed", color: "text-red-400", bgColor: "bg-red-500/8", borderColor: "border-red-500/20", icon: <XCircle className="h-4 w-4" /> },
};

const STAGES_ORDER: PipelineStage[] = ["identified", "contacted", "interested", "consented", "enrolled"];

const STUDY_NAMES: Record<string, string> = {
  "study-1": "KEYNOTE-789",
  "study-2": "DELIVER",
  "study-3": "STEP-5",
  "study-4": "Lecanemab AD",
  "study-5": "Risankizumab CD",
  "study-6": "Dupilumab AD",
};

const STAFF = ["Sarah Chen, CRC", "James Wright, CRC", "Maria Lopez, CRC", "Kevin Park, RN"];

function generatePipelineData(): PipelinePatient[] {
  const parsed = parseEpicRows();
  const patients: PipelinePatient[] = [];

  // Screen all patients across all studies and place top candidates in pipeline
  for (const studyDef of STUDY_SCREENING_DEFS) {
    const screening = screenPatientsForStudy(parsed, studyDef.studyId);
    const eligible = screening
      .filter((s) => s.summary.overallStatus === "eligible" || s.summary.overallStatus === "potentially_eligible")
      .sort((a, b) => b.summary.score - a.summary.score);

    for (let i = 0; i < eligible.length; i++) {
      const s = eligible[i]!;
      const p = parsed.find((pp) => pp.mrn === s.summary.sitePatientId);
      if (!p) continue;

      // Distribute across pipeline stages based on score and index
      let stage: PipelineStage;
      if (i === 0 && s.summary.score >= 70) stage = "enrolled";
      else if (i === 1 && s.summary.score >= 60) stage = "consented";
      else if (i <= 3 && s.summary.score >= 50) stage = "interested";
      else if (i <= 6) stage = "contacted";
      else stage = "identified";

      const daysMap: Record<PipelineStage, number> = { identified: Math.floor(Math.random() * 5) + 1, contacted: Math.floor(Math.random() * 3) + 1, interested: Math.floor(Math.random() * 7) + 2, consented: Math.floor(Math.random() * 4) + 1, enrolled: 0, screen_failed: Math.floor(Math.random() * 3) + 1 };

      const nextActions: Record<PipelineStage, string> = {
        identified: "Schedule initial outreach call",
        contacted: "Follow up on interest level",
        interested: "Schedule consent visit",
        consented: "Complete screening assessments",
        enrolled: "Schedule baseline visit",
        screen_failed: "Archive",
      };

      patients.push({
        id: `pipe-${s.summary.id}-${studyDef.studyId}`,
        mrn: p.mrn,
        name: `${p.firstName} ${p.lastName}`,
        age: s.summary.age,
        gender: p.sex,
        diagnosis: s.summary.primaryDiagnosis ?? p.diagnoses[0]?.name ?? "Unknown",
        stage,
        score: s.summary.score,
        studyId: studyDef.studyId,
        studyName: STUDY_NAMES[studyDef.studyId] ?? studyDef.studyId,
        daysInStage: daysMap[stage],
        lastContact: stage !== "identified" ? `2026-03-0${Math.floor(Math.random() * 7) + 1}` : null,
        contactAttempts: stage === "identified" ? 0 : stage === "contacted" ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 2) + 2,
        notes: stage === "interested" ? "Patient expressed interest, checking schedule" : stage === "consented" ? "Consent signed, awaiting labs" : null,
        nextAction: nextActions[stage],
        assignedTo: STAFF[Math.floor(Math.random() * STAFF.length)]!,
      });
    }
  }

  return patients;
}

export function PipelinePage() {
  const [pipelineData] = useState(() => generatePipelineData());
  const [selectedStudy, setSelectedStudy] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    let data = pipelineData;
    if (selectedStudy !== "all") data = data.filter((p) => p.studyId === selectedStudy);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((p) => p.name.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q));
    }
    return data;
  }, [pipelineData, selectedStudy, searchQuery]);

  const stageCounts = useMemo(() => {
    const counts: Record<PipelineStage, number> = { identified: 0, contacted: 0, interested: 0, consented: 0, enrolled: 0, screen_failed: 0 };
    for (const p of filteredData) counts[p.stage]++;
    return counts;
  }, [filteredData]);

  const conversionRates = useMemo(() => {
    const total = filteredData.length;
    if (total === 0) return { contactRate: 0, interestRate: 0, consentRate: 0, enrollRate: 0 };
    const contacted = filteredData.filter((p) => p.stage !== "identified").length;
    const interested = filteredData.filter((p) => ["interested", "consented", "enrolled"].includes(p.stage)).length;
    const consented = filteredData.filter((p) => ["consented", "enrolled"].includes(p.stage)).length;
    const enrolled = filteredData.filter((p) => p.stage === "enrolled").length;
    return {
      contactRate: Math.round((contacted / total) * 100),
      interestRate: contacted > 0 ? Math.round((interested / contacted) * 100) : 0,
      consentRate: interested > 0 ? Math.round((consented / interested) * 100) : 0,
      enrollRate: consented > 0 ? Math.round((enrolled / consented) * 100) : 0,
    };
  }, [filteredData]);

  const studyIds = useMemo(() => {
    const ids = new Set(pipelineData.map((p) => p.studyId));
    return Array.from(ids);
  }, [pipelineData]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-white">Enrollment Pipeline</h2>
              <button onClick={() => setShowInfoModal(true)} className="rounded-full p-1 text-slate-500 hover:bg-white/[0.05] hover:text-slate-300 transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Track patients from screening to enrollment across all active studies</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patients..."
                className="h-8 w-48 rounded-lg border border-white/[0.06] bg-white/[0.03] pl-8 pr-3 text-[12px] text-slate-200 placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none"
              />
            </div>
            <select
              value={selectedStudy}
              onChange={(e) => setSelectedStudy(e.target.value)}
              className="h-8 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-[12px] text-slate-300 focus:outline-none"
            >
              <option value="all">All Studies</option>
              {studyIds.map((id) => (
                <option key={id} value={id}>{STUDY_NAMES[id] ?? id}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Conversion funnel */}
        <div className="mt-3 flex items-center gap-1">
          {[
            { label: "Contact Rate", value: conversionRates.contactRate, color: "text-amber-400" },
            { label: "Interest Rate", value: conversionRates.interestRate, color: "text-purple-400" },
            { label: "Consent Rate", value: conversionRates.consentRate, color: "text-cyan-400" },
            { label: "Enroll Rate", value: conversionRates.enrollRate, color: "text-emerald-400" },
          ].map((metric, i) => (
            <div key={metric.label} className="flex items-center">
              {i > 0 && <ArrowRight className="mx-1 h-3 w-3 text-slate-700" />}
              <div className="rounded-md bg-white/[0.03] px-2.5 py-1 ring-1 ring-white/[0.06]">
                <span className="text-[9px] text-slate-500">{metric.label}</span>
                <span className={`ml-1.5 text-[13px] font-bold ${metric.color}`}>{metric.value}%</span>
              </div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
            <span>{filteredData.length} patients in pipeline</span>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex h-full gap-3" style={{ minWidth: STAGES_ORDER.length * 280 }}>
          {STAGES_ORDER.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const stagePatients = filteredData.filter((p) => p.stage === stage);
            return (
              <div key={stage} className="flex w-[272px] flex-shrink-0 flex-col rounded-xl border border-white/[0.06] bg-card/50">
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-t-xl border-b ${config.borderColor} ${config.bgColor} px-3 py-2.5`}>
                  <div className="flex items-center gap-2">
                    <span className={config.color}>{config.icon}</span>
                    <span className={`text-[12px] font-semibold ${config.color}`}>{config.label}</span>
                  </div>
                  <span className={`rounded-full ${config.bgColor} px-2 py-0.5 text-[11px] font-bold ${config.color} ring-1 ${config.borderColor}`}>
                    {stageCounts[stage]}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stagePatients.map((patient) => (
                    <PipelineCard
                      key={patient.id}
                      patient={patient}
                      expanded={expandedCard === patient.id}
                      onToggle={() => setExpandedCard(expandedCard === patient.id ? null : patient.id)}
                    />
                  ))}
                  {stagePatients.length === 0 && (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/[0.06] text-[11px] text-slate-600">
                      No patients
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && <PipelineInfoModal onClose={() => setShowInfoModal(false)} />}
    </div>
  );
}

function PipelineCard({ patient, expanded, onToggle }: { patient: PipelinePatient; expanded: boolean; onToggle: () => void }) {
  return (
    <div
      className={`rounded-lg border border-white/[0.06] bg-white/[0.02] transition-all hover:border-white/[0.12] ${expanded ? "ring-1 ring-indigo-500/20" : ""}`}
    >
      <button onClick={onToggle} className="w-full px-3 py-2.5 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-slate-200 truncate">{patient.name}</span>
          <span className="text-[10px] font-mono text-slate-500">{patient.mrn}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-400 ring-1 ring-indigo-500/20">{patient.studyName}</span>
          <span className="text-[10px] text-slate-500">{patient.age}y {patient.gender[0]}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-slate-600" />
            <span className={`text-[10px] ${patient.daysInStage > 5 ? "text-amber-400" : "text-slate-500"}`}>
              {patient.daysInStage}d in stage
            </span>
          </div>
          <div className="flex items-center gap-1">
            {patient.contactAttempts > 0 && (
              <span className="text-[10px] text-slate-500">{patient.contactAttempts} calls</span>
            )}
            <ChevronDown className={`h-3 w-3 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-3 py-2.5 space-y-2">
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">Diagnosis</span>
            <p className="text-[11px] text-slate-400 truncate">{patient.diagnosis}</p>
          </div>
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">Eligibility Score</span>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${patient.score}%` }} />
              </div>
              <span className="text-[11px] font-bold text-indigo-400">{patient.score}</span>
            </div>
          </div>
          {patient.notes && (
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">Notes</span>
              <p className="text-[11px] text-slate-400">{patient.notes}</p>
            </div>
          )}
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">Assigned To</span>
            <p className="text-[11px] text-slate-300">{patient.assignedTo}</p>
          </div>
          {patient.nextAction && (
            <div className="rounded-md bg-indigo-500/5 px-2.5 py-1.5 ring-1 ring-indigo-500/15">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-400">Next Action</span>
              <p className="text-[11px] text-indigo-300">{patient.nextAction}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-1">
            <button className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 transition-colors">
              <PhoneCall className="h-3 w-3" /> Log Call
            </button>
            <button className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 transition-colors">
              <MessageSquare className="h-3 w-3" /> Note
            </button>
            <button className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-500 transition-colors">
              <ArrowRight className="h-3 w-3" /> Advance
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#12141c] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent px-6 py-5 border-b border-white/[0.06]">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/[0.1] hover:text-white">
            <XIcon className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/15 p-2.5 ring-1 ring-indigo-500/25">
              <Target className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-white">Enrollment Pipeline</h3>
              <p className="text-[12px] text-indigo-300/70">From screening to enrollment — never lose a candidate</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {[
            { icon: <Users className="h-4 w-4 text-blue-400" />, title: "Visual Patient Tracking", desc: "Kanban-style board shows every candidate's status at a glance. No more spreadsheets or sticky notes." },
            { icon: <Timer className="h-4 w-4 text-amber-400" />, title: "Time-in-Stage Alerts", desc: "Spot patients stalling in the pipeline. Patients sitting >5 days get flagged for immediate follow-up." },
            { icon: <TrendingUp className="h-4 w-4 text-emerald-400" />, title: "Conversion Funnel Analytics", desc: "Real-time conversion rates at every stage. Know your contact-to-consent ratio and optimize outreach." },
            { icon: <Zap className="h-4 w-4 text-purple-400" />, title: "Cross-Study Pipeline", desc: "See pipeline across ALL active studies in one view. Filter by study for focused recruitment drives." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <div className="mt-0.5 rounded-lg bg-white/[0.04] p-2 ring-1 ring-white/[0.06]">{item.icon}</div>
              <div>
                <h4 className="text-[13px] font-semibold text-slate-200">{item.title}</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="rounded-lg bg-white/[0.02] px-4 py-3 ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Why This Matters</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Sites lose 20-30% of eligible patients between identification and enrollment. This pipeline ensures no candidate falls through the cracks, shortening enrollment timelines and maximizing per-study revenue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
