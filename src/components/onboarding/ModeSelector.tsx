import { useState } from "react";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { useModeStore } from "@/stores/use-mode-store";
import { useAppStore } from "@/stores/use-app-store";
import {
  WORKSPACE_MODES,
  getWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/workspace-modes";

/**
 * First-run picker shown after unlock when the user has not yet
 * chosen a workspace mode. Skippable — defaults to `admin`.
 */
export function ModeSelector() {
  const setMode = useModeStore((s) => s.setMode);
  const skip = useModeStore((s) => s.skipModeSelection);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const [hovered, setHovered] = useState<WorkspaceMode | null>(null);

  const commit = (id: WorkspaceMode) => {
    setMode(id);
    setCurrentPage(getWorkspaceMode(id).landingPage);
  };

  const handleSkip = () => {
    skip();
    setCurrentPage("dashboard");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0c0f17]/90 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-edge-2 bg-surface-1 p-8 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-400/25">
            <LayoutGrid className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-heading">
              Which workspace fits your role?
            </h2>
            <p className="mt-1 text-[12px] text-dim">
              Pick a focused view so the sidebar only shows what you actually use. You can switch any time from the header, and nothing is locked — this only affects what's shown.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {WORKSPACE_MODES.map((mode) => {
            const isHovered = hovered === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => commit(mode.id)}
                onMouseEnter={() => setHovered(mode.id)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all ${
                  isHovered
                    ? "border-indigo-400/40 bg-indigo-500/[0.06] ring-1 ring-indigo-400/30"
                    : "border-edge-2 bg-surface-2 hover:border-edge-4"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-heading">
                    {mode.label}
                  </span>
                  <ArrowRight
                    className={`h-3.5 w-3.5 flex-none transition-all ${
                      isHovered
                        ? "translate-x-0.5 text-indigo-400"
                        : "text-dim/40"
                    }`}
                  />
                </div>
                <p className="text-[11px] leading-snug text-dim">
                  {mode.description}
                </p>
                <p className="mt-1 text-[10px] font-medium text-dim/60">
                  {mode.persona}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-edge-2 pt-4">
          <p className="text-[11px] text-dim/70">
            You can change this any time from the header dropdown.
          </p>
          <button
            onClick={handleSkip}
            className="rounded-md px-3 py-1.5 text-[11px] font-medium text-dim transition-colors hover:bg-surface-3 hover:text-body"
          >
            Skip — show everything
          </button>
        </div>
      </div>
    </div>
  );
}
