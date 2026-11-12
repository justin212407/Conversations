// Test-only input adapter: session lifecycle is the actual production module.
import { useCallback, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import {
  WorkspaceSessionProvider,
  useWorkspace,
} from "../modules/workspace/session"
import {
  WorkspaceNavigation,
  WorkspaceScreen,
} from "../modules/workspace/workspace-screen"
import {
  displayedMessages,
  type WorkspaceStore,
} from "../modules/workspace/model"
import { verifyBrowserDiagnostics } from "./diagnostics-browser"

const navigate = (path: string) => {
  history.pushState(null, "", path)
  window.dispatchEvent(new Event("popstate"))
}
let setActor: (actor: string) => void, refresh: () => void
function Screen() {
  const { store, state } = useWorkspace()
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const update = () => setPath(location.pathname)
    window.addEventListener("popstate", update)
    return () => window.removeEventListener("popstate", update)
  }, [])
  useEffect(() => {
    store.select(path.split("/")[2] ?? null)
  }, [path, store])
  window.serviceFixture = {
    store,
    identity: setActor,
    refresh,
    documentId,
    displayed: () => displayedMessages(store.snapshot()),
    diagnostics: verifyBrowserDiagnostics,
  }
  return (
    <SidebarProvider>
      <WorkspaceNavigation
        state={state}
        store={store}
        navigate={(id) =>
          navigate(id ? "/conversations/" + id : "/conversations")
        }
        identity={<span>Test identity input</span>}
      />
      <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceScreen
          state={state}
          store={store}
          navigate={(id) =>
            navigate(id ? "/conversations/" + id : "/conversations")
          }
        />
      </main>
    </SidebarProvider>
  )
}
const documentId = crypto.randomUUID()
function App() {
  const [actor, updateActor] = useState("alice"),
    [revision, updateRevision] = useState(0)
  setActor = updateActor
  refresh = () => updateRevision((value) => value + 1)
  const getToken = useCallback(
    () => window.regressionToken(actor, revision),
    [actor, revision]
  )
  return (
    <ThemeProvider attribute="class">
      <WorkspaceSessionProvider
        identity={
          actor === "missing" ? null : "user_regression_browser_" + actor
        }
        getToken={getToken}
        navigate={navigate}
        apiUrl={window.regressionConfig.apiUrl}
        mode="test"
      >
        <Screen />
      </WorkspaceSessionProvider>
    </ThemeProvider>
  )
}
const host = document.getElementById("root")
if (!host) throw Error("Fixture host unavailable")
createRoot(host).render(<App />)
declare global {
  interface Window {
    regressionConfig: { apiUrl: string }
    regressionToken: (actor: string, revision: number) => Promise<string | null>
    serviceFixture: {
      store: WorkspaceStore
      identity: (actor: string) => void
      refresh: () => void
      documentId: string
      displayed: () => ReturnType<typeof displayedMessages>
      diagnostics: typeof verifyBrowserDiagnostics
    }
  }
}
