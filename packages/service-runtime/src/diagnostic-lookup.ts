import { fork, type ChildProcess, type ForkOptions } from "node:child_process"
import { getDefaultResultOrder } from "node:dns"
import { isIP, type LookupFunction } from "node:net"
import { z } from "zod"

const budget = 600,
  termGrace = 50,
  killGrace = 100
const optionsSchema = z
  .object({
    family: z
      .union([
        z.literal(0),
        z.literal(4),
        z.literal(6),
        z.literal("IPv4"),
        z.literal("IPv6"),
      ])
      .optional(),
    hints: z.number().int().min(0).max(0xffffffff).optional(),
    all: z.boolean().optional(),
    verbatim: z.boolean().optional(),
    order: z.enum(["verbatim", "ipv4first", "ipv6first"]).optional(),
  })
  .strict()
export const lookupRequest = z
  .object({ hostname: z.string().min(1).max(1024), options: optionsSchema })
  .strict()
const address = z
  .object({
    address: z.string().max(64),
    family: z.union([z.literal(4), z.literal(6)]),
  })
  .strict()
  .refine((value) => isIP(value.address) === value.family)
export const lookupCode = z.enum([
  "ECANCELLED",
  "EFAIL",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "EAI_NODATA",
  "EAI_NONAME",
  "EAI_ADDRFAMILY",
  "EAI_MEMORY",
  "EAI_FAMILY",
  "EAI_BADFLAGS",
  "EAI_SERVICE",
  "EAI_SOCKTYPE",
  "EAI_SYSTEM",
  "ENODATA",
  "EFORMERR",
  "ESERVFAIL",
  "ENOTIMP",
  "EREFUSED",
  "EBADQUERY",
  "EBADNAME",
  "EBADFAMILY",
  "EBADRESP",
  "ECONNREFUSED",
  "ETIMEOUT",
  "EOF",
  "EFILE",
  "ENOMEM",
  "EDESTRUCTION",
  "EBADSTR",
  "EBADFLAGS",
  "ENONAME",
  "EBADHINTS",
  "ENOTINITIALIZED",
  "ELOADIPHLPAPI",
  "EADDRGETNETWORKPARAMS",
])
const responseSchema = z.union([
  z.object({ ok: z.literal(true), result: address }).strict(),
  z
    .object({ ok: z.literal(true), results: z.array(address).min(1).max(256) })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: lookupCode,
    })
    .strict(),
])
export type LookupResponse = z.infer<typeof responseSchema>
export function lookupMessage(value: unknown): LookupResponse | undefined {
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > 65536) return
    const parsed = responseSchema.safeParse(value)
    return parsed.success ? parsed.data : undefined
  } catch {
    return
  }
}
export function resolverEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  // Preserve OS/NSS configuration, never application credentials or Node imports.
  for (const name of [
    "PATH",
    "HOME",
    "TZ",
    "LANG",
    "LC_ALL",
    "LOCALDOMAIN",
    "RES_OPTIONS",
    "HOSTALIASES",
    "SystemRoot",
    "SYSTEMROOT",
  ])
    if (env[name] !== undefined) result[name] = env[name]
  return result
}
export const lookupFailure = (code = "ECANCELLED") =>
  Object.assign(new Error("Diagnostic name resolution failed"), { code })
type Launcher = (module: URL, options: ForkOptions) => ChildProcess
interface Job {
  cancel(): Promise<void>
}

/** One actual OS lookup at a time. A callback never precedes observed child exit. */
export class DiagnosticLookup {
  private pending: Job | undefined
  private closed = false
  private closing: Promise<void> | undefined
  constructor(
    private readonly dependencies: {
      worker?: URL
      launch?: Launcher
      environment?: NodeJS.ProcessEnv
    } = {}
  ) {}

  readonly lookup: LookupFunction = (hostname, options, callback) => {
    if (this.closed || this.pending) {
      queueMicrotask(() => callback(lookupFailure(), ""))
      return
    }
    const request = lookupRequest.safeParse({
      hostname,
      options: {
        ...options,
        ...(options.order === undefined && options.verbatim === undefined
          ? { order: getDefaultResultOrder() }
          : {}),
      },
    })
    if (!request.success) {
      queueMicrotask(() => callback(lookupFailure(), ""))
      return
    }
    let child: ChildProcess | undefined,
      response: LookupResponse | undefined,
      reason: string | undefined,
      delivered = false,
      finishing: Promise<void> | undefined,
      verified = false,
      spawned = false,
      spawnFailed = false,
      stopping: Promise<void> | undefined,
      timer: NodeJS.Timeout | undefined
    let resolveExit: () => void = () => {}
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    const waitExit = (ms: number) =>
      new Promise<void>((resolve) => {
        if (verified || spawnFailed) {
          resolve()
          return
        }
        const deadline = setTimeout(resolve, ms)
        void exited.then(() => {
          clearTimeout(deadline)
          resolve()
        })
      })
    const terminate = () =>
      (stopping ??= (async () => {
        if (!spawned || spawnFailed || verified) return
        child?.kill("SIGTERM")
        await waitExit(termGrace)
        if (!verified) {
          child?.kill("SIGKILL")
          await waitExit(killGrace)
        }
        if (!verified) throw lookupFailure()
      })())
    const deliver = (error?: NodeJS.ErrnoException) => {
      if (delivered) return
      delivered = true
      if (error) callback(error, "")
      else if (response?.ok && "results" in response)
        callback(null, response.results)
      else if (response?.ok && "result" in response)
        callback(null, response.result.address, response.result.family)
      else callback(lookupFailure(), "")
    }
    const finish = () =>
      (finishing ??= (async () => {
        clearTimeout(timer)
        try {
          if (response) await waitExit(20)
          await terminate()
          if (!verified && !spawnFailed) throw lookupFailure()
          if (child?.connected) child.disconnect()
          if (this.pending === job) this.pending = undefined
          deliver(
            reason
              ? lookupFailure(reason)
              : response && !response.ok
                ? lookupFailure(response.code)
                : undefined
          )
        } catch {
          // Keep an unverified child owned: close must continue to reject.
          if (verified || spawnFailed) deliver(lookupFailure())
          throw lookupFailure()
        }
      })())
    const fail = (code = "ECANCELLED") => {
      reason ??= code
      void finish().catch(() => {})
    }
    const job: Job = {
      cancel: () => {
        reason ??= "ECANCELLED"
        clearTimeout(timer)
        return finish()
      },
    }
    this.pending = job
    try {
      const launch =
        this.dependencies.launch ??
        ((module, settings) => fork(module, [], settings))
      child = launch(
        this.dependencies.worker ??
          new URL("./diagnostic-lookup-child.js", import.meta.url),
        {
          execArgv: [],
          env: resolverEnvironment(
            this.dependencies.environment ?? process.env
          ),
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          serialization: "json",
        }
      )
      spawned = true
      child.once("error", () => {
        spawnFailed = !child?.pid
        resolveExit()
        fail()
      })
      child.once("exit", () => {
        verified = true
        resolveExit()
        if (!response) fail()
      })
      child.once("message", (value: unknown) => {
        response = lookupMessage(value)
        if (
          !response ||
          (response.ok &&
            (request.data.options.all === true) !== "results" in response)
        ) {
          response = undefined
          fail()
          return
        }
        void finish().catch(() => {})
      })
      timer = setTimeout(() => fail(), budget)
      child.send(request.data, (error) => {
        if (error) fail()
      })
      if (this.closed) fail()
    } catch {
      spawnFailed = !child?.pid
      resolveExit()
      fail()
    }
  }
  close(): Promise<void> {
    this.closed = true
    return (this.closing ??= (async () => {
      await this.pending?.cancel()
    })())
  }
}
