//! Custom study creation commands.
//!
//! Supports two flows:
//!   1. `parse_protocol_text` — takes raw text extracted from a protocol
//!      document (PDF/DOCX/TXT text extraction happens in the webview) and
//!      uses the local LLM to produce a structured `ParsedProtocol`.
//!   2. `create_custom_study` — persists a user-reviewed study + its
//!      inclusion/exclusion criteria to the encrypted database with
//!      `source = "custom"`.
//!
//! Parsed criteria are stored with `rule_type = "llm_required"` so the
//! existing screening pipeline can evaluate them via the LLM pathway
//! without any engine changes.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::llm::{LlmState, LlmStatus};
use crate::db::DbState;

/// Structured study metadata extracted from a protocol document.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ParsedProtocol {
    pub title: Option<String>,
    pub short_title: Option<String>,
    pub nct_number: Option<String>,
    pub sponsor: Option<String>,
    pub phase: Option<String>,
    pub therapeutic_area: Option<String>,
    pub indication: Option<String>,
    pub summary: Option<String>,
    pub inclusion_criteria: Vec<String>,
    pub exclusion_criteria: Vec<String>,
    /// Non-fatal warnings raised during parsing (e.g. truncated input).
    pub warnings: Vec<String>,
}

/// Input payload from the frontend's review-and-save step.
///
/// `*_structured_rules`, when provided, must be parallel to the corresponding
/// `*_criteria` array. Each entry is either a JSON-encoded `StructuredRule`
/// (which causes the criterion to be stored as `rule_type = "structured"`)
/// or `null` (which falls back to `rule_type = "llm_required"`).
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCustomStudyInput {
    pub title: String,
    pub short_title: Option<String>,
    pub nct_number: Option<String>,
    pub sponsor: String,
    pub phase: Option<String>,
    pub status: Option<String>,
    pub therapeutic_area: Option<String>,
    pub indication: Option<String>,
    pub summary: Option<String>,
    pub estimated_per_patient_value_cents: Option<i64>,
    pub estimated_site_startup_cents: Option<i64>,
    pub payment_model: Option<String>,
    pub inclusion_criteria: Vec<String>,
    pub exclusion_criteria: Vec<String>,
    #[serde(default)]
    pub inclusion_structured_rules: Option<Vec<Option<String>>>,
    #[serde(default)]
    pub exclusion_structured_rules: Option<Vec<Option<String>>>,
}

#[derive(Debug, Serialize)]
pub struct CreateCustomStudyResult {
    pub study_id: String,
    pub criteria_count: usize,
}

/// Maximum characters of protocol text sent to the LLM. Protocols beyond
/// this are truncated and a warning is surfaced in `ParsedProtocol.warnings`.
const MAX_PROTOCOL_CHARS: usize = 60_000;

fn build_protocol_prompt(text: &str) -> String {
    format!(
        r#"You are an expert clinical research assistant. Extract structured study metadata from the protocol text below.

Return JSON ONLY, matching this exact shape (use null for unknown string fields, empty arrays for unknown lists):

{{
  "title": string | null,
  "short_title": string | null,
  "nct_number": string | null,
  "sponsor": string | null,
  "phase": "Phase 1" | "Phase 2" | "Phase 3" | "Phase 4" | "Phase 1/2" | "Phase 2/3" | null,
  "therapeutic_area": string | null,
  "indication": string | null,
  "summary": string | null,
  "inclusion_criteria": string[],
  "exclusion_criteria": string[]
}}

Rules:
- inclusion_criteria and exclusion_criteria MUST be arrays of concise, atomic criterion strings (one criterion per array element, ~1 sentence each).
- Do not invent data. If a field is not present in the protocol, use null (or [] for arrays).
- summary should be 1-3 sentences describing the study's objective and intervention.
- Respond with the JSON object ONLY — no prose, no markdown, no code fences.

PROTOCOL TEXT:
{}
"#,
        text
    )
}

fn extract_json_object(raw: &str) -> Option<&str> {
    // Handle models that wrap JSON in ```json ... ``` fences or add prose.
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end > start {
        Some(&raw[start..=end])
    } else {
        None
    }
}

/// Call the local LLM via Ollama's `/v1/chat/completions` and return
/// the raw text content. Uses `json_object` response format so the
/// model is constrained to produce valid JSON.
async fn call_llm_for_json(
    app: &AppHandle,
    prompt: &str,
) -> Result<String, String> {
    let (port, model) = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state
            .0
            .lock()
            .map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status != LlmStatus::Running {
            return Err(
                "AI model is not running. Set up a model in Settings first.".to_string(),
            );
        }
        let model = lock.model.clone().ok_or("No Ollama model configured")?;
        (lock.port, model)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);
    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a clinical research data extraction assistant. Respond with JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }))
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    Ok(body
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|msg| msg.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("{}")
        .to_string())
}

/// Parse a protocol document into structured study metadata using the local LLM.
///
/// The webview is responsible for extracting plain text from PDF/DOCX/TXT
/// before calling this command.
#[tauri::command]
pub async fn parse_protocol_text(
    app: AppHandle,
    text: String,
) -> Result<ParsedProtocol, String> {
    if text.trim().is_empty() {
        return Err("Protocol text is empty.".to_string());
    }

    let mut warnings: Vec<String> = Vec::new();
    let trimmed = if text.chars().count() > MAX_PROTOCOL_CHARS {
        warnings.push(format!(
            "Protocol was truncated to {} characters for LLM parsing.",
            MAX_PROTOCOL_CHARS
        ));
        text.chars().take(MAX_PROTOCOL_CHARS).collect::<String>()
    } else {
        text
    };

    let prompt = build_protocol_prompt(&trimmed);
    let raw = call_llm_for_json(&app, &prompt).await?;

    let json_slice = extract_json_object(&raw).ok_or_else(|| {
        format!(
            "LLM response did not contain a JSON object. Raw response: {}",
            raw.chars().take(500).collect::<String>()
        )
    })?;

    let mut parsed: ParsedProtocol = serde_json::from_str(json_slice).map_err(|e| {
        format!(
            "Failed to parse LLM JSON: {} — response: {}",
            e,
            json_slice.chars().take(500).collect::<String>()
        )
    })?;

    // Trim whitespace and drop empty criterion strings that some models emit.
    parsed.inclusion_criteria = parsed
        .inclusion_criteria
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    parsed.exclusion_criteria = parsed
        .exclusion_criteria
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();

    parsed.warnings.extend(warnings);
    Ok(parsed)
}

/// Persist a user-reviewed custom study and its criteria to the database.
/// All criteria are stored with `rule_type = "llm_required"` so the
/// existing screening engine will evaluate them via the LLM pathway.
#[tauri::command]
pub fn create_custom_study(
    app: AppHandle,
    input: CreateCustomStudyInput,
) -> Result<CreateCustomStudyResult, String> {
    if input.title.trim().is_empty() {
        return Err("Study title is required.".to_string());
    }
    if input.sponsor.trim().is_empty() {
        return Err("Sponsor is required.".to_string());
    }

    let db_state = app.state::<DbState>();
    let lock = db_state
        .0
        .lock()
        .map_err(|e| format!("Lock poisoned: {}", e))?;
    let conn = lock
        .as_ref()
        .ok_or("Database not initialized. Please set up encryption first.")?
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;

    let study_id = uuid::Uuid::new_v4().to_string();
    let status = input.status.unwrap_or_else(|| "recruiting".to_string());
    let payment_model = input.payment_model.unwrap_or_else(|| "unknown".to_string());

    conn.execute_batch("BEGIN TRANSACTION")
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<usize, String> {
        conn.execute(
            "INSERT INTO studies (
                id, nct_number, title, short_title, sponsor, phase, status,
                therapeutic_area, indication, study_type, summary, source,
                last_synced, estimated_per_patient_value, estimated_site_startup,
                currency, payment_model, financial_details
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, 'interventional', ?10, 'custom',
                datetime('now'), ?11, ?12,
                'USD', ?13, NULL
             )",
            rusqlite::params![
                study_id,
                input.nct_number,
                input.title.trim(),
                input.short_title,
                input.sponsor.trim(),
                input.phase,
                status,
                input.therapeutic_area,
                input.indication,
                input.summary,
                input.estimated_per_patient_value_cents,
                input.estimated_site_startup_cents,
                payment_model,
            ],
        )
        .map_err(|e| format!("Failed to insert study: {}", e))?;

        let mut criteria_count = 0usize;
        insert_criteria(
            &conn,
            &study_id,
            "inclusion",
            &input.inclusion_criteria,
            input.inclusion_structured_rules.as_deref(),
            &mut criteria_count,
        )?;
        insert_criteria(
            &conn,
            &study_id,
            "exclusion",
            &input.exclusion_criteria,
            input.exclusion_structured_rules.as_deref(),
            &mut criteria_count,
        )?;

        // Audit trail entry so the action is traceable alongside other
        // sensitive operations.
        let _ = conn.execute(
            "INSERT INTO audit_log (id, action, details, timestamp)
             VALUES (?1, 'custom_study_created', ?2, datetime('now'))",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                format!("study_id={} criteria={}", study_id, criteria_count),
            ],
        );

        Ok(criteria_count)
    })();

    match result {
        Ok(criteria_count) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Failed to commit: {}", e))?;
            Ok(CreateCustomStudyResult {
                study_id,
                criteria_count,
            })
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// Insert a list of criteria with optional parallel structured rules.
/// Empty / whitespace-only criterion texts are skipped.
fn insert_criteria(
    conn: &rusqlite::Connection,
    study_id: &str,
    kind: &str,
    texts: &[String],
    rules: Option<&[Option<String>]>,
    counter: &mut usize,
) -> Result<(), String> {
    let mut number = 1i64;
    for (i, text) in texts.iter().enumerate() {
        let t = text.trim();
        if t.is_empty() {
            continue;
        }

        // A non-empty rule string flips this criterion to deterministic
        // evaluation; otherwise we fall back to the LLM screening pathway.
        let rule_json: Option<&str> = rules
            .and_then(|r| r.get(i))
            .and_then(|cell| cell.as_deref())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());

        let rule_type = if rule_json.is_some() {
            "structured"
        } else {
            "llm_required"
        };

        conn.execute(
            "INSERT INTO study_criteria (id, study_id, type, criterion_number, criterion_text, structured_rule, rule_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                study_id,
                kind,
                number,
                t,
                rule_json,
                rule_type,
            ],
        )
        .map_err(|e| format!("Failed to insert {} criterion: {}", kind, e))?;
        number += 1;
        *counter += 1;
    }
    Ok(())
}

// =============================================================================
// Structured rule inference
// =============================================================================

/// Per-criterion structured rule inference result.
#[derive(Debug, Clone, Serialize, Default)]
pub struct InferredRule {
    /// JSON-encoded `StructuredRule`, or `None` if the LLM could not
    /// confidently map this criterion to a deterministic rule.
    pub rule_json: Option<String>,
    /// Short, human-readable summary of what the rule does, suitable
    /// for displaying as a chip in the review UI (e.g. "Age ≥ 18").
    pub summary: Option<String>,
    /// 0.0–1.0 confidence the LLM emitted (best-effort, optional).
    #[serde(default)]
    pub confidence: f64,
}

#[derive(Debug, Deserialize)]
struct LlmRuleItem {
    #[serde(default)]
    rule: Option<serde_json::Value>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LlmRuleResponse {
    rules: Vec<LlmRuleItem>,
}

fn build_rule_inference_prompt(criteria: &[String]) -> String {
    // Number criteria 1..N so the model can return a parallel list.
    let listed = criteria
        .iter()
        .enumerate()
        .map(|(i, c)| format!("{}. {}", i + 1, c.trim()))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"You convert clinical trial eligibility criteria into deterministic structured rules.

For each numbered criterion below, return a JSON object describing whether it can be evaluated as one of these rule types. If a criterion is too complex, subjective, or relies on data we cannot model deterministically, set "rule" to null.

Supported rule shapes (use the EXACT "type" string):
- {{"type":"AgeRange","min":<int|null>,"max":<int|null>}}
- {{"type":"GenderIs","gender":"male"|"female"}}
- {{"type":"HasDiagnosis","icd10_prefix":"<ICD-10 prefix>","status":"active"}}
- {{"type":"NoDiagnosis","icd10_prefix":"<ICD-10 prefix>"}}
- {{"type":"HasMedication","drug_name_contains":"<lowercase substring>"}}
- {{"type":"NoMedication","drug_name_contains":"<lowercase substring>"}}
- {{"type":"LabValueRange","test_name":"<short name>","loinc_code":"<code|null>","min":<num|null>,"max":<num|null>,"lookback_days":90}}
- {{"type":"VitalRange","measurement_type":"<bp_systolic|bp_diastolic|heart_rate|weight_kg|height_cm|bmi|temp_c|spo2>","min":<num|null>,"max":<num|null>}}
- {{"type":"And","rules":[<rule>,<rule>...]}}
- {{"type":"Or","rules":[<rule>,<rule>...]}}

Rules:
- Return JSON ONLY in this exact shape: {{"rules":[{{"rule":<rule|null>,"summary":"short label","confidence":0.0-1.0}}, ...]}}
- The "rules" array MUST have exactly {n} entries, in the same order as the numbered criteria.
- "summary" is a 1-6 word human label like "Age ≥ 18" or "ECOG 0-1" — leave empty string if rule is null.
- DO NOT invent ICD codes you are not sure about. Prefer null over guessing.
- DO NOT wrap the JSON in markdown code fences.
- If a criterion mentions ECOG, performance status, prior therapy, response criteria, washout periods, or anything subjective, return null — those need LLM evaluation.

CRITERIA:
{criteria}
"#,
        n = criteria.len(),
        criteria = listed,
    )
}

/// Ask the local LLM to infer structured rules for a list of criterion strings.
/// Returns a vector parallel to the input — each entry is either a JSON-encoded
/// `StructuredRule` (with a short human summary) or empty.
#[tauri::command]
pub async fn infer_structured_rules(
    app: AppHandle,
    criteria: Vec<String>,
) -> Result<Vec<InferredRule>, String> {
    if criteria.is_empty() {
        return Ok(Vec::new());
    }

    let prompt = build_rule_inference_prompt(&criteria);
    let raw = call_llm_for_json(&app, &prompt).await?;
    let json_slice = extract_json_object(&raw).ok_or_else(|| {
        format!(
            "LLM rule-inference response did not contain JSON: {}",
            raw.chars().take(400).collect::<String>()
        )
    })?;

    let parsed: LlmRuleResponse = serde_json::from_str(json_slice).map_err(|e| {
        format!(
            "Failed to parse rule-inference JSON: {} — response: {}",
            e,
            json_slice.chars().take(400).collect::<String>()
        )
    })?;

    // Pad / truncate to match input length so the frontend can rely on
    // a strict 1:1 alignment with its criterion list.
    let mut out: Vec<InferredRule> = Vec::with_capacity(criteria.len());
    for i in 0..criteria.len() {
        let item = parsed.rules.get(i);
        let inferred = match item {
            Some(item) => {
                // Validate by round-tripping through serde so we never
                // store something the screening engine can't deserialize.
                let rule_json = item
                    .rule
                    .as_ref()
                    .filter(|v| !v.is_null())
                    .and_then(|v| {
                        let json = v.to_string();
                        match serde_json::from_str::<crate::screening::rules::StructuredRule>(&json) {
                            Ok(_) => Some(json),
                            Err(err) => {
                                tracing::warn!(
                                    "Discarding invalid inferred rule for criterion {}: {}",
                                    i + 1,
                                    err
                                );
                                None
                            }
                        }
                    });
                InferredRule {
                    rule_json,
                    summary: item.summary.clone().filter(|s| !s.trim().is_empty()),
                    confidence: item.confidence.unwrap_or(0.0).clamp(0.0, 1.0),
                }
            }
            None => InferredRule::default(),
        };
        out.push(inferred);
    }

    Ok(out)
}
