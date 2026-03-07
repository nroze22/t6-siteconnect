import { useState } from "react";
import {
  Search,
  FileUp,
  GitBranch,
  BarChart3,
  TrendingUp,
  Brain,
  Zap,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  FlaskConical,
  Users,
  Target,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import type { NavigationPage } from "@/types";

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  content: React.ReactNode;
}

const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to TalOS SiteConnect",
    subtitle: "The intelligent screening platform that helps your site enroll faster",
    icon: <Sparkles className="h-8 w-8 text-indigo-400" />,
    gradient: "from-indigo-600/30 via-purple-600/15 to-transparent",
    content: (
      <div className="space-y-5">
        <p className="text-[13px] text-slate-300 leading-relaxed">
          SiteConnect transforms how your research site identifies, screens, and enrolls patients into clinical trials — all while keeping every byte of data on your machine.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "100%", label: "On-Premise", sub: "Zero cloud exposure", color: "text-emerald-400" },
            { value: "10x", label: "Faster Screening", sub: "vs. manual chart review", color: "text-indigo-400" },
            { value: "30%", label: "More Enrollment", sub: "avg. site improvement", color: "text-purple-400" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-white/[0.03] p-3 text-center ring-1 ring-white/[0.06]">
              <span className={`text-[20px] font-bold ${stat.color}`}>{stat.value}</span>
              <p className="text-[11px] font-semibold text-slate-300 mt-0.5">{stat.label}</p>
              <p className="text-[9px] text-slate-500">{stat.sub}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-4 py-3 ring-1 ring-emerald-500/15">
          <Lock className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <p className="text-[11px] text-emerald-400/90 leading-relaxed">
            <span className="font-semibold">HIPAA-Ready Architecture:</span> AES-256 encryption, no PHI transmission, tamper-proof audit trail. Your patients' data never leaves this device.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "screening",
    title: "AI-Powered Patient Screening",
    subtitle: "Automatically match your patient population against trial criteria",
    icon: <Search className="h-8 w-8 text-blue-400" />,
    gradient: "from-blue-600/30 via-cyan-600/15 to-transparent",
    content: (
      <div className="space-y-4">
        <div className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 ring-1 ring-blue-500/25">
              <FileUp className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-slate-200 block">1. Import Patient Data</span>
              <span className="text-[10px] text-slate-500">Drop a CSV from Epic, Cerner, or any EMR</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 ring-1 ring-purple-500/25">
              <Brain className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-slate-200 block">2. AI Screens Every Patient</span>
              <span className="text-[10px] text-slate-500">Rule-based + LLM screening against all active study criteria</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/25">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <span className="text-[12px] font-semibold text-slate-200 block">3. Review & Decide</span>
              <span className="text-[10px] text-slate-500">Accept, reject, or defer with evidence-backed recommendations</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-indigo-500/5 px-4 py-3 ring-1 ring-indigo-500/15">
          <Zap className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            SiteConnect screens patients across <span className="font-semibold text-indigo-300">all your active studies simultaneously</span> — no more one-study-at-a-time manual chart review.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "pipeline",
    title: "Enrollment Pipeline",
    subtitle: "Track every candidate from identification to enrollment",
    icon: <GitBranch className="h-8 w-8 text-purple-400" />,
    gradient: "from-purple-600/30 via-pink-600/15 to-transparent",
    content: (
      <div className="space-y-4">
        {/* Mini kanban preview */}
        <div className="flex gap-2 overflow-hidden">
          {[
            { label: "Identified", count: 24, color: "border-blue-500/30 bg-blue-500/5", textColor: "text-blue-400" },
            { label: "Contacted", count: 16, color: "border-amber-500/30 bg-amber-500/5", textColor: "text-amber-400" },
            { label: "Interested", count: 9, color: "border-purple-500/30 bg-purple-500/5", textColor: "text-purple-400" },
            { label: "Consented", count: 5, color: "border-cyan-500/30 bg-cyan-500/5", textColor: "text-cyan-400" },
            { label: "Enrolled", count: 3, color: "border-emerald-500/30 bg-emerald-500/5", textColor: "text-emerald-400" },
          ].map((stage) => (
            <div key={stage.label} className={`flex-1 rounded-lg border ${stage.color} p-2 text-center`}>
              <span className={`text-[16px] font-bold ${stage.textColor}`}>{stage.count}</span>
              <span className={`block text-[8px] font-semibold uppercase tracking-wider ${stage.textColor} mt-0.5`}>{stage.label}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2.5">
          {[
            { icon: <Target className="h-3.5 w-3.5 text-purple-400" />, text: "Visual kanban board tracks every patient's journey through the recruitment funnel" },
            { icon: <Users className="h-3.5 w-3.5 text-blue-400" />, text: "Assign CRCs, log contact attempts, and schedule follow-ups — all in one place" },
            { icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />, text: "Real-time conversion analytics reveal bottlenecks in your enrollment process" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="mt-0.5 rounded-md bg-white/[0.04] p-1.5 ring-1 ring-white/[0.06]">{item.icon}</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "intelligence",
    title: "Operational Intelligence",
    subtitle: "Insights that help you win more studies and enroll faster",
    icon: <BarChart3 className="h-8 w-8 text-amber-400" />,
    gradient: "from-amber-600/30 via-orange-600/15 to-transparent",
    content: (
      <div className="space-y-3">
        {[
          {
            icon: <FlaskConical className="h-5 w-5 text-blue-400" />,
            bg: "bg-blue-500/8 ring-1 ring-blue-500/20",
            title: "Protocol Feasibility",
            desc: "Instantly calculate how many patients match any protocol criteria before committing to a study.",
          },
          {
            icon: <TrendingUp className="h-5 w-5 text-emerald-400" />,
            bg: "bg-emerald-500/8 ring-1 ring-emerald-500/20",
            title: "Site Performance Metrics",
            desc: "Screen pass rates, revenue projections, and failure intelligence — data you can show sponsors.",
          },
          {
            icon: <GitBranch className="h-5 w-5 text-purple-400" />,
            bg: "bg-purple-500/8 ring-1 ring-purple-500/20",
            title: "Multi-Study Matching",
            desc: "Identify patients eligible for multiple trials simultaneously. Maximize per-patient revenue.",
          },
          {
            icon: <Users className="h-5 w-5 text-cyan-400" />,
            bg: "bg-cyan-500/8 ring-1 ring-cyan-500/20",
            title: "Diversity Dashboard",
            desc: "FDA diversity metrics, Simpson score, and demographic breakdowns for every protocol.",
          },
        ].map((item) => (
          <div key={item.title} className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.04]">
            <div className={`rounded-lg p-2 ${item.bg}`}>{item.icon}</div>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-semibold text-slate-200 block">{item.title}</span>
              <span className="text-[10px] text-slate-500 leading-relaxed block">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "getstarted",
    title: "You're Ready to Go",
    subtitle: "Start screening patients in under 60 seconds",
    icon: <Zap className="h-8 w-8 text-emerald-400" />,
    gradient: "from-emerald-600/30 via-teal-600/15 to-transparent",
    content: (
      <div className="space-y-4">
        <div className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06] space-y-3">
          {[
            { step: 1, action: "Import Data", desc: "Drop your EMR export (CSV) into the Import page", page: "import" as NavigationPage, done: false },
            { step: 2, action: "Screen Patients", desc: "AI automatically screens all patients against active trials", page: "screening" as NavigationPage, done: false },
            { step: 3, action: "Review Results", desc: "Accept or reject candidates with evidence-backed reasoning", page: "review" as NavigationPage, done: false },
            { step: 4, action: "Track Pipeline", desc: "Move candidates through your enrollment funnel", page: "pipeline" as NavigationPage, done: false },
          ].map((item) => (
            <div key={item.step} className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-400 ring-1 ring-indigo-500/25">
                {item.step}
              </div>
              <div className="flex-1">
                <span className="text-[12px] font-semibold text-slate-200">{item.action}</span>
                <span className="text-[10px] text-slate-500 ml-1.5">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 p-4 ring-1 ring-indigo-500/15">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-indigo-400" />
            <span className="text-[12px] font-bold text-indigo-300">Demo Mode Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            We've pre-loaded <span className="font-semibold text-white">20 realistic patients</span> screened against <span className="font-semibold text-white">6 active clinical trials</span> so you can explore every feature immediately. Import your own data when you're ready.
          </p>
        </div>
      </div>
    ),
  },
];

export function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const handleComplete = (startPage?: NavigationPage) => {
    if (startPage) setCurrentPage(startPage);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-indigo-600/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#0f1118] shadow-2xl overflow-hidden">
        {/* Step indicator */}
        <div className="flex items-center gap-1 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? "bg-indigo-500" : "bg-white/[0.06]"
              }`}
            />
          ))}
        </div>

        {/* Header */}
        <div className={`relative bg-gradient-to-br ${current.gradient} px-6 pt-5 pb-4 mt-3`}>
          <div className="flex items-center gap-3.5">
            <div className="rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/[0.08] backdrop-blur-sm">
              {current.icon}
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-white leading-tight">{current.title}</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">{current.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto">
          {current.content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4 bg-white/[0.01]">
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                onClick={() => handleComplete("screening")}
                className="rounded-lg px-3 py-2 text-[12px] text-slate-500 transition-colors hover:text-slate-300"
              >
                Skip Tour
              </button>
            )}
            {isLast ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleComplete("import")}
                  className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-medium text-slate-300 transition-colors hover:bg-white/[0.06]"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Import Data
                </button>
                <button
                  onClick={() => handleComplete("screening")}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500 shadow-lg shadow-indigo-500/20"
                >
                  Explore Demo
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500 shadow-lg shadow-indigo-500/20"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
