"use client";

import dynamic from "next/dynamic";

const Lapse = process.env.NODE_ENV === "development"
  // Optional local tool: production must also typecheck without the package.
  ? dynamic(() => Promise.resolve(require("@aiforui/lapse").Lapse), { ssr: false })
  : () => null;

export function LapsePanel() {
  return <Lapse />;
}
