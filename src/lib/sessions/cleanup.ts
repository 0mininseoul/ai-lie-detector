type SupabaseRpcClient = {
  rpc(
    functionName: "cleanup_expired_sessions",
    args: {
      p_now: string;
      p_limit: number;
    }
  ): PromiseLike<{
    error: unknown;
  }>;
};

export async function cleanupExpiredSessions(supabase: SupabaseRpcClient, now = new Date()) {
  try {
    const { error } = await supabase.rpc("cleanup_expired_sessions", {
      p_now: now.toISOString(),
      p_limit: 250
    });

    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
