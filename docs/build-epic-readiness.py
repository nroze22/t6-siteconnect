#!/usr/bin/env python3
"""Build the Epic Integration Readiness & Certification Guide .docx."""

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml
import os

OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'TalOS_SiteConnect_Epic_Readiness.docx')

def set_cell_shading(cell, color):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def add_styled_table(doc, headers, rows, col_widths=None, header_color="4338CA"):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = 'Table Grid'
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = header
        for p in cell.paragraphs:
            for run in p.runs:
                run.font.bold = True
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        set_cell_shading(cell, header_color)
    for ri, row_data in enumerate(rows):
        for ci, val in enumerate(row_data):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = str(val)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(9)
            if ri % 2 == 1:
                set_cell_shading(cell, "F5F3FF")
    if col_widths:
        for ri in range(len(table.rows)):
            for ci, w in enumerate(col_widths):
                table.rows[ri].cells[ci].width = Cm(w)
    return table

def heading(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x1E, 0x1B, 0x4B)
    return h

def body(doc, text):
    p = doc.add_paragraph(text)
    p.style.font.size = Pt(10)
    return p

def bullet(doc, text, level=0):
    p = doc.add_paragraph(text, style='List Bullet')
    p.paragraph_format.left_indent = Cm(1.5 + level * 1.0)
    for run in p.runs:
        run.font.size = Pt(10)
    return p

def build():
    doc = Document()

    # --- Styles ---
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10)
    style.font.color.rgb = RGBColor(0x1F, 0x20, 0x37)

    sections = doc.sections
    for section in sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    # =====================================================================
    # TITLE PAGE
    # =====================================================================
    for _ in range(6):
        doc.add_paragraph()
    tp = doc.add_paragraph()
    tp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = tp.add_run('TalOS SiteConnect')
    run.font.size = Pt(28)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0x4F, 0x46, 0xE5)

    tp2 = doc.add_paragraph()
    tp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run2 = tp2.add_run('Epic Integration Readiness\n& Certification Guide')
    run2.font.size = Pt(18)
    run2.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    doc.add_paragraph()
    tp3 = doc.add_paragraph()
    tp3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run3 = tp3.add_run('Prepared by Talosix  •  April 2026  •  Confidential')
    run3.font.size = Pt(10)
    run3.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    run3.font.italic = True

    doc.add_page_break()

    # =====================================================================
    # EXECUTIVE SUMMARY
    # =====================================================================
    heading(doc, 'Executive Summary')
    body(doc, (
        'TalOS SiteConnect is an on-premise desktop application that enables clinical research sites '
        'to screen their patient population against active clinical trial eligibility criteria. The app '
        'runs entirely on the site\'s hardware — patient data never leaves the device. It is built with '
        'Tauri v2 (Rust), React 19, SQLCipher (AES-256 encryption at rest), and local LLM inference.'
    ))
    body(doc, (
        'This document outlines the current state of Epic / FHIR integration, what remains to reach '
        'production readiness, the Epic Vendor Services certification process, estimated costs, and a '
        'recommended timeline to production.'
    ))

    # =====================================================================
    # WHAT'S BUILT
    # =====================================================================
    heading(doc, 'What\'s Built Today')
    body(doc, 'The following Epic integration capabilities have been implemented and tested:')

    add_styled_table(doc,
        ['Capability', 'Status'],
        [
            ['Per-site FHIR connection profiles (CRUD + encrypted schema)', 'Complete'],
            ['SMART discovery (.well-known/smart-configuration)', 'Complete'],
            ['SMART Standalone Launch + PKCE (browser OAuth)', 'Complete'],
            ['SMART Backend Services (P-256 JWKS + JWT client_credentials)', 'Complete'],
            ['Token refresh (refresh_token grant)', 'Complete'],
            ['FHIR R4 client (metadata, read, search, retry on transient errors)', 'Complete'],
            ['Bulk Data $export (system / patient / group scope)', 'Complete'],
            ['Incremental _since delta exports', 'Complete'],
            ['NDJSON streaming parser (no full-file memory buffering)', 'Complete'],
            ['FHIR → SQLite normalizer (Patient, Condition, MedicationRequest, Observation)', 'Complete'],
            ['OS keychain token + signing key storage (ZeroizeOnDrop)', 'Complete'],
            ['Per-install P-256 keypair generation + JWKS export', 'Complete'],
            ['Cohort Pull Dialog with live progress events', 'Complete'],
            ['Settings UI for all connection management', 'Complete'],
            ['Audit trail for every Epic API operation', 'Complete'],
        ],
        col_widths=[12, 3]
    )
    body(doc, 'Verified: 106 Rust unit tests passing, TypeScript clean compilation, tested against fhir.epic.com public sandbox.')

    # =====================================================================
    # REMAINING WORK
    # =====================================================================
    doc.add_page_break()
    heading(doc, 'Remaining Engineering Work')

    heading(doc, 'Must-Have for Certification (~3-4 weeks)', level=2)
    add_styled_table(doc,
        ['#', 'Work Item', 'Why', 'Effort'],
        [
            ['1', 'Epic-flavored FHIR normalizer', 'Real Epic instances return non-standard extensions, custom value sets, and Epic-specific CodeSystem URIs that the sandbox doesn\'t.', 'M'],
            ['2', 'Patient identity reconciliation', 'Deduplicate when the same patient exists from both CSV import and FHIR pull. Match on MRN, not name.', 'M'],
            ['3', 'Token expiry UX', 'Surface "session expired, reconnect" clearly. Auto-reconnect for backend services flows.', 'S'],
            ['4', 'Error handling hardening', 'Network timeouts, partial export failures, Epic rate limiting (429 + Retry-After). Resumable cohort pulls.', 'M'],
            ['5', 'FHIR conformance testing', 'End-to-end validation against fhir.epic.com, document which resources/scopes work, characterize sandbox-vs-prod gaps.', 'S'],
            ['6', 'Security questionnaire prep', 'Pre-draft answers for Epic\'s standardized security review covering encryption, auth, audit, and vulnerability mgmt.', 'S'],
            ['7', 'AllergyIntolerance + Procedure normalizer', 'Screening criteria frequently reference "no prior surgery" or "no known allergies" — need these resource types.', 'S'],
        ],
        col_widths=[1, 4, 8, 1.5]
    )

    heading(doc, 'Should-Have Before First Customer (~2 weeks)', level=2)
    add_styled_table(doc,
        ['#', 'Work Item', 'Effort'],
        [
            ['8', 'Group selection UI — browse available Groups before $export', 'S'],
            ['9', 'Cohort pull shortcut from Screening Mode', 'S'],
            ['10', 'Connection health dashboard — token expiry countdown, sync history, error log', 'M'],
            ['11', 'Automatic scheduled pulls — "sync every 6 hours" background task', 'M'],
            ['12', 'Export audit report generator — one-click PDF for site compliance officers', 'S'],
        ],
        col_widths=[1, 10, 2]
    )

    heading(doc, 'Nice-to-Have (Post-Launch)', level=2)
    add_styled_table(doc,
        ['#', 'Work Item', 'Effort'],
        [
            ['13', 'CDS Hooks integration (eligibility alerts inside Epic Hyperspace)', 'L'],
            ['14', 'Multi-site dashboard (for SMO networks managing 10+ sites)', 'L'],
            ['15', 'FHIR $everything for single-patient deep drill', 'S'],
            ['16', 'Genomics resources (MolecularSequence, DiagnosticReport)', 'M'],
        ],
        col_widths=[1, 10, 2]
    )

    # =====================================================================
    # CERTIFICATION PROCESS
    # =====================================================================
    doc.add_page_break()
    heading(doc, 'Epic Certification Process')

    heading(doc, 'Program Landscape', level=2)
    body(doc, (
        'Epic sunset the "App Orchard" brand in 2022 and replaced it with a set of programs. '
        'As of 2025/2026 the relevant pieces are:'
    ))
    add_styled_table(doc,
        ['Program', 'What It Is', 'Cost', 'When Needed'],
        [
            ['Open.Epic\n(open.epic.com)', 'Free developer portal + public FHIR sandbox at fhir.epic.com', 'Free', 'Phase 1 — all development work'],
            ['Vendor Services\n(vendorservices.epic.com)', 'Paid program granting production client_ids that customer sites can authorize', 'Annual fee\n(low 5 figures USD/yr)', 'First paying customer wants production access'],
            ['Showroom', 'Epic\'s marketplace catalog where customers discover third-party apps', 'Requires\nVendor Services', 'When you want sites to find you via Epic\'s catalog'],
        ],
        col_widths=[3.5, 5, 2.5, 3.5]
    )
    body(doc, 'You do NOT need Vendor Services to develop. You need it the moment a paying site wants to point the app at their production Epic.')

    heading(doc, 'Three Gates to Production', level=2)

    heading(doc, 'Gate 1: Open.Epic Sandbox (Free, Immediate)', level=3)
    bullet(doc, 'Cost: $0')
    bullet(doc, 'Build and test against fhir.epic.com public sandbox with synthetic patients')
    bullet(doc, 'Non-production client_id, no contract')
    bullet(doc, 'Status: SiteConnect can demo end-to-end today against this sandbox')

    heading(doc, 'Gate 2: Friendly Pilot Site (Free, 2-8 Weeks)', level=3)
    bullet(doc, 'Cost: $0 (just the relationship + site IT\'s time)')
    bullet(doc, 'Find one Epic customer willing to register the app in their non-production Epic')
    bullet(doc, 'Site\'s Epic admin registers: app name, client_id, redirect URI(s), JWKS public key, scopes')
    bullet(doc, 'Critical because sandbox ≠ production — you will discover 5-10 things that break')
    bullet(doc, 'Finding the pilot site is the bottleneck; the technical registration takes 30 minutes')

    heading(doc, 'Gate 3: Epic Vendor Services (Paid, 2-6 Months)', level=3)
    body(doc, 'This is the gate for production access at any customer site. The process:')

    bullet(doc, 'Application — vendor intake form with company info, product description, architecture overview')
    bullet(doc, 'Security review — standardized questionnaire covering PHI storage, authentication, audit logging, vulnerability management')
    bullet(doc, 'Technical review — demonstrate OAuth flow, scope usage, error handling, token management')
    bullet(doc, 'Agreement — sign Epic\'s vendor agreement')
    bullet(doc, 'Listing (optional) — publish in Showroom marketplace')

    # =====================================================================
    # COSTS
    # =====================================================================
    doc.add_page_break()
    heading(doc, 'Estimated Costs')

    add_styled_table(doc,
        ['Item', 'Estimate', 'Notes'],
        [
            ['Vendor Services annual membership', '$15,000 – $25,000/yr', 'Verify with Epic — pricing not published. Varies by tier.'],
            ['Legal review of vendor agreement', '$5,000 – $15,000', 'Your counsel reviewing Epic\'s terms'],
            ['SOC 2 Type II (if required)', '$30,000 – $80,000', 'May be waived for on-premise-only apps that never transmit PHI'],
            ['Penetration testing (if required)', '$10,000 – $25,000', 'Annual. Some sites require independent reports.'],
            ['Total Year-1 cost', '$25,000 – $100,000+', 'Wide range; SOC 2 is the big variable'],
        ],
        col_widths=[4, 3.5, 7]
    )

    heading(doc, 'SiteConnect\'s Structural Cost Advantages', level=2)
    body(doc, 'The on-premise architecture provides unusually strong leverage in the certification process:')
    bullet(doc, '"PHI never leaves the device" is the single best answer on the security questionnaire. Most vendors must explain cloud architecture, multi-tenant isolation, and encryption in transit. SiteConnect says: "There is no server."')
    bullet(doc, 'No BAA with Epic likely needed — SiteConnect doesn\'t receive or transmit PHI through any Talosix infrastructure. The site already has a BAA with Epic. Counsel should confirm.')
    bullet(doc, 'SOC 2 may not be required — if PHI never touches Talosix infrastructure, the typical SOC 2 requirement (covering vendor operational controls) may be waived or reduced to self-attestation.')
    bullet(doc, 'Audit trail is already built — every Epic operation, import, and screening logged locally with tamper-evident chaining. This is exactly what Epic\'s compliance team wants to see.')

    # =====================================================================
    # TIMELINE
    # =====================================================================
    heading(doc, 'Recommended Timeline')

    add_styled_table(doc,
        ['Week', 'Milestone'],
        [
            ['Now', 'Demo against fhir.epic.com sandbox internally'],
            ['Week 1-2', 'Epic normalizer, patient dedup, token expiry UX'],
            ['Week 3-4', 'Error hardening, conformance testing, security questionnaire draft'],
            ['Week 4', 'Start outreach for a friendly pilot site'],
            ['Week 5-8', 'Pilot site testing + fix everything that breaks'],
            ['Week 6', 'Submit Vendor Services application (can overlap with pilot)'],
            ['Week 8', 'Additional resource types, Group UI, screening shortcut'],
            ['Week 8-12', 'Respond to Epic\'s security questionnaire'],
            ['Week 12-20', 'Epic review queue'],
            ['Week 20+', 'Production-ready, first paying customer live on Epic'],
        ],
        col_widths=[3, 11]
    )

    body(doc, '')
    p = doc.add_paragraph()
    run = p.add_run('The critical path is finding the pilot site.')
    run.bold = True
    run.font.size = Pt(10)
    p.add_run(' Everything else is engineering time you control. The pilot is a relationship you have to cultivate. Start that conversation now — it takes longer than the code.')

    # =====================================================================
    # RISKS & GOTCHAS
    # =====================================================================
    doc.add_page_break()
    heading(doc, 'Risks & Gotchas')

    risks = [
        ('Epic version drift', 'Sites run different Epic versions (quarterly releases). FHIR resource shapes, supported scopes, and extensions vary. Build version detection and graceful degradation.'),
        ('Sandbox ≠ production', 'fhir.epic.com is intentionally simplified. Real instances have extensions, custom value sets, and version-specific quirks the sandbox does not. Plan a second pass after the first pilot.'),
        ('Per-site client_id sprawl', 'N sites = N client_ids, N JWK uploads, N scope sets. The per-site connection model is already built for this, but document the per-site registration workflow clearly for customer IT.'),
        ('Loopback redirect URI', 'Some Epic instances are strict about redirect URIs. Pre-register http://127.0.0.1:<known port>/callback and handle port conflicts.'),
        ('Refresh token lifetime', 'Epic refresh tokens expire in days for standalone flows. Backend services tokens are minutes but silently renewable. Plan re-auth UX.'),
        ('Bulk export timing', 'Large $export calls can take hours and may be rate-limited. Build progress UI and resumability.'),
        ('System browser for OAuth', 'Always use the system browser (never embedded webview) per RFC 8252 §8.12 — Epic may block embedded webviews.'),
        ('Time skew', 'JWT assertions fail if the desktop clock is off by more than ~60s. Detect and warn.'),
        ('Patient identity reconciliation', 'Patients pulled from Epic may collide with CSV imports. Dedupe by Epic FHIR Patient.id + site MRN, never by name+DOB alone.'),
    ]

    for title, desc in risks:
        p = doc.add_paragraph()
        run = p.add_run(f'{title}: ')
        run.bold = True
        run.font.size = Pt(10)
        p.add_run(desc).font.size = Pt(10)

    # =====================================================================
    # ARCHITECTURE DIAGRAM (text)
    # =====================================================================
    doc.add_page_break()
    heading(doc, 'Integration Architecture')

    body(doc, 'Data flow for an Epic cohort pull:')
    steps = [
        '1. User clicks "Pull cohort" in SiteConnect Settings → Data → Epic connections',
        '2. SiteConnect discovers the SMART configuration from the site\'s Epic FHIR endpoint',
        '3. For standalone auth: browser opens to Epic\'s authorize URL with PKCE challenge',
        '   For backend services: SiteConnect signs a JWT with its per-install P-256 key',
        '4. Tokens are stored in the OS keychain (macOS Keychain / Windows Credential Manager)',
        '5. SiteConnect kicks off a Bulk Data $export request with Prefer: respond-async',
        '6. Polls the status URL until the manifest is ready (exponential backoff, 1hr timeout)',
        '7. Downloads each NDJSON file, streaming line-by-line (no full-file memory buffering)',
        '8. Each FHIR resource is normalized into the local SQLCipher-encrypted database',
        '9. Patient, Condition, MedicationRequest, Observation → patients, diagnoses, medications, lab_results tables',
        '10. Audit log entry written with resource counts, timestamp, scopes used (no PHI in payload)',
        '11. Patients are immediately available in the screening workflow',
    ]
    for step in steps:
        bullet(doc, step)

    body(doc, '')
    p = doc.add_paragraph()
    run = p.add_run('Key security properties: ')
    run.bold = True
    run.font.size = Pt(10)
    p.add_run('PHI flows only between Epic\'s FHIR server and the local device. No Talosix server is involved. Tokens and signing keys are stored in the OS keychain, never in the database. The database itself is encrypted with SQLCipher (AES-256). All operations are logged to a tamper-evident audit trail.').font.size = Pt(10)

    # =====================================================================
    # FOOTER
    # =====================================================================
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('— End of Document —')
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
    run.font.italic = True

    doc.save(OUTPUT)
    print(f'Saved to {OUTPUT}')

if __name__ == '__main__':
    build()
