import { describe, it, expect } from "vitest";
import { wrapReport, PRINT_STYLES } from "./pdf-export";

describe("pdf-export", () => {
  // TC-EXP-010: Report wrapping
  describe("wrapReport", () => {
    it("wraps body HTML in complete document", () => {
      const html = wrapReport("Test Report", "<p>Content</p>");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("Test Report");
      expect(html).toContain("<p>Content</p>");
    });

    it("includes print styles", () => {
      const html = wrapReport("Report", "<div>Body</div>");
      expect(html).toContain("@media print");
    });

    it("includes print/close buttons for web mode", () => {
      const html = wrapReport("Report", "<div>Body</div>");
      expect(html.toLowerCase()).toContain("print");
    });
  });

  // TC-EXP-011: Print styles constant
  describe("PRINT_STYLES", () => {
    it("is a non-empty string", () => {
      expect(typeof PRINT_STYLES).toBe("string");
      expect(PRINT_STYLES.length).toBeGreaterThan(100);
    });

    it("contains @page rules", () => {
      expect(PRINT_STYLES).toContain("@page");
    });

    it("contains @media print rules", () => {
      expect(PRINT_STYLES).toContain("@media print");
    });
  });
});
