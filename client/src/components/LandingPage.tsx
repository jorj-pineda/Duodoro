"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import PixelCharacter from "./PixelCharacter";
import { signInWithProvider } from "@/lib/supabase";
import { DEFAULT_AVATAR } from "@/lib/avatarData";

// Two sample characters walking toward each other on the landing page
const LEFT_CHAR = { ...DEFAULT_AVATAR, outfitColor: "#3B5BDB" };
const RIGHT_CHAR = { ...DEFAULT_AVATAR, hairColor: "#C9428B", outfitColor: "#C9428B", skinColor: "#F3C08C" };

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function LandingPage() {
  const [loading, setLoading] = useState<"google" | "discord" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (provider: "google" | "discord") => {
    setLoading(provider);
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch {
      setError("Sign in failed. Please try again.");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      {/* ── Pixel sky scene ── */}
      <div
        className="relative w-full flex-shrink-0 overflow-hidden"
        style={{
          height: "55vh",
          background: "linear-gradient(180deg, #0f172a 0%, #1e3a5f 60%, #7EC8E3 100%)",
        }}
      >
        {/* Stars */}
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: i % 4 === 0 ? 2 : 1,
              height: i % 4 === 0 ? 2 : 1,
              left: `${(i * 37 + 11) % 100}%`,
              top: `${(i * 17 + 5) % 55}%`,
              opacity: 0.5 + (i % 3) * 0.15,
            }}
          />
        ))}

        {/* Ground */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: "30%",
            background: "linear-gradient(180deg, #4a7c59 0%, #3d6849 100%)",
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-green-600/40" />
        </div>

        {/* Trees */}
        {[8, 18, 76, 88].map((left, i) => (
          <div
            key={i}
            className="absolute bottom-[26%]"
            style={{ left: `${left}%` }}
          >
            <div className="flex flex-col items-center">
              <div className="w-0 h-0" style={{ borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "12px solid #2d6a4f" }} />
              <div className="w-0 h-0 -mt-1" style={{ borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "14px solid #40916c" }} />
              <div className="w-0 h-0 -mt-1" style={{ borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderBottom: "14px solid #52b788" }} />
              <div className="w-2 h-6 bg-amber-900/70" />
            </div>
          </div>
        ))}

        {/* Heart at center */}
        <motion.div
          className="absolute bottom-[28%] left-1/2 -translate-x-1/2 text-3xl"
          animate={{ y: [0, -8, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          ❤️
        </motion.div>

        {/* Demo characters walking toward each other */}
        <motion.div
          className="absolute bottom-[26%]"
          animate={{ left: ["5%", "40%"] }}
          transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
        >
          <PixelCharacter {...LEFT_CHAR} anim="walk" facing="right" size={3} />
        </motion.div>
        <motion.div
          className="absolute bottom-[26%]"
          animate={{ right: ["5%", "40%"] }}
          transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
        >
          <PixelCharacter {...RIGHT_CHAR} anim="walk" facing="left" size={3} />
        </motion.div>
      </div>

      {/* ── Copy + CTAs ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6 text-center">
        <div>
          <h1 className="text-5xl font-black font-mono tracking-tight text-white drop-shadow-lg">
            DuoFocus
          </h1>
          <p className="mt-2 text-gray-400 text-lg font-mono">
            Focus together, no matter the distance
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {["👥 Friends list", "🎮 Break mini-game", "📝 Shared journal", "🐾 Pets (Premium)"].map((f) => (
            <span
              key={f}
              className="bg-gray-800 text-gray-300 text-xs font-mono px-3 py-1.5 rounded-full border border-gray-700"
            >
              {f}
            </span>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => handleAuth("google")}
            disabled={loading !== null}
            className="flex items-center justify-center gap-3 w-full bg-white hover:bg-gray-100 active:scale-95 text-gray-900 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg disabled:opacity-60"
          >
            <GoogleIcon />
            {loading === "google" ? "Signing in..." : "Continue with Google"}
          </button>

          <button
            onClick={() => handleAuth("discord")}
            disabled={loading !== null}
            className="flex items-center justify-center gap-3 w-full bg-[#5865F2] hover:bg-[#4752c4] active:scale-95 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg disabled:opacity-60"
          >
            <DiscordIcon />
            {loading === "discord" ? "Signing in..." : "Continue with Discord"}
          </button>

          {error && (
            <p className="text-red-400 text-sm font-mono text-center">{error}</p>
          )}
        </div>

        <p className="text-gray-600 text-xs font-mono max-w-xs">
          By signing in you agree to our terms of service. No spam, ever.
        </p>
      </div>
    </div>
  );
}
