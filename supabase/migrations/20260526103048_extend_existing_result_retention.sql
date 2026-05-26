update recordings r
set expires_at = greatest(r.expires_at, s.created_at + interval '7 days')
from sessions s
where r.session_id = s.id
  and s.created_at >= now() - interval '7 days'
  and r.expires_at < s.created_at + interval '7 days';

update analysis_results ar
set expires_at = greatest(ar.expires_at, s.created_at + interval '7 days')
from sessions s
where ar.session_id = s.id
  and s.created_at >= now() - interval '7 days'
  and ar.expires_at < s.created_at + interval '7 days';
