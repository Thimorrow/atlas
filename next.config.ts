import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // webuntis ist eine Node-Server-Lib, nicht bundeln.
  serverExternalPackages: ["webuntis"],
};

export default nextConfig;
