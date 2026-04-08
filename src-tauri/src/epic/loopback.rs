//! One-shot loopback HTTP listener for the SMART OAuth callback.
//!
//! Per RFC 8252 §7.3 ("OAuth 2.0 for Native Apps"), the recommended way
//! for desktop apps to receive an authorization code is to listen on
//! `http://127.0.0.1:<random port>/callback`. We bind a TCP listener,
//! tell the user's browser the redirect URI through the authorize URL,
//! and accept exactly one request — the redirect from Epic — then close.
//!
//! Why hand-rolled instead of pulling in `hyper`/`axum`?
//!   * One request, one response. The full HTTP/1.1 surface is overkill.
//!   * No new heavy dependency in `Cargo.toml`.
//!   * Total lifetime of the listener is seconds, not weeks of uptime.
//!
//! What we DO support:
//!   * Parsing the request line (`GET /callback?code=…&state=…`)
//!   * Returning a friendly HTML "you can close this tab" success page
//!     (or an error page that surfaces the OAuth error_description)
//!   * A configurable wall-clock timeout so the listener can never wedge
//!
//! What we DON'T support (and don't need):
//!   * Anything other than `GET /callback`
//!   * Persistent connections — we always send `Connection: close`
//!   * Chunked / large request bodies

use std::collections::HashMap;
use std::time::Duration;

use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;

#[derive(Debug, Error)]
pub enum LoopbackError {
    #[error("Failed to bind loopback listener: {0}")]
    Bind(#[from] std::io::Error),

    #[error("Timed out waiting for OAuth callback after {seconds}s")]
    Timeout { seconds: u64 },

    #[error("Browser sent malformed callback request")]
    Malformed,

    #[error("Authorization server returned error: {error} {description:?}")]
    OauthError {
        error: String,
        description: Option<String>,
    },

    #[error("Callback `state` did not match — possible CSRF")]
    StateMismatch,
}

/// Result of a successful callback capture.
#[derive(Debug, Clone)]
pub struct CallbackCapture {
    pub code: String,
}

/// A bound loopback listener that exposes the redirect URI to use in
/// the authorize URL. The listener is *armed* but not yet awaiting —
/// call [`LoopbackServer::wait_for_callback`] after the browser opens.
///
/// Binding before browser-launch (rather than after) avoids a race
/// where Epic redirects faster than we can listen.
pub struct LoopbackServer {
    listener: TcpListener,
    redirect_uri: String,
}

impl LoopbackServer {
    /// Bind to `127.0.0.1` on a kernel-assigned ephemeral port.
    pub async fn bind() -> Result<Self, LoopbackError> {
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
        tracing::info!("Loopback OAuth listener bound on {}", redirect_uri);
        Ok(Self {
            listener,
            redirect_uri,
        })
    }

    pub fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    /// Block until the browser hits `/callback?...` and return the
    /// authorization code. Validates `state` against the value we sent.
    pub async fn wait_for_callback(
        self,
        expected_state: &str,
        wait: Duration,
    ) -> Result<CallbackCapture, LoopbackError> {
        let seconds = wait.as_secs();
        let result = timeout(wait, self.accept_one(expected_state))
            .await
            .map_err(|_| LoopbackError::Timeout { seconds })??;
        Ok(result)
    }

    async fn accept_one(self, expected_state: &str) -> Result<CallbackCapture, LoopbackError> {
        let (mut socket, peer) = self.listener.accept().await?;
        tracing::debug!("OAuth callback connection from {}", peer);

        // Read enough bytes to capture the request line + headers.
        // 8KB is generous — query strings rarely break a few hundred bytes.
        let mut buf = vec![0u8; 8192];
        let n = socket.read(&mut buf).await?;
        let request = String::from_utf8_lossy(&buf[..n]);

        let request_line = request
            .lines()
            .next()
            .ok_or(LoopbackError::Malformed)?;
        let target = parse_request_line(request_line).ok_or(LoopbackError::Malformed)?;
        let params = parse_query(&target);

        // Detect explicit OAuth errors first so we can show a useful page.
        if let Some(error) = params.get("error") {
            let body = error_html(error, params.get("error_description").map(String::as_str));
            let _ = write_response(&mut socket, 400, "Bad Request", &body).await;
            return Err(LoopbackError::OauthError {
                error: error.clone(),
                description: params.get("error_description").cloned(),
            });
        }

        // Validate CSRF state.
        let returned_state = params.get("state").ok_or(LoopbackError::Malformed)?;
        if returned_state != expected_state {
            let _ = write_response(
                &mut socket,
                400,
                "Bad Request",
                &error_html("state_mismatch", Some("CSRF state did not match.")),
            )
            .await;
            return Err(LoopbackError::StateMismatch);
        }

        let code = params.get("code").ok_or(LoopbackError::Malformed)?.clone();

        let _ = write_response(&mut socket, 200, "OK", &success_html()).await;
        Ok(CallbackCapture { code })
    }
}

// ----- HTTP plumbing -----

/// Parse the path+query out of a request line like `GET /callback?x=1 HTTP/1.1`.
fn parse_request_line(line: &str) -> Option<String> {
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if !method.eq_ignore_ascii_case("GET") {
        return None;
    }
    Some(target.to_string())
}

/// Parse the query string out of a request target. Tolerant — empty
/// queries return an empty map.
fn parse_query(target: &str) -> HashMap<String, String> {
    let q = match target.split_once('?') {
        Some((_, q)) => q,
        None => return HashMap::new(),
    };
    let mut out = HashMap::new();
    for pair in q.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        out.insert(percent_decode(k), percent_decode(v));
    }
    out
}

fn percent_decode(s: &str) -> String {
    // Tiny hand-rolled decoder so we don't pull in `percent-encoding`.
    // Handles `%XX` escapes and `+` → space.
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(
                    std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                    16,
                ) {
                    out.push(byte as char);
                    i += 3;
                } else {
                    out.push('%');
                    i += 1;
                }
            }
            other => {
                out.push(other as char);
                i += 1;
            }
        }
    }
    out
}

async fn write_response(
    socket: &mut tokio::net::TcpStream,
    status: u16,
    reason: &str,
    body: &str,
) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        status,
        reason,
        body.len(),
        body
    );
    socket.write_all(response.as_bytes()).await?;
    socket.shutdown().await?;
    Ok(())
}

fn success_html() -> String {
    r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SiteConnect — Connected</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         background: #0c0f17; color: #e2e8f0; display: flex;
         align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { text-align: center; padding: 32px 40px; border-radius: 16px;
          background: #131825; border: 1px solid #1e2538; max-width: 420px; }
  .check { width: 56px; height: 56px; border-radius: 50%;
           background: rgba(16,185,129,0.12); color: #10b981;
           display: flex; align-items: center; justify-content: center;
           margin: 0 auto 16px; font-size: 28px; }
  h1 { margin: 0 0 6px; font-size: 18px; }
  p  { margin: 0; font-size: 13px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Connected to Epic</h1>
    <p>You can close this tab and return to TalOS SiteConnect.</p>
  </div>
</body>
</html>"#
        .to_string()
}

fn error_html(error: &str, description: Option<&str>) -> String {
    let desc = description.unwrap_or("The authorization server reported an error.");
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SiteConnect — Authorization failed</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         background: #0c0f17; color: #e2e8f0; display: flex;
         align-items: center; justify-content: center; height: 100vh; margin: 0; }}
  .card {{ text-align: center; padding: 32px 40px; border-radius: 16px;
          background: #131825; border: 1px solid #1e2538; max-width: 460px; }}
  .x {{ width: 56px; height: 56px; border-radius: 50%;
        background: rgba(244,63,94,0.12); color: #f43f5e;
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 16px; font-size: 28px; }}
  h1 {{ margin: 0 0 6px; font-size: 18px; }}
  code {{ display: inline-block; margin-top: 6px; padding: 4px 8px;
          background: #0c0f17; border-radius: 6px; font-size: 11px; color: #cbd5e1; }}
  p {{ margin: 0 0 8px; font-size: 13px; color: #94a3b8; }}
</style>
</head>
<body>
  <div class="card">
    <div class="x">!</div>
    <h1>Authorization failed</h1>
    <p>{desc}</p>
    <code>{error}</code>
  </div>
</body>
</html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_request_line() {
        assert_eq!(
            parse_request_line("GET /callback?code=abc&state=xyz HTTP/1.1"),
            Some("/callback?code=abc&state=xyz".to_string())
        );
    }

    #[test]
    fn rejects_non_get() {
        assert!(parse_request_line("POST /callback HTTP/1.1").is_none());
    }

    #[test]
    fn parses_query_params() {
        let q = parse_query("/callback?code=abc&state=xyz");
        assert_eq!(q.get("code").map(String::as_str), Some("abc"));
        assert_eq!(q.get("state").map(String::as_str), Some("xyz"));
    }

    #[test]
    fn percent_decodes_escapes() {
        assert_eq!(percent_decode("hello%20world"), "hello world");
        assert_eq!(percent_decode("a+b"), "a b");
        assert_eq!(percent_decode("clean"), "clean");
    }

    #[test]
    fn empty_query_returns_empty_map() {
        assert!(parse_query("/callback").is_empty());
    }
}
