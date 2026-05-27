/*
 * Supabase Data API explicit grants.
 *
 * New Supabase projects stop granting public-schema tables to Data API roles
 * automatically from 2026-05-30. The app and worker use supabase-js with the
 * service role key for server-side Data API access, so keep that access
 * explicit and reviewable in migrations.
 */

grant select, insert, update, delete on table
  public.sessions,
  public.recordings,
  public.feature_payloads,
  public.analysis_results,
  public.entitlements,
  public.entitlement_events,
  public.profiles,
  public.entitlement_pass_grants
to service_role;

grant usage, select on all sequences in schema public to service_role;
