"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useWorkspace } from "./context"
import { WorkspaceScreen } from "./workspace-screen"

export function WorkspacePage({
  conversationId = null,
}: {
  conversationId?: string | null
}) {
  const { state, store } = useWorkspace(),
    router = useRouter()
  useEffect(() => {
    store.select(conversationId)
  }, [store, conversationId])
  if (state.selectedId !== conversationId)
    return (
      <p role="status" className="m-auto p-6 text-sm text-muted-foreground">
        Opening conversation…
      </p>
    )
  return (
    <WorkspaceScreen
      key={conversationId ?? "list"}
      state={state}
      store={store}
      navigate={(id) =>
        router.push(id ? "/conversations/" + id : "/conversations")
      }
    />
  )
}
