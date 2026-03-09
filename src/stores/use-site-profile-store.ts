import { create } from "zustand";
import {
  type SiteIntelligenceProfile,
  type SiteResearchProfile,
  type SiteOperationalCapacity,
  type SiteFinancialDefaults,
  type SiteStudyPreferences,
  type SitePatientPopulation,
  type SiteDataReadiness,
  type SiteWorkflowPreferences,
  DEFAULT_SITE_PROFILE,
} from "@/types/site-profile";

interface SiteProfileState {
  profile: SiteIntelligenceProfile;
  isLoaded: boolean;

  // Section updaters
  updateResearch: (data: Partial<SiteResearchProfile>) => void;
  updateOperations: (data: Partial<SiteOperationalCapacity>) => void;
  updateFinancials: (data: Partial<SiteFinancialDefaults>) => void;
  updatePreferences: (data: Partial<SiteStudyPreferences>) => void;
  updatePopulation: (data: Partial<SitePatientPopulation>) => void;
  updateDataReadiness: (data: Partial<SiteDataReadiness>) => void;
  updateWorkflow: (data: Partial<SiteWorkflowPreferences>) => void;

  // Lifecycle
  completeOnboarding: () => void;
  resetProfile: () => void;
  loadFromStorage: () => void;
}

const STORAGE_KEY = "siteconnect-site-profile";

function persist(profile: SiteIntelligenceProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage unavailable
  }
}

function load(): SiteIntelligenceProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SiteIntelligenceProfile;
  } catch {
    return null;
  }
}

export const useSiteProfileStore = create<SiteProfileState>((set, get) => ({
  profile: DEFAULT_SITE_PROFILE,
  isLoaded: false,

  loadFromStorage: () => {
    const stored = load();
    if (stored) {
      set({ profile: { ...DEFAULT_SITE_PROFILE, ...stored }, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  updateResearch: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      research: { ...p.research, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  updateOperations: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      operations: { ...p.operations, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  updateFinancials: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      financials: { ...p.financials, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  updatePreferences: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      preferences: { ...p.preferences, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  updatePopulation: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      population: { ...p.population, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  updateDataReadiness: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      dataReadiness: { ...p.dataReadiness, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  updateWorkflow: (data) => {
    const p = get().profile;
    const updated = {
      ...p,
      updatedAt: new Date().toISOString(),
      workflow: { ...p.workflow, ...data },
    };
    set({ profile: updated });
    persist(updated);
  },

  completeOnboarding: () => {
    const p = get().profile;
    const now = new Date().toISOString();
    const updated = {
      ...p,
      onboardingComplete: true,
      createdAt: p.createdAt || now,
      updatedAt: now,
    };
    set({ profile: updated });
    persist(updated);
  },

  resetProfile: () => {
    set({ profile: DEFAULT_SITE_PROFILE });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },
}));
