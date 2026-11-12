import { createConnection } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { URL } from "node:url"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, basename, join } from "node:path"
import { access, chmod, mkdir, realpath, rm } from "node:fs/promises"
import {
  childEnvironment,
  GateFailure,
  privateRunDirectory,
} from "./runtime.mjs"

export async function bounded(work, milliseconds = 5000) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new GateFailure("browser-cleanup", "command_timeout")),
          milliseconds
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export const processExited = (child) =>
  child &&
  (Number.isInteger(child.exitCode) || typeof child.signalCode === "string")

export async function controlListenerClosed(endpoint, timeout = 5000) {
  let url
  try {
    url = new URL(endpoint)
    if (
      url.protocol !== "ws:" ||
      !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      !url.port ||
      url.username ||
      url.password
    )
      return false
  } catch {
    return false
  }
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const closed = await new Promise((resolve) => {
      const socket = createConnection({
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: Number(url.port),
      })
      const finish = (value) => {
        socket.destroy()
        resolve(value)
      }
      socket.once("connect", () => finish(false))
      socket.once("error", (error) => finish(error.code === "ECONNREFUSED"))
      socket.setTimeout(100, () => finish(false))
    })
    if (closed) return true
    await delay(20)
  }
  return false
}

export async function closeBrowser(
  { server, browser, profile },
  { timeout = 5000, verifyControl = controlListenerClosed } = {}
) {
  if (!server) return false
  const child = server.process()
  try {
    await bounded(async () => {
      await browser?.close()
      await server.close()
    }, timeout)
  } catch {
    try {
      await bounded(() => server.kill(), timeout)
    } catch {
      // A failed close is followed by owned termination and exit verification.
    }
  }
  if (!processExited(child)) {
    try {
      await bounded(() => server.kill(), timeout)
    } catch {
      // A failed close is followed by owned termination and exit verification.
    }
  }
  if (!processExited(child) || browser?.isConnected()) return false
  const controlClosed = await verifyControl(server.wsEndpoint?.())
  if (!profile) return false
  try {
    await rm(profile, { recursive: true, force: true })
    await access(profile)
    return false
  } catch (error) {
    return error.code === "ENOENT" && controlClosed
  }
}

export async function browserOwner(owned, signal) {
  // Playwright creates its profile in the *parent* Node os.tmpdir(), not merely
  // the browser child's TMPDIR. Validate that location before loading/launching.
  const probe = await privateRunDirectory()
  await probe.remove()
  const root = await realpath(tmpdir())
  if (process.platform !== "win32" && Buffer.byteLength(root) > 40)
    throw new GateFailure("browser-temporary-root", "precondition")
  const require = createRequire(
    new URL("../../apps/web/package.json", import.meta.url)
  )
  const { chromium } = require("playwright")
  await access(chromium.executablePath())
  const artifacts = join(owned.directory, "browser-artifacts")
  await mkdir(artifacts, { mode: 0o700 })
  let server,
    browser,
    profile,
    cleaning,
    launching,
    attempted = false
  const captures = []
  const captureRaw = (kind, value) => {
    if (captures.length < 100)
      captures.push({ kind, value: String(value).slice(0, 2048) })
  }
  const cleanup = () =>
    (cleaning ??= (async () => {
      signal?.removeEventListener("abort", abort)
      // Never race a still-running launch into an orphan after cleanup. Both
      // public launch/connect calls below have their own finite API deadlines.
      try {
        await launching
      } catch {
        // A failed close is followed by owned termination and exit verification.
      }
      let clean = !attempted
      if (server) clean = await closeBrowser({ server, browser, profile })
      try {
        await owned.write("browser-captures.json", JSON.stringify(captures))
      } catch {
        clean = false
      }
      return clean
    })())
  const abort = () => {
    void cleanup()
  }
  signal?.addEventListener("abort", abort, { once: true })
  return {
    cleanup,
    captureRaw,
    launch() {
      if (signal?.aborted)
        throw new GateFailure("browser-launch", "interrupted")
      attempted = true
      launching = (async () => {
        server = await chromium.launchServer({
          headless: true,
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
          host: "127.0.0.1",
          timeout: 15000,
          artifactsDir: artifacts,
          args: ["--mute-audio"],
          env: { ...childEnvironment(), TMPDIR: root },
        })
        const child = server.process()
        const argument = child.spawnargs.find((value) =>
          value.startsWith("--user-data-dir=")
        )
        const candidate = argument?.slice("--user-data-dir=".length)
        if (
          !candidate ||
          dirname(candidate) !== root ||
          !/^playwright_chromiumdev_profile-[A-Za-z0-9]+$/.test(
            basename(candidate)
          )
        )
          throw new GateFailure("browser-profile", "precondition")
        profile = await realpath(candidate)
        if (dirname(profile) !== root)
          throw new GateFailure("browser-profile", "precondition")
        await chmod(profile, 0o700)
        browser = await chromium.connect(server.wsEndpoint(), {
          timeout: 15000,
        })
        if (signal?.aborted)
          throw new GateFailure("browser-launch", "interrupted")
        return browser
      })()
      return launching
    },
    async context(origins) {
      const context = await browser.newContext({ serviceWorkers: "block" })
      context.setDefaultTimeout(15000)
      let unexpected = 0,
        pageErrors = 0,
        microphoneRequests = 0
      await context.route("**/*", (route) => {
        if (origins.includes(new URL(route.request().url()).origin))
          return route.continue()
        unexpected++
        captureRaw("blocked-request", route.request().url())
        return route.abort()
      })
      await context.routeWebSocket(
        (url) =>
          !origins.some(
            (origin) => url.origin === origin.replace(/^http/, "ws")
          ),
        (route) => {
          unexpected++
          route.close()
        }
      )
      context.on("page", (page) => {
        page.on("console", (message) => captureRaw("console", message.text()))
        page.on("pageerror", (error) => {
          pageErrors++
          captureRaw("page-error", error.stack)
        })
      })
      await context.exposeBinding("regressionMicrophoneRequest", () => {
        microphoneRequests++
      })
      await context.addInitScript(() => {
        globalThis.fixtureMicRequests = 0
        if (globalThis.navigator.mediaDevices)
          globalThis.navigator.mediaDevices.getUserMedia = async () => {
            globalThis.fixtureMicRequests++
            await globalThis.regressionMicrophoneRequest()
            throw Error("Microphone unavailable in text gate")
          }
      })
      return {
        context,
        verify() {
          if (unexpected || pageErrors || microphoneRequests)
            throw new GateFailure("browser-runtime", "assertion")
        },
        counts: () => ({ unexpected, pageErrors, microphoneRequests }),
      }
    },
    async capture(page, name) {
      if (!/^[a-z-]{1,40}$/.test(name))
        throw new GateFailure("browser-capture", "precondition")
      const path = join(artifacts, name + ".png")
      await page.screenshot({ path })
      await chmod(path, 0o600)
    },
  }
}
