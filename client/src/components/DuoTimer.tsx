"use client";
import { useState } from "react";
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
import SessionTopBar from "./SessionTopBar";
import SessionHUD from "./SessionHUD";
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

  // ── Loading ─────────────────────────────────────────────────────────────
  if (appStep === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="text-4xl font-black font-mono text-white tracking-widest">
            Duodoro
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <span className="text-gray-600 text-xs font-mono">
            signing you in...
          </span>
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <AvatarCreator
          initialConfig={myAvatar}
          initialDisplayName={profile?.display_name ?? ""}
          onBack={isEditing ? () => setAppStep("home") : undefined}
          onSave={async (config, name) => {
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
          onRejoinSession={() => setAppStep("game")}
          onJoinSession={handleJoinSession}
          onInvite={handleSendInvite}
          onEditAvatar={() => setAppStep("avatar")}
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
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-mono font-bold px-4 py-2.5 rounded-xl shadow-lg"
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
  }

  // ── Game Screen ─────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-gray-900 text-white flex flex-col"
      onClick={() => setProfileMenuOpen(false)}
    >
      <SessionTopBar
        phase={game.phase}
        displayName={displayName}
        username={profile?.username}
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
      />

      {/* ── Game World (contained card) ── */}
      <div className="w-full max-w-3xl mx-auto px-3 pb-3 mt-auto">
        <div className="rounded-2xl overflow-hidden border border-gray-700/60 shadow-2xl">
          <GameWorld
            worldId={game.myWorld}
            phase={game.phase}
            focusProgress={game.focusProgress}
            returningProgress={game.returningProgress}
            me={{ id: game.myId, avatar: myAvatar }}
            partner={game.partner}
            myPet={game.myPet}
            partnerPet={null}
            myName={profile?.display_name ?? profile?.username}
            partnerName={game.partnerName}
          />
        </div>
      </div>

      {/* ── Leave session ── */}
      <div className="text-center pb-4">
        <button
          onClick={handleLeaveSession}
          className="text-gray-700 hover:text-gray-400 text-xs font-mono transition-colors"
        >
          {"←"} leave session
        </button>
      </div>

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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-mono font-bold px-4 py-2.5 rounded-xl shadow-lg"
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
          <StickyNote
            open={notesOpen}
            onClose={() => setNotesOpen(false)}
            userId={profile.id}
            roomCode={game.sessionId || null}
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
    </div>
  );
}
