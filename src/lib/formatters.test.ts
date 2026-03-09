import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatCurrencyCompact,
  calculateAge,
  scoreColorClass,
  formatStatus,
  formatNumber,
} from "./formatters";

// ============================================================
// TC-FMT-001: formatCurrency (integer cents to USD)
// ============================================================

describe("formatCurrency", () => {
  it("TC-FMT-001a: formats zero cents", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("TC-FMT-001b: formats whole dollar amounts", () => {
    expect(formatCurrency(100_00)).toBe("$100");
  });

  it("TC-FMT-001c: rounds sub-dollar to nearest dollar", () => {
    const result = formatCurrency(4250);
    expect(result).toMatch(/^\$4[23]$/);
  });

  it("TC-FMT-001d: formats large values with commas", () => {
    expect(formatCurrency(1_234_567_00)).toBe("$1,234,567");
  });

  it("TC-FMT-001e: handles negative cents", () => {
    const result = formatCurrency(-500_00);
    expect(result).toContain("500");
    expect(result).toContain("-");
  });
});

// ============================================================
// TC-FMT-002: formatCurrencyCompact
// ============================================================

describe("formatCurrencyCompact", () => {
  it("TC-FMT-002a: formats thousands as K", () => {
    const result = formatCurrencyCompact(150_000_00);
    expect(result).toMatch(/\$150(\.0)?K/);
  });

  it("TC-FMT-002b: formats millions as M", () => {
    const result = formatCurrencyCompact(2_500_000_00);
    expect(result).toMatch(/\$2\.5M/);
  });

  it("TC-FMT-002c: small values show as-is", () => {
    const result = formatCurrencyCompact(50_00);
    expect(result).toContain("50");
  });
});

// ============================================================
// TC-FMT-003: calculateAge
// ============================================================

describe("calculateAge", () => {
  it("TC-FMT-003a: calculates correct age for past birthday this year", () => {
    const today = new Date();
    const birthYear = today.getFullYear() - 30;
    const dob = `${birthYear}-01-01`;
    expect(calculateAge(dob)).toBe(30);
  });

  it("TC-FMT-003b: returns age - 1 if birthday has not occurred yet", () => {
    const today = new Date();
    const birthYear = today.getFullYear() - 25;
    const dob = `${birthYear}-12-31`;
    const age = calculateAge(dob);
    const expectedAge = today.getMonth() === 11 && today.getDate() >= 31 ? 25 : 24;
    expect(age).toBe(expectedAge);
  });

  it("TC-FMT-003c: newborn is age 0", () => {
    const today = new Date();
    const dob = today.toISOString().split("T")[0]!;
    expect(calculateAge(dob)).toBe(0);
  });
});

// ============================================================
// TC-FMT-004: scoreColorClass
// ============================================================

describe("scoreColorClass", () => {
  it("TC-FMT-004a: score >= 85 returns emerald", () => {
    expect(scoreColorClass(90)).toContain("emerald");
  });

  it("TC-FMT-004b: score 70-84 returns green", () => {
    expect(scoreColorClass(75)).toContain("green");
  });

  it("TC-FMT-004c: score 50-69 returns amber", () => {
    expect(scoreColorClass(55)).toContain("amber");
  });

  it("TC-FMT-004d: score < 50 returns red", () => {
    expect(scoreColorClass(30)).toContain("red");
  });

  it("TC-FMT-004e: boundary 85 is emerald", () => {
    expect(scoreColorClass(85)).toContain("emerald");
  });

  it("TC-FMT-004f: boundary 70 is green", () => {
    expect(scoreColorClass(70)).toContain("green");
  });

  it("TC-FMT-004g: boundary 50 is amber", () => {
    expect(scoreColorClass(50)).toContain("amber");
  });
});

// ============================================================
// TC-FMT-005: formatStatus
// ============================================================

describe("formatStatus", () => {
  it("TC-FMT-005a: converts snake_case to Title Case", () => {
    expect(formatStatus("screen_failure")).toBe("Screen Failure");
  });

  it("TC-FMT-005b: single word is capitalized", () => {
    expect(formatStatus("eligible")).toBe("Eligible");
  });

  it("TC-FMT-005c: multiple underscores", () => {
    expect(formatStatus("not_yet_reviewed")).toBe("Not Yet Reviewed");
  });
});

// ============================================================
// TC-FMT-006: formatNumber
// ============================================================

describe("formatNumber", () => {
  it("TC-FMT-006a: adds commas for thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("TC-FMT-006b: small number unchanged", () => {
    expect(formatNumber(42)).toBe("42");
  });

  it("TC-FMT-006c: zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});
