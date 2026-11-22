import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Never auto-write AGENTS.md into this public repo.
  agentRules: false,
};

export default nextConfig;
