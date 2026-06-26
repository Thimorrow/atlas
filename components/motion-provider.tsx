"use client";

import { MotionConfig } from "framer-motion";

// Globales Framer-Gate: respektiert die OS-Einstellung "Bewegung reduzieren".
// transform/opacity-Animationen werden dann auf ihren Endzustand kollabiert.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
