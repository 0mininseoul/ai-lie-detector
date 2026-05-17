# Live Deployment

마지막 업데이트: 2026-05-18

## Provisioned Resources

- Vercel project: `0minseouls-projects/ai-lie-detector`
- Production URL: `https://ai-lie-detector-lake.vercel.app`
- Latest production deployment: `https://ai-lie-detector-m4odx3qjz-0minseouls-projects.vercel.app`
- Supabase project ref: `btifyegcjbknhxynkxpl`
- Supabase URL: `https://btifyegcjbknhxynkxpl.supabase.co`
- Cloudflare Worker: `https://ai-lie-detector-worker.tnsb5373.workers.dev`
- R2 bucket: `ai-lie-detector-recordings`

## Cost Guardrails Applied

- Browser upload goes to Cloudflare Worker, not Vercel request body.
- Worker upload token expires after 5 minutes.
- Worker rejects uploads over 95MB.
- R2 lifecycle deletes `recordings/` objects after 1 day.
- Current R2 bucket state after setup: `object_count = 0`, `bucket_size = 0 B`.
- Supabase cleanup RPC deletes expired session rows opportunistically when a new session is created.
- Gemini API key is only a Worker secret; it is not stored in Vercel.

## Owner Actions Still Required

### Gemini

Add the Gemini API key to the Worker:

```bash
cd worker
printf '%s' '<YOUR_GEMINI_API_KEY>' | pnpm exec wrangler secret put GEMINI_API_KEY
pnpm exec wrangler deploy
```

### Supabase Auth URL Configuration

Set these in Supabase Dashboard → Authentication → URL Configuration:

```text
Site URL:
https://ai-lie-detector-lake.vercel.app

Redirect URLs:
http://localhost:3000/auth/callback
https://ai-lie-detector-lake.vercel.app/auth/callback
https://ai-lie-detector-m4odx3qjz-0minseouls-projects.vercel.app/auth/callback
https://*-0minseouls-projects.vercel.app/**
```

### Kakao Developers

Add this redirect URI in Kakao Developers → Kakao Login → Redirect URI:

```text
https://btifyegcjbknhxynkxpl.supabase.co/auth/v1/callback
```

Then copy Kakao REST API Key and Client Secret into Supabase Dashboard → Authentication → Providers → Kakao.
