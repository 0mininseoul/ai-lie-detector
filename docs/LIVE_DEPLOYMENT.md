# Live Deployment

마지막 업데이트: 2026-06-02

## Provisioned Resources

- Vercel project: `0minseouls-projects/ai-lie-detector`
- Production URL: `https://nogoora.vercel.app`
- Latest production deployment: `https://ai-lie-detector-nae62ssnh-0minseouls-projects.vercel.app`
- Supabase project ref: `btifyegcjbknhxynkxpl`
- Supabase URL: `https://btifyegcjbknhxynkxpl.supabase.co`
- Cloudflare Worker: `https://ai-lie-detector-worker.tnsb5373.workers.dev`
- R2 bucket: `ai-lie-detector-recordings`
- Vertex AI GCS staging bucket: `gs://ai-baram-detector-vertex-staging`

## Cost Guardrails Applied

- Browser upload goes to Cloudflare Worker, not Vercel request body.
- Worker upload token expires after 5 minutes.
- Worker rejects uploads over 32MB.
- Vertex AI analysis uses inline video for recordings up to 8MB and GCS `fileData` staging for larger recordings.
- Session creation consumes one free trial or one stored credit before analysis can start.
- R2 lifecycle deletes `recordings/` objects after 7 days.
- Vertex AI GCS staging deletes `vertex-inputs/` objects immediately after successful analysis and has a 7-day lifecycle fallback.
- Current `recordings/` object state after cleanup: `0` objects.
- Supabase cleanup RPC deletes expired session rows opportunistically when a new session is created.
- Gemini calls are routed through Vertex AI with a least-privilege service account; no Gemini API key is stored in Vercel.

## Configured Runtime Settings

### Vertex AI Gemini

The Worker and Vercel environments are configured with these Vertex AI settings. Do not print the JSON key or base64 value:

```text
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GOOGLE_GENAI_USE_VERTEXAI
VERTEX_AI_MODEL
VERTEX_AI_GCS_BUCKET
GOOGLE_SERVICE_ACCOUNT_KEY_BASE64
```

### Supabase Auth URL Configuration Checklist

Set these in Supabase Dashboard → Authentication → URL Configuration:

```text
Site URL:
https://nogoora.vercel.app

Redirect URLs:
http://localhost:3000/auth/callback
https://nogoora.vercel.app/auth/callback
https://ai-lie-detector-nae62ssnh-0minseouls-projects.vercel.app/auth/callback
https://*-0minseouls-projects.vercel.app/**
```

### Kakao Developers

Add this redirect URI in Kakao Developers → Kakao Login → Redirect URI:

```text
https://btifyegcjbknhxynkxpl.supabase.co/auth/v1/callback
```

Then copy Kakao REST API Key and Client Secret into Supabase Dashboard → Authentication → Providers → Kakao.
