/**
 * Data Provider Tests — Web mode fallback behavior.
 *
 * Since tests run in a jsdom environment (not Tauri), these verify
 * that the data provider correctly falls back to demo data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the tauri module so isTauri is false
vi.mock("./tauri", () => ({ isTauri: false }));

// ============================================================
// TC-DP-001: Web Mode Fallbacks
// ============================================================

describe("data-provider (web mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-DP-001a: getPatients returns demo data in web mode", async () => {
    const { getPatients } = await import("./data-provider");
    const patients = await getPatients();
    expect(Array.isArray(patients)).toBe(true);
    expect(patients.length).toBeGreaterThan(0);
    const first = patients[0];
    expect(first).toHaveProperty("mrn");
    expect(first).toHaveProperty("dob");
    expect(first).toHaveProperty("sex");
    expect(first).toHaveProperty("diagnoses");
    expect(first).toHaveProperty("medications");
    expect(first).toHaveProperty("labs");
    expect(first).toHaveProperty("vitals");
  });

  it("TC-DP-001b: getSummary returns demo summary in web mode", async () => {
    const { getSummary } = await import("./data-provider");
    const summary = await getSummary();
    expect(summary.patient_count).toBeGreaterThan(0);
    expect(summary.study_count).toBeGreaterThan(0);
    expect(typeof summary.total_diagnoses).toBe("number");
    expect(typeof summary.total_labs).toBe("number");
    expect(typeof summary.total_medications).toBe("number");
  });

  it("TC-DP-001c: getStudies returns demo studies in web mode", async () => {
    const { getStudies } = await import("./data-provider");
    const studies = await getStudies();
    expect(Array.isArray(studies)).toBe(true);
    expect(studies.length).toBeGreaterThan(0);
    const first = studies[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("sponsor");
    expect(first).toHaveProperty("criteria_count");
  });

  it("TC-DP-001d: getLlmStatus returns not_configured in web mode", async () => {
    const { getLlmStatus } = await import("./data-provider");
    const status = await getLlmStatus();
    expect(status.status).toBe("not_configured");
    expect(status.model_name).toBeNull();
  });

  it("TC-DP-001e: checkLlmHealth returns false in web mode", async () => {
    const { checkLlmHealth } = await import("./data-provider");
    const healthy = await checkLlmHealth();
    expect(healthy).toBe(false);
  });

  it("TC-DP-001f: getAuditTrail returns demo entries in web mode", async () => {
    const { getAuditTrail } = await import("./data-provider");
    const entries = await getAuditTrail();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    const first = entries[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("timestamp");
    expect(first).toHaveProperty("action");
    expect(first).toHaveProperty("checksum");
  });

  it("TC-DP-002a: exportAuditTrail returns valid export in web mode", async () => {
    const { exportAuditTrail } = await import("./data-provider");
    const exported = await exportAuditTrail();
    expect(exported.total_entries).toBeGreaterThan(0);
    expect(exported.chain_valid).toBe(true);
    expect(exported.chain_error).toBeNull();
    expect(exported.app_version).toBe("0.1.0");
    expect(exported.entries.length).toBe(exported.total_entries);
  });

  it("TC-DP-002b: verifyAuditChain returns valid in web mode", async () => {
    const { verifyAuditChain } = await import("./data-provider");
    const result = await verifyAuditChain();
    expect(result.valid).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });
});

// ============================================================
// TC-DP-003: Type correctness for analytics types
// ============================================================

describe("data-provider type contracts", () => {
  it("TC-DP-003a: study objects have correct fields", async () => {
    const { getStudies } = await import("./data-provider");
    const studies = await getStudies();
    for (const study of studies) {
      expect(typeof study.id).toBe("string");
      expect(typeof study.title).toBe("string");
      expect(typeof study.sponsor).toBe("string");
      expect(typeof study.criteria_count).toBe("number");
      expect(study.nct_number === null || typeof study.nct_number === "string").toBe(true);
      expect(study.phase === null || typeof study.phase === "string").toBe(true);
    }
  });

  it("TC-DP-003b: patient objects have correct vital signs structure", async () => {
    const { getPatients } = await import("./data-provider");
    const patients = await getPatients();
    for (const patient of patients) {
      expect(typeof patient.vitals.systolic).toBe("number");
      expect(typeof patient.vitals.diastolic).toBe("number");
      expect(typeof patient.vitals.pulse).toBe("number");
      expect(typeof patient.vitals.weight).toBe("number");
      expect(typeof patient.vitals.height).toBe("number");
      expect(typeof patient.vitals.bmi).toBe("number");
    }
  });
});
