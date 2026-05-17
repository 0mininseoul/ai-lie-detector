"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type AuthState = {
  user: User | null;
  status: "loading" | "ready";
  error: string;
};

export function useSupabaseUser(): AuthState & {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>({ user: null, status: "loading", error: "" });

  useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof createSupabaseBrowser>;

    try {
      supabase = createSupabaseBrowser();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Supabase 클라이언트를 만들지 못했습니다.";
      setState({ user: null, status: "ready", error: message });
      return;
    }

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setState({ user: data.session?.user ?? null, status: "ready", error: "" });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ user: null, status: "ready", error: "" });
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState({ user: session?.user ?? null, status: "ready", error: "" });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    try {
      const supabase = createSupabaseBrowser();
      await supabase.auth.signOut();
      setState((current) => ({ ...current, user: null }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "로그아웃이 막혔습니다.";
      setState((current) => ({ ...current, error: message }));
    }
  }

  async function refresh() {
    try {
      const supabase = createSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      setState({ user: data.session?.user ?? null, status: "ready", error: "" });
    } catch {
      setState((current) => ({ ...current, status: "ready" }));
    }
  }

  return { ...state, signOut, refresh };
}

export function getDisplayName(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { name?: string; full_name?: string; nickname?: string } | undefined;
  return meta?.name ?? meta?.full_name ?? meta?.nickname ?? user.email ?? "카카오 사용자";
}

export function getAvatarUrl(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as { avatar_url?: string; picture?: string } | undefined;
  return meta?.avatar_url ?? meta?.picture ?? "";
}
