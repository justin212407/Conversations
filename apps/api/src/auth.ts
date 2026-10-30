import { verifyToken } from "@clerk/backend"
import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors"

export interface AuthConfig {
  issuer: string
  authorizedParties: string[]
  secretKey?: string
  jwtKey?: string
}

const developmentOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4303",
  "http://127.0.0.1:4303",
]

/** An unconfigured development API serves health only; production fails closed. */
export function loadAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): AuthConfig | undefined {
  const issuer = env.CLERK_JWT_ISSUER_DOMAIN?.trim()
  const secretKey = env.CLERK_SECRET_KEY?.trim() || undefined
  const jwtKey = env.CLERK_JWT_KEY?.trim() || undefined
  const origins = env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (!issuer && !secretKey && !jwtKey && env.NODE_ENV !== "production")
    return undefined
  if (!issuer || (!secretKey && !jwtKey))
    throw new Error("Invalid authentication configuration")
  const allowed = origins?.length
    ? origins
    : env.NODE_ENV === "production"
      ? []
      : developmentOrigins
  try {
    const url = new URL(issuer)
    if (
      url.protocol !== "https:" ||
      url.origin !== issuer ||
      url.username ||
      url.password
    )
      throw new Error()
    if (
      !allowed.length ||
      allowed.some((origin) => {
        const parsed = new URL(origin)
        return (
          !["https:", "http:"].includes(parsed.protocol) ||
          (env.NODE_ENV === "production" && parsed.protocol !== "https:") ||
          parsed.origin !== origin ||
          !!parsed.username ||
          !!parsed.password
        )
      })
    )
      throw new Error()
  } catch {
    throw new Error("Invalid authentication configuration")
  }
  return { issuer, authorizedParties: allowed, secretKey, jwtKey }
}

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication required")
  }
}
export class AuthenticationUnavailable extends Error {
  constructor() {
    super("Authentication unavailable")
  }
}

export async function authenticateBearer(
  header: string | undefined,
  config: AuthConfig | undefined
): Promise<string> {
  return (await authenticateSession(header, config)).subject
}
export async function authenticateSession(
  header: string | undefined,
  config: AuthConfig | undefined
): Promise<{ subject: string; sessionId: string; expiresAt: number }> {
  const match = header?.match(/^Bearer ([^\s]+)$/i)
  if (!match?.[1] || match[1].length > 16384) throw new AuthenticationError()
  if (!config) throw new AuthenticationUnavailable()
  try {
    const claims = await verifyToken(match[1], {
      issuer: config.issuer,
      authorizedParties: config.authorizedParties,
      secretKey: config.secretKey,
      jwtKey: config.jwtKey,
      clockSkewInMs: 0,
    })
    // Only completed user sessions are accepted, never machine/API credentials.
    if (
      typeof claims.sub !== "string" ||
      !/^user_[A-Za-z0-9_-]+$/.test(claims.sub) ||
      claims.sub.length > 255 ||
      typeof claims.sid !== "string" ||
      !/^sess_[A-Za-z0-9_-]+$/.test(claims.sid) ||
      (claims.sts !== undefined && claims.sts !== "active") ||
      typeof claims.exp !== "number" ||
      typeof claims.nbf !== "number" ||
      claims.iss !== config.issuer
    )
      throw new AuthenticationError()
    return {
      subject: claims.sub,
      sessionId: claims.sid,
      expiresAt: claims.exp * 1000,
    }
  } catch (error) {
    if (error instanceof AuthenticationError) throw error
    if (error instanceof TokenVerificationError) {
      const unavailable = [
        TokenVerificationErrorReason.RemoteJWKFailedToLoad,
        TokenVerificationErrorReason.InvalidSecretKey,
        TokenVerificationErrorReason.RemoteJWKInvalid,
        TokenVerificationErrorReason.RemoteJWKMissing,
        TokenVerificationErrorReason.LocalJWKMissing,
        TokenVerificationErrorReason.JWKFailedToResolve,
      ].includes(error.reason)
      if (!unavailable) throw new AuthenticationError()
    }
    // Network/SDK configuration errors are dependency failures, never bad sessions.
    throw new AuthenticationUnavailable()
  }
}
