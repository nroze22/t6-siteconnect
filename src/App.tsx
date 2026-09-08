import { DataCountsPage } from "@/components/data-counts/DataCountsPage";
import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { ModeLanding } from "@/components/layout/ModeLanding";
import { ScreeningPage } from "@/components/screening/ScreeningPage";
import { ImportPage } from "@/components/import/ImportPage";
import { TrialsPage } from "@/components/trials/TrialsPage";
import { ReviewQueuePage } from "@/components/review/ReviewQueuePage";
import { AnalyticsPage } from "@/components/analytics/AnalyticsPage";
import { PipelinePage } from "@/components/pipeline/PipelinePage";
import { PerformancePage } from "@/components/performance/PerformancePage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { IntelligencePage } from "@/components/intelligence/IntelligencePage";
import { RegistryPage } from "@/components/registry/RegistryPage";
import { NaacrPage } from "@/components/naaccr/NaacrPage";
import { SiteOnboarding } from "@/components/onboarding/SiteOnboarding";
import { ModeSelector } from "@/components/onboarding/ModeSelector";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { UnlockScreen } from "@/components/setup/UnlockScreen";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { KeyboardShortcutsOverlay } from "@/components/ui/KeyboardShortcuts";
import { HelpDrawer } from "@/components/ui/HelpDrawer";
import { PageTransition } from "@/components/ui/PageTransition";
import { WelcomeOverview } from "@/components/welcome/WelcomeOverview";
import { useAppStore } from "@/stores/use-app-store";
import { useSiteProfileStore } from "@/stores/use-site-profile-store";
import { useModeStore } from "@/stores/use-mode-store";
import { isPageVisibleInMode, getWorkspaceMode } from "@/lib/workspace-modes";
import { useDemoData } from "@/hooks/use-demo-data";
import { useWatcherListener } from "@/hooks/use-watcher-listener";
import { checkDatabaseExists } from "@/lib/tauri";
import { getLlmStatus } from "@/lib/data-provider";
import { initLlmQueue } from "@/lib/llm-queue";
import type { NavigationPage } from "@/types";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0c0f17] p-8">
          <div className="w-full max-w-lg text-center">
            {/* Icon */}
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
              <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>

            <h1 className="text-[17px] font-bold text-white">Something went wrong</h1>
            <p className="mt-2 text-[13px] text-slate-400">
              An unexpected error occurred. Your data is safe — try reloading the application.
            </p>

            {/* Error details (collapsed) */}
            <details className="mt-5 text-left">
              <summary className="cursor-pointer rounded-lg bg-white/[0.03] px-4 py-2 text-[11px] font-medium text-slate-500 ring-1 ring-white/[0.06] hover:bg-white/[0.05]">
                Technical details
              </summary>
              <div className="mt-2 rounded-lg bg-red-500/5 p-4 ring-1 ring-red-500/10">
                <p className="font-mono text-[12px] font-semibold text-red-400">{this.state.error.message}</p>
                <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap font-mono text-[10px] text-slate-500">
                  {this.state.error.stack}
                </pre>
              </div>
            </details>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Reload Application
              </button>
              <button
                onClick={() => this.setState({ error: null })}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-[13px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06]"
              >
                Try Again
              </button>
            </div>

            {/* Security reassurance */}
            <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-600">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/50" />
              <span>Your encrypted data remains safe on this device</span>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function PageRouter() {
  const currentPage = useAppStore((s) => s.currentPage);
  const currentMode = useModeStore((s) => s.currentMode);

  const page = currentMode === "data-counts" ? <DataCountsPage /> : (() => {
    switch (currentPage) {
      case "dashboard":
        // Non-admin modes get a role-tailored landing. Admin keeps the full
        // dashboard because it's the "I use everything" workspace.
        return currentMode === "admin" ? <DashboardPage /> : <ModeLanding />;
      case "screening":
        return <ScreeningPage />;
      case "import":
        return <ImportPage />;
      case "trials":
        return <TrialsPage />;
      case "review":
        return <ReviewQueuePage />;
      case "analytics":
        return <AnalyticsPage />;
      case "pipeline":
        return <PipelinePage />;
      case "intelligence":
        return <IntelligencePage />;
      case "performance":
        return <PerformancePage />;
      case "registry":
        return <RegistryPage />;
      case "naaccr":
        return <NaacrPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  })();

  return (
    <PageTransition pageKey={currentPage}>
      {page}
    </PageTransition>
  );
}

// Global keyboard navigation: 1-8 for pages
const pageKeys: Record<string, NavigationPage> = {
  "`": "dashboard",
  "1": "screening",
  "2": "import",
  "3": "review",
  "4": "trials",
  "5": "intelligence",
  "6": "pipeline",
  "7": "analytics",
  "8": "performance",
  "9": "registry",
  "0": "settings",
};

function useGlobalShortcuts() {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const lock = useAppStore((s) => s.lock);
  const currentMode = useModeStore((s) => s.currentMode);

  useEffect(() => {
    if (currentMode === "data-counts") return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Number keys for navigation (no modifiers) — filtered by workspace mode
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const page = pageKeys[e.key];
        if (page && isPageVisibleInMode(page, currentMode)) {
          e.preventDefault();
          setCurrentPage(page);
          return;
        }
      }

      // Cmd+L to lock
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        lock();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCurrentPage, lock, currentMode]);
}

/** Must be rendered inside ToastProvider so useToast() works. */
function WatcherInit() {
  useWatcherListener();
  return null;
}

function MainApp() {
  const dataCountsMode = useModeStore(s => s.currentMode === "data-counts");
  useDemoData(!dataCountsMode);
  useGlobalShortcuts();
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const theme = useAppStore((s) => s.theme);
  const setLlmStatus = useAppStore((s) => s.setLlmStatus);
  const loadProfile = useSiteProfileStore((s) => s.loadFromStorage);
  const currentMode = useModeStore((s) => s.currentMode);
  const hasChosenMode = useModeStore((s) => s.hasChosenMode);

  // Keep the active page consistent with the active workspace mode.
  // If a shortcut or deep link lands on a page hidden in this mode,
  // redirect to the mode's landing page.
  useEffect(() => {
    if (!isPageVisibleInMode(currentPage, currentMode)) {
      setCurrentPage(getWorkspaceMode(currentMode).landingPage);
    }
  }, [currentPage, currentMode, setCurrentPage]);
  // Apply theme class on mount and when theme changes
  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [theme]);

  // Load site profile on mount (pipeline + screening stores self-hydrate eagerly)
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Fetch LLM status on startup and sync to global store
  useEffect(() => {
    getLlmStatus().then((s) => {
      setLlmStatus(s.status, s.model_name);
    }).catch(() => {
      // Ignore — store default is "not_configured"
    });
  }, [setLlmStatus]);

  // Initialize background LLM processing queue
  useEffect(() => {
    if (dataCountsMode) return;
    const cleanup = initLlmQueue();
    return cleanup;
  }, [dataCountsMode]);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      const stored = localStorage.getItem("siteconnect-site-profile");
      if (stored) {
        const parsed = JSON.parse(stored);
        return !parsed.onboardingComplete;
      }
      return true;
    } catch {
      return true;
    }
  });

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return (
    <ToastProvider>
      {!dataCountsMode && <WatcherInit />}
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-hidden">
            <PageRouter />
          </main>
          {dataCountsMode ? <footer className="flex h-8 items-center justify-between border-t border-border px-5 text-[10px] text-dim"><span>Data COUNTS · synthetic rehearsal</span><span>No real broker connection · no approved PPRL</span></footer> : <StatusBar />}
        </div>
        {!dataCountsMode && showOnboarding && <SiteOnboarding onComplete={handleOnboardingComplete} />}
        {!dataCountsMode && !showOnboarding && !hasChosenMode && <ModeSelector />}
        {!dataCountsMode && !showOnboarding && hasChosenMode && <WelcomeOverview />}
        {!dataCountsMode && <><CommandPalette /><KeyboardShortcutsOverlay /><HelpDrawer currentPage={currentPage} /></>}
      </div>
    </ToastProvider>
  );
}

export default function App() {
  const demoMode = useModeStore(s => s.currentMode === "data-counts");
  // null = still loading, true/false = resolved
  const [databaseExists, setDatabaseExists] = useState<boolean | null>(null);
  const [databaseUnlocked, setDatabaseUnlocked] = useState(false);

  useEffect(() => {
    // In web/dev mode, skip the setup/unlock flow entirely
    if (!isTauri) {
      setDatabaseExists(true);
      setDatabaseUnlocked(true);
      return;
    }

    checkDatabaseExists()
      .then((exists) => setDatabaseExists(exists))
      .catch(() => setDatabaseExists(false));
  }, []);

  const handleSetupComplete = useCallback(() => {
    setDatabaseExists(true);
    setDatabaseUnlocked(true);
  }, []);

  const handleUnlock = useCallback(() => {
    setDatabaseUnlocked(true);
  }, []);

  // The synthetic-only rehearsal is isolated from the clinical database.
  if (demoMode) return <ErrorBoundary><MainApp /></ErrorBoundary>;

  // Loading state — branded splash screen
  if (databaseExists === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0c0f17]">
        <div className="flex flex-col items-center gap-5">
          {/* Logo with glow */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-xl animate-pulse" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 shadow-lg shadow-indigo-500/20">
              <img src="/t6logo.png" alt="Talosix" className="h-11 w-11 object-contain" />
            </div>
          </div>

          {/* App name */}
          <div className="text-center">
            <h1 className="text-[17px] font-bold tracking-tight text-white">TalOS SiteConnect</h1>
            <p className="mt-0.5 text-[11px] text-slate-500">On-Premise Patient Screening</p>
          </div>

          {/* Loading spinner */}
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-4 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
            <p className="text-[12px] text-slate-500">Initializing secure environment...</p>
          </div>

          {/* Security badge */}
          <div className="mt-2 flex items-center gap-2 rounded-full bg-emerald-500/8 px-3 py-1.5 ring-1 ring-emerald-500/15">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span className="text-[10px] font-medium text-emerald-400/80">AES-256 Encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  const backToRehearsal = <button className="fixed top-5 right-5 z-50 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white" onClick={() => useModeStore.getState().setMode("data-counts")}>Return to synthetic rehearsal</button>;

  // First run — no database yet
  if (!databaseExists) {
    return <>{backToRehearsal}<SetupScreen onComplete={handleSetupComplete} /></>;
  }

  // Database exists but not unlocked
  if (!databaseUnlocked) {
    return <>{backToRehearsal}<UnlockScreen onUnlock={handleUnlock} /></>;
  }

  // Ready
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
