import { createRequire } from "node:module"
import { build } from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { createServer } from "node:http"
import { readFile, writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const web = dirname(dirname(fileURLToPath(import.meta.url)))

// The caller owns a validated private directory and the complete lifetime.
// No fixture assets or temporary profile files are written into the checkout.
export async function startFixtureServer({
  directory,
  port = 0,
  service = false,
}) {
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
  const css = await postcss([tailwind({ base: web })]).process(
    '@import "@workspace/ui/globals.css";\n@source "../modules/workspace";\n:root{--font-sans:Arial,Helvetica,sans-serif;--font-mono:monospace}',
    { from: join(web, "test/fixture.css") }
  )
  await writeFile(join(folder, "fixture.css"), css.css, { mode: 0o600 })
  const html =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workspace interaction fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>'
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "GET") {
        res.writeHead(405)
        res.end()
        return
      }
      const file =
        req.url === "/fixture.js"
          ? "fixture.js"
          : req.url === "/fixture.css"
            ? "fixture.css"
            : null
      if (
        !file &&
        req.url !== "/" &&
        !/^\/conversations(?:\/[a-f0-9-]+)?$/.test(req.url)
      ) {
        res.writeHead(404)
        res.end()
        return
      }
      res.setHeader(
        "Content-Type",
        file?.endsWith(".js")
          ? "text/javascript"
          : file
            ? "text/css"
            : "text/html"
      )
      res.end(file ? await readFile(join(folder, file)) : html)
    } catch {
      res.writeHead(500)
      res.end()
    }
  })
  const sockets = new Set()
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  let cleaning
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close() {
      return (cleaning ??= (async () => {
        const closed = new Promise((resolve) => server.close(resolve))
        const exits = [...sockets].map(
          (socket) => new Promise((resolve) => socket.once("close", resolve))
        )
        for (const socket of sockets) socket.destroy()
        let timer
        try {
          return await Promise.race([
            (async () => {
              await closed
              await Promise.all(exits)
              return !server.listening && sockets.size === 0
            })(),
            new Promise((resolve) => {
              timer = setTimeout(() => resolve(false), 5000)
            }),
          ])
        } finally {
          clearTimeout(timer)
        }
      })())
    },
  }
}
