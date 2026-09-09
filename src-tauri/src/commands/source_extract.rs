//! Bounded, schema-constrained local entity extraction. No persistence or clinical import.
use super::llm::{LlmState, LlmStatus};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Manager};
static ACTIVE: Mutex<Option<(String, Arc<AtomicBool>)>> = Mutex::new(None);
#[derive(Deserialize, Serialize)]
pub struct Segment {
    id: String,
    text: String,
}
struct Job;
impl Drop for Job {
    fn drop(&mut self) {
        if let Ok(mut job) = ACTIVE.lock() {
            *job = None;
        }
    }
}
#[tauri::command]
pub fn cancel_source_extraction(job_id: String) -> Result<(), String> {
    let active = ACTIVE.lock().map_err(|e| e.to_string())?;
    if let Some((id, flag)) = &*active {
        if *id == job_id {
            flag.store(true, Ordering::SeqCst);
        }
    }
    Ok(())
}
fn validate_input(segments: &[Segment]) -> Result<(), String> {
    if segments.is_empty()
        || segments.len() > 200
        || segments
            .iter()
            .map(|s| s.text.len() + s.id.len())
            .sum::<usize>()
            > 10000
    {
        return Err(
            "Extraction batch exceeds the bounded context policy. Split the source.".into(),
        );
    }
    let mut ids = std::collections::HashSet::new();
    for s in segments {
        if s.id.is_empty() || s.id.len() > 300 || s.text.is_empty() || !ids.insert(&s.id) {
            return Err("Invalid or duplicate source segment.".into());
        }
    }
    Ok(())
}
fn validate_output(raw: &str, segments: &[Segment]) -> Result<Value, String> {
    let result: Value =
        serde_json::from_str(raw).map_err(|_| "Model did not return valid structured JSON")?;
    let root = result.as_object().ok_or("Model result is not an object")?;
    if root.len() != 1 {
        return Err("Unexpected fields in structured response".into());
    }
    let entities = result["entities"]
        .as_array()
        .ok_or("Missing entities array")?;
    if entities.len() > 24 {
        return Err("Too many entities in one response".into());
    }
    for e in entities {
        let object = e.as_object().ok_or("Invalid entity")?;
        if object.len() != 8 && !(object.len()==9 && object.contains_key("field")) {
            return Err("Entity fields do not match schema".into());
        }
        if let Some(field)=object.get("field") {
            let request:Value=serde_json::from_str(include_str!("../../../src/lib/data-counts/request.json")).map_err(|e|e.to_string())?;
            if !request["fields"].as_array().unwrap().contains(field) && field!="Patient.id" && field!="Patient.birthDate" {return Err("Unexpected request field".into());}
        }
        for key in ["segment_id", "kind", "label", "value", "assertion", "quote"] {
            if !e[key].is_string() {
                return Err(format!("Invalid field: {key}"));
            }
        }
        for key in ["unit", "subject"] {
            if !object.contains_key(key) || !(e[key].is_null() || e[key].is_string()) {
                return Err(format!("Invalid nullable field: {key}"));
            }
        }
        if !["lab", "medication", "diagnosis", "vital", "demographic", "context"]
            .contains(&e["kind"].as_str().unwrap())
            || !["present", "negated", "historical", "uncertain", "unknown"]
                .contains(&e["assertion"].as_str().unwrap())
        {
            return Err("Unknown entity category or assertion".into());
        }
        if !segments
            .iter()
            .any(|s| Some(s.id.as_str()) == e["segment_id"].as_str())
        {
            return Err("Model cited an unknown source segment".into());
        }
    }
    Ok(result)
}
fn grounding_errors(result: &Value, segments: &[Segment]) -> Vec<String> {
    let mut errors = Vec::new();
    for (i, e) in result["entities"].as_array().unwrap().iter().enumerate() {
        let text = segments
            .iter()
            .find(|s| Some(s.id.as_str()) == e["segment_id"].as_str())
            .map(|s| s.text.as_str())
            .unwrap_or("");
        let quote = e["quote"].as_str().unwrap_or("");
        if quote.is_empty() || text.matches(quote).count() != 1 {
            errors.push(format!(
                "Entity {i}: quote is not a unique exact source passage"
            ));
        }
        for key in ["label", "value", "unit", "subject"] {
            if let Some(value) = e[key].as_str() {
                if value.is_empty() || !quote.contains(value) {
                    errors.push(format!("Entity {i}: {key} does not occur exactly in quote"));
                }
            }
        }
        if let Some(field)=e["field"].as_str(){
            if (field=="Observation.valueQuantity" && e["kind"]!="lab") || (field!="Observation.valueQuantity" && (e["kind"]!="context" || !e["unit"].is_null())) {errors.push(format!("Entity {i}: requested field and category disagree; use lab for valueQuantity and context with null unit for other fields"));}
        }
        if e["kind"] == "diagnosis" && e["value"] != e["label"] {
            errors.push(format!(
                "Entity {i}: diagnosis value must be identical to condition label"
            ));
        }
    }
    errors
}
#[tauri::command]
pub async fn extract_source_entities(
    app: AppHandle,
    job_id: String,
    request_key: Option<String>,
    segments: Vec<Segment>,
) -> Result<Value, String> {
    validate_input(&segments)?;
    let definition:Value=serde_json::from_str(include_str!("../../../src/lib/data-counts/request.json")).map_err(|e|e.to_string())?;
    let expected_key=format!("{}@{}",definition["id"].as_str().unwrap(),definition["version"]);
    if request_key.as_ref().is_some_and(|k|k!=&expected_key){return Err("Request changed. Reload the matching request before extraction.".into());}
    if job_id.len() > 100 || job_id.is_empty() {
        return Err("Invalid job identifier".into());
    }
    let (port, model) = {
        let state = app.state::<LlmState>();
        let lock = state.0.lock().map_err(|e| e.to_string())?;
        if lock.status != LlmStatus::Running {
            return Err("Verify a local model in Model setup first.".into());
        }
        (lock.port, lock.model.clone().ok_or("No model selected")?)
    };
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = ACTIVE.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err(
                "Another source extraction is active. Wait or cancel it before retrying.".into(),
            );
        }
        *active = Some((job_id, cancelled.clone()));
    }
    let _job = Job;
    let profile: Value =
        serde_json::from_str(if request_key.is_some(){include_str!("../../../src/lib/extraction/request-profile.json")}else{include_str!("../../../src/lib/extraction/profile.json")})
            .map_err(|e| e.to_string())?;
    let started = std::time::Instant::now();
    let mut request = json!({"model":model,"stream":false,"think":profile["think"],"keep_alive":profile["keep_alive"],"options":profile["options"],"format":profile["schema"],"messages":[{"role":"system","content":format!("{}\nRequired JSON schema: {}\nRequest: {}",profile["system"].as_str().unwrap_or(""),profile["schema"],if request_key.is_some(){definition.clone()}else{Value::Null})},{"role":"user","content":serde_json::to_string(&segments).map_err(|e|e.to_string())?}]});
    let work = async {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .map_err(|e| e.to_string())?;
        for attempt in 1..=2 {
            let response: Value = client
                .post(format!("http://127.0.0.1:{port}/api/chat"))
                .json(&request)
                .send()
                .await
                .map_err(|e| format!("Local inference failed: {e}"))?
                .error_for_status()
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            if response["done"] != true || response["done_reason"] == "length" {
                return Err("Response was truncated. No partial entities were accepted. Split the source into smaller sections and retry.".into());
            }
            let result = validate_output(
                response["message"]["content"]
                    .as_str()
                    .ok_or("No response content")?,
                &segments,
            )?;
            if result["entities"].as_array().map(|v| v.len()).unwrap_or(0) == 24 {
                return Err(
                    "Section reached the entity limit. Split the source before accepting results."
                        .into(),
                );
            }
            if request_key.is_some() && result["entities"].as_array().unwrap().iter().any(|e| !e["field"].is_string()) {return Err("Request-bound extraction omitted field identity.".into());}
            let errors = grounding_errors(&result, &segments);
            if attempt == 1 && !errors.is_empty() {
                let content = serde_json::to_string(&result).map_err(|e| e.to_string())?;
                if content.len() > 10000 {
                    return Err("Response needs review but is too large for a bounded repair. Split the source.".into());
                }
                let messages = request["messages"]
                    .as_array_mut()
                    .ok_or("Invalid request")?;
                messages.push(json!({"role":"assistant","content":content}));
                messages.push(json!({"role":"user","content":format!("{}{}",profile["repair_instruction"].as_str().unwrap_or(""),serde_json::to_string(&errors).map_err(|e|e.to_string())?)}));
                continue;
            }
            return Ok(
                json!({"result":result,"requestKey":request_key,"attempts":attempt,"model":model,"profile":profile["version"],"latency_ms":started.elapsed().as_millis() as u64,"prompt_tokens":response["prompt_eval_count"],"output_tokens":response["eval_count"]}),
            );
        }
        Err("Extraction did not complete".into())
    };
    tokio::pin!(work);
    let mut timer = tokio::time::interval(std::time::Duration::from_millis(150));
    loop {
        tokio::select! {res=&mut work=>return res,_=timer.tick()=>{if cancelled.load(Ordering::SeqCst){return Err("Extraction cancelled. No release was changed.".into());}}}
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_duplicate_or_oversized_segments() {
        assert!(validate_input(&[
            Segment {
                id: "a".into(),
                text: "one".into()
            },
            Segment {
                id: "a".into(),
                text: "two".into()
            }
        ])
        .is_err());
        assert!(validate_input(&[Segment {
            id: "a".into(),
            text: "x".repeat(18001)
        }])
        .is_err());
    }
    #[test]
    fn rejects_extra_fields_and_unknown_source() {
        assert!(validate_output(r#"{"entities":[],"extra":true}"#, &[]).is_err());
        assert!(validate_output(r#"{"entities":[{"segment_id":"invented","kind":"lab","label":"x","value":"1","unit":null,"subject":null,"assertion":"present","quote":"x 1"}]}"#,&[]).is_err());
    }
    #[test]
    fn accepts_explicit_empty_extraction() {
        assert!(validate_output(r#"{"entities":[]}"#, &[]).is_ok());
    }
}
