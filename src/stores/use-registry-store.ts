import { create } from "zustand";
import type {
  ConsentType,
  RegistryAvailability,
  RegistryDashboard,
  AutoMatchNotification,
} from "@/types";

interface RegistryPatient {
  id: string;
  sitePatientId: string;
  dateOfBirth: string | null;
  gender: string | null;
  race: string | null;
  ethnicity: string | null;
  insuranceType: string | null;
  importedAt: string;
  lastUpdated: string;
  primaryDiagnosis: string | null;
  diagnosisCount: number;
  consentStatus: string | null;
  consentCount: number;
  registryStatus: string;
  availability: string;
}

interface RegistryStore {
  // Patient list
  patients: RegistryPatient[];
  isLoading: boolean;
  selectedPatientId: string | null;

  // Filters
  searchQuery: string;
  consentFilter: ConsentType | "all" | "none";
  availabilityFilter: RegistryAvailability | "all";

  // Dashboard
  dashboard: RegistryDashboard | null;

  // Auto-match notifications
  notifications: AutoMatchNotification[];

  // Actions
  setPatients: (patients: RegistryPatient[]) => void;
  setIsLoading: (v: boolean) => void;
  selectPatient: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setConsentFilter: (f: ConsentType | "all" | "none") => void;
  setAvailabilityFilter: (f: RegistryAvailability | "all") => void;
  setDashboard: (d: RegistryDashboard) => void;
  setNotifications: (n: AutoMatchNotification[]) => void;
  dismissNotification: (id: string) => void;
}

export type { RegistryPatient };

export const useRegistryStore = create<RegistryStore>((set) => ({
  patients: [],
  isLoading: false,
  selectedPatientId: null,
  searchQuery: "",
  consentFilter: "all",
  availabilityFilter: "all",
  dashboard: null,
  notifications: [],

  setPatients: (patients) => set({ patients }),
  setIsLoading: (v) => set({ isLoading: v }),
  selectPatient: (id) => set({ selectedPatientId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setConsentFilter: (f) => set({ consentFilter: f }),
  setAvailabilityFilter: (f) => set({ availabilityFilter: f }),
  setDashboard: (d) => set({ dashboard: d }),
  setNotifications: (n) => set({ notifications: n }),
  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
}));
