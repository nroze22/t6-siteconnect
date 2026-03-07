import { useEffect } from "react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { screenPatientsForStudy } from "@/lib/epic-demo-data";
import { getPatients } from "@/lib/data-provider";

/**
 * Loads patient data into the Zustand stores on mount.
 * In Tauri mode, queries real data from SQLite.
 * In web mode, falls back to demo data.
 */
export function useDemoData() {
  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => {
    getPatients().then((parsed) => {
      const screening = screenPatientsForStudy(parsed, "study-1");

      setPatients(screening.map((s) => s.summary));

      for (const s of screening) {
        setScreeningResult(s.summary.id, s.result);
        setCriteriaResults(s.result.id, s.criteria);
      }

      selectStudy("study-1");

      setStatus({
        databaseReady: true,
        patientCount: parsed.length,
        studyCount: 6,
        llmStatus: "ready",
        llmModel: "BioMistral-7B",
      });
    });
  }, []);
}
