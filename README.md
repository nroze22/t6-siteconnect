# TalOS SiteConnect

On-premise patient screening desktop application for clinical research sites.

## What It Does

SiteConnect gives clinical research sites three core capabilities:

1. **Patient Screening** -- Import patient data from EMR exports and automatically screen against clinical trial eligibility criteria using a local AI model
2. **Trial Discovery** -- Search a locally-synced database of clinical trials, see which ones your patients qualify for, and understand the financial opportunity
3. **Operational Intelligence** -- AI-powered analytics on patient demographics, disease prevalence, and research capacity

## Key Design Principles

- **100% Offline** -- No PHI ever leaves the device. No cloud, no network required.
- **Encrypted** -- All data encrypted at rest with AES-256 (SQLCipher)
- **AI-Powered** -- Local LLM (BioMistral-7B) for intelligent eligibility screening
- **Lightweight** -- ~200MB installer, runs on standard clinic hardware
- **Free** -- Core features are free forever

## Tech Stack

- **Desktop**: Tauri v2 (Rust backend, system WebView)
- **Frontend**: React 19 + Vite + shadcn/ui + Tailwind CSS
- **Database**: SQLite + SQLCipher + sqlite-vec
- **AI**: llama.cpp sidecar (BioMistral-7B or Gemma-3-1B)

## Development

```bash
# Prerequisites: Rust, Node.js 20+

# Install dependencies
npm install

# Development mode
cargo tauri dev

# Build installer
cargo tauri build
```

## Hardware Requirements

| Tier | RAM | Model | Features |
|------|-----|-------|----------|
| Minimum | 4GB | None | Rule-based screening only |
| Recommended | 8GB | Gemma-1B | Basic AI screening |
| Optimal | 16GB+ | BioMistral-7B | Full AI features |
