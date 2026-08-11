"use client";
import Button from "./Button";

// Shared by StatsScreen and StatsPanel. Both previously rendered their
// "No stats yet — complete your first focus session!" empty state whenever
// personalStats was null, which included every failed request. Telling someone
// with months of history that they have none is worse than showing an error, so
// the two cases are now distinct.
export default function StatsErrorState({
  onRetry,
  className,
}: {
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`text-center py-16 px-6 ${className ?? ""}`}
    >
      <p className="text-danger text-lg font-display mb-2">
        Couldn&apos;t load your stats
      </p>
      <p className="text-faint text-sm mb-5">
        Nothing has been lost — your sessions are still recorded. This was a
        problem reaching the server.
      </p>
      <Button variant="surface" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
