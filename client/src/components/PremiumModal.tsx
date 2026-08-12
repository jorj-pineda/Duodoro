"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSupabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

// "Unlock all world themes" was here. It was already untrue — everyone could
// pick all eight — and the rotation makes it unsellable: there is no per-user
// world choice left to gate. The rest of this list is still ahead of the
// product (stats and history are open to all, and nothing in the codebase
// sends a notification); that is roadmap item 2's to settle, not this PR's.
const FEATURES = [
  { icon: "🐾", label: "Companion pets that walk with you" },
  { icon: "🎨", label: "Exclusive premium character skins" },
  { icon: "📊", label: "Focus stats & session history" },
  { icon: "🔔", label: "Friend session notifications" },
];

export default function PremiumModal({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );

  const handleWaitlist = async () => {
    if (!email.includes("@")) return;
    setStatus("loading");
    try {
      const { error } = await getSupabase().from("waitlist").insert({ email });
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
              className="bg-surface border border-line rounded-2xl p-8 max-w-sm w-full shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 w-10 h-10 sm:w-auto sm:h-auto flex items-center justify-center text-faint hover:text-ink transition-colors text-xl"
              >
                ✕
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">🐾</div>
                <h2 className="font-display text-2xl text-ink">
                  Duodoro Premium
                </h2>
                <p className="text-muted text-sm mt-1">
                  Coming soon — join the waitlist
                </p>
              </div>

              {/* Feature list */}
              <ul className="space-y-2.5 mb-7">
                {FEATURES.map((f) => (
                  <li
                    key={f.label}
                    className="flex items-center gap-3 text-sm text-ink"
                  >
                    <span className="text-xl flex-shrink-0">{f.icon}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              {/* Waitlist signup */}
              {status === "done" ? (
                <div className="text-center text-go text-sm py-3">
                  ✓ You&apos;re on the list! We&apos;ll let you know when
                  Premium launches.
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
                      className="flex-1 bg-raise border border-line rounded-xl px-4 py-2.5 text-ink text-sm placeholder-faint focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={handleWaitlist}
                      disabled={status === "loading" || !email.includes("@")}
                      className="bg-accent hover:brightness-105 active:scale-95 disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-xl transition-all text-sm"
                    >
                      {status === "loading" ? "..." : "Notify me"}
                    </button>
                  </div>
                  {status === "error" && (
                    <p className="text-danger text-xs mt-2 text-center">
                      Something went wrong. Try again.
                    </p>
                  )}
                  <p className="text-faint text-xs text-center mt-3">
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
