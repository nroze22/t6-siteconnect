import { useEffect } from "react";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useAppStore } from "@/stores/use-app-store";
import { parseEpicRows, screenPatientsForStudy } from "@/lib/epic-demo-data";

/**
 * Loads demo data into the Zustand stores on mount.
 * Uses realistic Epic patient data screened against KEYNOTE-789.
 */
export function useDemoData() {
  const setPatients = useScreeningStore((s) => s.setPatients);
  const setScreeningResult = useScreeningStore((s) => s.setScreeningResult);
  const setCriteriaResults = useScreeningStore((s) => s.setCriteriaResults);
  const selectStudy = useScreeningStore((s) => s.selectStudy);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => {
    // Parse Epic demo data and screen against KEYNOTE-789
    const parsed = parseEpicRows();
    const screening = screenPatientsForStudy(parsed, "study-1");

    // Load patients
    setPatients(screening.map((s) => s.summary));

    // Load screening results and criteria
    for (const s of screening) {
      setScreeningResult(s.summary.id, s.result);
      setCriteriaResults(s.result.id, s.criteria);
    }

    // Set active study
    selectStudy("study-1");

    // Update app status
    setStatus({
      databaseReady: true,
      patientCount: parsed.length,
      studyCount: 6,
      llmStatus: "ready",
      llmModel: "BioMistral-7B",
    });
  }, []);
}
