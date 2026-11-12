import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.{ts,js}"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
  },
})
