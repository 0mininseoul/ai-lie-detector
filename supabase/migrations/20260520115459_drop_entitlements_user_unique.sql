/*
 * Drop the 1-row-per-user invariant on entitlements.
 *
 * `entitlements_user_id_unique_idx` (partial unique on user_id where not null)
 * was added in the init migration when the free-trial counter lived directly
 * on the `entitlements` row, so "one user = one row" guarded against double
 * trials. The 20260520000000 migration moved free trials to
 * `profiles.free_trials_used` (capped at 1, user-scoped) and made the manual
 * credit fallback read from `profiles.manual_credits`. After that move,
 * `entitlements` is purely device-scoped (one row per device, holding
 * device-scoped paid credits + legacy anonymous trial).
 *
 * Problem this caused: when the same authenticated user analyses on a second
 * device (e.g. PC first, then mobile), `consume_analysis_credit` runs
 * `insert into entitlements (device_id, user_id) ... on conflict (device_id)`
 * at the top so it can return a fresh row. With the partial unique index on
 * user_id, that INSERT raises 23505 because the user already has a row on
 * their other device — the `on conflict (device_id)` clause does not catch a
 * conflict on user_id. The exception aborts the whole function before Step 3
 * (`profiles.manual_credits` fallback) can run, and the API route surfaces
 * the generic "무료 체험 1회를 이미 사용했습니다" message even though the user
 * has plenty of manual credits.
 *
 * Same applies to `entitlements_kakao_user_id_unique_idx` — drop the twin so
 * the model is consistent.
 *
 * Non-unique indexes on user_id / kakao_user_id stay (still useful for
 * lookups). Nothing in app code relies on the uniqueness.
 */

drop index if exists public.entitlements_user_id_unique_idx;
drop index if exists public.entitlements_kakao_user_id_unique_idx;
