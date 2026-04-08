import { create } from "zustand";
import type { AbstractStatus, ReportableCase, NaacrDashboard } from "@/types/naaccr";

interface NaacrStore {
  cases: ReportableCase[];
  isLoading: boolean;
  selectedCaseId: string | null;
  dashboard: NaacrDashboard | null;
  statusFilter: AbstractStatus | "all";
  searchQuery: string;

  setCases: (cases: ReportableCase[]) => void;
  setIsLoading: (v: boolean) => void;
  selectCase: (id: string | null) => void;
  setDashboard: (d: NaacrDashboard) => void;
  setStatusFilter: (f: AbstractStatus | "all") => void;
  setSearchQuery: (q: string) => void;
}

export const useNaacrStore = create<NaacrStore>((set) => ({
  cases: [],
  isLoading: false,
  selectedCaseId: null,
  dashboard: null,
  statusFilter: "all",
  searchQuery: "",

  setCases: (cases) => set({ cases }),
  setIsLoading: (v) => set({ isLoading: v }),
  selectCase: (id) => set({ selectedCaseId: id }),
  setDashboard: (d) => set({ dashboard: d }),
  setStatusFilter: (f) => set({ statusFilter: f }),
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
