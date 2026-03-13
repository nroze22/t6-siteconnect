/**
 * Background LLM processing queue.
 *
 * Processes one job at a time (local models can't parallelize), with priority:
 *   1. Currently selected patient (summary, then rationales)
 *   2. Other visible patients sorted by score (summaries first)
 *   3. All remaining rationales
 *
 * Starts when LLM comes online, pauses when it goes offline,
 * and stores results in useLlmQueueStore for reactive UI updates.
 */

import { useAppStore } from "@/stores/use-app-store";
import { useScreeningStore } from "@/stores/use-screening-store";
import { useLlmQueueStore } from "@/stores/use-llm-queue-store";
import { generatePatientSummary, generateCriterionRationale } from "@/lib/data-provider";
import type { CriterionResult } from "@/types";

// ---------------------------------------------------------------------------
// Patient context builder (shared with CriteriaDetailPanel)
// ---------------------------------------------------------------------------

export function buildPatientContext(patientId: string): string {
  const { patients, screeningResults, criteriaResults } = useScreeningStore.getState();
  const screening = screeningResults.get(patientId);
  if (!screening) return "";
  const criteria = criteriaResults.get(screening.id) ?? [];
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return "";

  const lines: string[] = [
    `Patient: ${patient.sitePatientId}, ${patient.age} years old, ${patient.gender}`,
  ];
  if (patient.primaryDiagnosis) lines.push(`Primary diagnosis: ${patient.primaryDiagnosis}`);
  lines.push(`Eligibility score: ${patient.score}/100, Status: ${patient.overallStatus}`);
  lines.push(`Inclusion: ${patient.inclusionMet}/${patient.inclusionTotal} met, Exclusion: ${patient.exclusionTriggered}/${patient.exclusionTotal} triggered`);

  for (const c of criteria) {
    if (c.evidence) {
      lines.push(`[${c.criterionType}] ${c.criterionText}: ${c.result} — ${c.evidence}`);
    }
  }

  return lines.join("\n").slice(0, 3000);
}

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

interface SummaryJob {
  type: "summary";
  patientId: string;
  priority: number; // lower = higher priority
}

interface RationaleJob {
  type: "rationale";
  criterionId: string;
  patientId: string;
  criterion: CriterionResult;
  priority: number;
}

type Job = SummaryJob | RationaleJob;

// ---------------------------------------------------------------------------
// Job list builder
// ---------------------------------------------------------------------------

function buildJobList(): Job[] {
  const { patients, screeningResults, criteriaResults } = useScreeningStore.getState();
  const { summaries, rationales, priorityPatientId } = useLlmQueueStore.getState();
  const jobs: Job[] = [];

  // Sort patients: priority patient first, then by score descending
  const sorted = [...patients].sort((a, b) => {
    if (a.id === priorityPatientId) return -1;
    if (b.id === priorityPatientId) return 1;
    return b.score - a.score;
  });

  for (let i = 0; i < sorted.length; i++) {
    const patient = sorted[i]!;
    const basePriority = patient.id === priorityPatientId ? 0 : i + 1;

    // Summary job (if not already cached as AI)
    const cached = summaries[patient.id];
    if (!cached?.isAi) {
      jobs.push({ type: "summary", patientId: patient.id, priority: basePriority * 10 });
    }

    // Rationale jobs for this patient's criteria
    const screening = screeningResults.get(patient.id);
    if (screening) {
      const criteria = criteriaResults.get(screening.id) ?? [];
      for (const c of criteria) {
        if (!rationales[c.id]) {
          jobs.push({
            type: "rationale",
            criterionId: c.id,
            patientId: patient.id,
            criterion: c,
            priority: basePriority * 10 + 5, // rationales after summaries within same patient
          });
        }
      }
    }
  }

  return jobs.sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Wait for LLM to come online
// ---------------------------------------------------------------------------

function waitForLlmRunning(cancelledRef: { current: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (cancelledRef.current) { reject(new Error("cancelled")); return; }

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      unsub();
      fn();
    };

    // Immediate check BEFORE subscribing to avoid race
    if (useAppStore.getState().status.llmStatus === "running") {
      // No subscription created yet — just resolve
      resolve();
      return;
    }

    const unsub = useAppStore.subscribe((state) => {
      if (cancelledRef.current) { settle(() => reject(new Error("cancelled"))); return; }
      if (state.status.llmStatus === "running") { settle(resolve); }
    });

    // Re-check after subscribing in case status changed between check and subscribe
    if (cancelledRef.current) { settle(() => reject(new Error("cancelled"))); }
    else if (useAppStore.getState().status.llmStatus === "running") { settle(resolve); }
  });
}

// ---------------------------------------------------------------------------
// Queue processor
// ---------------------------------------------------------------------------

async function processQueue(cancelledRef: { current: boolean }) {
  const store = useLlmQueueStore.getState();

  // Only process if LLM is running
  if (useAppStore.getState().status.llmStatus !== "running") {
    console.log("[llm-queue] LLM not running, waiting...");
    store.setQueueStatus("paused");
    try {
      await waitForLlmRunning(cancelledRef);
    } catch {
      console.log("[llm-queue] Wait cancelled");
      return; // cancelled
    }
  }

  store.setQueueStatus("processing");
  let totalCompleted = 0;
  let consecutiveErrors = 0;

  // Outer loop: rebuild job list each pass to pick up new patients/criteria
  // and respect priority changes
  while (!cancelledRef.current) {
    const jobs = buildJobList();
    console.log("[llm-queue] Job list rebuilt:", jobs.length, "jobs remaining (summaries:", jobs.filter(j => j.type === "summary").length, ", rationales:", jobs.filter(j => j.type === "rationale").length, ")");
    if (jobs.length === 0) break;

    store.setProgress(totalCompleted, totalCompleted + jobs.length);

    for (const job of jobs) {
      if (cancelledRef.current) break;

      // Re-check LLM status before each job
      if (useAppStore.getState().status.llmStatus !== "running") {
        console.log("[llm-queue] LLM went offline mid-queue, pausing...");
        store.setQueueStatus("paused");
        try {
          await waitForLlmRunning(cancelledRef);
        } catch {
          store.setCurrentJob(null);
          return;
        }
        store.setQueueStatus("processing");
      }

      // Skip if already cached (another process or manual click may have filled it)
      if (job.type === "summary") {
        const existing = useLlmQueueStore.getState().summaries[job.patientId];
        if (existing?.isAi) { totalCompleted++; store.setProgress(totalCompleted, totalCompleted + jobs.length); continue; }
      } else {
        const existing = useLlmQueueStore.getState().rationales[job.criterionId];
        if (existing) { totalCompleted++; store.setProgress(totalCompleted, totalCompleted + jobs.length); continue; }
      }

      // Process the job
      store.setCurrentJob(job.patientId);
      try {
        if (job.type === "summary") {
          console.log("[llm-queue] Generating summary for patient", job.patientId);
          const ctx = buildPatientContext(job.patientId);
          if (ctx) {
            const result = await generatePatientSummary(ctx);
            if (!cancelledRef.current && result && result.length > 20) {
              useLlmQueueStore.getState().setSummary(job.patientId, { text: result, isAi: true });
              console.log("[llm-queue] Summary saved for", job.patientId, `(${result.length} chars)`);
              consecutiveErrors = 0;
            } else {
              console.warn("[llm-queue] Summary too short or empty for", job.patientId, "result:", result?.slice(0, 50));
            }
          } else {
            console.warn("[llm-queue] No patient context for", job.patientId);
          }
        } else {
          const ctx = buildPatientContext(job.patientId);
          if (ctx) {
            const result = await generateCriterionRationale(
              job.criterion.criterionText,
              job.criterion.criterionType,
              job.criterion.result,
              job.criterion.evidence,
              ctx,
            );
            if (!cancelledRef.current && result) {
              useLlmQueueStore.getState().setRationale(job.criterionId, result);
              consecutiveErrors = 0;
            }
          }
        }
      } catch (err) {
        consecutiveErrors++;
        console.error(`[llm-queue] Job failed (${consecutiveErrors} consecutive):`, job.type, job.patientId, err);
        // If LLM is consistently failing, back off to avoid hammering it
        if (consecutiveErrors >= 3) {
          console.warn("[llm-queue] Too many consecutive errors, pausing 5s...");
          await new Promise((r) => setTimeout(r, 5000));
          // Re-check if LLM is still running
          if (useAppStore.getState().status.llmStatus !== "running") {
            console.log("[llm-queue] LLM went offline after errors, breaking");
            break;
          }
        }
      }

      totalCompleted++;
      store.setProgress(totalCompleted, totalCompleted + jobs.length);
    }

    // After processing a batch, rebuild to check for new work
    // (e.g. new patients imported while processing)
  }

  if (!cancelledRef.current) {
    console.log("[llm-queue] Queue complete. Total processed:", totalCompleted);
    store.setQueueStatus("done");
    store.setCurrentJob(null);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let activeCancel: { current: boolean } | null = null;
let queueInitialized = false;

function startProcessing() {
  // Cancel any existing run
  if (activeCancel) activeCancel.current = true;
  const cancelledRef = { current: false };
  activeCancel = cancelledRef;
  console.log("[llm-queue] Starting queue processing...");
  processQueue(cancelledRef).catch((err) => {
    console.error("[llm-queue] processQueue error:", err);
  });
}

/**
 * Initialize the background LLM queue.
 * Call once at app startup. Returns a cleanup function.
 * Guards against React.StrictMode double-mount.
 */
export function initLlmQueue(): () => void {
  // Guard against double-initialization (React.StrictMode remounts)
  if (queueInitialized) {
    console.log("[llm-queue] Already initialized, skipping duplicate init");
    return () => {}; // No-op cleanup for the duplicate
  }
  queueInitialized = true;
  console.log("[llm-queue] Initializing LLM queue");

  // Start processing when LLM comes online
  const unsubLlm = useAppStore.subscribe((state, prevState) => {
    if (state.status.llmStatus === "running" && prevState.status.llmStatus !== "running") {
      console.log("[llm-queue] LLM came online — starting queue");
      startProcessing();
    }
  });

  // Rebuild job list when screening data changes (new study screened)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubScreening = useScreeningStore.subscribe((state, prevState) => {
    if (state.patients !== prevState.patients || state.criteriaResults !== prevState.criteriaResults) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (useAppStore.getState().status.llmStatus === "running") {
          console.log("[llm-queue] Screening data changed — restarting queue");
          startProcessing();
        }
      }, 1000);
    }
  });

  // If LLM is already running, start immediately
  if (useAppStore.getState().status.llmStatus === "running") {
    // Small delay to let screening data settle
    setTimeout(startProcessing, 2000);
  }

  return () => {
    console.log("[llm-queue] Cleanup called");
    if (activeCancel) activeCancel.current = true;
    unsubLlm();
    unsubScreening();
    if (debounceTimer) clearTimeout(debounceTimer);
    queueInitialized = false;
  };
}
