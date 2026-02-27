"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FEATURES = [
  { icon: "🐾", label: "Companion pets that walk with you" },
  { icon: "🎨", label: "Exclusive premium character skins" },
  { icon: "📊", label: "Focus stats & session history" },
  { icon: "🌍", label: "Unlock all world themes" },
  { icon: "🔔", label: "Friend session notifications" },
];

export default function PremiumModal({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleWaitlist = async () => {
    if (!email.includes("@")) return;
    setStatus("loading");
    try {
      const { error } = await getSupabase()
        .from("waitlist")
        .insert({ email });
      if (error && error.code !== "23505") throw error; // 23505 = duplicate
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.4 }}
          >
            <div
              className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors text-xl"
              >
                ✕
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">🐾</div>
                <h2 className="text-2xl font-black font-mono text-white">
                  Duodoro Premium
                </h2>
                <p className="text-gray-400 text-sm mt-1 font-mono">
                  Coming soon — join the waitlist
                </p>
              </div>

              {/* Feature list */}
              <ul className="space-y-2.5 mb-7">
                {FEATURES.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-sm text-gray-300">
                    <span className="text-xl flex-shrink-0">{f.icon}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              {/* Waitlist signup */}
              {status === "done" ? (
                <div className="text-center text-emerald-400 font-mono text-sm py-3">
                  ✓ You&apos;re on the list! We&apos;ll let you know when Premium launches.
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleWaitlist()}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleWaitlist}
                      disabled={status === "loading" || !email.includes("@")}
                      className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-xl transition-all font-mono text-sm"
                    >
                      {status === "loading" ? "..." : "Notify me"}
                    </button>
                  </div>
                  {status === "error" && (
                    <p className="text-red-400 text-xs font-mono mt-2 text-center">
                      Something went wrong. Try again.
                    </p>
                  )}
                  <p className="text-gray-600 text-xs font-mono text-center mt-3">
                    Stripe integration coming soon • No spam, ever
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
