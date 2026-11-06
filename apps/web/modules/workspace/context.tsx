"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { createWorkspaceApi, sessionTokenSource } from "./api"
import { createWorkspaceStore, type WorkspaceStore } from "./model"
import { workspaceApiOrigin } from "./config"

const WorkspaceContext = createContext<WorkspaceStore | null>(null)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { getToken, userId } = useAuth(),
    router = useRouter()
  const token = useMemo(() => sessionTokenSource(userId), [userId])
  useEffect(() => {
    token.update(getToken)
  }, [getToken, token])
  const store = useMemo(() => {
    const url = workspaceApiOrigin(
      process.env.NEXT_PUBLIC_API_URL,
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Next.js replaces this constant at build time.
      process.env.NODE_ENV
    )
    const currentToken = token.getToken
    return createWorkspaceStore({
      api: createWorkspaceApi({ url, getToken: currentToken }),
      url,
      getToken: currentToken,
      navigate: (path) => router.push(path),
    })
  }, [router, token])
  useEffect(() => {
    void store.start()
    return () => store.stop()
  }, [store])
  return (
    <WorkspaceContext.Provider value={store}>
      {children}
    </WorkspaceContext.Provider>
  )
}
export function useWorkspace() {
  const store = useContext(WorkspaceContext)
  if (!store) throw new Error("Workspace provider is required")
  return {
    store,
    state: useSyncExternalStore(
      store.subscribe,
      store.snapshot,
      store.snapshot
    ),
  }
}
