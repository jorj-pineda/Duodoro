"use client";
import { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  open: boolean;
  currentName: string;
  changedAt: string | null;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

function getCooldownText(changedAt: string | null): string | null {
  if (!changedAt) return null;
  const unlockAt = new Date(changedAt).getTime() + 7 * 24 * 60 * 60 * 1000;
  const remaining = unlockAt - Date.now();
  if (remaining <= 0) return null;
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return `Available in ${days} day${days === 1 ? "" : "s"}`;
}

export default function DisplayNameChangeModal({
  open,
  currentName,
  changedAt,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const cooldown = getCooldownText(changedAt);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      setError("Must be 1-50 characters");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(trimmed);
    } catch (err: any) {
      setError(err?.message ?? "Failed to change display name");
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-line rounded-2xl p-6 shadow-2xl w-[calc(100vw-1rem)] sm:w-80"
      >
        <h3 className="font-display text-ink tracking-wide text-base mb-1">
          Change display name
        </h3>
        <p className="text-faint text-xs mb-4">
          Current: {currentName}
        </p>
        {cooldown ? (
          <>
            <p className="text-gold text-xs mb-4">{cooldown}</p>
            <button
              onClick={onClose}
              className="w-full text-muted hover:text-ink text-sm py-3 sm:py-2 rounded-xl transition-colors"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <input
              className={`w-full px-3 py-3 sm:py-2 bg-raise border rounded-lg text-ink text-sm placeholder-faint focus:outline-none transition-colors mb-1 ${
                error
                  ? "border-danger focus:border-danger"
                  : "border-line focus:border-accent"
              }`}
              placeholder="New display name"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.slice(0, 50));
                setError("");
              }}
              maxLength={50}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
            <p className="text-faint text-[10px] mb-3">
              1-week cooldown after changing.
            </p>
            {error && (
              <p className="text-danger text-xs mb-3">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 text-muted hover:text-ink text-sm py-3 sm:py-2 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || value.trim().length < 1}
                className="flex-1 bg-accent hover:brightness-105 text-white font-bold text-sm py-3 sm:py-2 rounded-xl transition-all disabled:opacity-40"
              >
                {submitting ? "..." : "Confirm"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
