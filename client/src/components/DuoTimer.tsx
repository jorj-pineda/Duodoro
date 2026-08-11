"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AvatarCreator from "./AvatarCreator";
import GameWorld from "./GameWorld";
import LandingPage from "./LandingPage";
import FriendsPanel from "./FriendsPanel";
import StickyNote from "./StickyNote";
import PremiumModal from "./PremiumModal";
import StatsPanel from "./StatsPanel";
import StatsScreen from "./StatsScreen";
import HomeDashboard from "./HomeDashboard";
import InvitePopup from "./InvitePopup";
import ConnectionBanner from "./ConnectionBanner";
import SessionTopBar from "./SessionTopBar";
import SessionHUD from "./SessionHUD";
import UsernameChangeModal from "./UsernameChangeModal";
import DisplayNameChangeModal from "./DisplayNameChangeModal";
import { useAuth } from "@/hooks/useAuth";
import { useGameSession } from "@/hooks/useGameSession";

export default function DuoTimer() {
  const auth = useAuth();
  const game = useGameSession(auth.profile);

  // ── UI panel state ──────────────────────────────────────────────────────
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [fullStatsOpen, setFullStatsOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const showError = (message: string) => {
    setErrorToast(message);
    window.setTimeout(() => setErrorToast(null), 4000);
  };

  const { appStep, setAppStep, profile, myAvatar, isPremium, displayName, sb } =
    auth;
  const initial = displayName.charAt(0).toUpperCase();

  // ── Wrappers that bridge auth + game ────────────────────────────────────
  const handleCreateSession = (world: Parameters<typeof game.createSession>[0]) => {
    game.createSession(world, myAvatar);
    setAppStep("game");
  };

  const handleJoinSession = (sid: string) => {
    game.joinSession(sid, myAvatar);
    setAppStep("game");
  };

  const handleLeaveSession = () => {
    game.leaveSession();
    setAppStep("home");
  };

  const handleSendInvite = (targetUserId: string) => {
    game.sendInvite(targetUserId, myAvatar);
    if (!game.sessionId) setAppStep("game");
  };

  // ── Socket-reported errors ──────────────────────────────────────────────
  // A refused or stale join used to be console-only, stranding the user on an
  // empty game screen reading "Setting up…". Show it and send them home.
  useEffect(() => {
    if (!game.sessionError) return;
    showError(game.sessionError);
    game.clearSessionError();
    if (!game.sessionId) setAppStep((step) => (step === "game" ? "home" : step));
    // showError/setAppStep are stable; re-running on sessionId would re-fire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.sessionError]);

  // ── Resume after a page reload ──────────────────────────────────────────
  // The server holds our spot during its reconnect grace window; once we're
  // back on home with an avatar loaded, silently rejoin the stored session —
  // and jump straight back into the game screen if the timer is running.
  const resumingRef = useRef(false);
  useEffect(() => {
    if (appStep !== "home" || !game.resumeSessionId) return;
    resumingRef.current = true;
    game.joinSession(game.resumeSessionId, myAvatar);
    game.consumeResumeSession();
  }, [appStep, game, myAvatar]);
  useEffect(() => {
    if (resumingRef.current && game.sessionStarted && appStep === "home") {
      resumingRef.current = false;
      setAppStep("game");
    }
  }, [game.sessionStarted, appStep, setAppStep]);

  // Danger-styled sibling of the "Invite sent!" toast; rendered on every
  // screen that can produce an error (avatar/home/game)
  const errorToastEl = (
    <AnimatePresence>
      {errorToast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-danger text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-lg"
        >
          {errorToast}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Overlays shared by the home and game screens ────────────────────────
  const sharedOverlays = (
    <>
      {errorToastEl}
      <ConnectionBanner
        state={game.connectionState}
        inSession={Boolean(game.sessionId)}
        onRetry={game.reconnect}
      />

      {game.pendingInvite && (
        <InvitePopup
          invite={game.pendingInvite}
          onAccept={() => {
            if (game.pendingInvite?.sessionId)
              handleJoinSession(game.pendingInvite.sessionId);
            game.dismissInvite();
          }}
          onDismiss={game.dismissInvite}
        />
      )}
      <AnimatePresence>
        {game.inviteSentName && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-go text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-lg"
          >
            Invite sent!
          </motion.div>
        )}
      </AnimatePresence>
      {profile && (
        <>
          <FriendsPanel
            open={friendsOpen}
            onClose={() => setFriendsOpen(false)}
            myProfile={profile}
            onJoinSession={handleJoinSession}
            onInviteFriend={handleSendInvite}
          />
          <StatsPanel
            open={statsOpen}
            onClose={() => setStatsOpen(false)}
            userId={profile.id}
            onViewFullStats={() => {
              setStatsOpen(false);
              setFullStatsOpen(true);
            }}
          />
          <StatsScreen
            open={fullStatsOpen}
            onClose={() => setFullStatsOpen(false)}
            userId={profile.id}
          />
          <PremiumModal
            open={premiumOpen}
            onClose={() => setPremiumOpen(false)}
          />
        </>
      )}
    </>
  );

  // ── Loading ─────────────────────────────────────────────────────────────
  if (appStep === "loading") {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="font-display text-4xl text-ink tracking-wide">
            Duodoro
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full bg-accent animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-accent animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-accent animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <span className="text-faint text-xs">signing you in...</span>
        </div>
      </div>
    );
  }

  // ── Landing ─────────────────────────────────────────────────────────────
  if (appStep === "landing") {
    return <LandingPage />;
  }

  // ── Avatar creator ──────────────────────────────────────────────────────
  if (appStep === "avatar") {
    const isEditing = !!profile?.avatar_config;
    return (
      <div className="min-h-dvh bg-bg texture-dots flex items-center justify-center p-6">
        <AvatarCreator
          initialConfig={myAvatar}
          initialDisplayName={profile?.display_name ?? ""}
          onBack={isEditing ? () => setAppStep("home") : undefined}
          onSave={async (config, name, username) => {
            // Claim username (first setup only)
            if (username && profile) {
              try {
                const { data, error } = await sb.rpc("claim_username", {
                  desired_username: username,
                });
                if (error) throw error;
                const tag = data as { username: string; discriminator: string };
                auth.updateProfile({
                  username: tag.username,
                  discriminator: tag.discriminator,
                });
              } catch (err) {
                showError(
                  err instanceof Error
                    ? err.message
                    : "Failed to claim username",
                );
                return;
              }
            }
            await auth.saveAvatar(config);
            if (name && profile) {
              await sb
                .from("profiles")
                .update({ display_name: name })
                .eq("id", profile.id);
              auth.updateProfile({
                display_name: name,
                avatar_config: config,
              });
            }
            setAppStep("home");
          }}
        />
        {errorToastEl}
      </div>
    );
  }

  // ── Home Dashboard ──────────────────────────────────────────────────────
  if (appStep === "home") {
    return (
      <>
        <HomeDashboard
          profile={profile!}
          activeSessionId={game.sessionId || undefined}
          socketRef={game.socketRef}
          onFocus={handleCreateSession}
          selectedWorld={game.myWorld}
          onSelectWorld={game.setMyWorld}
          onRejoinSession={() => setAppStep("game")}
          onJoinSession={handleJoinSession}
          onInvite={handleSendInvite}
          onEditAvatar={() => setAppStep("avatar")}
          onChangeUsername={() => setUsernameModalOpen(true)}
          onChangeDisplayName={() => setDisplayNameModalOpen(true)}
          onSignOut={async () => {
            const { signOut } = await import("@/lib/supabase");
            await signOut();
          }}
          onOpenFriends={() => {
            setFriendsOpen(true);
            setStatsOpen(false);
          }}
          onOpenStats={() => {
            setStatsOpen((o) => !o);
            setFriendsOpen(false);
          }}
        />
        {sharedOverlays}
        <UsernameChangeModal
          open={usernameModalOpen}
          currentUsername={profile?.username ?? ""}
          onClose={() => setUsernameModalOpen(false)}
          onSubmit={async (newUsername) => {
            const { data, error } = await sb.rpc("claim_username", {
              desired_username: newUsername,
            });
            if (error) throw error;
            const tag = data as { username: string; discriminator: string };
            auth.updateProfile({
              username: tag.username,
              discriminator: tag.discriminator,
              username_changed: true,
            });
            setUsernameModalOpen(false);
          }}
        />
        <DisplayNameChangeModal
          open={displayNameModalOpen}
          currentName={profile?.display_name ?? profile?.username ?? ""}
          changedAt={profile?.display_name_changed_at ?? null}
          onClose={() => setDisplayNameModalOpen(false)}
          onSubmit={async (newName) => {
            const { data, error } = await sb.rpc("change_display_name", {
              new_name: newName,
            });
            if (error) throw error;
            const result = data as {
              display_name: string;
              display_name_changed_at: string;
            };
            auth.updateProfile({
              display_name: result.display_name,
              display_name_changed_at: result.display_name_changed_at,
            });
            setDisplayNameModalOpen(false);
          }}
        />
      </>
    );
  }

  // ── Game Screen ─────────────────────────────────────────────────────────
  return (
    <div
      className="h-dvh bg-bg text-white relative overflow-hidden"
      onClick={() => setProfileMenuOpen(false)}
    >
      {/* ── Game World (full-screen background) ── */}
      <div className="absolute inset-0">
        <GameWorld
          worldId={game.myWorld}
          phase={game.phase}
          focusProgress={game.focusProgress}
          returningProgress={game.returningProgress}
          me={{ id: game.myId, avatar: myAvatar }}
          partner={game.partner}
          myPet={game.myPet}
          partnerPet={game.partnerPet}
          partnerDisconnected={game.partnerDisconnected}
          myName={profile?.display_name ?? profile?.username}
          partnerName={game.partnerName}
        />
      </div>

      {/* ── Overlay UI ── */}
      <div className="relative z-10 flex flex-col h-full">
        <SessionTopBar
          phase={game.phase}
          displayName={displayName}
          username={profile?.username}
          discriminator={profile?.discriminator}
          initial={initial}
          isPremium={isPremium}
          friendsOpen={friendsOpen}
          notesOpen={notesOpen}
          statsOpen={statsOpen}
          profileMenuOpen={profileMenuOpen}
          onToggleFriends={() => {
            setFriendsOpen((o) => !o);
            setNotesOpen(false);
            setStatsOpen(false);
          }}
          onToggleNotes={() => {
            setNotesOpen((o) => !o);
            setFriendsOpen(false);
            setStatsOpen(false);
          }}
          onToggleStats={() => {
            setStatsOpen((o) => !o);
            setNotesOpen(false);
            setFriendsOpen(false);
          }}
          onToggleProfileMenu={() => setProfileMenuOpen((o) => !o)}
          onGoHome={() => setAppStep("home")}
          onEditAvatar={() => {
            setAppStep("avatar");
            setProfileMenuOpen(false);
          }}
          onOpenPremium={() => {
            setPremiumOpen(true);
            setProfileMenuOpen(false);
          }}
          onSignOut={async () => {
            const { signOut } = await import("@/lib/supabase");
            await signOut();
            setProfileMenuOpen(false);
          }}
        />

        <SessionHUD
          phase={game.phase}
          serverMode={game.serverMode}
          sessionStarted={game.sessionStarted}
          playerCount={game.playerCount}
          timeLeft={game.timeLeft}
          flowElapsed={game.flowElapsed}
          phaseProgress={game.phaseProgress}
          timerMode={game.timerMode}
          focusDuration={game.focusDuration}
          breakDuration={game.breakDuration}
          onTimerModeChange={game.setTimerMode}
          onFocusDurationChange={game.setFocusDuration}
          onBreakDurationChange={game.setBreakDuration}
          myPet={game.myPet}
          onPetSelect={game.setMyPet}
          isPremium={isPremium}
          onPremiumClick={() => setPremiumOpen(true)}
          onStart={game.startSession}
          onStop={game.stopSession}
          onFinishFlow={game.finishFlowFocus}
          onLeave={handleLeaveSession}
        />
      </div>

      {sharedOverlays}
      {profile && (
        <StickyNote
          open={notesOpen}
          onClose={() => setNotesOpen(false)}
          userId={profile.id}
          roomCode={game.sessionId || null}
          partnerUserId={game.partnerUserId}
          partnerName={game.partnerName}
        />
      )}
    </div>
  );
}
