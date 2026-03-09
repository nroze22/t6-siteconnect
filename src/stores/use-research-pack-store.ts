import { create } from "zustand";
import type {
  ResearchPack,
  PackStudy,
  ProcedureBenchmark,
  ReimbursementModel,
  SponsorProfile,
  TherapeuticAreaLandscape,
  ResearchPackManifest,
  RegulatoryContext,
  IndustryBenchmarks,
  StudyEconomicsTemplate,
} from "@/types/research-pack";
import { getFullPack } from "@/lib/research-pack-provider";

interface ResearchPackState {
  // Data
  manifest: ResearchPackManifest | null;
  studies: PackStudy[];
  procedureBenchmarks: ProcedureBenchmark[];
  reimbursementModels: ReimbursementModel[];
  economicsTemplates: StudyEconomicsTemplate[];
  sponsorProfiles: SponsorProfile[];
  taLandscapes: TherapeuticAreaLandscape[];
  regulatoryContext: RegulatoryContext | null;
  industryBenchmarks: IndustryBenchmarks | null;

  // Status
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPack: () => Promise<void>;
  getStudy: (nctId: string) => PackStudy | undefined;
  getReimbursementModel: (archetypeId: string) => ReimbursementModel | undefined;
  getSponsor: (name: string) => SponsorProfile | undefined;
  getLandscape: (ta: string) => TherapeuticAreaLandscape | undefined;
  getTemplate: (archetypeId: string) => StudyEconomicsTemplate | undefined;
  getBenchmark: (procedureId: string) => ProcedureBenchmark | undefined;
}

export const useResearchPackStore = create<ResearchPackState>((set, get) => ({
  manifest: null,
  studies: [],
  procedureBenchmarks: [],
  reimbursementModels: [],
  economicsTemplates: [],
  sponsorProfiles: [],
  taLandscapes: [],
  regulatoryContext: null,
  industryBenchmarks: null,
  isLoaded: false,
  isLoading: false,
  error: null,

  loadPack: async () => {
    if (get().isLoaded || get().isLoading) return;
    set({ isLoading: true, error: null });

    try {
      const pack: ResearchPack = await getFullPack();
      set({
        manifest: pack.manifest,
        studies: pack.studies,
        procedureBenchmarks: pack.procedureBenchmarks,
        reimbursementModels: pack.reimbursementModels,
        economicsTemplates: pack.economicsTemplates,
        sponsorProfiles: pack.sponsorProfiles,
        taLandscapes: pack.therapeuticAreaLandscapes,
        regulatoryContext: pack.regulatoryContext,
        industryBenchmarks: pack.industryBenchmarks,
        isLoaded: true,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load research pack",
        isLoading: false,
      });
    }
  },

  getStudy: (nctId) => get().studies.find((s) => s.nctId === nctId),

  getReimbursementModel: (archetypeId) =>
    get().reimbursementModels.find((m) => m.archetypeId === archetypeId),

  getSponsor: (name) =>
    get().sponsorProfiles.find(
      (p) => p.sponsorName.toLowerCase() === name.toLowerCase()
    ),

  getLandscape: (ta) =>
    get().taLandscapes.find(
      (l) => l.therapeuticArea.toLowerCase() === ta.toLowerCase()
    ),

  getTemplate: (archetypeId) =>
    get().economicsTemplates.find((t) => t.archetypeId === archetypeId),

  getBenchmark: (procedureId) =>
    get().procedureBenchmarks.find((b) => b.procedureId === procedureId),
}));
