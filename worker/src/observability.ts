export type AxiomEnv = {
  AXIOM_TOKEN?: string;
  AXIOM_DATASET?: string;
  AXIOM_URL?: string;
  AXIOM_INGEST_URL?: string;
  AXIOM_ORG_ID?: string;
};

export type AxiomEvent = Record<string, unknown> & {
  event: string;
  level?: "debug" | "info" | "warn" | "error";
  sessionId?: string;
};

const defaultDataset = "ai-lie-detector";
const defaultAxiomUrl = "https://api.axiom.co";

export async function logAxiomEvent(env: AxiomEnv, event: AxiomEvent) {
  const token = env.AXIOM_TOKEN?.trim();
  if (!token) return false;

  const dataset = env.AXIOM_DATASET?.trim() || defaultDataset;
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  });
  const orgId = env.AXIOM_ORG_ID?.trim();
  if (orgId) headers.set("x-axiom-org-id", orgId);

  const payload = sanitizeAxiomEvent({
    time: new Date().toISOString(),
    service: "ai-lie-detector",
    runtime: "cloudflare-worker",
    ...event
  });

  try {
    const response = await fetch(buildAxiomIngestUrl(dataset, env), {
      method: "POST",
      headers,
      body: JSON.stringify([payload])
    });

    return response.ok;
  } catch {
    return false;
  }
}

function buildAxiomIngestUrl(dataset: string, env: AxiomEnv) {
  const encodedDataset = encodeURIComponent(dataset);
  const explicitUrl = env.AXIOM_INGEST_URL?.trim();
  if (explicitUrl) {
    return explicitUrl.replace("{dataset}", encodedDataset);
  }

  const baseUrl = (env.AXIOM_URL?.trim() || defaultAxiomUrl).replace(/\/+$/, "");
  return `${baseUrl}/v1/datasets/${encodedDataset}/ingest`;
}

function sanitizeAxiomEvent(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (typeof value === "string") {
    return value.length > 900 ? `${value.slice(0, 897)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 16).map((item) => sanitizeAxiomEvent(item, depth + 1));
  }

  if (typeof value === "object") {
    if (depth > 4) return "[truncated]";

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 48);
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeAxiomEvent(item, depth + 1)]));
  }

  return String(value);
}
