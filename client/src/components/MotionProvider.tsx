"use client";
import { MotionConfig } from "framer-motion";

/** Makes every framer-motion animation respect the OS
 *  prefers-reduced-motion setting. */
export default function MotionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
