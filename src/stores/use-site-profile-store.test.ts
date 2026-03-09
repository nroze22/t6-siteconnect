import { describe, it, expect, beforeEach } from "vitest";
import { useSiteProfileStore } from "./use-site-profile-store";

describe("useSiteProfileStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSiteProfileStore.getState().resetProfile();
  });

  // TC-UI-010: Site profile management
  describe("profile updates", () => {
    it("updates research profile", () => {
      useSiteProfileStore.getState().updateResearch({
        siteName: "Test Research Center",
      });
      const profile = useSiteProfileStore.getState().profile;
      expect(profile.research.siteName).toBe("Test Research Center");
    });

    it("updates operational capacity", () => {
      useSiteProfileStore.getState().updateOperations({
        coordinatorCount: 5,
      });
      const ops = useSiteProfileStore.getState().profile.operations;
      expect(ops.coordinatorCount).toBe(5);
    });

    it("updates financial defaults", () => {
      useSiteProfileStore.getState().updateFinancials({
        overheadPercent: 25,
      });
      const fin = useSiteProfileStore.getState().profile.financials;
      expect(fin.overheadPercent).toBe(25);
    });
  });

  // TC-UI-011: Onboarding completion
  describe("onboarding", () => {
    it("marks onboarding as complete", () => {
      useSiteProfileStore.getState().completeOnboarding();
      expect(
        useSiteProfileStore.getState().profile.onboardingComplete
      ).toBe(true);
    });
  });

  // TC-UI-012: Profile persistence
  describe("persistence", () => {
    it("persists profile to localStorage on update", () => {
      useSiteProfileStore.getState().updateResearch({
        siteName: "Persisted Site",
      });
      const stored = localStorage.getItem("siteconnect-site-profile");
      expect(stored).not.toBeNull();
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.research.siteName).toBe("Persisted Site");
      }
    });

    it("loads profile from localStorage", () => {
      const profile = {
        research: { siteName: "Loaded Site" },
        onboardingComplete: true,
      };
      localStorage.setItem(
        "siteconnect-site-profile",
        JSON.stringify(profile)
      );
      useSiteProfileStore.getState().loadFromStorage();
      expect(
        useSiteProfileStore.getState().profile.research.siteName
      ).toBe("Loaded Site");
    });

    it("resets profile to defaults", () => {
      useSiteProfileStore.getState().updateResearch({
        siteName: "Custom Site",
      });
      useSiteProfileStore.getState().resetProfile();
      expect(
        useSiteProfileStore.getState().profile.research.siteName
      ).toBeFalsy();
    });
  });
});
