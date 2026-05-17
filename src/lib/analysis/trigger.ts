export type AnalysisTriggerStatus = "queued" | "disabled" | "failed";

export type AnalysisTriggerResult = {
  status: AnalysisTriggerStatus;
  queued: boolean;
  error?: string;
};

type TriggerAnalysisOptions = {
  workerUrl?: string;
  sharedSecret?: string;
  fetcher?: typeof fetch;
};

export function buildAnalyzeUrl(workerUrl: string) {
  const parsed = new URL(workerUrl);
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");

  if (normalizedPath.endsWith("/analyze")) {
    parsed.pathname = normalizedPath;
    return parsed.toString();
  }

  parsed.pathname = `${normalizedPath}/analyze`.replace(/^\/?/, "/");
  return parsed.toString();
}

export async function triggerAnalysis(
  sessionId: string,
  options: TriggerAnalysisOptions = {}
): Promise<AnalysisTriggerResult> {
  const workerUrl = (options.workerUrl ?? process.env.ANALYSIS_WORKER_URL ?? "").trim();
  const sharedSecret = (options.sharedSecret ?? process.env.WORKER_SHARED_SECRET ?? "").trim();

  if (!workerUrl) {
    return {
      status: "disabled",
      queued: false,
      error: "ANALYSIS_WORKER_URL is required"
    };
  }

  if (!sharedSecret) {
    return {
      status: "disabled",
      queued: false,
      error: "WORKER_SHARED_SECRET is required"
    };
  }

  try {
    const response = await (options.fetcher ?? fetch)(buildAnalyzeUrl(workerUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${sharedSecret}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });

    if (!response.ok) {
      const message = await readWorkerError(response);
      return {
        status: "failed",
        queued: false,
        error: `Worker trigger failed with status ${response.status}: ${message}`
      };
    }

    return {
      status: "queued",
      queued: true
    };
  } catch (error) {
    return {
      status: "failed",
      queued: false,
      error: error instanceof Error ? error.message : "Worker trigger failed"
    };
  }
}

async function readWorkerError(response: Response) {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    // Fall back to status text below.
  }

  return response.statusText || "unknown error";
}
