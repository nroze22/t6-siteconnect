import { create } from "zustand";

// ============================================================
// Pipeline Types
// ============================================================

export type PipelineStage =
  | "identified"
  | "contacted"
  | "interested"
  | "consented"
  | "enrolled"
  | "screen_failed";

export const STAGES_ORDER: PipelineStage[] = [
  "identified",
  "contacted",
  "interested",
  "consented",
  "enrolled",
];

export interface PipelinePatient {
  id: string;
  mrn: string;
  name: string;
  age: number;
  gender: string;
  diagnosis: string;
  stage: PipelineStage;
  score: number;
  studyId: string;
  studyName: string;
  daysInStage: number;
  lastContact: string | null;
  contactAttempts: number;
  notes: string | null;
  nextAction: string | null;
  assignedTo: string;
  addedAt: string; // ISO timestamp for sorting
}

export interface ActivityEntry {
  id: string;
  patientId: string;
  type: "call" | "note" | "advance" | "added" | "screen_failed";
  detail: string;
  timestamp: string;
  user: string;
}

// ============================================================
// Store
// ============================================================

const STORAGE_KEY = "siteconnect-pipeline";
const ACTIVITY_KEY = "siteconnect-pipeline-activity";

interface PipelineStore {
  patients: PipelinePatient[];
  activity: ActivityEntry[];

  // Actions
  addPatient: (patient: PipelinePatient) => void;
  addPatients: (patients: PipelinePatient[]) => void;
  removePatient: (id: string) => void;
  advancePatient: (id: string) => void;
  moveToStage: (id: string, stage: PipelineStage) => void;
  logCall: (id: string) => void;
  addNote: (id: string, note: string) => void;
  updateAssignment: (id: string, assignedTo: string) => void;
  markScreenFailed: (id: string) => void;

  // Activity log
  addActivity: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;

  // Queries
  getPatientsByStage: (stage: PipelineStage) => PipelinePatient[];
  getPatientsByStudy: (studyId: string) => PipelinePatient[];
  hasPatient: (mrn: string, studyId: string) => boolean;

  // Persistence
  loadFromStorage: () => void;
  clearAll: () => void;
}

function persist(patients: PipelinePatient[], activity: ActivityEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
  } catch {
    // Storage full or unavailable
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const NEXT_ACTIONS: Record<PipelineStage, string> = {
  identified: "Schedule initial outreach call",
  contacted: "Follow up on interest level",
  interested: "Schedule consent visit",
  consented: "Complete screening assessments",
  enrolled: "Schedule baseline visit",
  screen_failed: "Archive",
};

// Eagerly hydrate from localStorage
function eagerLoad(): { patients: PipelinePatient[]; activity: ActivityEntry[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const activityRaw = localStorage.getItem(ACTIVITY_KEY);
    return {
      patients: raw ? JSON.parse(raw) : [],
      activity: activityRaw ? JSON.parse(activityRaw) : [],
    };
  } catch {
    return { patients: [], activity: [] };
  }
}

const _hydrated = eagerLoad();

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  patients: _hydrated.patients,
  activity: _hydrated.activity,

  addPatient: (patient) =>
    set((state) => {
      // Deduplicate by mrn + studyId
      if (state.patients.some((p) => p.mrn === patient.mrn && p.studyId === patient.studyId)) {
        return state;
      }
      const next = [...state.patients, patient];
      const activity = [
        ...state.activity,
        {
          id: generateId(),
          patientId: patient.id,
          type: "added" as const,
          detail: `Added to pipeline for ${patient.studyName}`,
          timestamp: new Date().toISOString(),
          user: "System",
        },
      ];
      persist(next, activity);
      return { patients: next, activity };
    }),

  addPatients: (newPatients) =>
    set((state) => {
      const existing = new Set(state.patients.map((p) => `${p.mrn}:${p.studyId}`));
      const deduped = newPatients.filter((p) => !existing.has(`${p.mrn}:${p.studyId}`));
      if (deduped.length === 0) return state;
      const next = [...state.patients, ...deduped];
      const newActivity = deduped.map((p) => ({
        id: generateId(),
        patientId: p.id,
        type: "added" as const,
        detail: `Added to pipeline for ${p.studyName}`,
        timestamp: new Date().toISOString(),
        user: "System",
      }));
      const activity = [...state.activity, ...newActivity];
      persist(next, activity);
      return { patients: next, activity };
    }),

  removePatient: (id) =>
    set((state) => {
      const next = state.patients.filter((p) => p.id !== id);
      persist(next, state.activity);
      return { patients: next };
    }),

  advancePatient: (id) =>
    set((state) => {
      const next = state.patients.map((p) => {
        if (p.id !== id) return p;
        const idx = STAGES_ORDER.indexOf(p.stage);
        if (idx < 0 || idx >= STAGES_ORDER.length - 1) return p;
        const nextStage = STAGES_ORDER[idx + 1]!;
        return { ...p, stage: nextStage, daysInStage: 0, nextAction: NEXT_ACTIONS[nextStage] };
      });
      const patient = state.patients.find((p) => p.id === id);
      const nextIdx = patient ? STAGES_ORDER.indexOf(patient.stage) + 1 : -1;
      const nextStage = nextIdx >= 0 && nextIdx < STAGES_ORDER.length ? STAGES_ORDER[nextIdx] : null;
      const activity = nextStage
        ? [
            ...state.activity,
            {
              id: generateId(),
              patientId: id,
              type: "advance" as const,
              detail: `Advanced to ${nextStage}`,
              timestamp: new Date().toISOString(),
              user: "Current User",
            },
          ]
        : state.activity;
      persist(next, activity);
      return { patients: next, activity };
    }),

  moveToStage: (id, stage) =>
    set((state) => {
      const next = state.patients.map((p) =>
        p.id === id ? { ...p, stage, daysInStage: 0, nextAction: NEXT_ACTIONS[stage] } : p,
      );
      const activity = [
        ...state.activity,
        {
          id: generateId(),
          patientId: id,
          type: "advance" as const,
          detail: `Moved to ${stage}`,
          timestamp: new Date().toISOString(),
          user: "Current User",
        },
      ];
      persist(next, activity);
      return { patients: next, activity };
    }),

  logCall: (id) =>
    set((state) => {
      const today = new Date().toISOString().split("T")[0] ?? "";
      const next = state.patients.map((p) =>
        p.id === id ? { ...p, contactAttempts: p.contactAttempts + 1, lastContact: today } : p,
      );
      const activity = [
        ...state.activity,
        {
          id: generateId(),
          patientId: id,
          type: "call" as const,
          detail: "Call logged",
          timestamp: new Date().toISOString(),
          user: "Current User",
        },
      ];
      persist(next, activity);
      return { patients: next, activity };
    }),

  addNote: (id, note) =>
    set((state) => {
      const next = state.patients.map((p) => {
        if (p.id !== id) return p;
        const existing = p.notes ? `${p.notes}\n${note}` : note;
        return { ...p, notes: existing };
      });
      const activity = [
        ...state.activity,
        {
          id: generateId(),
          patientId: id,
          type: "note" as const,
          detail: note,
          timestamp: new Date().toISOString(),
          user: "Current User",
        },
      ];
      persist(next, activity);
      return { patients: next, activity };
    }),

  updateAssignment: (id, assignedTo) =>
    set((state) => {
      const next = state.patients.map((p) => (p.id === id ? { ...p, assignedTo } : p));
      persist(next, state.activity);
      return { patients: next };
    }),

  markScreenFailed: (id) =>
    set((state) => {
      const next = state.patients.map((p) =>
        p.id === id ? { ...p, stage: "screen_failed" as PipelineStage, nextAction: "Archive" } : p,
      );
      const activity = [
        ...state.activity,
        {
          id: generateId(),
          patientId: id,
          type: "screen_failed" as const,
          detail: "Marked as screen failed",
          timestamp: new Date().toISOString(),
          user: "Current User",
        },
      ];
      persist(next, activity);
      return { patients: next, activity };
    }),

  addActivity: (entry) =>
    set((state) => {
      const full: ActivityEntry = {
        ...entry,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };
      const activity = [...state.activity, full];
      persist(state.patients, activity);
      return { activity };
    }),

  getPatientsByStage: (stage) => get().patients.filter((p) => p.stage === stage),
  getPatientsByStudy: (studyId) => get().patients.filter((p) => p.studyId === studyId),
  hasPatient: (mrn, studyId) => get().patients.some((p) => p.mrn === mrn && p.studyId === studyId),

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const activityRaw = localStorage.getItem(ACTIVITY_KEY);
      const patients: PipelinePatient[] = raw ? JSON.parse(raw) : [];
      const activity: ActivityEntry[] = activityRaw ? JSON.parse(activityRaw) : [];
      set({ patients, activity });
    } catch {
      // Corrupt data — start fresh
    }
  },

  clearAll: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    set({ patients: [], activity: [] });
  },
}));
