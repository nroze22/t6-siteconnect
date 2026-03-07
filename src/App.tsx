import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { StatusBar } from "@/components/layout/StatusBar";
import { ScreeningPage } from "@/components/screening/ScreeningPage";
import { ImportPage } from "@/components/import/ImportPage";
import { TrialsPage } from "@/components/trials/TrialsPage";
import { ReviewQueuePage } from "@/components/review/ReviewQueuePage";
import { AnalyticsPage } from "@/components/analytics/AnalyticsPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { UnlockScreen } from "@/components/setup/UnlockScreen";
import { useAppStore } from "@/stores/use-app-store";
import { useDemoData } from "@/hooks/use-demo-data";
import { checkDatabaseExists } from "@/lib/tauri";

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
        <div style={{ padding: 40, fontFamily: "monospace", color: "#ef4444", background: "#0a0a0a", minHeight: "100vh" }}>
          <h1 style={{ fontSize: 20, marginBottom: 16 }}>Rendering Error</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#fca5a5" }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#94a3b8", marginTop: 12 }}>
            {this.state.error.stack}
          </pre>
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

  switch (currentPage) {
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
    case "settings":
      return <SettingsPage />;
    default:
      return <ScreeningPage />;
  }
}

function MainApp() {
  useDemoData();
  console.log("[MainApp] Rendering main application");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden">
          <PageRouter />
        </main>
        <StatusBar />
      </div>
    </div>
  );
}

export default function App() {
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

  // Loading state
  if (databaseExists === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-slate-600 border-t-slate-300 animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // First run — no database yet
  if (!databaseExists) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  // Database exists but not unlocked
  if (!databaseUnlocked) {
    return <UnlockScreen onUnlock={handleUnlock} />;
  }

  // Ready
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
