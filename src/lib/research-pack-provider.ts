// Research Pack Provider
// Bridges Tauri SQLite storage and web-mode bundled JSON data
// Follows the same pattern as data-provider.ts

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

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── Lazy-loaded pack data (web mode) ───
let cachedPack: ResearchPack | null = null;

async function loadWebPack(): Promise<ResearchPack> {
  if (cachedPack) return cachedPack;
  const { RESEARCH_PACK } = await import("@/data/research-pack");
  cachedPack = RESEARCH_PACK;
  return cachedPack;
}

// ─── Public API ───

export async function getPackManifest(): Promise<ResearchPackManifest> {
  if (isTauri) {
    // TODO: invoke get_pack_meta Tauri command
    const pack = await loadWebPack();
    return pack.manifest;
  }
  const pack = await loadWebPack();
  return pack.manifest;
}

export interface StudyFilters {
  therapeuticArea?: string;
  phase?: string;
  sponsor?: string;
  status?: string;
  searchQuery?: string;
  minPerPatientCents?: number;
  maxPerPatientCents?: number;
}

export async function getPackStudies(
  filters?: StudyFilters
): Promise<PackStudy[]> {
  if (isTauri) {
    // TODO: invoke get_pack_studies Tauri command with filters
    const pack = await loadWebPack();
    return applyFilters(pack.studies, filters);
  }
  const pack = await loadWebPack();
  return applyFilters(pack.studies, filters);
}

export async function getPackStudy(
  nctId: string
): Promise<PackStudy | undefined> {
  const studies = await getPackStudies();
  return studies.find((s) => s.nctId === nctId);
}

export async function getProcedureBenchmarks(): Promise<ProcedureBenchmark[]> {
  const pack = await loadWebPack();
  return pack.procedureBenchmarks;
}

export async function getReimbursementModels(): Promise<ReimbursementModel[]> {
  const pack = await loadWebPack();
  return pack.reimbursementModels;
}

export async function getReimbursementModelForArchetype(
  archetypeId: string
): Promise<ReimbursementModel | undefined> {
  const models = await getReimbursementModels();
  return models.find((m) => m.archetypeId === archetypeId);
}

export async function getEconomicsTemplates(): Promise<StudyEconomicsTemplate[]> {
  const pack = await loadWebPack();
  return pack.economicsTemplates;
}

export async function getSponsorProfiles(): Promise<SponsorProfile[]> {
  const pack = await loadWebPack();
  return pack.sponsorProfiles;
}

export async function getSponsorProfile(
  sponsorName: string
): Promise<SponsorProfile | undefined> {
  const profiles = await getSponsorProfiles();
  return profiles.find(
    (p) => p.sponsorName.toLowerCase() === sponsorName.toLowerCase()
  );
}

export async function getTALandscapes(): Promise<TherapeuticAreaLandscape[]> {
  const pack = await loadWebPack();
  return pack.therapeuticAreaLandscapes;
}

export async function getTALandscape(
  ta: string
): Promise<TherapeuticAreaLandscape | undefined> {
  const landscapes = await getTALandscapes();
  return landscapes.find(
    (l) => l.therapeuticArea.toLowerCase() === ta.toLowerCase()
  );
}

export async function getRegulatoryContext(): Promise<RegulatoryContext> {
  const pack = await loadWebPack();
  return pack.regulatoryContext;
}

export async function getIndustryBenchmarks(): Promise<IndustryBenchmarks> {
  const pack = await loadWebPack();
  return pack.industryBenchmarks;
}

export async function getFullPack(): Promise<ResearchPack> {
  return loadWebPack();
}

// ─── Filtering Logic ───

function applyFilters(
  studies: PackStudy[],
  filters?: StudyFilters
): PackStudy[] {
  if (!filters) return studies;

  let result = studies;

  if (filters.therapeuticArea) {
    const ta = filters.therapeuticArea.toLowerCase();
    result = result.filter(
      (s) => s.therapeuticArea.toLowerCase() === ta
    );
  }

  if (filters.phase) {
    const phase = filters.phase.toLowerCase();
    result = result.filter(
      (s) => s.phase.toLowerCase().includes(phase)
    );
  }

  if (filters.sponsor) {
    const sponsor = filters.sponsor.toLowerCase();
    result = result.filter(
      (s) => s.sponsor.toLowerCase().includes(sponsor)
    );
  }

  if (filters.status) {
    result = result.filter((s) => s.status === filters.status);
  }

  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    result = result.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.briefTitle.toLowerCase().includes(q) ||
        s.sponsor.toLowerCase().includes(q) ||
        s.indication.toLowerCase().includes(q) ||
        s.nctId.toLowerCase().includes(q) ||
        s.conditions.some((c) => c.toLowerCase().includes(q))
    );
  }

  if (filters.minPerPatientCents != null) {
    result = result.filter(
      (s) => s.estimatedPerPatientCents >= filters.minPerPatientCents!
    );
  }

  if (filters.maxPerPatientCents != null) {
    result = result.filter(
      (s) => s.estimatedPerPatientCents <= filters.maxPerPatientCents!
    );
  }

  return result;
}
