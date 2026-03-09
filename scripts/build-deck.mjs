#!/usr/bin/env node
/**
 * TalOS SiteConnect — Product & Validation Deck
 * Dark premium theme matching the landing page aesthetic
 *
 * Run: node scripts/build-deck.mjs
 */

import PptxGenJS from "pptxgenjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "..", "TalOS_SiteConnect_Deck.pptx");
const LOGO = path.join(__dirname, "..", "public", "t6logo.png");

// ═══════════════════════════════════════════════════
// DESIGN SYSTEM — Midnight Indigo (matching landing page)
// ═══════════════════════════════════════════════════
const C = {
  bgDeep:    "07090E",
  bgDark:    "0C0F17",
  bgCard:    "111520",
  bgElevated:"161B2A",
  border:    "1A1F30",
  textPri:   "E8ECF4",
  textSec:   "A8B2C8",
  textMuted: "6B7A94",
  indigo:    "6366F1",
  indigoLt:  "818CF8",
  indigoPale:"C7D2FE",
  emerald:   "10B981",
  emeraldLt: "34D399",
  amber:     "F59E0B",
  amberLt:   "FBBF24",
  red:       "EF4444",
  redLt:     "F87171",
  cyan:      "06B6D4",
  cyanLt:    "22D3EE",
  purple:    "A855F7",
  purpleLt:  "C084FC",
  pink:      "F472B6",
  white:     "FFFFFF",
  black:     "000000",
};

const FONT = {
  head: "Palatino Linotype",
  body: "Trebuchet MS",
  mono: "Consolas",
};

const pptx = new PptxGenJS();
pptx.author = "Talosix";
pptx.company = "Talosix";
pptx.subject = "TalOS SiteConnect — Product & Validation Overview";
pptx.title = "TalOS SiteConnect";
pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function darkBg(slide) {
  slide.background = { color: C.bgDeep };
}

function addTopBar(slide, color = C.indigo) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.04,
    fill: { color },
  });
}

function addLogo(slide, x = 0.5, y = 0.35) {
  slide.addImage({ path: LOGO, x, y, w: 0.32, h: 0.32 });
  slide.addText("TalOS SiteConnect", {
    x: x + 0.4, y, w: 2.5, h: 0.32,
    fontSize: 11, fontFace: FONT.body, color: C.textMuted,
    valign: "middle",
  });
}

function addSlideNum(slide, num) {
  slide.addText(String(num).padStart(2, "0"), {
    x: 12.3, y: 6.9, w: 0.7, h: 0.4,
    fontSize: 10, fontFace: FONT.mono, color: C.textSec,
    align: "right",
  });
}

function addSectionLabel(slide, text, color = C.indigo) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.1, w: text.length * 0.11 + 0.4, h: 0.32,
    fill: { color, transparency: 88 },
    line: { color, width: 0.5, transparency: 70 },
    rectRadius: 0.16,
  });
  slide.addText(text.toUpperCase(), {
    x: 0.5, y: 1.1, w: text.length * 0.11 + 0.4, h: 0.32,
    fontSize: 9, fontFace: FONT.body, color,
    bold: true, letterSpacing: 2, align: "center", valign: "middle",
  });
}

function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: opts.fill || C.bgCard },
    line: { color: opts.border || C.border, width: 0.5 },
    rectRadius: 0.12,
    shadow: { type: "outer", blur: 8, offset: 2, color: "000000", opacity: 0.15 },
  });
}

function stat(slide, x, y, value, label, color = C.indigo) {
  card(slide, x, y, 1.8, 1.0);
  slide.addText(value, {
    x, y: y + 0.08, w: 1.8, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color, bold: true, align: "center",
  });
  slide.addText(label, {
    x: x + 0.1, y: y + 0.6, w: 1.6, h: 0.32,
    fontSize: 9, fontFace: FONT.body, color: C.textSec, align: "center",
  });
}

function iconCircle(slide, x, y, emoji, color) {
  slide.addShape(pptx.shapes.OVAL, {
    x, y, w: 0.42, h: 0.42,
    fill: { color, transparency: 85 },
    line: { color, width: 0.5, transparency: 60 },
  });
  slide.addText(emoji, {
    x, y, w: 0.42, h: 0.42,
    fontSize: 16, align: "center", valign: "middle",
  });
}

let slideNum = 0;

// ═══════════════════════════════════════════════════
// SLIDE 1: TITLE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);

  // Gradient accent bar at top
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.06,
    fill: { type: "solid", color: C.indigo },
  });

  // Big indigo glow circle (background atmosphere)
  s.addShape(pptx.shapes.OVAL, {
    x: 3.5, y: 0.5, w: 6, h: 6,
    fill: { color: C.indigo, transparency: 94 },
    line: { width: 0 },
  });

  // Logo centered
  s.addImage({ path: LOGO, x: 5.85, y: 1.6, w: 1.1, h: 1.1 });

  s.addText("TalOS SiteConnect", {
    x: 1, y: 3.0, w: 11.33, h: 0.8,
    fontSize: 48, fontFace: FONT.head, color: C.white,
    bold: true, align: "center", letterSpacing: -1,
  });

  s.addText("AI-Powered Clinical Trial Screening Engine", {
    x: 2, y: 3.8, w: 9.33, h: 0.5,
    fontSize: 20, fontFace: FONT.body, color: C.indigoLt,
    align: "center",
  });

  s.addText("100% On-Premise  ·  Zero PHI Exposure  ·  FDA-Aligned", {
    x: 2, y: 4.4, w: 9.33, h: 0.4,
    fontSize: 13, fontFace: FONT.body, color: C.textSec,
    align: "center",
  });

  // Bottom bar
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 6.7, w: 13.33, h: 0.8,
    fill: { color: C.bgDark },
  });
  s.addText("Product Overview  ·  Features  ·  Validation  ·  Architecture", {
    x: 1, y: 6.8, w: 11.33, h: 0.5,
    fontSize: 11, fontFace: FONT.body, color: C.textMuted,
    align: "center",
  });
  s.addText("CONFIDENTIAL — March 2026", {
    x: 10, y: 7.0, w: 2.8, h: 0.3,
    fontSize: 9, fontFace: FONT.mono, color: C.textMuted,
    align: "right",
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 2: THE PROBLEM
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.red);
  addLogo(s);
  addSlideNum(s, slideNum);

  s.addText("The Problem", {
    x: 0.5, y: 1.1, w: 12, h: 0.65,
    fontSize: 38, fontFace: FONT.head, color: C.white, bold: true,
  });

  s.addText("Research sites lose eligible patients every day to slow, manual screening processes.", {
    x: 0.5, y: 1.85, w: 8, h: 0.45,
    fontSize: 15, fontFace: FONT.body, color: C.textSec,
  });

  // Pain point cards
  const pains = [
    { icon: "⏱", title: "2-4 hours", sub: "per patient for manual chart review", color: C.red },
    { icon: "📋", title: "Spreadsheet chaos", sub: "No audit trail, no accountability", color: C.amber },
    { icon: "🔓", title: "PHI at risk", sub: "Cloud tools expose patient data", color: C.red },
    { icon: "💸", title: "Revenue lost", sub: "No financial visibility pre-commitment", color: C.amber },
    { icon: "👥", title: "Missed patients", sub: "Eligible patients hidden in EHR data", color: C.red },
    { icon: "📊", title: "No analytics", sub: "Guesswork instead of data-driven decisions", color: C.amber },
  ];

  pains.forEach((p, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 4.1;
    const y = 2.7 + row * 1.85;
    card(s, x, y, 3.8, 1.55);
    iconCircle(s, x + 0.2, y + 0.2, p.icon, p.color);
    s.addText(p.title, {
      x: x + 0.75, y: y + 0.15, w: 2.8, h: 0.35,
      fontSize: 18, fontFace: FONT.head, color: C.white, bold: true,
    });
    s.addText(p.sub, {
      x: x + 0.75, y: y + 0.5, w: 2.8, h: 0.9,
      fontSize: 12, fontFace: FONT.body, color: C.textSec,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 3: THE SOLUTION (overview)
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.emerald);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Overview", C.emerald);

  s.addText("The Solution", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  s.addText("A desktop app that turns your EHR into a patient-finding machine — 100% offline, zero PHI exposure.", {
    x: 0.5, y: 2.15, w: 9, h: 0.45,
    fontSize: 15, fontFace: FONT.body, color: C.textSec,
  });

  // Key stats
  stat(s, 0.5, 2.7, "47ms", "Avg screening time", C.indigoLt);
  stat(s, 2.6, 2.7, "0", "PHI records exposed", C.emeraldLt);
  stat(s, 4.7, 2.7, "10x", "Faster than manual", C.cyanLt);
  stat(s, 6.8, 2.7, "94%", "AI accuracy vs PI", C.amberLt);

  // Feature list (two columns)
  const left = [
    "Two-tier AI screening (rule-based + on-device LLM)",
    "Three-panel clinical review workspace",
    "18 therapeutic archetypes with revenue modeling",
    "Monte Carlo enrollment forecasting",
    "FDA diversity compliance analytics",
  ];
  const right = [
    "SQLCipher AES-256 encrypted database",
    "HMAC-chained tamper-evident audit trail",
    "Smart CSV import with auto column mapping",
    "ClinicalTrials.gov integration",
    "PDF reports & sponsor pitch generation",
  ];

  left.forEach((t, i) => {
    s.addText([
      { text: "→  ", options: { color: C.emeraldLt, fontSize: 12 }},
      { text: t, options: { color: C.textPri, fontSize: 12 }},
    ], {
      x: 0.5, y: 4.15 + i * 0.42, w: 5.8, h: 0.38,
      fontFace: FONT.body, valign: "middle",
    });
  });

  right.forEach((t, i) => {
    s.addText([
      { text: "→  ", options: { color: C.emeraldLt, fontSize: 12 }},
      { text: t, options: { color: C.textPri, fontSize: 12 }},
    ], {
      x: 6.8, y: 4.15 + i * 0.42, w: 5.8, h: 0.38,
      fontFace: FONT.body, valign: "middle",
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 4: ARCHITECTURE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.cyan);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Architecture", C.cyan);

  s.addText("Enterprise-Grade Technology, Desktop Simplicity", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Tech stack cards (4x2 grid)
  const stack = [
    { name: "Tauri v2", sub: "Rust + WebView2 runtime", color: C.indigo },
    { name: "BioMistral-7B", sub: "On-device LLM via llama.cpp", color: C.purple },
    { name: "SQLCipher", sub: "AES-256-CBC encryption", color: C.emerald },
    { name: "React 19", sub: "TypeScript strict + Vite", color: C.cyan },
    { name: "HMAC Chain", sub: "Tamper-evident audit trail", color: C.amber },
    { name: "21 CFR Part 11", sub: "FDA-aligned controls", color: C.red },
    { name: "IQ/OQ/PQ", sub: "103 unit + 17 E2E tests", color: C.indigoLt },
    { name: "macOS + Windows", sub: "Native desktop application", color: C.emeraldLt },
  ];

  stack.forEach((item, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 0.5 + col * 3.1;
    const y = 2.5 + row * 1.7;

    card(s, x, y, 2.8, 1.35);
    s.addShape(pptx.shapes.RECTANGLE, {
      x: x + 0.15, y: y + 0.15, w: 0.06, h: 0.5,
      fill: { color: item.color },
      rectRadius: 0.03,
    });
    s.addText(item.name, {
      x: x + 0.35, y: y + 0.12, w: 2.3, h: 0.4,
      fontSize: 16, fontFace: FONT.head, color: C.white, bold: true,
    });
    s.addText(item.sub, {
      x: x + 0.35, y: y + 0.55, w: 2.3, h: 0.6,
      fontSize: 11, fontFace: FONT.body, color: C.textSec,
    });
  });

  // Architecture flow at bottom
  card(s, 0.5, 6.0, 12.33, 1.1, { fill: C.bgDark });
  const flow = ["CSV/EHR Import", "→", "Column Mapping", "→", "SQLCipher DB", "→", "Rule Engine", "→", "LLM (Tier 2)", "→", "Review Queue", "→", "Export/Report"];
  const flowW = 13.33 / flow.length;
  flow.forEach((txt, i) => {
    const isArrow = txt === "→";
    s.addText(txt, {
      x: 0.15 + i * (12.33 / flow.length), y: 6.1, w: 12.33 / flow.length, h: 0.9,
      fontSize: isArrow ? 16 : 10,
      fontFace: isArrow ? FONT.body : FONT.mono,
      color: isArrow ? C.textMuted : C.indigoLt,
      bold: !isArrow,
      align: "center", valign: "middle",
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 5: AI SCREENING ENGINE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.indigo);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Core Engine");

  s.addText("Two-Tier AI Screening", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Tier 1 card
  card(s, 0.5, 2.4, 5.9, 4.5, { border: C.emerald });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 2.4, w: 5.9, h: 0.04, fill: { color: C.emerald },
  });
  s.addText("TIER 1 — Rule-Based Engine", {
    x: 0.8, y: 2.6, w: 5, h: 0.4,
    fontSize: 16, fontFace: FONT.head, color: C.emeraldLt, bold: true,
  });
  s.addText("47ms average per patient", {
    x: 0.8, y: 3.0, w: 5, h: 0.3,
    fontSize: 24, fontFace: FONT.head, color: C.white, bold: true,
  });

  const rules = [
    "AgeRange — min/max bounds check",
    "GenderIs — exact match (case-insensitive)",
    "HasDiagnosis — ICD-10 prefix matching",
    "NoDiagnosis — absence verification",
    "HasMedication — drug name matching",
    "NoMedication — absence verification",
    "LabValueRange — threshold validation",
    "VitalRange — vital sign bounds",
    "And/Or — boolean combinators",
  ];
  rules.forEach((r, i) => {
    s.addText([
      { text: "●  ", options: { color: C.emeraldLt, fontSize: 10 }},
      { text: r, options: { color: C.textPri, fontSize: 11 }},
    ], {
      x: 0.8, y: 3.5 + i * 0.35, w: 5.2, h: 0.32,
      fontFace: FONT.mono,
    });
  });

  // Tier 2 card
  card(s, 6.9, 2.4, 5.9, 4.5, { border: C.purple });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 6.9, y: 2.4, w: 5.9, h: 0.04, fill: { color: C.purple },
  });
  s.addText("TIER 2 — On-Device LLM", {
    x: 7.2, y: 2.6, w: 5, h: 0.4,
    fontSize: 16, fontFace: FONT.head, color: C.purpleLt, bold: true,
  });
  s.addText("2.3s for complex criteria", {
    x: 7.2, y: 3.0, w: 5, h: 0.3,
    fontSize: 24, fontFace: FONT.head, color: C.white, bold: true,
  });

  const llmFeatures = [
    "BioMistral-7B (medical-tuned Mistral)",
    "Runs via llama.cpp sidecar process",
    "Zero API calls — fully local inference",
    "Structured JSON output with confidence",
    "Conservative defaults (flags for review)",
    "Graceful degradation when offline",
    "GGUF model hot-swap support",
    "Health monitoring & auto-restart",
    "127.0.0.1 only — no network exposure",
  ];
  llmFeatures.forEach((r, i) => {
    s.addText([
      { text: "●  ", options: { color: C.purpleLt, fontSize: 10 }},
      { text: r, options: { color: C.textPri, fontSize: 11 }},
    ], {
      x: 7.2, y: 3.5 + i * 0.35, w: 5.2, h: 0.32,
      fontFace: FONT.mono,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 6: THREE-PANEL WORKSPACE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.indigo);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Screening UI");

  s.addText("Three-Panel Clinical Review Workspace", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  s.addText("Ranked patients → Criteria evaluation → Source EHR data — all linked with evidence highlighting.", {
    x: 0.5, y: 2.2, w: 10, h: 0.35,
    fontSize: 13, fontFace: FONT.body, color: C.textSec,
  });

  // Panel 1: Patient List
  card(s, 0.5, 2.8, 3.6, 4.2, { border: C.indigo });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 2.8, w: 3.6, h: 0.04, fill: { color: C.indigo },
  });
  s.addText("Patient Rank Panel", {
    x: 0.7, y: 2.95, w: 3, h: 0.35,
    fontSize: 14, fontFace: FONT.head, color: C.indigoLt, bold: true,
  });
  const patients = [
    { id: "PAT-001", demo: "62F · NSCLC", score: "92", color: C.emeraldLt },
    { id: "PAT-004", demo: "58M · NSCLC III", score: "88", color: C.emeraldLt },
    { id: "PAT-007", demo: "71M · Adeno", score: "74", color: C.amberLt },
    { id: "PAT-012", demo: "45F · Squam.", score: "68", color: C.amberLt },
    { id: "PAT-009", demo: "55M · SCLC", score: "31", color: C.redLt },
  ];
  patients.forEach((p, i) => {
    const py = 3.45 + i * 0.65;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y: py, w: 3.2, h: 0.52,
      fill: { color: i === 0 ? C.bgElevated : C.bgCard },
      line: { color: i === 0 ? C.indigo : C.border, width: 0.5 },
      rectRadius: 0.06,
    });
    s.addText(p.id, {
      x: 0.85, y: py + 0.02, w: 1.5, h: 0.25,
      fontSize: 10, fontFace: FONT.mono, color: C.textPri, bold: true,
    });
    s.addText(p.demo, {
      x: 0.85, y: py + 0.25, w: 1.5, h: 0.22,
      fontSize: 9, fontFace: FONT.body, color: C.textMuted,
    });
    s.addText(p.score, {
      x: 3.15, y: py + 0.05, w: 0.6, h: 0.42,
      fontSize: 18, fontFace: FONT.head, color: p.color, bold: true, align: "center",
    });
  });

  // Panel 2: Criteria Detail
  card(s, 4.35, 2.8, 4.4, 4.2, { border: C.emerald });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 4.35, y: 2.8, w: 4.4, h: 0.04, fill: { color: C.emerald },
  });
  s.addText("Criteria Evaluation", {
    x: 4.55, y: 2.95, w: 4, h: 0.35,
    fontSize: 14, fontFace: FONT.head, color: C.emeraldLt, bold: true,
  });
  const criteria = [
    { text: "Age ≥ 18 years", status: "Met", badge: "Rule", color: C.emeraldLt },
    { text: "NSCLC with documented histology", status: "Met", badge: "AI 94%", color: C.emeraldLt },
    { text: "ECOG performance status 0-1", status: "Met", badge: "AI 87%", color: C.emeraldLt },
    { text: "No prior systemic therapy", status: "Unknown", badge: "", color: C.amberLt },
    { text: "Adequate organ function", status: "Met", badge: "Rule", color: C.emeraldLt },
  ];
  criteria.forEach((c, i) => {
    const cy = 3.5 + i * 0.65;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 4.55, y: cy, w: 4.0, h: 0.52,
      fill: { color: C.bgCard },
      line: { color: C.border, width: 0.5 },
      rectRadius: 0.06,
    });
    s.addText(c.status === "Met" ? "✓" : "?", {
      x: 4.65, y: cy + 0.05, w: 0.35, h: 0.4,
      fontSize: 14, fontFace: FONT.body, color: c.color, bold: true, align: "center",
    });
    s.addText(c.text, {
      x: 5.05, y: cy + 0.02, w: 2.6, h: 0.25,
      fontSize: 10, fontFace: FONT.body, color: C.textPri,
    });
    s.addText(`${c.status}${c.badge ? "  ·  " + c.badge : ""}`, {
      x: 5.05, y: cy + 0.27, w: 2.6, h: 0.2,
      fontSize: 9, fontFace: FONT.mono, color: c.color,
    });
  });

  // Panel 3: Source Data
  card(s, 9.0, 2.8, 3.83, 4.2, { border: C.cyan });
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 9.0, y: 2.8, w: 3.83, h: 0.04, fill: { color: C.cyan },
  });
  s.addText("Source EHR Data", {
    x: 9.2, y: 2.95, w: 3.4, h: 0.35,
    fontSize: 14, fontFace: FONT.head, color: C.cyanLt, bold: true,
  });

  // Tab bar
  const tabs = ["Demo", "Dx", "Meds", "Labs", "Vitals"];
  tabs.forEach((t, i) => {
    s.addText(t, {
      x: 9.2 + i * 0.65, y: 3.4, w: 0.6, h: 0.25,
      fontSize: 9, fontFace: FONT.body,
      color: i === 1 ? C.cyanLt : C.textMuted,
      bold: i === 1, align: "center",
    });
  });

  const data = [
    { label: "ICD-10", value: "C34.1", hl: true },
    { label: "Description", value: "NSCLC, upper lobe", hl: true },
    { label: "Dx Date", value: "2024-01-15", hl: false },
    { label: "Status", value: "Active", hl: false },
    { label: "ICD-10", value: "E11.9", hl: false },
    { label: "Description", value: "Type 2 DM", hl: false },
  ];
  data.forEach((d, i) => {
    const dy = 3.75 + i * 0.42;
    if (d.hl) {
      s.addShape(pptx.shapes.RECTANGLE, {
        x: 9.1, y: dy - 0.02, w: 3.6, h: 0.38,
        fill: { color: C.cyan, transparency: 90 },
      });
    }
    s.addText(d.label, {
      x: 9.25, y: dy, w: 1.2, h: 0.3,
      fontSize: 9, fontFace: FONT.body, color: C.textMuted,
    });
    s.addText(d.value, {
      x: 10.5, y: dy, w: 2, h: 0.3,
      fontSize: 10, fontFace: FONT.mono, color: d.hl ? C.cyanLt : C.textPri,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 7: FINANCIAL INTELLIGENCE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.emerald);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Financial Intelligence", C.emerald);

  s.addText("Know What Every Trial Is Worth", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Stats row
  stat(s, 0.5, 2.4, "18", "Therapeutic archetypes", C.indigoLt);
  stat(s, 2.6, 2.4, "3", "Scenario models", C.emeraldLt);
  stat(s, 4.7, 2.4, "¢", "Integer-cent precision", C.amberLt);
  stat(s, 6.8, 2.4, "FMV", "Validated rates", C.cyanLt);

  // Scenario cards
  const scenarios = [
    { name: "Conservative", value: "$612K", sub: "35 patients · low consent rate", color: C.redLt, bg: C.red },
    { name: "Base Case", value: "$847K", sub: "46 patients · standard assumptions", color: C.emeraldLt, bg: C.emerald },
    { name: "Optimistic", value: "$1.12M", sub: "58 patients · high retention", color: C.indigoLt, bg: C.indigo },
  ];

  scenarios.forEach((sc, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 3.8, 3.9, 1.7, { border: sc.bg });
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: 3.8, w: 3.9, h: 0.04, fill: { color: sc.bg },
    });
    s.addText(sc.name.toUpperCase(), {
      x: x + 0.2, y: 3.95, w: 3.5, h: 0.3,
      fontSize: 10, fontFace: FONT.body, color: sc.color, bold: true, letterSpacing: 1,
    });
    s.addText(sc.value, {
      x: x + 0.2, y: 4.3, w: 3.5, h: 0.55,
      fontSize: 36, fontFace: FONT.head, color: C.white, bold: true,
    });
    s.addText(sc.sub, {
      x: x + 0.2, y: 4.9, w: 3.5, h: 0.4,
      fontSize: 11, fontFace: FONT.body, color: C.textSec,
    });
  });

  // Feature list
  const finFeatures = [
    "Per-patient revenue modeling with 18 therapeutic archetypes",
    "Site fit scoring based on capabilities, patient mix, and infrastructure",
    "Per-visit cost breakdown: coordinator time, PI time, overhead, procedures",
    "Sponsor-ready financial summaries for budget negotiations",
  ];
  finFeatures.forEach((f, i) => {
    s.addText([
      { text: "→  ", options: { color: C.emeraldLt }},
      { text: f, options: { color: C.textPri }},
    ], {
      x: 0.5, y: 5.85 + i * 0.36, w: 12, h: 0.32,
      fontSize: 12, fontFace: FONT.body,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 8: ANALYTICS & POPULATION INTELLIGENCE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.amber);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Analytics", C.amber);

  s.addText("Population Intelligence Engine", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Left column: features
  const analyticsFeatures = [
    { title: "Feasibility Queries", desc: "Multi-criteria patient cohort analysis with preset and custom queries" },
    { title: "Enrollment Forecasting", desc: "Monte Carlo simulation with configurable consent rates and P10-P90 bands" },
    { title: "Diversity Profiling", desc: "FDA compliance checks: age, sex, race, ethnicity breakdowns with scoring" },
    { title: "Cross-Filter Dashboards", desc: "Click any chart element — every view updates instantly" },
    { title: "Drill-Down Analysis", desc: "From aggregate metric to individual patient records in one click" },
    { title: "Snapshot Comparison", desc: "Save analytics snapshots, compare scenarios side-by-side" },
  ];

  analyticsFeatures.forEach((f, i) => {
    const y = 2.4 + i * 0.75;
    s.addText(f.title, {
      x: 0.5, y, w: 5.5, h: 0.3,
      fontSize: 14, fontFace: FONT.head, color: C.white, bold: true,
    });
    s.addText(f.desc, {
      x: 0.5, y: y + 0.3, w: 5.5, h: 0.35,
      fontSize: 11, fontFace: FONT.body, color: C.textSec,
    });
  });

  // Right: Mock analytics display
  card(s, 6.8, 2.4, 5.9, 4.5);
  s.addText("Population Intelligence Dashboard", {
    x: 7.0, y: 2.55, w: 5.5, h: 0.3,
    fontSize: 11, fontFace: FONT.body, color: C.textMuted, bold: true,
  });

  // KPI row
  const kpis = [
    { label: "Eligible Pool", value: "247", color: C.emeraldLt },
    { label: "Match Rate", value: "68%", color: C.indigoLt },
    { label: "P(Success)", value: "82%", color: C.amberLt },
  ];
  kpis.forEach((k, i) => {
    const kx = 7.1 + i * 1.85;
    s.addText(k.label, {
      x: kx, y: 3.0, w: 1.7, h: 0.2,
      fontSize: 9, fontFace: FONT.body, color: C.textMuted,
    });
    s.addText(k.value, {
      x: kx, y: 3.2, w: 1.7, h: 0.4,
      fontSize: 24, fontFace: FONT.head, color: k.color, bold: true,
    });
  });

  // Mock bar chart
  const bars = [95,88,72,85,60,45,82,30,78,55,92,40];
  bars.forEach((h, i) => {
    const bColor = h >= 70 ? C.emerald : h >= 45 ? C.amber : C.red;
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 7.15 + i * 0.42, y: 4.1 + (1.5 * (1 - h/100)), w: 0.28, h: 1.5 * h / 100,
      fill: { color: bColor, transparency: 50 },
      rectRadius: 0.03,
    });
  });
  s.addText("Criteria Match Distribution", {
    x: 7.0, y: 5.8, w: 5.5, h: 0.25,
    fontSize: 9, fontFace: FONT.body, color: C.textMuted, align: "center",
  });

  // Diversity donut placeholder
  card(s, 7.0, 6.2, 2.5, 0.55);
  s.addText("Diversity Score: ", {
    x: 7.1, y: 6.25, w: 1.5, h: 0.4,
    fontSize: 10, fontFace: FONT.body, color: C.textSec,
  });
  s.addText("76/100", {
    x: 8.5, y: 6.25, w: 0.9, h: 0.4,
    fontSize: 12, fontFace: FONT.head, color: C.emeraldLt, bold: true,
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 9: SECURITY & COMPLIANCE
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.emerald);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Security", C.emerald);

  s.addText("Built for the Most Regulated Industry on Earth", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  const secCards = [
    { icon: "🔐", title: "AES-256 Encryption", desc: "SQLCipher with user-controlled passphrase. PBKDF2 256K iterations.", color: C.emerald },
    { icon: "🔗", title: "HMAC Audit Chain", desc: "SHA-256 checksums chained. Any modification breaks the chain instantly.", color: C.indigo },
    { icon: "🖥️", title: "100% On-Premise", desc: "No internet required. No telemetry. No analytics. Air-gap compatible.", color: C.cyan },
    { icon: "🧬", title: "On-Device AI", desc: "BioMistral runs locally. Zero patient data sent to any API.", color: C.purple },
    { icon: "🏥", title: "HIPAA-Ready", desc: "Role-based access, session timeouts, screen lock — all configurable.", color: C.amber },
    { icon: "📜", title: "21 CFR Part 11", desc: "Electronic records, signatures, audit trails aligned with FDA regs.", color: C.red },
  ];

  secCards.forEach((sc, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 4.1;
    const y = 2.5 + row * 2.3;

    card(s, x, y, 3.8, 1.95, { border: sc.color });
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y, w: 3.8, h: 0.04, fill: { color: sc.color },
    });
    iconCircle(s, x + 0.25, y + 0.25, sc.icon, sc.color);
    s.addText(sc.title, {
      x: x + 0.8, y: y + 0.2, w: 2.8, h: 0.35,
      fontSize: 16, fontFace: FONT.head, color: C.white, bold: true,
    });
    s.addText(sc.desc, {
      x: x + 0.25, y: y + 0.7, w: 3.3, h: 1.0,
      fontSize: 12, fontFace: FONT.body, color: C.textSec,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 10: COMPLETE FEATURE MAP
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.indigo);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Features");

  s.addText("Complete Module Map", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  const modules = [
    { name: "AI Screening", items: "9 rule types, LLM tier 2, batch processing, confidence scores", color: C.indigo },
    { name: "Three-Panel Review", items: "Patient rank, criteria eval, source data, evidence highlighting", color: C.emerald },
    { name: "Trial Discovery", items: "ClinicalTrials.gov, eligible counts, financial projections", color: C.cyan },
    { name: "Import Wizard", items: "CSV drag-drop, auto column mapping, Epic/Cerner/Allscripts", color: C.purple },
    { name: "Population Analytics", items: "Feasibility queries, diversity profiling, Monte Carlo forecast", color: C.amber },
    { name: "Financial Engine", items: "18 archetypes, 3 scenarios, integer cents, FMV validation", color: C.emeraldLt },
    { name: "Enrollment Pipeline", items: "5 stages: identified → enrolled, conversion tracking", color: C.indigoLt },
    { name: "Cohort Builder", items: "Multi-criteria queries, saved cohorts, export lists", color: C.pink },
    { name: "Site Performance", items: "Screening velocity, enrollment rates, time-to-enrollment", color: C.cyanLt },
    { name: "Export & Reports", items: "CSV, PDF, sponsor pitch decks, branded feasibility reports", color: C.amberLt },
    { name: "LLM Management", items: "Model config, server lifecycle, health monitoring", color: C.purpleLt },
    { name: "Security & Audit", items: "AES-256, HMAC chain, session lock, passphrase protection", color: C.redLt },
  ];

  modules.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 4.1;
    const y = 2.3 + row * 1.2;

    s.addShape(pptx.shapes.RECTANGLE, {
      x, y, w: 0.06, h: 0.9,
      fill: { color: m.color },
      rectRadius: 0.03,
    });
    s.addText(m.name, {
      x: x + 0.2, y, w: 3.6, h: 0.32,
      fontSize: 13, fontFace: FONT.head, color: C.white, bold: true,
    });
    s.addText(m.items, {
      x: x + 0.2, y: y + 0.32, w: 3.6, h: 0.55,
      fontSize: 10, fontFace: FONT.body, color: C.textSec,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 11: VALIDATION OVERVIEW
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.cyan);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Validation", C.cyan);

  s.addText("IQ/OQ/PQ Validation Framework", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  s.addText("GAMP 5 Category 3/5 approach with full requirements traceability — 94 requirements mapped to 106 test cases.", {
    x: 0.5, y: 2.2, w: 10, h: 0.4,
    fontSize: 14, fontFace: FONT.body, color: C.textSec,
  });

  // Big stats
  stat(s, 0.5, 2.9, "94", "Requirements (PRD)", C.indigoLt);
  stat(s, 2.6, 2.9, "106", "Test cases mapped", C.emeraldLt);
  stat(s, 4.7, 2.9, "103", "Unit tests passing", C.cyanLt);
  stat(s, 6.8, 2.9, "23", "Rust tests passing", C.amberLt);
  stat(s, 8.9, 2.9, "17", "E2E test specs", C.purpleLt);
  stat(s, 11.0, 2.9, "5", "Validation docs", C.redLt);

  // Validation documents
  card(s, 0.5, 4.3, 12.33, 2.9);
  s.addText("Validation Documentation Suite", {
    x: 0.7, y: 4.45, w: 11, h: 0.35,
    fontSize: 16, fontFace: FONT.head, color: C.white, bold: true,
  });

  const docs = [
    { name: "Validation Master Plan", desc: "Overall strategy, risk register, regulatory mapping, governance framework", pages: "592 lines" },
    { name: "Product Requirements (PRD)", desc: "18 sections covering all modules with traceable requirement IDs", pages: "593 lines" },
    { name: "Requirements Traceability Matrix", desc: "94 requirements → 106 test cases with bidirectional traceability", pages: "235 lines" },
    { name: "IQ/OQ/PQ Protocols", desc: "7 IQ scripts, full OQ module tables, 9 PQ performance scripts", pages: "621 lines" },
    { name: "Test Case Specifications", desc: "109 test cases across 14 categories with preconditions & expected results", pages: "1,276 lines" },
  ];

  docs.forEach((d, i) => {
    const dy = 4.95 + i * 0.42;
    s.addText([
      { text: d.name, options: { color: C.white, fontSize: 11, bold: true, fontFace: FONT.body }},
      { text: "  —  " + d.desc, options: { color: C.textSec, fontSize: 10, fontFace: FONT.body }},
    ], {
      x: 0.9, y: dy, w: 9, h: 0.35,
    });
    s.addText(d.pages, {
      x: 10.3, y: dy, w: 2, h: 0.35,
      fontSize: 10, fontFace: FONT.mono, color: C.textMuted, align: "right",
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 12: TEST CASE BREAKDOWN
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.emerald);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Test Cases", C.emerald);

  s.addText("Test Coverage by Category", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Table data
  const categories = [
    { cat: "Screening Engine (Rust)", reqs: 8, tests: 28, status: "15 passed", color: C.emeraldLt },
    { cat: "Import Pipeline (Rust)", reqs: 7, tests: 17, status: "6 passed", color: C.emeraldLt },
    { cat: "Audit Trail (Rust)", reqs: 5, tests: 8, status: "6 passed", color: C.emeraldLt },
    { cat: "Security & Encryption", reqs: 7, tests: 7, status: "Designed", color: C.amberLt },
    { cat: "Database Schema", reqs: 5, tests: 5, status: "2 passed", color: C.emeraldLt },
    { cat: "Analytics Store (TS)", reqs: 4, tests: 12, status: "12 passed", color: C.emeraldLt },
    { cat: "Screening Store (TS)", reqs: 9, tests: 19, status: "19 passed", color: C.emeraldLt },
    { cat: "Financial Engine (TS)", reqs: 9, tests: 19, status: "19 passed", color: C.emeraldLt },
    { cat: "Population Analytics (TS)", reqs: 5, tests: 15, status: "15 passed", color: C.emeraldLt },
    { cat: "Export CSV/PDF (TS)", reqs: 5, tests: 12, status: "12 passed", color: C.emeraldLt },
    { cat: "App Store (TS)", reqs: 10, tests: 15, status: "15 passed", color: C.emeraldLt },
    { cat: "Site Profile Store (TS)", reqs: 3, tests: 7, status: "7 passed", color: C.emeraldLt },
    { cat: "E2E Navigation", reqs: 5, tests: 5, status: "Designed", color: C.cyanLt },
    { cat: "E2E Screening", reqs: 5, tests: 5, status: "Designed", color: C.cyanLt },
    { cat: "E2E Security", reqs: 4, tests: 4, status: "Designed", color: C.cyanLt },
    { cat: "E2E Settings", reqs: 3, tests: 3, status: "Designed", color: C.cyanLt },
  ];

  // Header row
  const tableY = 2.15;
  const colX = [0.5, 5.5, 7.0, 8.5, 10.3];
  const headers = ["Category", "Requirements", "Test Cases", "Status", "Coverage"];
  headers.forEach((h, i) => {
    s.addText(h, {
      x: colX[i], y: tableY, w: i === 0 ? 4.8 : 1.4, h: 0.28,
      fontSize: 9, fontFace: FONT.body, color: C.textMuted, bold: true,
      letterSpacing: 1,
    });
  });

  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: tableY + 0.28, w: 12.33, h: 0.01,
    fill: { color: C.border },
  });

  categories.forEach((row, i) => {
    const ry = tableY + 0.35 + i * 0.27;
    if (i % 2 === 0) {
      s.addShape(pptx.shapes.RECTANGLE, {
        x: 0.5, y: ry - 0.01, w: 12.33, h: 0.27,
        fill: { color: C.bgCard, transparency: 50 },
      });
    }
    s.addText(row.cat, {
      x: colX[0], y: ry, w: 4.8, h: 0.25,
      fontSize: 9, fontFace: FONT.body, color: C.textPri,
    });
    s.addText(String(row.reqs), {
      x: colX[1], y: ry, w: 1.4, h: 0.25,
      fontSize: 9, fontFace: FONT.mono, color: C.textSec, align: "center",
    });
    s.addText(String(row.tests), {
      x: colX[2], y: ry, w: 1.4, h: 0.25,
      fontSize: 9, fontFace: FONT.mono, color: C.textSec, align: "center",
    });
    s.addText(row.status, {
      x: colX[3], y: ry, w: 1.6, h: 0.25,
      fontSize: 9, fontFace: FONT.mono, color: row.color,
    });
    // Coverage bar
    const pct = row.status.includes("passed") ? 100 : row.status === "Designed" ? 60 : 0;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: colX[4], y: ry + 0.03, w: 1.5, h: 0.16,
      fill: { color: C.bgElevated },
      rectRadius: 0.08,
    });
    if (pct > 0) {
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: colX[4], y: ry + 0.03, w: 1.5 * (pct / 100), h: 0.16,
        fill: { color: pct === 100 ? C.emerald : C.amber, transparency: 40 },
        rectRadius: 0.08,
      });
    }
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 13: RUST ENGINE TEST DETAILS
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.amber);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Rust Tests", C.amber);

  s.addText("Rust Backend — 23/23 Tests Passing", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Left: Screening rules
  card(s, 0.5, 2.4, 4.0, 4.6, { border: C.indigo });
  s.addText("Screening Rules (9)", {
    x: 0.7, y: 2.55, w: 3.5, h: 0.35,
    fontSize: 14, fontFace: FONT.head, color: C.indigoLt, bold: true,
  });
  const rTests = [
    "test_age_range_pass",
    "test_age_range_fail",
    "test_has_diagnosis",
    "test_no_diagnosis_pass",
    "test_lab_value_range",
    "test_missing_data",
    "test_and_rule",
    "test_or_rule",
    "test_rule_serialization",
  ];
  rTests.forEach((t, i) => {
    s.addText([
      { text: "✓ ", options: { color: C.emeraldLt, fontSize: 10 }},
      { text: t, options: { color: C.textPri, fontSize: 10 }},
    ], {
      x: 0.7, y: 3.0 + i * 0.38, w: 3.5, h: 0.32,
      fontFace: FONT.mono,
    });
  });

  // Middle: Engine + Audit
  card(s, 4.75, 2.4, 4.0, 4.6, { border: C.emerald });
  s.addText("Engine + Audit (6)", {
    x: 4.95, y: 2.55, w: 3.5, h: 0.35,
    fontSize: 14, fontFace: FONT.head, color: C.emeraldLt, bold: true,
  });
  const eaTests = [
    "test_screen_patient",
    "test_screen_all_patients",
    "test_write_audit_entry",
    "test_audit_chain_integrity",
    "test_audit_chain_detects_tampering",
    "test_empty_audit_chain_verifies",
  ];
  eaTests.forEach((t, i) => {
    s.addText([
      { text: "✓ ", options: { color: C.emeraldLt, fontSize: 10 }},
      { text: t, options: { color: C.textPri, fontSize: 10 }},
    ], {
      x: 4.95, y: 3.0 + i * 0.38, w: 3.5, h: 0.32,
      fontFace: FONT.mono,
    });
  });

  // Right: DB + Import
  card(s, 9.0, 2.4, 3.83, 4.6, { border: C.cyan });
  s.addText("DB + Import (8)", {
    x: 9.2, y: 2.55, w: 3.4, h: 0.35,
    fontSize: 14, fontFace: FONT.head, color: C.cyanLt, bold: true,
  });
  const diTests = [
    "test_init_database_in_memory",
    "test_seed_if_empty_inserts",
    "test_seed_idempotent",
    "test_normalize",
    "test_exact_match",
    "test_auto_map_common",
    "test_auto_map_epic",
    "test_no_duplicate_targets",
  ];
  diTests.forEach((t, i) => {
    s.addText([
      { text: "✓ ", options: { color: C.emeraldLt, fontSize: 10 }},
      { text: t, options: { color: C.textPri, fontSize: 10 }},
    ], {
      x: 9.2, y: 3.0 + i * 0.38, w: 3.4, h: 0.32,
      fontFace: FONT.mono,
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 14: TYPESCRIPT UNIT TESTS
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.emerald);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Unit Tests", C.emerald);

  s.addText("TypeScript — 103/103 Tests Passing", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  // Test file cards
  const tsTests = [
    { file: "use-screening-store.test.ts", count: 19, items: "Patient selection, filtering, status counts, review actions, overrides, highlights" },
    { file: "financial-engine.test.ts", count: 19, items: "Archetype detection, catalog, procedures, modeling, scenarios, currency, color helpers" },
    { file: "use-app-store.test.ts", count: 15, items: "Navigation (10 pages), session lock/unlock, theme toggle, app status updates" },
    { file: "population-analytics.test.ts", count: 15, items: "Feasibility queries, enrollment forecast, diversity profile, presets, lab thresholds" },
    { file: "use-analytics-store.test.ts", count: 12, items: "Filter management, drill-down navigation, snapshot save/clear, compare mode" },
    { file: "export-csv.test.ts", count: 7, items: "CSV generation, quote escaping, status filtering, detailed export, empty data" },
    { file: "use-site-profile-store.test.ts", count: 7, items: "Profile updates (research/ops/financial), onboarding, localStorage persistence" },
    { file: "pdf-export.test.ts", count: 5, items: "Report wrapping, print styles, @page rules, @media print" },
  ];

  tsTests.forEach((t, i) => {
    const y = 2.25 + i * 0.56;
    card(s, 0.5, y, 12.33, 0.47);

    // Count badge
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y: y + 0.08, w: 0.5, h: 0.3,
      fill: { color: C.emerald, transparency: 80 },
      line: { color: C.emerald, width: 0.5, transparency: 60 },
      rectRadius: 0.15,
    });
    s.addText(String(t.count), {
      x: 0.7, y: y + 0.08, w: 0.5, h: 0.3,
      fontSize: 10, fontFace: FONT.mono, color: C.emeraldLt, bold: true, align: "center", valign: "middle",
    });

    s.addText(t.file, {
      x: 1.35, y: y + 0.03, w: 3.5, h: 0.2,
      fontSize: 10, fontFace: FONT.mono, color: C.white, bold: true,
    });
    s.addText(t.items, {
      x: 1.35, y: y + 0.23, w: 10.5, h: 0.2,
      fontSize: 9, fontFace: FONT.body, color: C.textSec,
    });
  });

  // Bottom summary
  card(s, 0.5, 6.65, 11.5, 0.3, { fill: C.bgDark });
  s.addText([
    { text: "TOTAL: ", options: { color: C.textMuted, fontSize: 10, bold: true }},
    { text: "8 test files  ·  103 tests  ·  ", options: { color: C.textSec, fontSize: 10 }},
    { text: "100% PASSING", options: { color: C.emeraldLt, fontSize: 10, bold: true }},
    { text: "  ·  Duration: 2.73s", options: { color: C.textMuted, fontSize: 10 }},
  ], {
    x: 0.7, y: 6.65, w: 10.8, h: 0.3,
    fontFace: FONT.body, valign: "middle",
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 15: WORKFLOW — 3 STEPS
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.indigo);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Workflow");

  s.addText("From EHR Data to Enrolled Patient", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  const steps = [
    {
      num: "01", title: "Import Patient Data",
      desc: "Drag and drop CSV exports from Epic, Cerner, or any EHR. Smart column mapping auto-detects demographics, diagnoses, medications, labs, and vitals.",
      details: ["Auto-detect column mappings", "ICD-10, RxNorm, LOINC support", "Up to 50,000 records per file"],
      color: C.indigo,
    },
    {
      num: "02", title: "Screen Against Trials",
      desc: "Select a study and instantly see every patient ranked by eligibility score. Two-tier AI evaluates all criteria with evidence linking.",
      details: ["Three-panel review workspace", "Keyboard shortcuts (A/R/D)", "AI confidence + evidence links"],
      color: C.emerald,
    },
    {
      num: "03", title: "Report & Enroll",
      desc: "Generate feasibility reports, sponsor pitch decks, and enrollment projections. Track patients through the enrollment pipeline.",
      details: ["PDF reports with site branding", "Financial projections per trial", "Enrollment pipeline tracking"],
      color: C.amber,
    },
  ];

  steps.forEach((step, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 2.5, 3.9, 4.5, { border: step.color });

    // Step number
    s.addShape(pptx.shapes.OVAL, {
      x: x + 0.2, y: 2.7, w: 0.55, h: 0.55,
      fill: { color: step.color, transparency: 80 },
      line: { color: step.color, width: 1 },
    });
    s.addText(step.num, {
      x: x + 0.2, y: 2.7, w: 0.55, h: 0.55,
      fontSize: 16, fontFace: FONT.head, color: step.color, bold: true,
      align: "center", valign: "middle",
    });

    s.addText(step.title, {
      x: x + 0.9, y: 2.75, w: 2.7, h: 0.4,
      fontSize: 18, fontFace: FONT.head, color: C.white, bold: true,
    });

    s.addText(step.desc, {
      x: x + 0.25, y: 3.4, w: 3.4, h: 1.2,
      fontSize: 12, fontFace: FONT.body, color: C.textSec,
    });

    step.details.forEach((d, j) => {
      s.addText([
        { text: "→  ", options: { color: step.color }},
        { text: d, options: { color: C.textPri }},
      ], {
        x: x + 0.25, y: 4.7 + j * 0.4, w: 3.4, h: 0.35,
        fontSize: 11, fontFace: FONT.body,
      });
    });

    // Arrow between steps
    if (i < 2) {
      s.addText("→", {
        x: x + 4.0, y: 4.3, w: 0.4, h: 0.4,
        fontSize: 24, fontFace: FONT.body, color: C.textMuted, align: "center",
      });
    }
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 16: REQUIREMENTS TRACEABILITY
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.purple);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Traceability", C.purple);

  s.addText("Requirements Traceability Matrix", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  s.addText("Every requirement (PRD-xxx) maps to test cases (TC-xxx) with bidirectional traceability.", {
    x: 0.5, y: 2.2, w: 10, h: 0.35,
    fontSize: 13, fontFace: FONT.body, color: C.textSec,
  });

  // Sample RTM entries
  const rtmSample = [
    { req: "PRD-SCR-001", desc: "Tier 1 rule-based screening (9 types)", tests: "TC-SCR-001→017", status: "Passed" },
    { req: "PRD-SCR-002", desc: "Screening result classification (4 statuses)", tests: "TC-SCR-018→021", status: "Passed" },
    { req: "PRD-SEC-001", desc: "AES-256 SQLCipher encryption", tests: "TC-SEC-001", status: "Passed" },
    { req: "PRD-AUD-002", desc: "HMAC chain integrity verification", tests: "TC-AUD-002→006", status: "Passed" },
    { req: "PRD-IMP-002", desc: "Smart column auto-mapping", tests: "TC-IMP-004→008", status: "Passed" },
    { req: "PRD-FIN-001", desc: "18 therapeutic archetypes", tests: "TC-FIN-001→002", status: "Passed" },
    { req: "PRD-FIN-004", desc: "Three-scenario financial model", tests: "TC-FIN-004", status: "Passed" },
    { req: "PRD-ANL-010", desc: "Feasibility query execution", tests: "TC-ANL-010", status: "Passed" },
    { req: "PRD-ANL-012", desc: "Diversity profile computation", tests: "TC-ANL-012", status: "Passed" },
    { req: "PRD-EXP-001", desc: "CSV export with filtering", tests: "TC-EXP-001→003", status: "Passed" },
    { req: "PRD-LLM-001", desc: "Sidecar architecture (127.0.0.1)", tests: "TC-LLM-001", status: "Designed" },
    { req: "PRD-PFM-003", desc: "Single patient screening <100ms", tests: "TC-PFM-003", status: "Designed" },
  ];

  const cols = [0.5, 2.3, 7.2, 9.6, 11.5];
  const hdrs = ["Requirement", "Description", "Test Cases", "Status", ""];
  const ws = [1.7, 4.7, 2.2, 1.7, 1.2];

  hdrs.forEach((h, i) => {
    s.addText(h, {
      x: cols[i], y: 2.75, w: ws[i], h: 0.3,
      fontSize: 9, fontFace: FONT.body, color: C.textMuted, bold: true, letterSpacing: 1,
    });
  });

  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 3.05, w: 12.33, h: 0.01, fill: { color: C.border },
  });

  rtmSample.forEach((r, i) => {
    const ry = 3.15 + i * 0.28;
    if (i % 2 === 0) {
      s.addShape(pptx.shapes.RECTANGLE, {
        x: 0.5, y: ry - 0.02, w: 12.33, h: 0.28,
        fill: { color: C.bgCard, transparency: 50 },
      });
    }
    s.addText(r.req, { x: cols[0], y: ry, w: ws[0], h: 0.24, fontSize: 9, fontFace: FONT.mono, color: C.indigoLt, bold: true });
    s.addText(r.desc, { x: cols[1], y: ry, w: ws[1], h: 0.24, fontSize: 9, fontFace: FONT.body, color: C.textPri });
    s.addText(r.tests, { x: cols[2], y: ry, w: ws[2], h: 0.24, fontSize: 9, fontFace: FONT.mono, color: C.textSec });
    const stColor = r.status === "Passed" ? C.emeraldLt : C.amberLt;
    s.addText(r.status, { x: cols[3], y: ry, w: ws[3], h: 0.24, fontSize: 9, fontFace: FONT.mono, color: stColor, bold: true });
  });

  // Note at bottom
  card(s, 0.5, 6.65, 11.5, 0.3, { fill: C.bgDark });
  s.addText("Full RTM: 94 requirements → 106 test cases — see docs/validation/REQUIREMENTS-TRACEABILITY-MATRIX.md", {
    x: 0.7, y: 6.65, w: 10.8, h: 0.3,
    fontSize: 9, fontFace: FONT.mono, color: C.textMuted, valign: "middle",
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 17: WHAT'S NEXT
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);
  addTopBar(s, C.indigo);
  addLogo(s);
  addSlideNum(s, slideNum);
  addSectionLabel(s, "Roadmap");

  s.addText("What's Next", {
    x: 0.5, y: 1.55, w: 12, h: 0.55,
    fontSize: 32, fontFace: FONT.head, color: C.white, bold: true,
  });

  const roadmap = [
    { phase: "Now", items: [
      "23 Rust tests + 103 TS unit tests passing",
      "17 E2E test specs designed",
      "Full IQ/OQ/PQ validation documentation",
      "Zephyr Scale integration for test reporting",
    ], color: C.emerald },
    { phase: "Next", items: [
      "FHIR R4 / CDA / HL7v2 data parsers",
      "E2E test execution with Playwright",
      "Performance qualification benchmarks",
      "Tauri build signing & notarization",
    ], color: C.amber },
    { phase: "Future", items: [
      "Site network multi-tenant analytics",
      "Sponsor marketplace integration",
      "Real-time EHR monitoring (file watcher)",
      "Multi-site cohort federation",
    ], color: C.indigo },
  ];

  roadmap.forEach((phase, i) => {
    const x = 0.5 + i * 4.2;
    card(s, x, 2.3, 3.9, 4.4, { border: phase.color });
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: 2.3, w: 3.9, h: 0.04, fill: { color: phase.color },
    });
    s.addText(phase.phase.toUpperCase(), {
      x: x + 0.25, y: 2.5, w: 3.4, h: 0.35,
      fontSize: 14, fontFace: FONT.head, color: phase.color, bold: true, letterSpacing: 2,
    });
    phase.items.forEach((item, j) => {
      s.addText([
        { text: "→  ", options: { color: phase.color }},
        { text: item, options: { color: C.textPri }},
      ], {
        x: x + 0.25, y: 3.1 + j * 0.55, w: 3.4, h: 0.45,
        fontSize: 12, fontFace: FONT.body,
      });
    });
  });
}


// ═══════════════════════════════════════════════════
// SLIDE 18: CLOSING
// ═══════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideNum++;
  darkBg(s);

  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.33, h: 0.06,
    fill: { color: C.indigo },
  });

  // Big glow
  s.addShape(pptx.shapes.OVAL, {
    x: 3.5, y: 0.5, w: 6, h: 6,
    fill: { color: C.indigo, transparency: 94 },
    line: { width: 0 },
  });

  s.addImage({ path: LOGO, x: 5.85, y: 1.8, w: 1.1, h: 1.1 });

  s.addText("TalOS SiteConnect", {
    x: 1, y: 3.2, w: 11.33, h: 0.8,
    fontSize: 44, fontFace: FONT.head, color: C.white,
    bold: true, align: "center",
  });

  s.addText("The on-premise screening engine that turns your EHR\ninto a patient-finding machine.", {
    x: 2, y: 4.1, w: 9.33, h: 0.8,
    fontSize: 18, fontFace: FONT.body, color: C.textSec,
    align: "center",
  });

  // Contact / links
  card(s, 3.5, 5.4, 6.33, 1.2);
  s.addText("Ready to transform your site's screening workflow?", {
    x: 3.7, y: 5.5, w: 5.93, h: 0.4,
    fontSize: 14, fontFace: FONT.head, color: C.white, bold: true, align: "center",
  });
  s.addText("talosix.com  ·  hello@talosix.com", {
    x: 3.7, y: 5.95, w: 5.93, h: 0.35,
    fontSize: 13, fontFace: FONT.body, color: C.indigoLt, align: "center",
  });

  s.addText("CONFIDENTIAL — March 2026  ·  © Talosix Inc.", {
    x: 1, y: 7.0, w: 11.33, h: 0.3,
    fontSize: 10, fontFace: FONT.body, color: C.textMuted, align: "center",
  });
}


// ═══════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════
await pptx.writeFile({ fileName: OUTPUT });
console.log(`✅ Deck created: ${OUTPUT}`);
console.log(`   ${slideNum} slides generated`);
