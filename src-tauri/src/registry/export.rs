use rusqlite::Connection;

/// Generate NAACCR XML V25 for a set of reportable cases.
/// Returns the XML string.
pub fn export_cases_xml(
    conn: &Connection,
    case_ids: &[String],
    _state_code: &str,
) -> Result<String, String> {
    let mut xml = String::new();
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<NaaccrData xmlns=\"http://naaccr.org/naaccrxml\" ");
    xml.push_str("specificationVersion=\"1.7\" baseDictionaryUri=\"http://naaccr.org/naaccrxml/naaccr-dictionary-250.xml\">\n");

    for case_id in case_ids {
        let case = conn.query_row(
            "SELECT rc.id, rc.patient_id, rc.primary_site_icdo3, rc.histology_icdo3,
                    rc.behavior_code, rc.grade, rc.laterality, rc.date_of_diagnosis,
                    rc.diagnostic_confirmation, rc.clinical_stage_group, rc.pathologic_stage_group,
                    rc.tnm_clinical_t, rc.tnm_clinical_n, rc.tnm_clinical_m,
                    rc.tnm_pathologic_t, rc.tnm_pathologic_n, rc.tnm_pathologic_m,
                    rc.treatment_surgery, rc.treatment_radiation, rc.treatment_chemo,
                    rc.treatment_hormone, rc.treatment_immuno, rc.treatment_other,
                    rc.date_first_treatment, rc.vital_status, rc.date_of_last_contact,
                    p.date_of_birth, p.gender, p.race, p.ethnicity, p.site_patient_id
             FROM reportable_cases rc
             JOIN patients p ON p.id = rc.patient_id
             WHERE rc.id = ?1",
            [case_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, Option<String>>(14)?,
                    row.get::<_, Option<String>>(15)?,
                    row.get::<_, Option<String>>(16)?,
                    row.get::<_, String>(17)?,
                    row.get::<_, String>(18)?,
                    row.get::<_, String>(19)?,
                    row.get::<_, String>(20)?,
                    row.get::<_, String>(21)?,
                    row.get::<_, String>(22)?,
                    row.get::<_, Option<String>>(23)?,
                    row.get::<_, String>(24)?,
                    row.get::<_, Option<String>>(25)?,
                    row.get::<_, Option<String>>(26)?,
                    row.get::<_, Option<String>>(27)?,
                    row.get::<_, Option<String>>(28)?,
                    row.get::<_, Option<String>>(29)?,
                    row.get::<_, String>(30)?,
                ))
            },
        );

        let data = match case {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("Skipping case {}: {}", case_id, e);
                continue;
            }
        };

        let (_case_id, _patient_id, primary_site, histology, behavior, grade, laterality,
             dx_date, dx_confirm, clin_stage, path_stage,
             tnm_ct, tnm_cn, tnm_cm, tnm_pt, tnm_pn, tnm_pm,
             tx_surgery, tx_radiation, tx_chemo, tx_hormone, tx_immuno, tx_other,
             tx_date, vital_status, last_contact,
             dob, gender, race, ethnicity, site_patient_id) = data;

        xml.push_str("  <Patient>\n");
        write_item(&mut xml, 20, &site_patient_id); // Medical Record Number
        if let Some(ref v) = dob { write_item(&mut xml, 240, v); } // Date of Birth
        if let Some(ref v) = gender { write_item(&mut xml, 220, &map_sex(v)); } // Sex
        if let Some(ref v) = race { write_item(&mut xml, 160, v); } // Race 1
        if let Some(ref v) = ethnicity { write_item(&mut xml, 190, v); } // Spanish/Hispanic Origin

        xml.push_str("    <Tumor>\n");
        if let Some(ref v) = primary_site { write_tumor_item(&mut xml, 400, v); } // Primary Site
        if let Some(ref v) = histology { write_tumor_item(&mut xml, 522, v); } // Histologic Type
        if let Some(ref v) = behavior { write_tumor_item(&mut xml, 523, v); } // Behavior Code
        if let Some(ref v) = grade { write_tumor_item(&mut xml, 440, v); } // Grade
        if let Some(ref v) = laterality { write_tumor_item(&mut xml, 410, v); } // Laterality
        if let Some(ref v) = dx_date { write_tumor_item(&mut xml, 390, v); } // Date of Diagnosis
        if let Some(ref v) = dx_confirm { write_tumor_item(&mut xml, 490, v); } // Diagnostic Confirmation
        if let Some(ref v) = clin_stage { write_tumor_item(&mut xml, 3000, v); } // TNM Clin Stage Group
        if let Some(ref v) = path_stage { write_tumor_item(&mut xml, 3010, v); } // TNM Path Stage Group
        if let Some(ref v) = tnm_ct { write_tumor_item(&mut xml, 940, v); }
        if let Some(ref v) = tnm_cn { write_tumor_item(&mut xml, 950, v); }
        if let Some(ref v) = tnm_cm { write_tumor_item(&mut xml, 960, v); }
        if let Some(ref v) = tnm_pt { write_tumor_item(&mut xml, 880, v); }
        if let Some(ref v) = tnm_pn { write_tumor_item(&mut xml, 890, v); }
        if let Some(ref v) = tnm_pm { write_tumor_item(&mut xml, 900, v); }
        write_tumor_item(&mut xml, 1290, &tx_surgery); // RX Summ--Surg Prim Site
        write_tumor_item(&mut xml, 1360, &tx_radiation); // RX Summ--Radiation
        write_tumor_item(&mut xml, 1390, &tx_chemo); // RX Summ--Chemo
        write_tumor_item(&mut xml, 1400, &tx_hormone); // RX Summ--Hormone
        write_tumor_item(&mut xml, 1410, &tx_immuno); // RX Summ--BRM
        write_tumor_item(&mut xml, 1420, &tx_other); // RX Summ--Other
        if let Some(ref v) = tx_date { write_tumor_item(&mut xml, 1270, v); } // Date Initial RX SEER
        write_tumor_item(&mut xml, 1760, &vital_status); // Vital Status
        if let Some(ref v) = last_contact { write_tumor_item(&mut xml, 1750, v); } // Date of Last Contact
        xml.push_str("    </Tumor>\n");
        xml.push_str("  </Patient>\n");
    }

    xml.push_str("</NaaccrData>\n");
    Ok(xml)
}

fn write_item(xml: &mut String, item_number: u32, value: &str) {
    xml.push_str(&format!(
        "    <Item naaccrId=\"item{}\">{}</Item>\n",
        item_number,
        escape_xml(value)
    ));
}

fn write_tumor_item(xml: &mut String, item_number: u32, value: &str) {
    xml.push_str(&format!(
        "      <Item naaccrId=\"item{}\">{}</Item>\n",
        item_number,
        escape_xml(value)
    ));
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&apos;")
}

fn map_sex(gender: &str) -> String {
    match gender.to_lowercase().as_str() {
        "male" => "1".to_string(),
        "female" => "2".to_string(),
        _ => "9".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db_with_case() -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::init_test_db(&conn);

        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, race, ethnicity, imported_at, last_updated)
             VALUES ('p-exp', 'MRN-EXP-001', '1962-08-22', 'male', 'White', 'Not Hispanic', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();

        let case_id = "case-exp-1";
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, abstract_status,
                    primary_site_icdo3, histology_icdo3, behavior_code, grade,
                    date_of_diagnosis, clinical_stage_group, treatment_surgery, treatment_chemo,
                    vital_status)
             VALUES (?1, 'p-exp', '2026-03-01', 'complete',
                    'C34.1', '8140/3', '/3', '2',
                    '2025-11-15', 'IIIA', '01', '01',
                    '1')",
            [case_id],
        ).unwrap();

        (conn, case_id.to_string())
    }

    #[test]
    fn test_export_xml_structure() {
        let (conn, case_id) = setup_db_with_case();
        let xml = export_cases_xml(&conn, &[case_id], "WA").unwrap();

        // Check XML declaration and root element
        assert!(xml.starts_with("<?xml version=\"1.0\""), "Should start with XML declaration");
        assert!(xml.contains("<NaaccrData"), "Should have NaaccrData root element");
        assert!(xml.contains("</NaaccrData>"), "Should close NaaccrData");
        assert!(xml.contains("<Patient>"), "Should have Patient element");
        assert!(xml.contains("<Tumor>"), "Should have Tumor element");
        assert!(xml.contains("</Tumor>"), "Should close Tumor");
        assert!(xml.contains("</Patient>"), "Should close Patient");
    }

    #[test]
    fn test_export_xml_patient_data() {
        let (conn, case_id) = setup_db_with_case();
        let xml = export_cases_xml(&conn, &[case_id], "WA").unwrap();

        // Medical Record Number (item 20)
        assert!(xml.contains("item20"), "Should have MRN item");
        assert!(xml.contains("MRN-EXP-001"), "Should contain patient MRN");

        // Sex (item 220) - male = 1
        assert!(xml.contains("item220"), "Should have sex item");
        assert!(xml.contains(">1<"), "Male should map to 1");
    }

    #[test]
    fn test_export_xml_tumor_data() {
        let (conn, case_id) = setup_db_with_case();
        let xml = export_cases_xml(&conn, &[case_id], "WA").unwrap();

        // Primary Site (item 400)
        assert!(xml.contains("item400"), "Should have primary site item");
        assert!(xml.contains("C34.1"), "Should contain C34.1");

        // Histology (item 522)
        assert!(xml.contains("item522"), "Should have histology item");
        assert!(xml.contains("8140/3"), "Should contain histology code");

        // Stage (item 3000)
        assert!(xml.contains("item3000"), "Should have clinical stage item");
        assert!(xml.contains("IIIA"), "Should contain stage IIIA");

        // Treatment chemo (item 1390)
        assert!(xml.contains("item1390"), "Should have chemo item");
    }

    #[test]
    fn test_export_xml_escapes_special_chars() {
        let (conn, _) = setup_db_with_case();

        // Insert a case with special chars in a field
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p-esc', 'MRN-<TEST>&', '1970-01-01', 'female', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, abstract_status, vital_status)
             VALUES ('case-esc', 'p-esc', '2026-03-01', 'draft', '1')",
            [],
        ).unwrap();

        let xml = export_cases_xml(&conn, &["case-esc".to_string()], "WA").unwrap();
        assert!(xml.contains("MRN-&lt;TEST&gt;&amp;"), "Special chars should be escaped");
        assert!(!xml.contains("MRN-<TEST>&"), "Raw special chars should NOT appear");
    }

    #[test]
    fn test_export_multiple_cases() {
        let (conn, case_id) = setup_db_with_case();

        // Add second patient + case
        conn.execute(
            "INSERT INTO patients (id, site_patient_id, date_of_birth, gender, imported_at, last_updated)
             VALUES ('p-exp2', 'MRN-EXP-002', '1975-03-15', 'female', '2026-01-01', '2026-01-01')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO reportable_cases (id, patient_id, detected_at, abstract_status, primary_site_icdo3, vital_status)
             VALUES ('case-exp-2', 'p-exp2', '2026-03-02', 'draft', 'C50.9', '1')",
            [],
        ).unwrap();

        let xml = export_cases_xml(&conn, &[case_id, "case-exp-2".to_string()], "WA").unwrap();

        // Should have two Patient elements
        let patient_count = xml.matches("<Patient>").count();
        assert_eq!(patient_count, 2, "Should export 2 patients");

        assert!(xml.contains("MRN-EXP-001"), "Should contain first patient");
        assert!(xml.contains("MRN-EXP-002"), "Should contain second patient");
    }

    #[test]
    fn test_export_skips_nonexistent_case() {
        let (conn, case_id) = setup_db_with_case();
        let xml = export_cases_xml(&conn, &[case_id, "nonexistent".to_string()], "WA").unwrap();

        let patient_count = xml.matches("<Patient>").count();
        assert_eq!(patient_count, 1, "Should only export the existing case");
    }
}
