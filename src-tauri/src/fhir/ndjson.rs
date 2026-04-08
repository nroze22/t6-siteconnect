//! NDJSON line streamer for FHIR Bulk Data downloads.
//!
//! `$export` files can be megabytes-to-gigabytes. We deliberately
//! never load a whole file into memory — instead we stream HTTP body
//! bytes from `reqwest`, accumulate into a small buffer, and yield
//! one parsed `serde_json::Value` per line via the supplied callback.
//!
//! Empty lines are ignored. Lines that fail to parse are surfaced as
//! a warning to the caller (via `NdjsonError::ParseAt`) so the import
//! can either continue (logging a warning) or abort, at the caller's
//! discretion. The current implementation logs and continues — better
//! to import 999 of 1000 patients than to abort the whole batch on
//! one malformed row.

use futures_util::StreamExt;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NdjsonError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Server returned {status} for {url}")]
    Status { url: String, status: u16 },

    #[error("Stream read error: {0}")]
    Io(#[from] std::io::Error),
}

/// Stream an NDJSON file from `url`, calling `on_resource` once per
/// successfully-parsed line. Returns the total number of lines that
/// parsed cleanly.
///
/// `bearer_token`, if present, is sent as `Authorization: Bearer …`.
/// Bulk Data download URLs are typically authenticated even when
/// the `/metadata` endpoint is public.
pub async fn stream_ndjson<F>(
    client: &reqwest::Client,
    url: &str,
    bearer_token: Option<&str>,
    mut on_resource: F,
) -> Result<usize, NdjsonError>
where
    F: FnMut(serde_json::Value),
{
    let mut req = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/fhir+ndjson");
    if let Some(token) = bearer_token {
        req = req.bearer_auth(token);
    }
    let resp = req.send().await?;

    let status = resp.status();
    if !status.is_success() {
        return Err(NdjsonError::Status {
            url: url.to_string(),
            status: status.as_u16(),
        });
    }

    let mut stream = resp.bytes_stream();
    let mut buffer: Vec<u8> = Vec::with_capacity(64 * 1024);
    let mut count: usize = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buffer.extend_from_slice(&chunk);

        // Drain whole lines from the buffer.
        while let Some(newline_at) = buffer.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buffer.drain(..=newline_at).collect();
            // Strip the trailing \n (and possible \r) before parsing.
            let trimmed = trim_line_end(&line[..line.len() - 1]);
            if trimmed.is_empty() {
                continue;
            }
            match serde_json::from_slice::<serde_json::Value>(trimmed) {
                Ok(value) => {
                    on_resource(value);
                    count += 1;
                }
                Err(err) => {
                    tracing::warn!("Skipping unparseable ndjson line: {}", err);
                }
            }
        }
    }

    // Final line may have no trailing newline.
    let trimmed = trim_line_end(&buffer);
    if !trimmed.is_empty() {
        match serde_json::from_slice::<serde_json::Value>(trimmed) {
            Ok(value) => {
                on_resource(value);
                count += 1;
            }
            Err(err) => {
                tracing::warn!("Skipping unparseable trailing ndjson line: {}", err);
            }
        }
    }

    Ok(count)
}

fn trim_line_end(bytes: &[u8]) -> &[u8] {
    if bytes.last() == Some(&b'\r') {
        &bytes[..bytes.len() - 1]
    } else {
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_trailing_cr() {
        assert_eq!(trim_line_end(b"hello\r"), b"hello");
        assert_eq!(trim_line_end(b"hello"), b"hello");
        assert_eq!(trim_line_end(b""), b"");
    }
}
