import { useEffect } from "react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { getPatients, getStudies, screenPatientsViaRust, screeningResultToOutput } from "@/lib/data-provider";

/**
 * Loads patient data into the Zustand stores on mount.
 * In Tauri mode, queries real data from SQLite and screens via Rust engine.
 * In web mode, falls back to demo data with JS screening.
 *
 * Skips if the screening store already has persisted data (from a previous session).
 */
export function useDemoData(enabled = true) {
  const patients = useScreeningStore((s) => s.patients);
  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => {
    if (!enabled) return;
    // If screening store already has patients (hydrated from localStorage), just update app status
    if (patients.length > 0) {
      const selectedStudyId = useScreeningStore.getState().selectedStudyId;
      setStatus({
        databaseReady: true,
        patientCount: patients.length,
        studyCount: 6,
      });
      if (!selectedStudyId) {
        getStudies().then((studies) => {
          selectStudy(studies.length > 0 ? studies[0]!.id : "study-1");
        });
      }
      return;
    }

    // No persisted data — load fresh
    (async () => {
      const studies = await getStudies();
      const studyId = studies.length > 0 ? studies[0]!.id : "study-1";

      const rustResults = await screenPatientsViaRust(studyId);
      const screening = rustResults.map(screeningResultToOutput);

      setPatients(screening.map((s) => s.summary));

      for (const s of screening) {
        setScreeningResult(s.summary.id, s.result);
        setCriteriaResults(s.result.id, s.criteria);
      }

      selectStudy(studyId);

      const parsed = await getPatients();
      setStatus({
        databaseReady: true,
        patientCount: parsed.length,
        studyCount: studies.length || 6,
      });
    })();
  }, [enabled, ]); // eslint-disable-line react-hooks/exhaustive-deps
}
