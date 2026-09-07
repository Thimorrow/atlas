"use client";

import dynamic from "next/dynamic";

const Lapse = process.env.NODE_ENV === "development"
  ? dynamic(() => import("@aiforui/lapse").then((mod) => mod.Lapse), { ssr: false })
  : () => null;

export function LapsePanel() {
  return <Lapse />;
}
