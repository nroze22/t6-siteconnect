import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useModeStore } from "@/stores/use-mode-store";
import { useAppStore } from "@/stores/use-app-store";
import {
  WORKSPACE_MODES,
  getWorkspaceMode,
  isPageVisibleInMode,
  type WorkspaceMode,
} from "@/lib/workspace-modes";

/**
 * Compact header dropdown for switching the active workspace mode.
 *
 * The menu is rendered via a React portal to `document.body` so it
 * escapes the header's `backdrop-filter` stacking context and always
 * paints above every other element.
 */
export function ModeSwitcher() {
  const currentMode = useModeStore((s) => s.currentMode);
  const setMode = useModeStore((s) => s.setMode);
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  // Position the portal menu relative to the button.
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, []);

  const toggle = useCallback(() => {
    if (!open) updatePosition();
    setOpen((v) => !v);
  }, [open, updatePosition]);

  // Close on click-outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = getWorkspaceMode(currentMode);

  const handleSelect = (id: WorkspaceMode) => {
    setOpen(false);
    if (id === currentMode) return;
    setMode(id);
    if (!isPageVisibleInMode(currentPage, id)) {
      setCurrentPage(getWorkspaceMode(id).landingPage);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1 text-dim ring-1 ring-edge-2 transition-all hover:bg-surface-3 hover:text-body hover:ring-edge-4"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LayoutGrid className="h-3 w-3" />
        <span className="text-[11px] font-medium">{active.label}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="mode-dropdown fixed z-[9990] w-[320px] rounded-xl border border-edge-2 p-1.5 shadow-2xl ring-1 ring-black/30"
          >
            <div className="px-3 pb-1.5 pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-dim">
                Workspace Mode
              </p>
              <p className="mt-0.5 text-[11px] text-dim/70">
                Existing workspaces are preserved. Data COUNTS uses separate synthetic data.
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              {WORKSPACE_MODES.map((mode) => {
                const isActive = mode.id === currentMode;
                return (
                  <button
                    key={mode.id}
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(mode.id)}
                    className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "bg-indigo-500/10 ring-1 ring-indigo-400/25"
                        : "hover:bg-surface-3"
                    }`}
                  >
                    <div className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center">
                      {isActive ? (
                        <Check className="h-3.5 w-3.5 text-indigo-400" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-dim/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[12px] font-semibold ${isActive ? "text-heading" : "text-body"}`}>
                        {mode.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-dim/80">
                        {mode.tagline}
                      </div>
                      <div className="mt-1 text-[10px] text-dim/60">{mode.persona}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
