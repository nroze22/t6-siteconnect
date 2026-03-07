# HIPAA Preparatory to Research — Knowledge Reference

> Comprehensive guide to the HIPAA "preparatory to research" provision and its application to on-premises patient screening at clinical research sites using TalOS SiteConnect.

---

## 1. Legal Foundation: 45 CFR 164.512(i)(1)(ii)

The HIPAA Privacy Rule permits a covered entity to use or disclose protected health information (PHI) for research purposes **without** individual authorization when the use is solely **preparatory to research**. This provision is codified at 45 CFR 164.512(i)(1)(ii).

### Statutory Text (Paraphrased)

A covered entity may use or disclose PHI for research without individual authorization if the covered entity obtains from the researcher representations that:

1. The use or disclosure is sought solely to review PHI as necessary to prepare a research protocol or for similar purposes preparatory to research.
2. No PHI will be removed from the covered entity by the researcher in the course of the review.
3. The PHI for which use or access is sought is necessary for the research purposes.

---

## 2. The Three Required Representations

Any researcher (or site staff acting in a research capacity) seeking to use PHI under the preparatory-to-research provision must make three representations to the covered entity. These representations may be oral or written, though **written representations are strongly recommended** for compliance documentation.

### Representation 1: Purpose Is Solely Preparatory

> "The use or disclosure is sought solely to review PHI as necessary to prepare a research protocol or for similar purposes preparatory to research."

**What qualifies:**
- Determining feasibility of a clinical trial at a site
- Estimating the number of potentially eligible patients
- Identifying recruitment strategies based on patient population characteristics
- Screening medical records to assess whether a study can meet enrollment targets
- Reviewing aggregate patterns in diagnoses, lab values, or demographics

**What does NOT qualify:**
- Collecting data for a research dataset
- Building a registry or cohort for ongoing research analysis
- Any activity that constitutes the "research" itself rather than preparation for it

### Representation 2: No PHI Leaves the Covered Entity

> "No PHI will be removed from the covered entity by the researcher in the course of the review."

**Key implications:**
- PHI must stay within the covered entity's systems and physical/logical boundaries
- No copying PHI to external drives, cloud services, emails, or paper printouts that leave the site
- Aggregate counts and de-identified summaries CAN leave the site (they are not PHI)
- Screen captures or exports containing identifiable patient information must NOT leave the premises

**For SiteConnect:** Because the application runs entirely on-premises (local desktop application with local data processing), PHI never leaves the site's infrastructure. This is a core architectural decision that supports the preparatory-to-research provision.

### Representation 3: PHI Access Is Necessary

> "The PHI for which use or access is sought is necessary for the research purposes."

**This requires data minimization:**
- Only access the minimum data elements needed for the screening task
- If age and diagnosis are sufficient for eligibility screening, do not access unrelated PHI (e.g., psychiatric notes, HIV status)
- Document which data fields are accessed and why they map to protocol eligibility criteria

---

## 3. What Sites Can Do Without Individual Authorization

Under the preparatory-to-research provision, clinical research sites can:

| Activity | Permitted? | Notes |
|----------|-----------|-------|
| Query EMR for patients matching age/diagnosis criteria | Yes | Core feasibility screening |
| Count potentially eligible patients for a sponsor query | Yes | Aggregate counts are typical output |
| Review lab values against protocol thresholds | Yes | Part of eligibility assessment |
| Check medication history for inclusion/exclusion | Yes | Necessary for screening |
| Generate de-identified feasibility reports | Yes | De-identified data is not PHI |
| Screen patient charts before approaching for consent | Yes | Standard pre-screening workflow |
| Create internal lists of potentially eligible MRNs for CRC follow-up | Yes | Must stay internal to the site |
| Send patient-level PHI to the sponsor | **No** | Requires authorization or waiver |
| Upload PHI to a cloud-based screening tool | **No** | PHI leaves the covered entity |
| Share screening results with external CROs containing PHI | **No** | PHI leaves the covered entity |
| Retain research screening data indefinitely | **No** | Purpose must remain preparatory |

---

## 4. How On-Premises Patient Screening Qualifies

TalOS SiteConnect is specifically architected to operate within the preparatory-to-research provision:

### Workforce Members Screening Internal Data

- **Who performs screening:** Site workforce members (CRCs, research nurses, investigators) who already have access to patient data under HIPAA's minimum necessary standard for treatment, payment, or healthcare operations.
- **Where data lives:** Patient data is imported from the site's own EMR system into SiteConnect's local encrypted database. Data never leaves the site's network or physical premises.
- **What happens:** Workforce members use SiteConnect to efficiently query and filter their own patient population against protocol eligibility criteria -- the same activity they would perform manually by reviewing charts.

### No PHI Export

- SiteConnect processes all data locally on the site's hardware
- The local LLM (llama.cpp sidecar) runs on the same machine -- no cloud AI calls with PHI
- Output reports contain only aggregate counts and de-identified summaries
- Patient-level match lists remain within the application and the site's infrastructure
- No network transmission of PHI occurs at any point

### Architectural Alignment with HIPAA

```
+-----------------------------------------------------------+
|                    SITE PREMISES                           |
|                                                            |
|  +----------+     +--------------------+     +----------+  |
|  |   EMR    |---->| TalOS SiteConnect  |---->| Aggregate|  |
|  | (Epic,   |     | (Local Desktop)    |     | Reports  |  |
|  |  Cerner) |     | - Encrypted DB     |     | (No PHI) |  |
|  +----------+     | - Local LLM        |     +----------+  |
|                   | - Rule Engine      |                   |
|                   +--------------------+                   |
|                                                            |
|  <-- PHI boundary: nothing crosses this line -->           |
+-----------------------------------------------------------+
```

---

## 5. Data Minimization Principles

The Privacy Rule's minimum necessary standard (45 CFR 164.502(b)) applies to all uses and disclosures for research, including preparatory activities.

### Implementation in SiteConnect

1. **Field-level access control:** Only import EMR fields that map to protocol eligibility criteria. If a protocol only requires age, diagnosis, and eGFR, do not import psychiatric notes or social history.

2. **Purpose limitation:** Data imported for Study A screening should not be repurposed for Study B screening without a separate preparatory-to-research determination.

3. **Temporal limitation:** Screening data should be purged or archived once the preparatory phase concludes and the study moves to active enrollment (at which point individual authorization or IRB waiver governs data use).

4. **Role-based access:** Within SiteConnect, only authorized research staff should access screening results. Administrative or IT staff who configure the system should not have access to PHI-level screening data.

5. **Audit logging:** All access to PHI within SiteConnect is logged locally for compliance review, including which user accessed which data fields and when.

### Minimum Necessary Data Elements by Screening Phase

| Screening Phase | Data Elements Needed | Justification |
|----------------|---------------------|---------------|
| Feasibility (count only) | Diagnosis codes, age range, gender | Aggregate counts for sponsor queries |
| Pre-screening (identify candidates) | + Lab values, medications, vital signs | Match against inclusion/exclusion criteria |
| Chart review (detailed eligibility) | + Procedure history, clinical notes | Confirm eligibility before patient contact |

---

## 6. When Full HIPAA Authorization IS Required

The preparatory-to-research provision has clear boundaries. Full individual HIPAA authorization (or an IRB/Privacy Board waiver) is required when:

### Authorization Required

- **PHI leaves the covered entity:** Sending patient data to a sponsor, CRO, or central lab
- **Research use begins:** Once a patient is enrolled and data is collected for the study protocol
- **External sharing of any kind:** Uploading PHI to cloud platforms, emailing identifiable data, sharing with collaborating sites
- **Creation of a research database:** If screening data is retained and used as a research dataset beyond the preparatory phase
- **Publication or presentation:** Using any identifiable patient information in manuscripts or presentations
- **Biobanking or specimen collection:** Always requires authorization regardless of research phase

### Authorization NOT Required (But Other Provisions May Apply)

- **De-identified data (per 45 CFR 164.514):** Data that has been de-identified using Safe Harbor or Expert Determination methods is no longer PHI
- **Limited data sets with Data Use Agreement:** A middle ground that removes direct identifiers but retains dates and geographic information

---

## 7. IRB Waiver of Authorization -- 45 CFR 164.512(i)(2)

When the preparatory-to-research provision does not apply (e.g., research has begun, or PHI must leave the site), an IRB or Privacy Board may grant a waiver of HIPAA authorization if **all** of the following criteria are met:

### Waiver Criteria

1. **Minimal risk:** The use or disclosure of PHI involves no more than minimal risk to the privacy of individuals, based on:
   - An adequate plan to protect identifiers from improper use and disclosure
   - An adequate plan to destroy identifiers at the earliest opportunity (unless retention is justified)
   - Adequate written assurances that PHI will not be reused or disclosed except as required by law, for authorized oversight of the research, or for other research permitted by the Privacy Rule

2. **Impracticability:** The research could not practicably be conducted without the waiver

3. **Necessity:** The research could not practicably be conducted without access to and use of the PHI

### Relationship to SiteConnect

For most SiteConnect use cases, IRB waiver is **not needed** because:
- Screening is preparatory to research (not the research itself)
- PHI does not leave the site
- Site workforce members are accessing their own patient data

However, if a site wishes to use SiteConnect for more extensive chart review that goes beyond preparatory screening, or if aggregate results with small cell sizes could be re-identified, an IRB waiver may be appropriate as an additional safeguard.

---

## 8. Common Misconceptions About HIPAA and Research Screening

### Misconception 1: "All research use of PHI requires patient consent"

**Reality:** HIPAA provides multiple pathways for research use without individual authorization:
- Preparatory to research (45 CFR 164.512(i)(1)(ii))
- IRB/Privacy Board waiver of authorization (45 CFR 164.512(i)(2))
- De-identified data (45 CFR 164.514)
- Limited data sets with DUA (45 CFR 164.514(e))
- Decedent research (45 CFR 164.512(i)(1)(iii))

### Misconception 2: "IRB approval replaces HIPAA authorization"

**Reality:** HIPAA and the Common Rule are separate regulatory frameworks. IRB approval of a research protocol does not automatically satisfy HIPAA requirements. The IRB can grant a waiver of HIPAA authorization, but this is a separate determination with specific criteria.

### Misconception 3: "Looking at patient charts for screening is a HIPAA violation"

**Reality:** Site workforce members reviewing their own patients' records for research eligibility screening is a well-established permitted use under the preparatory-to-research provision. This is functionally equivalent to a physician reviewing their patient panel for a referral -- it uses existing access to internal data.

### Misconception 4: "Any use of technology for screening requires a BAA"

**Reality:** A Business Associate Agreement is required when a business associate creates, receives, maintains, or transmits PHI on behalf of a covered entity. SiteConnect runs locally on the site's own hardware -- no third party receives or transmits PHI. The software vendor (TalOS) never has access to PHI. A BAA is not required for locally-installed software that processes data without transmitting it externally, similar to a locally-installed word processor or spreadsheet application.

### Misconception 5: "De-identified counts are still PHI"

**Reality:** Aggregate counts (e.g., "47 patients meet the age and diagnosis criteria") are not PHI. They contain no individually identifiable information. However, small cell sizes (e.g., "1 patient with diagnosis X at site Y") could potentially enable re-identification and should be suppressed (cells < 5 or 10, per institutional policy).

### Misconception 6: "The preparatory-to-research exemption has no limits"

**Reality:** The provision is specifically limited to activities that are truly preparatory. It cannot be used as a blanket justification for ongoing research data access. Once the preparatory phase ends (protocol is finalized, enrollment begins), a different legal basis is needed for continued PHI access.

---

## 9. Practical Guidance for Sites Using SiteConnect

### Before Starting Screening

1. **Document the preparatory purpose:** Create a brief memo stating that SiteConnect screening is being used for preparatory-to-research activities (feasibility, pre-screening, recruitment planning).

2. **Complete the three representations:** Have the PI or designated researcher sign a preparatory-to-research attestation form covering the three required representations.

3. **Define data scope:** Document which EMR data fields will be imported and how they map to specific protocol eligibility criteria.

4. **Confirm workforce status:** Ensure all users of SiteConnect are workforce members of the covered entity with existing access to the EMR data being screened.

### During Screening

5. **Limit access:** Only grant SiteConnect access to staff directly involved in the research screening activity.

6. **No external sharing of PHI:** Provide only aggregate counts and de-identified summaries to sponsors and CROs. Never export patient-level PHI from SiteConnect.

7. **Maintain audit logs:** SiteConnect automatically logs all data access. Retain these logs per institutional policy (typically 6 years under HIPAA).

8. **Apply small cell suppression:** When generating feasibility reports, suppress any cell counts below 5 (or per institutional policy) to prevent potential re-identification.

### After Screening

9. **Transition to appropriate authorization:** When moving from screening to enrollment, ensure HIPAA authorization or IRB waiver is in place before using PHI for research purposes.

10. **Data retention/purge:** Follow institutional data retention policies. Consider purging imported EMR data from SiteConnect once the preparatory phase concludes, unless ongoing screening is needed for the study's enrollment period.

### Institutional Documentation Template

Sites should maintain the following documentation:

```
PREPARATORY TO RESEARCH ATTESTATION

Study: [Protocol Number / Title]
Principal Investigator: [Name]
Date: [Date]

I represent that:

1. The use of protected health information through TalOS SiteConnect
   is sought solely to review PHI as necessary to prepare for the
   above-referenced research study, including but not limited to
   feasibility assessment and patient pre-screening.

2. No PHI will be removed from [Institution Name] in the course of
   this review. All data processing occurs locally on institutional
   hardware. Only aggregate, de-identified results will be shared
   externally.

3. The PHI for which access is sought is necessary for the research
   screening purposes. Specifically, the following data elements are
   needed: [list fields and map to eligibility criteria].

Signature: ________________________
Date: ____________________________
```

---

## 10. Key Distinction: Screening/Feasibility vs. Research Use of PHI

This is the most critical distinction for SiteConnect users to understand.

### Preparatory Activities (No Authorization Needed)

| Activity | Nature | Output |
|----------|--------|--------|
| "How many patients at our site have NSCLC?" | Feasibility query | Aggregate count |
| "Which patients might be eligible for Protocol XYZ?" | Pre-screening | Internal candidate list |
| "Do we have enough patients to meet enrollment targets?" | Site selection support | Yes/No + count |
| "What are the demographic characteristics of our eligible population?" | Recruitment planning | De-identified summary statistics |

### Research Activities (Authorization or Waiver Needed)

| Activity | Nature | Trigger |
|----------|--------|---------|
| Recording screening results in a study database | Data collection | Research has begun |
| Sharing a patient's labs with the sponsor for eligibility confirmation | PHI disclosure | PHI leaves site |
| Creating a screening log with patient identifiers for the study file | Research documentation | Part of the study record |
| Contacting patients based on screening results | Recruitment action | Research activity (though this may fall under healthcare operations depending on the relationship) |

### The SiteConnect Boundary

SiteConnect is designed to operate exclusively in the **preparatory** space:

- It helps site staff **identify** potentially eligible patients (preparatory)
- It does **not** enroll patients, collect research data, or transmit PHI (research)
- Once a candidate is identified, the CRC transitions to standard recruitment workflows that operate under their own HIPAA legal basis (authorization, waiver, or treatment relationship)

---

## References

- 45 CFR 164.512(i) -- Uses and disclosures for research purposes
- 45 CFR 164.514 -- Other requirements relating to uses and disclosures of PHI (de-identification)
- 45 CFR 164.502(b) -- Minimum necessary standard
- HHS Guidance: Research (https://www.hhs.gov/hipaa/for-professionals/special-topics/research/index.html)
- NIH: Protecting Personal Health Information in Research (https://privacyruleandresearch.nih.gov/)
- OHRP: HIPAA Privacy Rule Booklet (https://www.hhs.gov/ohrp/regulations-and-policy/guidance/research-involving-coded-private-information/index.html)
