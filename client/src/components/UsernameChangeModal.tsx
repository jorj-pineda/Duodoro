"use client";
import { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  open: boolean;
  currentUsername: string;
  onSubmit: (username: string) => Promise<void>;
  onClose: () => void;
}

export default function UsernameChangeModal({
  open,
  currentUsername,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!value || value.length < 3 || value.length > 20) {
      setError("Must be 3-20 characters");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(value)) {
      setError("Only lowercase letters, numbers, underscores");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(value);
    } catch (err: any) {
      setError(err?.message ?? "Failed to change username");
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
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl w-80"
      >
        <h3 className="text-white font-bold font-mono tracking-widest text-sm mb-1">
          CHANGE USERNAME
        </h3>
        <p className="text-gray-500 text-xs font-mono mb-4">
          Current: @{currentUsername} — you can only do this once!
        </p>
        <input
          className={`w-full px-3 py-2 bg-gray-900/60 border rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none transition-colors mb-1 ${
            error
              ? "border-red-500 focus:border-red-400"
              : "border-gray-600 focus:border-emerald-500"
          }`}
          placeholder="new_username"
          value={value}
          onChange={(e) => {
            const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
            setValue(val);
            setError("");
          }}
          maxLength={20}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoFocus
        />
        <p className="text-gray-600 text-[10px] font-mono mb-3">
          A new #tag will be generated automatically.
        </p>
        {error && (
          <p className="text-red-400 text-xs font-mono mb-3">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-gray-400 hover:text-white text-sm font-mono py-2 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || value.length < 3}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm font-mono py-2 rounded-xl transition-colors disabled:opacity-40"
          >
            {submitting ? "..." : "Confirm"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
