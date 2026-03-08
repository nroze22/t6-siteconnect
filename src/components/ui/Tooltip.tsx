import { useState, useRef, useCallback } from "react";

interface TooltipProps {
  content: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

export function Tooltip({ content, shortcut, side = "top", delay = 400, className, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className={`relative inline-flex ${className ?? ""}`} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          className={`absolute z-[9999] whitespace-nowrap animate-[tooltip-in_0.12s_ease-out] ${positionClasses[side] ?? positionClasses["top"]}`}
        >
          <div className="flex items-center gap-2 rounded-lg bg-[#1a2036]/98 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 shadow-xl shadow-black/30 ring-1 ring-white/10 backdrop-blur-xl">
            <span>{content}</span>
            {shortcut && (
              <kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[9px] text-slate-500 ring-1 ring-white/[0.06]">
                {shortcut}
              </kbd>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
