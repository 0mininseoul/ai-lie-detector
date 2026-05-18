/*
 * Persist *why* an analysis failed.
 *
 * Until now the worker (Cloudflare side) caught errors and only flipped
 * sessions.status to 'failed'. Vercel routes that later polled the row
 * could only surface a generic "분석이 실패했습니다" copy, and the actual
 * stack trace lived only in Cloudflare Workers logs — invisible from the
 * Vercel runtime logs the user inspects.
 *
 * Two new columns:
 *   error_code   — short, stable identifier (e.g. "gemini_timeout",
 *                  "recording_missing", "validation_failed"). Safe to
 *                  surface in the UI.
 *   error_detail — free-form text (truncated error.message + minimal
 *                  context). Surfaced only to the session owner / admin.
 */

alter table sessions
  add column if not exists error_code text,
  add column if not exists error_detail text,
  add column if not exists error_at timestamptz;

create index if not exists sessions_error_code_idx
  on sessions (error_code)
  where error_code is not null;
