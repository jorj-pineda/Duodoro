"use client";
import { useEffect, useState } from "react";
import {
  DEFAULT_AVATAR,
  type AvatarConfig,
} from "@/lib/avatarData";
import { getSupabase } from "@/lib/supabase";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import type { AppStep } from "@/lib/sessionTypes";

const PROFILE_CACHE_KEY = "duodoro_profile";

function cacheProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
  } catch {}
}

function getCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

export function useAuth() {
  const [appStep, setAppStep] = useState<AppStep>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myAvatar, setMyAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);

  const sb = getSupabase();

  useEffect(() => {
    let mounted = true;
    let sessionHandled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const hasOAuthCode = window.location.search.includes("code=");
    timeoutId = setTimeout(
      () => {
        if (mounted) setAppStep("landing");
      },
      hasOAuthCode ? 20000 : 8000,
    );

    const profileFromSession = (session: Session): Profile => {
      const { id, user_metadata, email } = session.user;
      const raw =
        (
          user_metadata?.preferred_username ||
          user_metadata?.user_name ||
          (email ?? "").split("@")[0] ||
          "user"
        )
          .replace(/[^a-zA-Z0-9_]/g, "")
          .toLowerCase() || "user";
      return {
        id,
        username: raw,
        display_name: user_metadata?.full_name ?? user_metadata?.name ?? raw,
        avatar_config: null,
        is_premium: false,
        current_room: null,
        current_session_id: null,
        current_world_id: null,
        updated_at: new Date().toISOString(),
      };
    };

    const applyProfile = (prof: Profile) => {
      if (!mounted) return;
      if (window.location.search.includes("code=")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      setProfile(prof);
      cacheProfile(prof);
      if (prof.avatar_config) {
        setMyAvatar(prof.avatar_config);
        setAppStep("home");
      } else {
        setAppStep("avatar");
      }
    };

    const handleSession = async (session: Session) => {
      if (sessionHandled) return;
      sessionHandled = true;
      clearTimeout(timeoutId);
      if (!mounted) return;

      const cached = getCachedProfile();
      if (cached && cached.id === session.user.id && cached.avatar_config) {
        applyProfile(cached);
        sb.from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data && mounted) {
              const fresh = data as Profile;
              setProfile(fresh);
              cacheProfile(fresh);
              if (fresh.avatar_config) setMyAvatar(fresh.avatar_config);
            }
          });
        return;
      }

      try {
        const result = await Promise.race([
          sb.from("profiles").select("*").eq("id", session.user.id).single(),
          new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 4000),
          ),
        ]);
        if (!mounted) return;

        if (result.data) {
          applyProfile(result.data as Profile);
        } else {
          const provisional = profileFromSession(session);
          applyProfile(provisional);
          sb.from("profiles")
            .upsert({
              id: provisional.id,
              username: provisional.username + "_" + provisional.id.slice(0, 4),
              display_name: provisional.display_name,
            })
            .then(() => {});
        }
      } catch {
        const provisional = profileFromSession(session);
        applyProfile(provisional);
      }
    };

    const loadUser = async () => {
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!mounted) return;
        if (!session) {
          if (!window.location.search.includes("code=")) setAppStep("landing");
          return;
        }
        await handleSession(session);
      } catch {
        if (mounted) setAppStep("landing");
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
          await handleSession(session);
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          clearCachedProfile();
          setAppStep("landing");
        }
      },
    );

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAvatar = async (config: AvatarConfig) => {
    if (!profile) return;
    await sb
      .from("profiles")
      .update({ avatar_config: config })
      .eq("id", profile.id);
    setMyAvatar(config);
    const updated = { ...profile, avatar_config: config };
    setProfile(updated);
    cacheProfile(updated);
  };

  const updateProfile = (updates: Partial<Profile>) => {
    if (!profile) return;
    const updated = { ...profile, ...updates };
    setProfile(updated);
    cacheProfile(updated);
  };

  const isPremium = profile?.is_premium ?? false;
  const displayName = profile?.display_name ?? profile?.username ?? "You";

  return {
    appStep,
    setAppStep,
    profile,
    setProfile,
    myAvatar,
    setMyAvatar,
    saveAvatar,
    updateProfile,
    isPremium,
    displayName,
    sb,
  };
}
