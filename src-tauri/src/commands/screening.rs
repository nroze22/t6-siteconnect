use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::db::DbState;
use crate::db::audit::{write_audit_entry, AuditAction};
use crate::screening::engine::ScreeningEngine;
use crate::screening::rules::PatientData;
use crate::commands::llm::{LlmState, LlmStatus, evaluate_criterion};

/// Tauri commands for the screening engine.
/// Wired to the real ScreeningEngine and database.

#[derive(Serialize)]
pub struct ScreeningResultResponse {
    pub screening_id: String,
    pub patient_id: String,
    pub study_id: String,
    pub site_patient_id: String,
    pub age: Option<u32>,
    pub gender: Option<String>,
    pub primary_diagnosis: Option<String>,
    pub overall_status: String,
    pub score: f64,
    pub inclusion_met: u32,
    pub inclusion_total: u32,
    pub exclusion_triggered: u32,
    pub exclusion_total: u32,
    pub missing_data_count: u32,
}

#[derive(Serialize)]
pub struct CriterionResultResponse {
    pub criterion_id: String,
    pub criterion_type: String,
    pub criterion_text: String,
    pub result: String,
    pub evidence: Option<String>,
    pub evidence_source: Option<String>,
    pub confidence: f64,
    pub ai_determined: bool,
}

#[derive(Deserialize)]
pub struct ScreenRequest {
    pub study_id: String,
    pub patient_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct OverrideRequest {
    pub screening_result_id: String,
    pub criterion_id: String,
    pub new_result: String,
    pub justification: String,
}

#[tauri::command]
pub async fn screen_patients(app: AppHandle, request: ScreenRequest) -> Result<Vec<ScreeningResultResponse>, String> {
    // Phase 1: Run rule-based screening synchronously (database access)
    let mut results = {
        let db_state = app.state::<DbState>();
        let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        let pool = lock.as_ref().ok_or("Database not initialized")?;
        let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

        tracing::info!("Screening patients for study {}", request.study_id);

        let results = ScreeningEngine::screen_all_patients(&conn, &request.study_id)?;

        // If specific patient_ids were requested, filter to those
        if let Some(ref ids) = request.patient_ids {
            results.into_iter().filter(|r| ids.contains(&r.patient_id)).collect()
        } else {
            results
        }
    };

    // Phase 2: LLM post-processing for "needs_review" criteria
    let llm_info = {
        let llm_state = app.state::<LlmState>();
        let lock = llm_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        if lock.status == LlmStatus::Running {
            Some((lock.port, lock.backend.clone(), lock.ollama_model.clone()))
        } else {
            None
        }
    };

    if let Some((port, backend, ollama_model)) = llm_info {
        let mut llm_attempted = 0u32;
        let mut llm_resolved = 0u32;

        // Pre-load full patient data for each patient (for rich LLM context)
        let patient_data_map: std::collections::HashMap<String, PatientData> = {
            let db_state = app.state::<DbState>();
            let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
            let pool = lock.as_ref().ok_or("Database not initialized")?;
            let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

            let mut map = std::collections::HashMap::new();
            for result in &results {
                if result.criteria_results.iter().any(|c| c.result == "needs_review") {
                    if let Ok(pd) = ScreeningEngine::load_patient_data(&conn, &result.patient_id) {
                        map.insert(result.patient_id.clone(), pd);
                    }
                }
            }
            map
        };

        for result in &mut results {
            // Build rich patient context from full clinical data
            let patient_context = if let Some(pd) = patient_data_map.get(&result.patient_id) {
                build_patient_context_from_data(pd)
            } else {
                build_patient_context_fallback(result)
            };

            for criterion in &mut result.criteria_results {
                if criterion.result != "needs_review" {
                    continue;
                }

                llm_attempted += 1;

                match evaluate_criterion(port, &criterion.criterion_text, &criterion.criterion_type, &patient_context, &backend, ollama_model.as_deref()).await {
                    Ok(eval) => {
                        criterion.result = eval.result;
                        criterion.confidence = eval.confidence;
                        criterion.evidence = Some(eval.reasoning);
                        criterion.evidence_source = if eval.evidence_extracted.is_empty() {
                            None
                        } else {
                            Some(eval.evidence_extracted.join("; "))
                        };
                        criterion.ai_determined = true;
                        llm_resolved += 1;
                    }
                    Err(_) => {
                        // Graceful degradation: leave as needs_review
                        criterion.evidence = Some("LLM evaluation attempted but failed".to_string());
                    }
                }
            }

            // Recompute counters after LLM evaluation
            recompute_patient_result(result);
        }

        // Re-sort by score descending after LLM adjustments
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        tracing::info!(
            "LLM evaluation attempted for {} criteria, resolved {}",
            llm_attempted, llm_resolved
        );
    }

    // Map engine results to response structs
    let responses: Vec<ScreeningResultResponse> = results
        .into_iter()
        .map(|r| ScreeningResultResponse {
            screening_id: r.screening_id,
            patient_id: r.patient_id,
            study_id: r.study_id,
            site_patient_id: r.site_patient_id,
            age: r.age,
            gender: r.gender,
            primary_diagnosis: r.primary_diagnosis,
            overall_status: r.overall_status,
            score: r.score,
            inclusion_met: r.inclusion_met,
            inclusion_total: r.inclusion_total,
            exclusion_triggered: r.exclusion_triggered,
            exclusion_total: r.exclusion_total,
            missing_data_count: r.missing_data_count,
        })
        .collect();

    Ok(responses)
}

/// Build rich patient context from full clinical data for LLM evaluation.
/// Includes all diagnoses, medications, labs, and vitals.
/// Does NOT log the output (PHI).
/// Truncates to ~3000 chars to stay within small model context windows.
fn build_patient_context_from_data(patient: &PatientData) -> String {
    let mut ctx = String::new();
    const MAX_CHARS: usize = 3000;

    // Demographics
    ctx.push_str("DEMOGRAPHICS:\n");
    if let Some(age) = patient.age {
        ctx.push_str(&format!("  Age: {}\n", age));
    }
    if let Some(ref gender) = patient.gender {
        ctx.push_str(&format!("  Gender: {}\n", gender));
    }

    // Diagnoses
    if !patient.diagnoses.is_empty() {
        ctx.push_str("\nDIAGNOSES:\n");
        for dx in &patient.diagnoses {
            let code = dx.icd10_code.as_deref().unwrap_or("—");
            ctx.push_str(&format!("  - {} [{}] ({})\n", dx.description, code, dx.status));
            if ctx.len() > MAX_CHARS { break; }
        }
    }

    // Medications
    if !patient.medications.is_empty() && ctx.len() < MAX_CHARS {
        ctx.push_str("\nMEDICATIONS:\n");
        for med in &patient.medications {
            ctx.push_str(&format!("  - {} ({})\n", med.drug_name, med.status));
            if ctx.len() > MAX_CHARS { break; }
        }
    }

    // Labs (most recent first, so sort by date descending)
    if !patient.labs.is_empty() && ctx.len() < MAX_CHARS {
        ctx.push_str("\nLAB RESULTS:\n");
        let mut labs_sorted: Vec<_> = patient.labs.iter().collect();
        labs_sorted.sort_by(|a, b| b.result_date.cmp(&a.result_date));
        for lab in labs_sorted {
            let val = lab.value.map(|v| format!("{}", v)).unwrap_or_else(|| "—".to_string());
            let unit = lab.unit.as_deref().unwrap_or("");
            let date = lab.result_date.as_deref().unwrap_or("unknown date");
            let range = lab.reference_range.as_deref().map(|r| format!(" [ref: {}]", r)).unwrap_or_default();
            ctx.push_str(&format!("  - {}: {} {}{} ({})\n", lab.test_name, val, unit, range, date));
            if ctx.len() > MAX_CHARS { break; }
        }
    }

    // Vitals
    if !patient.vitals.is_empty() && ctx.len() < MAX_CHARS {
        ctx.push_str("\nVITALS:\n");
        let mut vitals_sorted: Vec<_> = patient.vitals.iter().collect();
        vitals_sorted.sort_by(|a, b| b.measurement_date.cmp(&a.measurement_date));
        for vital in vitals_sorted {
            let date = vital.measurement_date.as_deref().unwrap_or("unknown date");
            ctx.push_str(&format!("  - {}: {} {} ({})\n", vital.measurement_type, vital.value, vital.unit, date));
            if ctx.len() > MAX_CHARS { break; }
        }
    }

    // Hard truncate if somehow still over limit
    if ctx.len() > MAX_CHARS + 200 {
        ctx.truncate(MAX_CHARS);
        ctx.push_str("\n[... truncated]");
    }

    ctx
}

/// Fallback context builder using only data from the screening result (no DB access).
fn build_patient_context_fallback(result: &crate::screening::engine::PatientScreeningResult) -> String {
    let mut ctx = String::new();

    ctx.push_str("DEMOGRAPHICS:\n");
    if let Some(age) = result.age {
        ctx.push_str(&format!("  Age: {}\n", age));
    }
    if let Some(ref gender) = result.gender {
        ctx.push_str(&format!("  Gender: {}\n", gender));
    }
    if let Some(ref dx) = result.primary_diagnosis {
        ctx.push_str(&format!("\nDIAGNOSES:\n  - {} (active)\n", dx));
    }

    // Include already-evaluated criteria as supplemental context
    ctx.push_str("\nPRIOR EVALUATIONS:\n");
    for cr in &result.criteria_results {
        if cr.result != "needs_review" {
            ctx.push_str(&format!("  - {}: {}", cr.criterion_text, cr.result));
            if let Some(ref ev) = cr.evidence {
                ctx.push_str(&format!(" [{}]", ev));
            }
            ctx.push('\n');
        }
    }

    ctx
}

/// Recompute counters and status after LLM post-processing modifies criterion results.
fn recompute_patient_result(result: &mut crate::screening::engine::PatientScreeningResult) {
    let mut inclusion_met = 0u32;
    let mut inclusion_total = 0u32;
    let mut exclusion_triggered = 0u32;
    let mut exclusion_total = 0u32;
    let mut missing_data_count = 0u32;

    for cr in &result.criteria_results {
        let is_inclusion = cr.criterion_type == "inclusion";
        if is_inclusion {
            inclusion_total += 1;
        } else {
            exclusion_total += 1;
        }

        match cr.result.as_str() {
            "met" if is_inclusion => inclusion_met += 1,
            "met" if !is_inclusion => exclusion_triggered += 1,
            "unknown" | "needs_review" => missing_data_count += 1,
            _ => {}
        }
    }

    result.inclusion_met = inclusion_met;
    result.inclusion_total = inclusion_total;
    result.exclusion_triggered = exclusion_triggered;
    result.exclusion_total = exclusion_total;
    result.missing_data_count = missing_data_count;

    // Recompute status and score using same logic as the engine
    if exclusion_triggered > 0 {
        let score = if inclusion_total > 0 {
            (inclusion_met as f64 / inclusion_total as f64) * 30.0
        } else {
            0.0
        };
        result.overall_status = "ineligible".to_string();
        result.score = score;
        return;
    }

    let inclusion_ratio = if inclusion_total > 0 {
        inclusion_met as f64 / inclusion_total as f64
    } else {
        1.0
    };

    let total_criteria = inclusion_total + missing_data_count;
    let missing_penalty = if total_criteria > 0 {
        missing_data_count as f64 / total_criteria as f64
    } else {
        0.0
    };

    let score = (inclusion_ratio * 100.0 * (1.0 - missing_penalty * 0.3)).round();
    result.score = score.clamp(0.0, 100.0);

    result.overall_status = if inclusion_met == inclusion_total && missing_data_count == 0 {
        "eligible".to_string()
    } else if inclusion_ratio >= 0.7 && missing_data_count <= 2 {
        "potentially_eligible".to_string()
    } else if missing_data_count > 3 {
        "needs_review".to_string()
    } else {
        "ineligible".to_string()
    };
}

#[tauri::command]
pub fn override_criterion(app: AppHandle, request: OverrideRequest) -> Result<(), String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    tracing::info!(
        "Override criterion {} -> {} (justification: {})",
        request.criterion_id,
        request.new_result,
        request.justification
    );

    // Persist the override to the screening_criteria_results table
    let rows_updated = conn.execute(
        "UPDATE screening_criteria_results
         SET result = ?1, human_override = ?2, human_verified = 1
         WHERE screening_result_id = ?3 AND criterion_id = ?4",
        rusqlite::params![
            request.new_result,
            request.justification,
            request.screening_result_id,
            request.criterion_id,
        ],
    ).map_err(|e| format!("Failed to persist override: {}", e))?;

    if rows_updated == 0 {
        // No existing row -- insert the override as a new record
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO screening_criteria_results
             (id, screening_result_id, criterion_id, criterion_type, criterion_text, result, human_override, human_verified)
             VALUES (?1, ?2, ?3, '', '', ?4, ?5, 1)",
            rusqlite::params![
                id,
                request.screening_result_id,
                request.criterion_id,
                request.new_result,
                request.justification,
            ],
        ).map_err(|e| format!("Failed to insert override: {}", e))?;
    }

    // Write audit trail entry
    let audit_details = format!(
        "criterion_id={}, screening_result_id={}, new_result={}, justification={}",
        request.criterion_id,
        request.screening_result_id,
        request.new_result,
        request.justification,
    );
    write_audit_entry(&conn, AuditAction::CriterionOverridden, &audit_details)
        .map_err(|e| format!("Failed to write audit entry: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_study_criteria(app: AppHandle, study_id: String) -> Result<Vec<CriterionResultResponse>, String> {
    let db_state = app.state::<DbState>();
    let lock = db_state.0.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let pool = lock.as_ref().ok_or("Database not initialized")?;
    let conn = pool.get().map_err(|e| format!("Failed to get connection: {}", e))?;

    tracing::info!("Getting criteria for study {}", study_id);

    let mut stmt = conn.prepare(
        "SELECT id, type, criterion_text FROM study_criteria
         WHERE study_id = ?1 ORDER BY type, criterion_number"
    ).map_err(|e| format!("Query error: {}", e))?;

    let criteria = stmt.query_map([&study_id], |row| {
        Ok(CriterionResultResponse {
            criterion_id: row.get(0)?,
            criterion_type: row.get(1)?,
            criterion_text: row.get(2)?,
            result: "pending".to_string(),
            evidence: None,
            evidence_source: None,
            confidence: 0.0,
            ai_determined: false,
        })
    })
    .map_err(|e| format!("Query error: {}", e))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("Row error: {}", e))?;

    Ok(criteria)
}
