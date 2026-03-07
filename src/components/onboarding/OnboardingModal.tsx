import { useState } from "react";
import {
  FileUp,
  GitBranch,
  TrendingUp,
  Brain,
  Zap,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  FlaskConical,
  Users,
  Target,
} from "lucide-react";
import { useAppStore } from "@/stores/use-app-store";
import type { NavigationPage } from "@/types";

// Fixed content height so the modal never bounces between slides
const CONTENT_HEIGHT = "h-[320px]";

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  content: React.ReactNode;
}

const STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to TalOS SiteConnect",
    subtitle: "The intelligent screening platform built for research sites",
    content: (
      <div className="space-y-5">
        {/* Logo + hero */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            <img src="/t6logo.png" alt="Talosix" className="h-12 w-12 rounded-xl object-contain" />
            <div>
              <h3 className="text-[15px] font-bold tracking-tight text-white">TalOS SiteConnect</h3>
              <p className="text-[11px] text-slate-500">by Talosix</p>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-slate-300 leading-relaxed text-center">
          Screen patients, track enrollment, and generate operational intelligence — all from your EMR data, all on your machine.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "100%", label: "On-Premise", sub: "Zero cloud exposure", color: "text-emerald-400" },
            { value: "10x", label: "Faster Screening", sub: "vs. manual chart review", color: "text-blue-400" },
            { value: "30%", label: "More Enrollment", sub: "avg. site improvement", color: "text-cyan-400" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-white/[0.03] p-3 text-center ring-1 ring-white/[0.06]">
              <span className={`text-[20px] font-bold ${stat.color}`}>{stat.value}</span>
              <p className="text-[11px] font-semibold text-slate-300 mt-0.5">{stat.label}</p>
              <p className="text-[9px] text-slate-500">{stat.sub}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/5 px-4 py-2.5 ring-1 ring-emerald-500/15">
          <Lock className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <p className="text-[11px] text-emerald-400/90 leading-relaxed">
            <span className="font-semibold">HIPAA-ready:</span> AES-256 encrypted, tamper-proof audit trail. No PHI ever leaves this device.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "screening",
    title: "AI-Powered Screening",
    subtitle: "From EMR export to ranked candidates in seconds",
    content: (
      <div className="space-y-4">
        <div className="space-y-3">
          {[
            { num: "1", icon: <FileUp className="h-4 w-4 text-blue-400" />, bg: "bg-blue-500/10 ring-1 ring-blue-500/20", title: "Import Patient Data", desc: "Drop a CSV from Epic, Cerner, or any EMR. Smart column mapping handles the rest." },
            { num: "2", icon: <Brain className="h-4 w-4 text-indigo-400" />, bg: "bg-indigo-500/10 ring-1 ring-indigo-500/20", title: "AI Screens Every Patient", desc: "Rule-based engine + local LLM evaluate every criterion across all active studies." },
            { num: "3", icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, bg: "bg-emerald-500/10 ring-1 ring-emerald-500/20", title: "Review & Decide", desc: "Evidence-backed recommendations. Accept, reject, or defer — with full audit trail." },
          ].map((item) => (
            <div key={item.num} className="flex items-start gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                {item.icon}
              </div>
              <div className="min-w-0">
                <span className="text-[12px] font-semibold text-slate-200 block">{item.title}</span>
                <span className="text-[10px] text-slate-500 leading-relaxed block mt-0.5">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-blue-500/5 px-4 py-2.5 ring-1 ring-blue-500/15">
          <Zap className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Screens across <span className="font-semibold text-blue-300">all active studies simultaneously</span> — no more one-study-at-a-time chart review.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "pipeline",
    title: "Enrollment Pipeline",
    subtitle: "Track every candidate from screening to enrollment",
    content: (
      <div className="space-y-4">
        {/* Mini kanban preview */}
        <div className="flex gap-2">
          {[
            { label: "Identified", count: 24, color: "border-blue-500/25 bg-blue-500/5", text: "text-blue-400" },
            { label: "Contacted", count: 16, color: "border-amber-500/25 bg-amber-500/5", text: "text-amber-400" },
            { label: "Interested", count: 9, color: "border-indigo-500/25 bg-indigo-500/5", text: "text-indigo-400" },
            { label: "Consented", count: 5, color: "border-cyan-500/25 bg-cyan-500/5", text: "text-cyan-400" },
            { label: "Enrolled", count: 3, color: "border-emerald-500/25 bg-emerald-500/5", text: "text-emerald-400" },
          ].map((stage) => (
            <div key={stage.label} className={`flex-1 rounded-lg border ${stage.color} p-2.5 text-center`}>
              <span className={`text-[18px] font-bold ${stage.text}`}>{stage.count}</span>
              <span className={`block text-[8px] font-semibold uppercase tracking-wider ${stage.text} mt-0.5`}>{stage.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2.5">
          {[
            { icon: <Target className="h-3.5 w-3.5 text-indigo-400" />, text: "Visual kanban board tracks every patient through the recruitment funnel" },
            { icon: <Users className="h-3.5 w-3.5 text-blue-400" />, text: "Assign CRCs, log contact attempts, and schedule follow-ups in one place" },
            { icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />, text: "Conversion analytics reveal bottlenecks so you can fix them fast" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex-shrink-0 rounded-md bg-white/[0.04] p-1.5 ring-1 ring-white/[0.06]">{item.icon}</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-indigo-500/5 px-4 py-2.5 ring-1 ring-indigo-500/15">
          <GitBranch className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Sites lose <span className="font-semibold text-indigo-300">20-30% of eligible patients</span> between identification and enrollment. This pipeline closes that gap.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "intelligence",
    title: "Operational Intelligence",
    subtitle: "Data-driven insights to win more studies",
    content: (
      <div className="space-y-3">
        {[
          {
            icon: <FlaskConical className="h-4.5 w-4.5 text-blue-400" />,
            bg: "bg-blue-500/8 ring-1 ring-blue-500/20",
            title: "Protocol Feasibility",
            desc: "Calculate how many patients match any protocol before you commit to a study.",
          },
          {
            icon: <TrendingUp className="h-4.5 w-4.5 text-emerald-400" />,
            bg: "bg-emerald-500/8 ring-1 ring-emerald-500/20",
            title: "Site Performance Metrics",
            desc: "Pass rates, revenue projections, and screen failure intelligence for sponsor presentations.",
          },
          {
            icon: <GitBranch className="h-4.5 w-4.5 text-indigo-400" />,
            bg: "bg-indigo-500/8 ring-1 ring-indigo-500/20",
            title: "Multi-Study Matching",
            desc: "Find patients eligible for multiple trials simultaneously. Maximize per-patient revenue.",
          },
          {
            icon: <Users className="h-4.5 w-4.5 text-cyan-400" />,
            bg: "bg-cyan-500/8 ring-1 ring-cyan-500/20",
            title: "Diversity Dashboard",
            desc: "FDA diversity metrics, demographic breakdowns, and compliance scoring per protocol.",
          },
        ].map((item) => (
          <div key={item.title} className="flex items-center gap-3 rounded-lg bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
            <div className={`flex-shrink-0 rounded-lg p-2 ${item.bg}`}>{item.icon}</div>
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
    title: "You're Ready",
    subtitle: "Start screening patients in under 60 seconds",
    content: (
      <div className="space-y-4">
        <div className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06] space-y-3">
          {[
            { step: 1, action: "Import Data", desc: "Drop your EMR export (CSV) into the Import page" },
            { step: 2, action: "Screen Patients", desc: "AI screens all patients against active trial criteria" },
            { step: 3, action: "Review Results", desc: "Accept or reject candidates with evidence-backed reasoning" },
            { step: 4, action: "Track Pipeline", desc: "Move candidates through your enrollment funnel" },
          ].map((item) => (
            <div key={item.step} className="flex items-center gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-bold text-slate-300 ring-1 ring-white/[0.08]">
                {item.step}
              </div>
              <div className="flex-1">
                <span className="text-[12px] font-semibold text-slate-200">{item.action}</span>
                <span className="text-[10px] text-slate-500 ml-1.5">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-indigo-400" />
            <span className="text-[12px] font-bold text-slate-200">Demo Mode Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            We've pre-loaded <span className="font-semibold text-white">20 realistic patients</span> screened against <span className="font-semibold text-white">6 active trials</span> so you can explore every feature immediately. Import your own data when ready.
          </p>
        </div>
      </div>
    ),
  },
];

// Dot indicator for current step
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? "h-1.5 w-5 bg-white/60"
              : i < current
              ? "h-1.5 w-1.5 bg-white/30"
              : "h-1.5 w-1.5 bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.06] bg-[#111318] shadow-2xl overflow-hidden">
        {/* Header — fixed height */}
        <div className="px-6 pt-6 pb-4">
          <div className="mb-4">
            <StepDots current={step} total={STEPS.length} />
          </div>
          <h2 className="text-[17px] font-bold text-white text-center leading-tight">{current.title}</h2>
          <p className="text-[12px] text-slate-500 text-center mt-1">{current.subtitle}</p>
        </div>

        {/* Content — fixed height container prevents bouncing */}
        <div className={`${CONTENT_HEIGHT} overflow-y-auto px-6`}>
          {current.content}
        </div>

        {/* Footer — fixed at bottom */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
          <div>
            {!isFirst ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-300"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            ) : (
              <div /> // spacer
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                onClick={() => handleComplete("screening")}
                className="rounded-lg px-3 py-2 text-[12px] text-slate-600 transition-colors hover:text-slate-400"
              >
                Skip
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
                  className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[12px] font-semibold text-[#111318] transition-colors hover:bg-slate-200"
                >
                  Explore Demo
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[12px] font-semibold text-[#111318] transition-colors hover:bg-slate-200"
              >
                Continue
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
