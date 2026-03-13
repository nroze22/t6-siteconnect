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
  Check,
  Send,
  Sparkles,
} from "lucide-react";
import { usePipelineStore, STAGES_ORDER } from "@/stores/use-pipeline-store";
import type { PipelineStage, PipelinePatient } from "@/stores/use-pipeline-store";
import { useAppStore } from "@/stores/use-app-store";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  identified: { label: "Identified", color: "text-blue-400", bgColor: "bg-blue-500/8", borderColor: "border-blue-500/20", icon: <Users className="h-4 w-4" /> },
  contacted: { label: "Contacted", color: "text-amber-400", bgColor: "bg-amber-500/8", borderColor: "border-amber-500/20", icon: <Phone className="h-4 w-4" /> },
  interested: { label: "Interested", color: "text-purple-400", bgColor: "bg-purple-500/8", borderColor: "border-purple-500/20", icon: <Heart className="h-4 w-4" /> },
  consented: { label: "Consented", color: "text-cyan-400", bgColor: "bg-cyan-500/8", borderColor: "border-cyan-500/20", icon: <FileSignature className="h-4 w-4" /> },
  enrolled: { label: "Enrolled", color: "text-emerald-400", bgColor: "bg-emerald-500/8", borderColor: "border-emerald-500/20", icon: <UserCheck className="h-4 w-4" /> },
  screen_failed: { label: "Screen Failed", color: "text-red-400", bgColor: "bg-red-500/8", borderColor: "border-red-500/20", icon: <XCircle className="h-4 w-4" /> },
};

const STUDY_NAMES: Record<string, string> = {
  "study-1": "KEYNOTE-789",
  "study-2": "DELIVER",
  "study-3": "STEP-5",
  "study-4": "Lecanemab AD",
  "study-5": "Risankizumab CD",
  "study-6": "Dupilumab AD",
};

export function PipelinePage() {
  const pipelinePatients = usePipelineStore((s) => s.patients);
  const advancePatient = usePipelineStore((s) => s.advancePatient);
  const logCall = usePipelineStore((s) => s.logCall);
  const addNote = usePipelineStore((s) => s.addNote);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const [selectedStudy, setSelectedStudy] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [confirmAdvance, setConfirmAdvance] = useState<PipelinePatient | null>(null);
  const toast = useToast();

  const filteredData = useMemo(() => {
    let data = pipelinePatients.filter((p) => p.stage !== "screen_failed");
    if (selectedStudy !== "all") data = data.filter((p) => p.studyId === selectedStudy);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((p) => p.name.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q));
    }
    return data;
  }, [pipelinePatients, selectedStudy, searchQuery]);

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
    const ids = new Set(pipelinePatients.map((p) => p.studyId));
    return Array.from(ids);
  }, [pipelinePatients]);

  // Empty state — no pipeline data at all
  if (pipelinePatients.length === 0) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md text-center px-6">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Target className="h-7 w-7 text-indigo-400" />
            </div>
            <h2 className="text-[17px] font-bold text-heading">No Subjects in Pipeline</h2>
            <p className="mt-2 text-[13px] text-dim leading-relaxed">
              Your enrollment pipeline is empty. Screen patients against a trial and accept candidates to start tracking them through enrollment.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => setCurrentPage("screening")}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <Sparkles className="h-4 w-4" />
                Go to Screening
              </button>
              <p className="text-[11px] text-faint">
                Screen patients → Review results → Accept candidates → They appear here
              </p>
            </div>

            {/* How it works */}
            <div className="mt-8 grid grid-cols-3 gap-3 text-left">
              {[
                { step: "1", label: "Screen", desc: "Run screening against a trial" },
                { step: "2", label: "Review", desc: "Accept eligible candidates" },
                { step: "3", label: "Track", desc: "Pipeline tracks enrollment" },
              ].map((item) => (
                <div key={item.step} className="rounded-lg bg-surface-1 p-3 ring-1 ring-edge-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/15 text-[10px] font-bold text-indigo-300">
                    {item.step}
                  </span>
                  <p className="mt-1.5 text-[12px] font-semibold text-body">{item.label}</p>
                  <p className="text-[11px] text-dim">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[12px] text-dim">Track subjects from screening to enrollment across all active studies</p>
            <button onClick={() => setShowInfoModal(true)} className="rounded-full p-1 text-dim hover:bg-surface-3 hover:text-body transition-colors">
              <Info className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subjects..."
                className="h-8 w-48 rounded-lg border border-edge-2 bg-surface-2 pl-8 pr-8 text-[12px] text-body placeholder-dim focus:border-indigo-500/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-dim hover:text-body"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              )}
            </div>
            <select
              value={selectedStudy}
              onChange={(e) => setSelectedStudy(e.target.value)}
              className="h-8 rounded-lg border border-edge-2 bg-surface-2 px-3 text-[12px] text-body focus:outline-none"
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
              {i > 0 && <ArrowRight className="mx-1 h-3 w-3 text-faint" />}
              <div className="rounded-md bg-surface-2 px-2.5 py-1 ring-1 ring-edge-2">
                <span className="text-[9px] text-dim">{metric.label}</span>
                <span className={`ml-1.5 text-[13px] font-bold tabular-nums ${metric.color}`}>{metric.value}%</span>
              </div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 text-[12px] text-dim">
            <span className="tabular-nums">{filteredData.length} subjects in pipeline</span>
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
              <div key={stage} className="flex w-[272px] flex-shrink-0 flex-col rounded-xl border border-edge-2 bg-card/50">
                {/* Column header */}
                <div className={`flex items-center justify-between rounded-t-xl border-b ${config.borderColor} ${config.bgColor} px-3 py-2.5`}>
                  <div className="flex items-center gap-2">
                    <span className={config.color}>{config.icon}</span>
                    <span className={`text-[12px] font-semibold ${config.color}`}>{config.label}</span>
                  </div>
                  <span className={`rounded-full ${config.bgColor} px-2 py-0.5 text-[12px] font-bold tabular-nums ${config.color} ring-1 ${config.borderColor}`}>
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
                      onAdvance={() => setConfirmAdvance(patient)}
                      onLogCall={() => {
                        logCall(patient.id);
                        toast.info("Call logged", `${patient.name} — ${patient.contactAttempts + 1} total attempts`);
                      }}
                      onAddNote={(note) => {
                        addNote(patient.id, note);
                        toast.success("Note added", `${patient.name}`);
                      }}
                      isLastStage={STAGES_ORDER.indexOf(patient.stage) === STAGES_ORDER.length - 1}
                    />
                  ))}
                  {stagePatients.length === 0 && (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-edge-2 text-center">
                      <div>
                        <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                          <Users className="h-3.5 w-3.5 text-dim" />
                        </div>
                        <p className="text-[12px] text-dim">No subjects in this stage</p>
                      </div>
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

      {/* Advance Confirmation */}
      <ConfirmDialog
        open={confirmAdvance !== null}
        title={`Move ${confirmAdvance?.name ?? ""} to ${
          confirmAdvance
            ? STAGE_CONFIG[STAGES_ORDER[STAGES_ORDER.indexOf(confirmAdvance.stage) + 1] ?? confirmAdvance.stage]?.label ?? ""
            : ""
        }?`}
        description={`This will advance the subject to the next pipeline stage. You can continue tracking their progress from there.`}
        confirmLabel="Advance"
        variant="info"
        onConfirm={() => {
          if (confirmAdvance) {
            advancePatient(confirmAdvance.id);
            const idx = STAGES_ORDER.indexOf(confirmAdvance.stage);
            const nextStage = idx >= 0 && idx < STAGES_ORDER.length - 1 ? STAGE_CONFIG[STAGES_ORDER[idx + 1]!]?.label : null;
            if (nextStage) toast.success(`Moved to ${nextStage}`, `${confirmAdvance.name} advanced in pipeline`);
          }
          setConfirmAdvance(null);
        }}
        onCancel={() => setConfirmAdvance(null)}
      />
    </div>
  );
}

interface PipelineCardProps {
  patient: PipelinePatient;
  expanded: boolean;
  onToggle: () => void;
  onAdvance: () => void;
  onLogCall: () => void;
  onAddNote: (note: string) => void;
  isLastStage: boolean;
}

function PipelineCard({ patient, expanded, onToggle, onAdvance, onLogCall, onAddNote, isLastStage }: PipelineCardProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");

  const handleSubmitNote = () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNoteText("");
    setShowNoteInput(false);
  };

  return (
    <div
      className={`card-lift rounded-lg border border-edge-2 bg-surface-1 transition-all duration-200 hover:border-edge-4 ${expanded ? "ring-1 ring-indigo-500/20" : ""}`}
    >
      <button onClick={onToggle} className="w-full px-3 py-2.5 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-body truncate">{patient.name}</span>
          <span className="text-[12px] font-mono text-dim">{patient.mrn}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300 ring-1 ring-indigo-500/25">{patient.studyName}</span>
          <span className="text-[12px] text-dim">{patient.age}y {patient.gender[0]}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-dim" />
            <span className={`text-[12px] tabular-nums ${patient.daysInStage > 5 ? "text-amber-400" : "text-dim"}`}>
              {patient.daysInStage}d in stage
            </span>
          </div>
          <div className="flex items-center gap-1">
            {patient.contactAttempts > 0 && (
              <span className="text-[12px] tabular-nums text-dim">{patient.contactAttempts} calls</span>
            )}
            <ChevronDown className={`h-3 w-3 text-dim transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-edge-2 px-3 py-2.5 space-y-2">
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-dim">Diagnosis</span>
            <p className="text-[12px] text-body truncate">{patient.diagnosis}</p>
          </div>
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-dim">Eligibility Score</span>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-indigo-500 animate-bar-fill" style={{ width: `${patient.score}%` }} />
              </div>
              <span className="text-[12px] font-bold tabular-nums text-indigo-400">{patient.score}</span>
            </div>
          </div>
          {patient.notes && (
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-dim">Notes</span>
              <p className="text-[12px] text-body whitespace-pre-line">{patient.notes}</p>
            </div>
          )}
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-dim">Assigned To</span>
            <p className="text-[12px] text-body">{patient.assignedTo}</p>
          </div>
          {patient.nextAction && (
            <div className="rounded-md bg-indigo-500/5 px-2.5 py-1.5 ring-1 ring-indigo-500/15">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-400">Next Action</span>
              <p className="text-[12px] text-indigo-300">{patient.nextAction}</p>
            </div>
          )}

          {/* Note input */}
          {showNoteInput && (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmitNote(); if (e.key === "Escape") { setShowNoteInput(false); setNoteText(""); } }}
                placeholder="Add a note..."
                className="flex-1 rounded-md border border-edge-3 bg-surface-2 px-2 py-1 text-[12px] text-body placeholder-dim focus:border-indigo-500/40 focus:outline-none"
              />
              <button
                onClick={handleSubmitNote}
                disabled={!noteText.trim()}
                className="rounded-md bg-indigo-600 p-1.5 text-white transition-colors hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600"
              >
                <Send className="h-3 w-3" />
              </button>
              <button
                onClick={() => { setShowNoteInput(false); setNoteText(""); }}
                className="rounded-md p-1.5 text-dim hover:bg-surface-3 hover:text-body"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={onLogCall}
              className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[12px] text-dim hover:bg-surface-4 hover:text-body transition-colors active:scale-[0.97]"
            >
              <PhoneCall className="h-3 w-3" /> Log Call
            </button>
            <button
              onClick={() => setShowNoteInput(!showNoteInput)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors active:scale-[0.97] ${
                showNoteInput
                  ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20"
                  : "bg-surface-2 text-dim hover:bg-surface-4 hover:text-body"
              }`}
            >
              <MessageSquare className="h-3 w-3" /> Note
            </button>
            {!isLastStage && (
              <button
                onClick={onAdvance}
                className="flex items-center gap-1 rounded-md bg-emerald-600/80 px-2 py-1 text-[12px] font-medium text-white hover:bg-emerald-500 transition-colors active:scale-[0.97]"
              >
                <ArrowRight className="h-3 w-3" /> Advance
              </button>
            )}
            {isLastStage && (
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[12px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                <Check className="h-3 w-3" /> Enrolled
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-edge-3 bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent px-6 py-5 border-b border-edge-2">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-dim hover:bg-surface-5 hover:text-heading">
            <XIcon className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/15 p-2.5 ring-1 ring-indigo-500/25">
              <Target className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-heading">Enrollment Pipeline</h3>
              <p className="text-[12px] text-indigo-300/70">From screening to enrollment — never lose a candidate</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {[
            { icon: <Users className="h-4 w-4 text-blue-400" />, title: "Visual Subject Tracking", desc: "Kanban-style board shows every candidate's status at a glance. No more spreadsheets or sticky notes." },
            { icon: <Timer className="h-4 w-4 text-amber-400" />, title: "Time-in-Stage Alerts", desc: "Spot subjects stalling in the pipeline. Subjects sitting >5 days get flagged for immediate follow-up." },
            { icon: <TrendingUp className="h-4 w-4 text-emerald-400" />, title: "Conversion Funnel Analytics", desc: "Real-time conversion rates at every stage. Know your contact-to-consent ratio and optimize outreach." },
            { icon: <Zap className="h-4 w-4 text-purple-400" />, title: "Cross-Study Pipeline", desc: "See pipeline across ALL active studies in one view. Filter by study for focused recruitment drives." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <div className="mt-0.5 rounded-lg bg-surface-2 p-2 ring-1 ring-edge-2">{item.icon}</div>
              <div>
                <h4 className="text-[13px] font-semibold text-body">{item.title}</h4>
                <p className="text-[12px] text-dim leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}

          <div className="rounded-lg bg-surface-1 px-4 py-3 ring-1 ring-edge-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-dim mb-1.5">Why This Matters</p>
            <p className="text-[12px] text-body leading-relaxed">
              Sites lose 20-30% of eligible subjects between identification and enrollment. This pipeline ensures no candidate falls through the cracks, shortening enrollment timelines and maximizing per-study revenue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
