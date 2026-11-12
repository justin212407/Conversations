import process from "node:process"
// Build-only child. It never owns a listener, browser, provider or Docker resource.
import { createRequire } from "node:module"
import { build, stop } from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { writeFile, chmod, mkdir } from "node:fs/promises"
import { join, dirname, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"

const web = dirname(dirname(fileURLToPath(import.meta.url)))
const [directory, selector, hold] = process.argv.slice(2)
const service = selector === "service"
try {
  if (
    !directory ||
    !isAbsolute(directory) ||
    !["renderer", "service"].includes(selector) ||
    (hold && !["--hold-after-bundle", "--hold-ignore-term"].includes(hold)) ||
    process.argv.length > 5
  )
    throw Error("Invalid fixture build arguments")
  const folder = directory
  const require = createRequire(import.meta.url)
  const shim = join(folder, "process-shim.js")
  // Match Next's browser ProvidePlugin; never supply the Node process/env.
  await writeFile(
    shim,
    "export { default as process } from " +
      JSON.stringify(require.resolve("next/dist/build/polyfills/process")) +
      ";",
    { mode: 0o600 }
  )
  await build({
    entryPoints: [
      join(
        web,
        service
          ? "test/service-browser-fixture.tsx"
          : "test/browser-fixture.tsx"
      ),
    ],
    inject: [shim],
    bundle: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    outfile: join(folder, "fixture.js"),
    logLevel: "silent",
    define: {
      global: "globalThis",
      // NCC browser shims assign their unused require.ab from webpack's root dirname.
      __dirname: '"/"',
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_RUNTIME": '""',
    },
    plugins: [
      {
        name: "fixture-next-link",
        setup(builder) {
          builder.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "next-link",
            namespace: "fixture",
          }))
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              'import React from "react";export default function Link(props){return React.createElement("a",props)}',
            loader: "js",
            resolveDir: web,
          }))
        },
      },
    ],
  })
  await chmod(join(folder, "fixture.js"), 0o600)
  process.send?.("bundle-complete")
  if (hold) {
    if (hold === "--hold-ignore-term") process.on("SIGTERM", () => {})
    setTimeout(async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 })
      await writeFile(join(folder, "late-write"), "late fixture writer", {
        mode: 0o600,
      })
    }, 3000)
    setInterval(() => {}, 1000)
    await new Promise(() => {})
  }
  const css = await postcss([tailwind({ base: web })]).process(
    '@import "@workspace/ui/globals.css";\n@source "../modules/workspace";\n:root{--font-sans:Arial,Helvetica,sans-serif;--font-mono:monospace}',
    { from: join(web, "test/fixture.css") }
  )
  await writeFile(join(folder, "fixture.css"), css.css, { mode: 0o600 })
} catch (error) {
  // Private diagnostics remain in the already owned output directory, never stdout.
  try {
    await writeFile(
      join(directory, "build-failure.json"),
      JSON.stringify({ stack: error.stack }),
      { mode: 0o600 }
    )
  } catch {
    /* Exit still reports build failure without raw payload. */
  }
  process.exitCode = 1
} finally {
  stop()
  if (process.connected) process.disconnect()
}
