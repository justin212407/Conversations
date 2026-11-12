import process from "node:process"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { join, relative, isAbsolute, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { ownedProcess } from "../../../scripts/regression/process.mjs"
import {
  GateFailure,
  validatePrivateDirectory,
} from "../../../scripts/regression/runtime.mjs"

async function fixtureDirectory(owned, directory) {
  const root = await validatePrivateDirectory(owned.directory)
  const target = await validatePrivateDirectory(directory)
  const child = relative(root, target)
  if (
    root !== owned.directory ||
    target !== resolve(directory) ||
    !isAbsolute(directory) ||
    (child &&
      (isAbsolute(child) || child === ".." || child.startsWith(".." + sep)))
  )
    throw new GateFailure("fixture-directory", "precondition")
  return target
}

// The caller owns a validated private directory and the complete lifetime.
// No fixture assets or temporary profile files are written into the checkout.
export async function startFixtureServer({
  owned,
  directory = owned.directory,
  port = 0,
  service = false,
  signal,
  own,
  hold,
  onStage,
}) {
  directory = await fixtureDirectory(owned, directory)
  const builder = ownedProcess(owned, {
    signal,
    stage: "fixture-build",
    capture: service ? "service-build.json" : "renderer-build.json",
    onStage,
    timeoutAfterStageMs: hold === "--hold-ignore-term" ? 50 : undefined,
  })
  own?.(() => builder.cleanup())
  await builder.run(process.execPath, [
    fileURLToPath(new URL("./build-browser-fixture.mjs", import.meta.url)),
    directory,
    service ? "service" : "renderer",
    ...(hold ? [hold] : []),
  ])
  if (signal?.aborted) throw new GateFailure("fixture-listen", "interrupted")
  return serveFixture({ owned, directory, port, signal, own })
}

export async function serveFixture({
  owned,
  directory = owned.directory,
  port = 0,
  signal,
  own,
}) {
  const folder = await fixtureDirectory(owned, directory)
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
  const sockets = new Set(),
    controller = new AbortController()
  let cleaning
  const close = () =>
    (cleaning ??= (async () => {
      controller.abort()
      signal?.removeEventListener("abort", abort)
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
  const abort = () => {
    void close().catch(() => {})
  }
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    if (cleaning) socket.destroy()
  })
  own?.(close)
  signal?.addEventListener("abort", abort, { once: true })
  let timer
  try {
    if (signal?.aborted) throw new GateFailure("fixture-listen", "interrupted")
    await new Promise((resolve, reject) => {
      const stop = () =>
        reject(
          new GateFailure(
            "fixture-listen",
            signal?.aborted ? "interrupted" : "command_timeout"
          )
        )
      controller.signal.addEventListener("abort", stop, { once: true })
      server.once("error", () =>
        reject(new GateFailure("fixture-listen", "command_failed"))
      )
      timer = setTimeout(() => {
        controller.abort()
      }, 5000)
      server.listen(
        { port, host: "127.0.0.1", signal: controller.signal },
        resolve
      )
    })
    if (signal?.aborted || cleaning)
      throw new GateFailure("fixture-listen", "interrupted")
    return { origin: "http://127.0.0.1:" + server.address().port, close }
  } catch (error) {
    if (!(await close()))
      throw new GateFailure("fixture-listen-cleanup", "cleanup_failed")
    throw error
  } finally {
    clearTimeout(timer)
  }
}
