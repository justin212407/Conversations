import { fileURLToPath } from "node:url"

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
}

// Telemetry/build uploads and proxy tunnels are introduced explicitly in #24.
export default nextConfig
