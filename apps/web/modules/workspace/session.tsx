"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { createWorkspaceApi, sessionTokenSource } from "./api"
import { createWorkspaceStore, type WorkspaceStore } from "./model"
import { workspaceApiOrigin } from "./config"

const WorkspaceContext = createContext<WorkspaceStore | null>(null)

export function WorkspaceSessionProvider({
  children,
  identity,
  getToken,
  navigate,
  apiUrl,
  mode,
}: {
  children: ReactNode
  identity: string | null | undefined
  getToken: () => Promise<string | null>
  navigate: (path: string) => void
  apiUrl: string | undefined
  mode: string
}) {
  const token = useMemo(() => sessionTokenSource(identity), [identity])
  useEffect(() => {
    token.update(getToken)
  }, [getToken, token])
  const store = useMemo(() => {
    const url = workspaceApiOrigin(apiUrl, mode)
    const currentToken = token.getToken
    return createWorkspaceStore({
      api: createWorkspaceApi({ url, getToken: currentToken }),
      url,
      getToken: currentToken,
      navigate,
    })
  }, [navigate, token, apiUrl, mode])
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
