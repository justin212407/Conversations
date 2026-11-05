import { build } from "esbuild"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import { createServer } from "node:http"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import process from "node:process"

const web = dirname(dirname(fileURLToPath(import.meta.url))),
  folder = await mkdtemp(join(tmpdir(), "conversations-workspace-browser-"))
await build({
  entryPoints: [join(web, "test/browser-fixture.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  outfile: join(folder, "fixture.js"),
  define: { "process.env.NODE_ENV": '"production"' },
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
await writeFile(join(folder, "fixture.css"), css.css)
const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workspace interaction fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>'
const server = createServer(async (req, res) => {
  const file =
    req.url === "/fixture.js"
      ? "fixture.js"
      : req.url === "/fixture.css"
        ? "fixture.css"
        : null
  res.setHeader(
    "Content-Type",
    file?.endsWith(".js") ? "text/javascript" : file ? "text/css" : "text/html"
  )
  res.end(file ? await readFile(join(folder, file)) : html)
})
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port
  console.log(
    JSON.stringify({ url: `http://127.0.0.1:${port}`, pid: process.pid })
  )
})
const stop = () =>
  server.close(() => {
    void rm(folder, { recursive: true, force: true }).finally(() =>
      process.exit(0)
    )
  })
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
