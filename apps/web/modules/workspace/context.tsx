"use client"

import { useCallback, type ReactNode } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { WorkspaceSessionProvider } from "./session"

export { useWorkspace } from "./session"

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { getToken, userId } = useAuth()
  const router = useRouter()
  const navigate = useCallback((path: string) => router.push(path), [router])
  return (
    <WorkspaceSessionProvider
      identity={userId}
      getToken={getToken}
      navigate={navigate}
      apiUrl={process.env.NEXT_PUBLIC_API_URL}
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Next.js replaces this constant at build time.
      mode={process.env.NODE_ENV}
    >
      {children}
    </WorkspaceSessionProvider>
  )
}
