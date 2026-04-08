#!/usr/bin/env python3
"""Build TalOS SiteConnect Product Overview .docx with embedded screenshots."""

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import os

SCREENSHOTS = './docs/screenshots'
OUTPUT = './TalOS_SiteConnect_Product_Overview.docx'

def set_cell_shading(cell, color):
    """Set cell background color."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def add_styled_table(doc, headers, rows, col_widths=None, header_color="4F46E5"):
    """Add a formatted table with colored header."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = 'Table Grid'

    # Header row
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = header
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in paragraph.runs:
                run.bold = True
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                run.font.size = Pt(9)
                run.font.name = 'Calibri'
        set_cell_shading(cell, header_color)

    # Data rows
    for row_idx, row_data in enumerate(rows):
        for col_idx, cell_text in enumerate(row_data):
            cell = table.rows[row_idx + 1].cells[col_idx]
            cell.text = str(cell_text)
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(9)
                    run.font.name = 'Calibri'
            if row_idx % 2 == 1:
                set_cell_shading(cell, "F8FAFC")

    return table

def add_screenshot(doc, filename, caption, width=Inches(6.5)):
    """Add a screenshot with caption."""
    path = os.path.join(SCREENSHOTS, filename)
    if not os.path.exists(path):
        p = doc.add_paragraph(f'[Screenshot: {caption} — file not found: {filename}]')
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        return

    doc.add_picture(path, width=width)
    last_paragraph = doc.paragraphs[-1]
    last_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

    caption_p = doc.add_paragraph()
    caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = caption_p.add_run(caption)
    run.italic = True
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    caption_p.space_after = Pt(16)

def add_heading_styled(doc, text, level=1):
    """Add a heading with consistent styling."""
    heading = doc.add_heading(text, level=level)
    for run in heading.runs:
        run.font.name = 'Calibri'
    return heading

def build_document():
    doc = Document()

    # --- Page setup ---
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)

    # --- Style defaults ---
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10.5)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.15

    for i in range(1, 5):
        hs = doc.styles[f'Heading {i}']
        hs.font.name = 'Calibri'
        hs.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

    doc.styles['Heading 1'].font.size = Pt(22)
    doc.styles['Heading 1'].font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)
    doc.styles['Heading 2'].font.size = Pt(16)
    doc.styles['Heading 3'].font.size = Pt(13)

    # =============================================
    # COVER PAGE
    # =============================================
    for _ in range(6):
        doc.add_paragraph()

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('TalOS')
    run.font.size = Pt(48)
    run.bold = True
    run.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)
    run.font.name = 'Calibri'

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('SiteConnect')
    run.font.size = Pt(32)
    run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    run.font.name = 'Calibri'

    doc.add_paragraph()

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('Product Overview & Requirements Document')
    run.font.size = Pt(18)
    run.bold = True
    run.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('On-Premise Patient Screening Desktop Application\nfor Clinical Research Sites')
    run.font.size = Pt(13)
    run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    for _ in range(4):
        doc.add_paragraph()

    # Cover metadata table
    meta = doc.add_table(rows=5, cols=2)
    meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ('Version', '0.1.0'),
        ('Date', 'March 16, 2026'),
        ('Classification', 'Confidential'),
        ('Platform', 'Windows, macOS'),
        ('Status', 'Production-Ready'),
    ]
    for i, (label, value) in enumerate(meta_data):
        meta.rows[i].cells[0].text = label
        meta.rows[i].cells[1].text = value
        for cell in meta.rows[i].cells:
            for paragraph in cell.paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in paragraph.runs:
                    run.font.size = Pt(10)
                    run.font.name = 'Calibri'
                    run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
            for border_name in ['top', 'bottom', 'start', 'end']:
                border = parse_xml(f'<w:tcBorders {nsdecls("w")}><w:{border_name} w:val="none"/></w:tcBorders>')

    doc.add_page_break()

    # =============================================
    # TABLE OF CONTENTS
    # =============================================
    add_heading_styled(doc, 'Table of Contents', level=1)
    toc_items = [
        '1.  Executive Summary',
        '2.  Product at a Glance',
        '3.  Security & HIPAA Compliance',
        '4.  Technical Architecture',
        '5.  Setup & Onboarding',
        '6.  Data Import Engine',
        '7.  Screening Engine',
        '8.  Three-Panel Screening UI (Hero Feature)',
        '9.  Trial Discovery & Financial Intelligence',
        '10. Enrollment Pipeline',
        '11. Analytics & Population Intelligence',
        '12. AI Integration & LLM Sidecar',
        '13. Export & Reporting',
        '14. Application Pages',
        '15. Data Model',
        '16. Competitive Advantages',
        '17. Roadmap & Future Features',
        '18. Completion Status',
    ]
    for item in toc_items:
        p = doc.add_paragraph(item)
        p.paragraph_format.space_after = Pt(4)
        for run in p.runs:
            run.font.size = Pt(11)
            run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_page_break()

    # =============================================
    # 1. EXECUTIVE SUMMARY
    # =============================================
    add_heading_styled(doc, '1. Executive Summary', level=1)

    doc.add_paragraph(
        'TalOS SiteConnect is a fully-functional, on-premise desktop application that empowers '
        'clinical research sites to screen patients for trial eligibility, model financial opportunity, '
        'and manage enrollment pipelines \u2014 all without any patient data ever leaving the device.'
    )
    doc.add_paragraph(
        'The application combines rule-based screening with local AI inference (BioMistral-7B or '
        'Gemma-1B running on-device via llama.cpp), a three-panel eligibility review interface, and '
        'a three-tier financial intelligence engine that estimates per-patient revenue, site ROI, and '
        'enrollment scenarios across 50+ curated clinical trials.'
    )

    # Strategic callout
    p = doc.add_paragraph()
    run = p.add_run('Strategic Purpose: ')
    run.bold = True
    run.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)
    run = p.add_run(
        'SiteConnect is the customer acquisition vehicle for the TalOS site network. By providing a '
        'powerful, free, zero-risk screening tool, we establish relationships with 30\u201350+ research sites. '
        'The data, insights, and relationships this creates enable future products: sponsor marketplace, '
        'EDC/ePRO, and network analytics.'
    )

    # KPI stats table
    add_styled_table(doc,
        ['Metric', 'Value', 'Metric', 'Value'],
        [
            ['Application Pages', '11', 'Import Formats', '6'],
            ['Curated Trials', '50+', 'Financial Archetypes', '15+'],
            ['Operation Mode', '100% Offline', 'Encryption', 'AES-256'],
            ['Installer Size', '2\u20135 MB', 'Screen 1,000 Patients', '<2 seconds'],
        ]
    )

    # Dashboard screenshot
    add_screenshot(doc, '02-dashboard.png', 'Figure 1: Dashboard \u2014 KPI cards, recent activity, getting-started checklist, and AI screening status')

    doc.add_page_break()

    # =============================================
    # 2. PRODUCT AT A GLANCE
    # =============================================
    add_heading_styled(doc, '2. Product at a Glance', level=1)

    add_heading_styled(doc, '2.1 Problem Statement', level=2)
    doc.add_paragraph(
        'Clinical research sites waste significant coordinator time manually matching patients to '
        'trial eligibility criteria. They lack visibility into the financial value of trials, have no '
        'tools to forecast enrollment, and existing solutions require cloud infrastructure that creates '
        'PHI compliance risk.'
    )

    add_heading_styled(doc, '2.2 Solution', level=2)
    doc.add_paragraph(
        'A desktop application that runs entirely on the site\'s own hardware. It imports patient data '
        'from any EHR export format, screens patients against structured eligibility criteria using a '
        'hybrid rule-based + AI engine, and surfaces the financial opportunity of each trial with detailed '
        'per-patient revenue modeling.'
    )

    add_heading_styled(doc, '2.3 Target Users', level=2)
    add_styled_table(doc,
        ['Role', 'Primary Use Case'],
        [
            ['Clinical Research Coordinator', 'Import patient data, run screening, review eligibility, manage pipeline'],
            ['Site Director / PI', 'Evaluate trial financial opportunity, view population analytics, track performance'],
            ['Regulatory / Compliance', 'Audit trail review, verify data handling, confirm encryption'],
        ]
    )

    add_heading_styled(doc, '2.4 Key Workflows', level=2)
    add_styled_table(doc,
        ['#', 'Workflow', 'Description'],
        [
            ['1', 'Import', 'Drag-and-drop CSV, Excel, FHIR R4, HL7v2, or CDA files. Smart column mapping with saved profiles.'],
            ['2', 'Screen', 'Select a trial, click Screen. Rule-based engine evaluates every patient instantly. AI handles complex criteria.'],
            ['3', 'Review', 'Three-panel UI: ranked patient list, criterion-by-criterion detail, source data with linked highlighting.'],
            ['4', 'Decide', 'Accept, reject, or defer each patient. Override AI decisions with justification. Full audit trail.'],
            ['5', 'Track', 'Move eligible patients through a 5-stage enrollment pipeline: Identified \u2192 Contacted \u2192 Interested \u2192 Consented \u2192 Enrolled.'],
            ['6', 'Analyze', 'Population feasibility queries, diversity analysis, Monte Carlo enrollment forecasting, cohort building.'],
            ['7', 'Model', 'Three-tier financial engine: quick ranges on trial cards, detailed models on study pages, interactive Budget Wizard.'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 3. SECURITY & HIPAA COMPLIANCE
    # =============================================
    add_heading_styled(doc, '3. Security & HIPAA Compliance', level=1)

    p = doc.add_paragraph()
    run = p.add_run('NON-NEGOTIABLE: ')
    run.bold = True
    run.font.color.rgb = RGBColor(0xDC, 0x26, 0x26)
    run = p.add_run(
        'All patient data is processed and stored locally. There is no network transmission of PHI '
        'under any circumstances. The application operates 100% offline.'
    )

    add_heading_styled(doc, '3.1 Encryption', level=2)
    add_styled_table(doc,
        ['Control', 'Implementation'],
        [
            ['Database Encryption', 'SQLCipher with AES-256-CBC. PBKDF2 key derivation with 256,000 iterations.'],
            ['Passphrase Requirement', 'Minimum 12 characters with real-time entropy scoring (Weak/Fair/Strong/Excellent).'],
            ['Unlock Flow', 'Passphrase required on every app launch. Configurable session timeout (15/30/60 min).'],
            ['Lock Shortcut', 'Cmd/Ctrl+L locks the application instantly from any screen.'],
        ]
    )

    add_heading_styled(doc, '3.2 Audit Trail', level=2)
    doc.add_paragraph('Every sensitive operation is logged with timestamp and action details:')
    audit_items = [
        'Database initialization and unlocks',
        'Patient data imports (file name, record count, validation results)',
        'Screening runs (study ID, patient count, result summary)',
        'Review decisions (accept, reject, defer, override)',
        'Criterion overrides (before/after, justification text)',
        'Data exports (format, record count)',
    ]
    for item in audit_items:
        doc.add_paragraph(item, style='List Bullet')

    add_heading_styled(doc, '3.3 Data Protection Controls', level=2)
    add_styled_table(doc,
        ['Control', 'Details'],
        [
            ['No PHI in Logs', 'Rust backend uses tracing crate. PHI fields implement Zeroize trait.'],
            ['No Network Calls', 'Zero network requests by default. No telemetry, no analytics, no phone-home.'],
            ['Soft Deletes Only', 'Patient records are never hard-deleted. Soft delete preserves audit integrity.'],
            ['Memory Safety', 'Sensitive data in Rust uses Zeroize + ZeroizeOnDrop to clear memory after use.'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 4. TECHNICAL ARCHITECTURE
    # =============================================
    add_heading_styled(doc, '4. Technical Architecture', level=1)

    add_heading_styled(doc, '4.1 Technology Stack', level=2)
    add_styled_table(doc,
        ['Layer', 'Technology', 'Purpose'],
        [
            ['Desktop Shell', 'Tauri v2 (Rust)', 'Native wrapper, 2\u20135 MB binary (vs. Electron 150+ MB)'],
            ['Frontend', 'React 19 + Vite + TypeScript', 'Fast, type-safe UI with hot module replacement'],
            ['UI Library', 'shadcn/ui + Tailwind CSS', 'Production-grade components with dark/light themes'],
            ['Data Grid', 'TanStack Table', 'Virtualized, sortable, filterable patient lists'],
            ['Charts', 'Recharts', 'Bar, line, pie, radar, area charts for analytics'],
            ['State', 'Zustand', '8 specialized stores with LocalStorage persistence'],
            ['Database', 'SQLite + SQLCipher + sqlite-vec', 'Encrypted local database with vector search'],
            ['LLM Inference', 'llama.cpp (llama-server sidecar)', 'Local AI via OpenAI-compatible localhost API'],
            ['Primary Model', 'BioMistral-7B-GGUF (Q4_K_M)', 'Clinical NLP optimized, ~4.4 GB, CPU-only'],
            ['Alt Model', 'Gemma-3-1B-GGUF', 'Lightweight for 8 GB RAM devices, ~1 GB'],
        ]
    )

    add_heading_styled(doc, '4.2 Hardware Tiers', level=2)
    add_styled_table(doc,
        ['Tier', 'RAM', 'AI Model', 'Capabilities'],
        [
            ['Minimum', '4 GB', 'None', 'Rule-based screening only. Full financial modeling and analytics.'],
            ['Recommended', '8 GB', 'Gemma-1B', 'Basic AI screening for complex criteria. All features available.'],
            ['Optimal', '16 GB+', 'BioMistral-7B', 'Full clinical AI screening with high accuracy and confidence.'],
        ]
    )

    # Settings screenshot showing hardware detection
    add_screenshot(doc, '12-settings.png', 'Figure 2: Settings \u2014 Hardware detection, AI model selection, and system profile')

    doc.add_page_break()

    # =============================================
    # 5. SETUP & ONBOARDING
    # =============================================
    add_heading_styled(doc, '5. Setup & Onboarding', level=1)

    add_heading_styled(doc, '5.1 First Run: Database Setup', level=2)
    doc.add_paragraph('On first launch, the user is guided through a secure database initialization:')
    steps = [
        'Welcome Splash \u2014 Explains that all data is encrypted locally, never transmitted.',
        'Create Passphrase \u2014 Minimum 12 characters. Real-time strength meter. Show/hide toggle.',
        'Key Management Checklist \u2014 User must confirm: saved passphrase, understands no recovery, acknowledges risk.',
        'Database Initialization \u2014 Creates SQLCipher-encrypted database, runs migrations, seeds trial data.',
    ]
    for i, step in enumerate(steps, 1):
        doc.add_paragraph(f'{i}. {step}')

    add_heading_styled(doc, '5.2 Site Profile Onboarding', level=2)
    doc.add_paragraph('After database setup, a 6-step wizard captures the site\'s operational profile:')
    add_styled_table(doc,
        ['Step', 'Information Captured'],
        [
            ['1. Research Program', 'Site name, institution, role, specialty/therapeutic areas'],
            ['2. Team & Capacity', 'Number of coordinators, expected screens/month, operating hours'],
            ['3. Financial Defaults', 'Labor cost/hour, overhead percentage, preferred payment models'],
            ['4. Data & Systems', 'EHR vendor (Epic, Cerner, etc.), available data domains'],
            ['5. Study Evaluation', 'Priority ranking (revenue vs. burden vs. fit), preferences'],
            ['6. Workspace Setup', 'Export preferences, data retention policy, notifications'],
        ]
    )

    add_screenshot(doc, '01-onboarding.png', 'Figure 3: Site Onboarding \u2014 6-step wizard to capture site profile and preferences')

    doc.add_page_break()

    # =============================================
    # 6. DATA IMPORT ENGINE
    # =============================================
    add_heading_styled(doc, '6. Data Import Engine', level=1)

    add_heading_styled(doc, '6.1 Supported Formats', level=2)
    add_styled_table(doc,
        ['Format', 'Extensions', 'Details'],
        [
            ['Delimited Text', '.csv, .tsv, .pip, .dat', 'Auto-detects delimiter. Handles CRLF and LF line endings.'],
            ['Microsoft Excel', '.xlsx, .xls', 'Multi-sheet support via calamine parser.'],
            ['FHIR R4 JSON', '.json, .ndjson', 'Full FHIR R4 Bundle and NDJSON parsing.'],
            ['HL7 v2 Messages', '.hl7', 'ADT and ORU message segments. Line ending normalization.'],
            ['CDA XML', '.xml', 'Clinical Document Architecture parsing.'],
            ['Epic EMR Export', '.csv', 'Pre-configured column mapping for Epic exports.'],
        ]
    )

    add_heading_styled(doc, '6.2 Import Workflow', level=2)
    workflow_steps = [
        'File Selection \u2014 Drag-and-drop or native file picker. Format auto-detected.',
        'Column Mapping \u2014 Visual mapper with smart auto-suggestions. Save/load profiles.',
        'Validation & Preview \u2014 First rows displayed. Data quality checks run automatically.',
        'Import Execution \u2014 8-stage animated progress. Deduplication against existing records.',
        'Validation Report \u2014 Summary of imported records, skipped duplicates, and errors.',
    ]
    for i, step in enumerate(workflow_steps, 1):
        doc.add_paragraph(f'{i}. {step}')

    add_screenshot(doc, '04-import.png', 'Figure 4: Data Import \u2014 Drag-and-drop with format auto-detection, smart column mapping, and demo data loading')

    add_heading_styled(doc, '6.3 Target Data Fields', level=2)
    add_styled_table(doc,
        ['Category', 'Fields'],
        [
            ['Demographics', 'Patient ID, Date of Birth, Gender, Race, Ethnicity, Insurance'],
            ['Diagnoses', 'ICD-10 Code, Name, Onset Date, Status, Confidence Score'],
            ['Medications', 'Drug Name, RxNorm Code, Dose, Frequency, Start/End Date'],
            ['Lab Results', 'LOINC Code, Test Name, Value, Units, Reference Range, Abnormal Flag'],
            ['Vitals', 'Height, Weight, BMI, Blood Pressure, Heart Rate, Temperature'],
            ['Clinical Notes', 'Free-text notes (used for LLM-based criterion evaluation)'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 7. SCREENING ENGINE
    # =============================================
    add_heading_styled(doc, '7. Screening Engine', level=1)

    add_heading_styled(doc, '7.1 Two-Tier Hybrid Architecture', level=2)

    add_heading_styled(doc, 'Tier 1: Rule-Based Screening (Instant, Deterministic)', level=3)
    doc.add_paragraph(
        'The primary screening tier parses eligibility criteria into structured rules and evaluates '
        'them against patient data. This runs synchronously in the Rust backend and can screen '
        '1,000 patients in under 2 seconds.'
    )
    add_styled_table(doc,
        ['Evaluation Type', 'Examples'],
        [
            ['Diagnosis Match', 'ICD-10 code match, text keyword search (e.g., "Type 2 Diabetes")'],
            ['Medication Match', 'Drug name match (e.g., "metformin", "pembrolizumab")'],
            ['Lab Thresholds', 'Numeric comparison: HbA1c \u2265 7.5%, eGFR > 30, platelets 100K\u2013400K'],
            ['Demographics', 'Age range, gender, race/ethnicity'],
            ['Vitals', 'BMI range, blood pressure thresholds'],
            ['Clinical Notes', 'Keyword search in free-text notes'],
        ]
    )

    add_heading_styled(doc, 'Tier 2: LLM-Assisted Screening (Background, AI-Powered)', level=3)
    doc.add_paragraph(
        'Criteria that cannot be resolved by rules alone are queued for local AI evaluation. '
        'The LLM receives the criterion text and relevant patient data, returning a structured '
        'response with result (met/not_met/unknown), confidence (0\u20131.0), reasoning, and evidence. '
        'LLM failure never blocks the user; criteria remain as "needs review."'
    )

    add_heading_styled(doc, '7.2 Screening Output', level=2)
    add_styled_table(doc,
        ['Field', 'Description'],
        [
            ['Eligibility Status', 'Eligible, Potentially Eligible, Needs Review, or Ineligible'],
            ['Eligibility Score', '0\u2013100 composite score based on criteria met/triggered'],
            ['Inclusion Summary', 'X of Y inclusion criteria met'],
            ['Exclusion Summary', 'X of Y exclusion criteria triggered'],
            ['Missing Data Count', 'Criteria that could not be evaluated due to missing data'],
            ['Per-Criterion Detail', 'Individual result, evidence, confidence, and AI flag for every criterion'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 8. THREE-PANEL SCREENING UI
    # =============================================
    add_heading_styled(doc, '8. Three-Panel Screening UI (Hero Feature)', level=1)

    doc.add_paragraph(
        'The primary screening interface is a three-panel resizable layout that provides a complete '
        'screening workflow in a single view. Clicking a criterion in the middle panel highlights '
        'the corresponding source data evidence in the right panel.'
    )

    add_screenshot(doc, '03-screening.png', 'Figure 5: Three-Panel Screening UI \u2014 Patient rank list (left), criteria detail (center), source data viewer (right)')

    add_heading_styled(doc, '8.1 Left Panel \u2014 Patient Rank List (25% width)', level=2)
    items = [
        'All screened patients sorted by eligibility score (highest first)',
        'Status filter buttons: All, Eligible, Potential, Ineligible, Review',
        'Score range slider (0\u2013100) for quick filtering',
        'Search by patient ID with keyboard navigation (\u2191/\u2193)',
        'Color-coded status dots: green, yellow, orange, red',
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    add_heading_styled(doc, '8.2 Middle Panel \u2014 Criteria Detail (42% width)', level=2)
    items = [
        'Patient identifier, age, gender, and primary diagnosis',
        'Inclusion criteria cards: green checkmark (met), red X (not met), yellow ? (unknown)',
        'Exclusion criteria cards: red (triggered), green (not triggered)',
        'Confidence indicator per criterion with "AI-determined" badge',
        'Click any criterion to highlight matching evidence in right panel',
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    add_heading_styled(doc, '8.3 Right Panel \u2014 Source Data Viewer (33% width)', level=2)
    items = [
        'Raw patient data organized by category: Demographics, Diagnoses, Medications, Labs, Vitals, Notes',
        'Collapsible/expandable sections',
        'Color-coded diagnosis status (active, resolved, historical)',
        'Abnormal lab flags highlighted',
        'Interactive highlighting linked to criterion selection in middle panel',
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    doc.add_page_break()

    # =============================================
    # 9. TRIAL DISCOVERY & FINANCIAL INTELLIGENCE
    # =============================================
    add_heading_styled(doc, '9. Trial Discovery & Financial Intelligence', level=1)

    add_heading_styled(doc, '9.1 Curated Trial Dataset', level=2)
    doc.add_paragraph(
        'The application ships with approximately 50 curated real-world clinical trials across '
        'six therapeutic areas. Each trial includes real NCT numbers sourced from ClinicalTrials.gov, '
        'augmented with estimated financial data from industry benchmarks.'
    )
    add_styled_table(doc,
        ['Therapeutic Area', 'Trials', 'Examples'],
        [
            ['Oncology', '~15', 'KEYNOTE-789 (Merck), Opdivo + Yervoy, lung/breast Phase 2/3'],
            ['Cardiology', '~10', 'DELIVER (AstraZeneca, dapagliflozin HFpEF), SGLT2i trials'],
            ['Metabolic / Endocrine', '~8', 'STEP-5 (Novo Nordisk, semaglutide), GLP-1 RA'],
            ['CNS / Neurology', '~8', 'Lecanemab early Alzheimer\'s, Parkinson\'s disease'],
            ['Immunology', '~6', 'Risankizumab Crohn\'s (AbbVie), JAK inhibitor RA'],
            ['Rare Disease', '~3', 'Gene therapy, natural history studies'],
        ]
    )

    add_screenshot(doc, '05-trials.png', 'Figure 6: Trial Discovery \u2014 Curated trials with financial intelligence, per-patient payment estimates, and site fit scoring')

    add_heading_styled(doc, '9.2 Three-Tier Financial Engine', level=2)

    add_heading_styled(doc, 'Tier 1: Study Card (Quick Directional Range)', level=3)
    doc.add_paragraph(
        'Fast estimates on trial cards: per-patient payment range (\u00b120%), burden badge, '
        'screen failure risk, enrollment fit, and time intensity.'
    )

    add_heading_styled(doc, 'Tier 2: Study Detail (Full Financial Model)', level=3)
    doc.add_paragraph(
        'Detailed model from one of 15+ study archetypes (e.g., oncology_immunotherapy, '
        'cardiology_moderate, gene_cell_therapy). Includes revenue drivers, cost drivers, '
        'visit models, CMS fee schedule anchoring, and scenario outputs.'
    )

    add_heading_styled(doc, 'Tier 3: Budget Wizard (Interactive Scenario Planning)', level=3)
    add_styled_table(doc,
        ['Step', 'Function'],
        [
            ['1. Model Overview', 'Archetype details, confidence level, visit flow diagram'],
            ['2. Site Assumptions', 'Enrollment target, screen failure rate, consent rate, dropout, monthly capacity'],
            ['3. Financial Outputs', 'Revenue projections (base/optimistic/conservative), profit, payback period'],
            ['4. Line-Item Tuning', 'Edit individual revenue line items and recalculate in real time'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 10. ENROLLMENT PIPELINE
    # =============================================
    add_heading_styled(doc, '10. Enrollment Pipeline', level=1)

    add_styled_table(doc,
        ['Stage', 'Description', 'Tracked Metrics'],
        [
            ['1. Identified', 'Screened as eligible; not yet contacted', 'Days since screening'],
            ['2. Contacted', 'Outreach initiated (phone, letter, portal)', 'Contact attempts, last contact date'],
            ['3. Interested', 'Subject expressed willingness to participate', 'Days to interest'],
            ['4. Consented', 'Informed consent signed', 'Consent date, consent rate'],
            ['5. Enrolled', 'Subject enrolled in trial', 'Enrollment date, total time'],
            ['Screen Failed', 'Did not meet criteria at re-screening', 'Failure reason, stage at failure'],
        ]
    )

    add_screenshot(doc, '07-pipeline.png', 'Figure 7: Enrollment Pipeline \u2014 5-stage tracking from identification through enrollment with activity logging')

    doc.add_paragraph(
        'The pipeline features a Kanban-style column view, conversion rate funnel, study filtering, '
        'search, and bulk actions (advance, log call, add note, reassign). Eligible patients from '
        'screening automatically flow into the "Identified" stage.'
    )

    doc.add_page_break()

    # =============================================
    # 11. ANALYTICS & POPULATION INTELLIGENCE
    # =============================================
    add_heading_styled(doc, '11. Analytics & Population Intelligence', level=1)

    add_heading_styled(doc, '11.1 Population Analytics', level=2)

    add_heading_styled(doc, 'Feasibility Tab', level=3)
    doc.add_paragraph(
        'Build population queries to assess trial feasibility: diagnosis (ICD-10), age range, '
        'lab thresholds, medication, BMI, gender. Results show match count, match rate, demographic '
        'breakdown, and exportable patient list. 10+ preset queries included.'
    )

    add_heading_styled(doc, 'Trajectory Tab (Monte Carlo Enrollment Forecasting)', level=3)
    doc.add_paragraph(
        'Probabilistic enrollment simulation using 1,000+ Monte Carlo runs with seeded PRNG. '
        'Produces month-by-month percentile bands (P10\u2013P90), median time to target, success '
        'probability, and 80% confidence intervals.'
    )

    add_heading_styled(doc, 'Diversity Tab', level=3)
    doc.add_paragraph(
        'Demographic profile with Simpson\'s Diversity Index, inclusion gap analysis, and '
        'AI-generated diversity recommendations.'
    )

    add_screenshot(doc, '08-analytics.png', 'Figure 8: Population Analytics \u2014 Protocol feasibility queries with AI-generated insights and matched subject counts')

    add_heading_styled(doc, '11.2 Cohort Builder', level=2)
    doc.add_paragraph(
        'Advanced query interface with 10+ pre-built quick-start queries, custom query editor, '
        'interactive drill-down, named cohort saving, and CSV export with demographics.'
    )

    add_screenshot(doc, '09-cohort.png', 'Figure 9: Cohort Builder \u2014 Custom population queries with drill-down analysis')

    add_heading_styled(doc, '11.3 Research Intelligence', level=2)
    doc.add_paragraph(
        'Site Readiness Score (0\u2013100 radar chart across Data Readiness, Operational Capacity, '
        'AI Capability, Financial Performance), opportunity alerts, ROI modeling, and AI-generated '
        'narrative insights.'
    )

    add_screenshot(doc, '10-intelligence.png', 'Figure 10: Research Intelligence \u2014 Site readiness scoring with radar chart and AI-generated insights')

    add_heading_styled(doc, '11.4 Site Performance', level=2)
    add_screenshot(doc, '11-performance.png', 'Figure 11: Site Performance \u2014 Revenue metrics, screening dashboard, and enrollment velocity')

    add_heading_styled(doc, '11.5 AI Narrative Engine', level=2)
    add_styled_table(doc,
        ['Narrative Type', 'Example'],
        [
            ['Feasibility', '"Your site has 18 eligible patients for KEYNOTE-789, exceeding the 10-patient threshold."'],
            ['Diversity', '"Hispanic patients are underrepresented (8% vs. 12% target). Consider targeted outreach."'],
            ['Performance', '"Your screen rate is trending up +15% MoM. Target enrollment in 6 months."'],
            ['Enrollment', '"Your consent rate is 65%, healthy for Phase 3 oncology."'],
            ['Readiness', '"Your site is 85% ready. Set up AI screening to unlock 20% faster enrollment."'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 12. AI INTEGRATION
    # =============================================
    add_heading_styled(doc, '12. AI Integration & LLM Sidecar', level=1)

    add_heading_styled(doc, '12.1 Supported Backends', level=2)
    add_styled_table(doc,
        ['Backend', 'Details', 'Setup'],
        [
            ['llama.cpp (Recommended)', 'llama-server sidecar, OpenAI-compatible API', 'Download GGUF model, configure in Settings'],
            ['Ollama', 'Cross-platform model manager with pull/serve', 'Install Ollama, pull model, start daemon'],
            ['None', 'Rule-based screening only', 'No setup required'],
        ]
    )

    add_heading_styled(doc, '12.2 Model Options', level=2)
    add_styled_table(doc,
        ['Model', 'Size', 'RAM', 'Best For'],
        [
            ['BioMistral-7B-GGUF (Q4_K_M)', '~4.4 GB', '16 GB+', 'Production clinical screening'],
            ['Gemma-3-1B-GGUF', '~1 GB', '8 GB', 'Lightweight on constrained hardware'],
            ['Custom GGUF', 'Varies', 'Varies', 'Any GGUF model via file path'],
        ]
    )

    add_heading_styled(doc, '12.3 Key Features', level=2)
    items = [
        'Criterion Evaluation: Structured JSON with result, confidence, reasoning, evidence',
        'Background Queue: Async processing during idle time with retry logic',
        'Health Monitoring: Status indicator, latency testing',
        'Graceful Degradation: LLM failure never blocks the user',
        'Hardware Detection: Automatic RAM/disk assessment with tier recommendation',
        'Ollama Integration: Auto-detect, list models, pull with progress, start/stop daemon',
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    doc.add_page_break()

    # =============================================
    # 13. EXPORT & REPORTING
    # =============================================
    add_heading_styled(doc, '13. Export & Reporting', level=1)

    add_styled_table(doc,
        ['Export Type', 'Format', 'Contents'],
        [
            ['Screening Summary', 'CSV', 'One row per patient: ID, age, gender, diagnosis, score, status, decision'],
            ['Screening Detail', 'CSV', 'One row per criterion: patient, text, result, evidence, confidence'],
            ['Analytics Report', 'HTML/PDF', 'Charts, demographics, insights, narrative summaries'],
            ['Cohort Patient List', 'CSV', 'Matched patients with demographics, labs, diagnoses, medications'],
            ['Audit Trail', 'CSV', 'Full audit log: timestamp, user, action, details'],
            ['Query Definitions', 'JSON', 'Saved feasibility queries and cohort definitions'],
        ]
    )
    doc.add_paragraph(
        'All exports require explicit user action and generate an audit trail entry.'
    )

    # =============================================
    # 14. APPLICATION PAGES
    # =============================================
    add_heading_styled(doc, '14. Application Pages', level=1)

    add_styled_table(doc,
        ['#', 'Page', 'Key', 'Description'],
        [
            ['1', 'Dashboard', '`', 'KPI cards, recent activity, getting-started checklist, AI status'],
            ['2', 'Screening', '1', 'Three-panel screening: patient rank, criteria detail, source data'],
            ['3', 'Import Data', '2', 'Multi-format import with drag-drop, column mapping, validation'],
            ['4', 'Trial Discovery', '3', 'Curated trial library with financial intelligence, Budget Wizard'],
            ['5', 'Review Queue', '4', 'Screening decision management: accept/reject/defer, CSV export'],
            ['6', 'Enrollment Pipeline', '5', 'Kanban 5-stage subject tracking through enrollment'],
            ['7', 'Population Analytics', '6', 'Feasibility queries, Monte Carlo forecasting, diversity'],
            ['8', 'Cohort Builder', '7', 'Custom queries, drill-down analysis, cohort save/export'],
            ['9', 'Research Intelligence', '8', 'Site readiness, opportunity alerts, ROI modeling'],
            ['10', 'Site Performance', '9', 'Revenue metrics, operational analytics, reports'],
            ['11', 'Settings', '0', 'LLM config, Ollama, database, security/audit, watch folder'],
        ]
    )

    add_heading_styled(doc, 'Additional UI Features', level=2)
    items = [
        'Command Palette (Cmd/Ctrl+K): Global search across pages, studies, and patients',
        'Keyboard Shortcuts Overlay (Cmd/Ctrl+?): All available shortcuts',
        'Dark / Light Mode: Full theme support with system preference detection',
        'Framer Motion Animations: Smooth page transitions and micro-interactions',
        'Global Error Boundary: Friendly error screen with reload option',
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    doc.add_page_break()

    # =============================================
    # 15. DATA MODEL
    # =============================================
    add_heading_styled(doc, '15. Data Model', level=1)

    add_heading_styled(doc, '15.1 Core Patient Tables', level=2)
    add_styled_table(doc,
        ['Table', 'Key Fields'],
        [
            ['patients', 'site_patient_id, dob, gender, race, ethnicity, insurance, import_source'],
            ['diagnoses', 'patient_id, icd10_code, name, onset_date, status, confidence'],
            ['medications', 'patient_id, rxnorm_code, name, dose, frequency, start/end_date'],
            ['lab_results', 'patient_id, loinc_code, name, value, units, reference_range, abnormal_flag'],
            ['vitals', 'patient_id, height, weight, bmi, bp_systolic, bp_diastolic, hr, temp'],
            ['allergies', 'patient_id, allergen, reaction, severity, onset_date'],
            ['procedures', 'patient_id, cpt_code, name, procedure_date'],
            ['clinical_notes', 'patient_id, note_text, note_date, ner_processed'],
        ]
    )

    add_heading_styled(doc, '15.2 Study & Screening Tables', level=2)
    add_styled_table(doc,
        ['Table', 'Key Fields'],
        [
            ['studies', 'nct_number, title, sponsor, phase, therapeutic_area, per_patient_payment, payment_model'],
            ['study_criteria', 'study_id, criterion_type (inclusion/exclusion), criterion_text, rule_type'],
            ['screening_results', 'patient_id, study_id, status, score, inclusion_met/total, exclusion_triggered/total'],
            ['criterion_results', 'screening_id, criterion_id, result, evidence, confidence, ai_evaluated, human_override'],
        ]
    )

    add_heading_styled(doc, '15.3 Data Conventions', level=2)
    items = [
        'All financial values stored as integer cents (e.g., $2,500.00 = 250000)',
        'All timestamps in ISO 8601 format',
        'Confidence scores range 0.0 \u2013 1.0',
        'Soft deletes only (no hard deletion of patient data)',
        'All tables include created_at and updated_at columns',
    ]
    for item in items:
        doc.add_paragraph(item, style='List Bullet')

    doc.add_page_break()

    # =============================================
    # 16. COMPETITIVE ADVANTAGES
    # =============================================
    add_heading_styled(doc, '16. Competitive Advantages', level=1)

    add_styled_table(doc,
        ['#', 'Advantage', 'Why It Matters'],
        [
            ['1', 'Financial Intelligence', 'Only product showing per-patient payments, startup fees, and ROI per trial. We show the money.'],
            ['2', 'AI Transparency', 'LLM runs 100% on device. No data sent to cloud APIs. Full explainability.'],
            ['3', 'Zero Network Risk', 'Completely offline. No cloud sync. IT departments have zero objections.'],
            ['4', 'Free to Sites', 'No license fee. Removes the #1 barrier to adoption.'],
            ['5', 'Rich Analytics', 'Feasibility, diversity, Monte Carlo forecasting. Most competitors stop at screening.'],
            ['6', 'Operational Pipeline', 'Tracks subjects from identification through enrollment.'],
            ['7', 'Tiny Footprint', '2\u20135 MB installer (Tauri) vs. 150+ MB (Electron competitors).'],
        ]
    )

    # =============================================
    # 17. ROADMAP
    # =============================================
    add_heading_styled(doc, '17. Roadmap & Future Features', level=1)

    add_heading_styled(doc, '17.1 Near-Term Enhancements', level=2)
    add_styled_table(doc,
        ['Feature', 'Description', 'Priority'],
        [
            ['NER Pipeline', 'Python spaCy/scispaCy sidecar for entity extraction from clinical notes', 'High'],
            ['Auto-Update', 'In-app update checking and seamless version upgrades', 'High'],
            ['Linux Support', 'AppImage and .deb packaging for Linux workstations', 'Medium'],
        ]
    )

    add_heading_styled(doc, '17.2 Phase 2: Network Features (Months 6\u201318)', level=2)
    add_styled_table(doc,
        ['Feature', 'Description'],
        [
            ['TalOS Network Sync', 'Optional, opt-in sync of curated trial data from TalOS hub. No PHI transmitted.'],
            ['Anonymized Feasibility', 'K-anonymized (k\u22655) aggregate eligibility counts for sponsor marketplace.'],
            ['Telemetry', 'Optional, opt-in, k-anonymized usage analytics. User previews before send.'],
        ]
    )

    add_heading_styled(doc, '17.3 Phase 3: Platform Expansion (Months 12\u201324)', level=2)
    add_styled_table(doc,
        ['Product', 'Description'],
        [
            ['Sponsor Marketplace', 'Sponsors post opportunities; sites with matching populations get notified.'],
            ['TalOS EDC', 'Electronic Data Capture upsell for trial execution.'],
            ['TalOS ePRO', 'Electronic Patient-Reported Outcomes for subject-facing data collection.'],
            ['Network Analytics', 'Cross-site enrollment intelligence for sponsors (anonymized, aggregated).'],
        ]
    )

    doc.add_page_break()

    # =============================================
    # 18. COMPLETION STATUS
    # =============================================
    add_heading_styled(doc, '18. Completion Status', level=1)

    add_styled_table(doc,
        ['Module', 'Status', 'Details'],
        [
            ['Core Screening Engine', 'Complete', 'Rule-based + LLM hybrid, override with audit trail'],
            ['Data Import Engine', 'Complete', 'CSV, XLSX, FHIR R4, HL7v2, CDA, column mapping, validation'],
            ['Patient Database', 'Complete', 'SQLCipher AES-256, 10+ tables, full schema with migrations'],
            ['Three-Panel Screening UI', 'Complete', 'Resizable panels, interactive criterion-to-evidence linking'],
            ['Financial Intelligence', 'Complete', '3-tier model, 15+ archetypes, Budget Wizard'],
            ['Trial Discovery', 'Complete', '50+ curated trials, search/filter, financial cards'],
            ['Enrollment Pipeline', 'Complete', '5-stage Kanban, activity logging, conversion funnel'],
            ['Population Analytics', 'Complete', 'Feasibility, Monte Carlo forecasting, diversity, cohort builder'],
            ['AI Narrative Engine', 'Complete', '6 narrative types, auto-generated insights'],
            ['Statistical Engine', 'Complete', 'Monte Carlo, descriptive stats, correlation, anomaly detection'],
            ['LLM Integration', 'Complete', 'llama.cpp + Ollama, background queue, graceful degradation'],
            ['Settings & Config', 'Complete', 'LLM setup, database, watch folder, audit trail, preferences'],
            ['Security & Encryption', 'Complete', 'Passphrase, unlock flow, session timeout, audit trail'],
            ['Onboarding', 'Complete', 'Setup wizard, site profile, welcome overview, help system'],
            ['Export & Reporting', 'Complete', 'CSV, HTML/PDF, audit trail export'],
            ['UI / UX', 'Complete', '11 pages, dark/light mode, animations, keyboard shortcuts'],
            ['Testing', '85%', '217 passing tests, 90%+ coverage on core engines'],
            ['Windows Installer', 'Complete', 'NSIS .exe installer via GitHub Actions CI/CD'],
            ['macOS Installer', 'Complete', '.dmg for Apple Silicon (arm64) and Intel (x64)'],
        ],
        header_color="166534"  # Green header for completion table
    )

    # Footer
    doc.add_paragraph()
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('TalOS SiteConnect v0.1.0 \u2014 Confidential')
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('Built for the Talosix Site Network Strategy')
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('Get into the sites. Build the network. Own the supply side.')
    run.italic = True
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    # Save
    doc.save(OUTPUT)
    print(f'Document saved to {OUTPUT}')

if __name__ == '__main__':
    build_document()
