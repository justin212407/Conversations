"use client"
import { UserButton } from "@clerk/nextjs"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { WorkspaceNavigation } from "@/modules/workspace/workspace-screen"
import { useWorkspace } from "@/modules/workspace/context"

export function DashboardSidebar() {
  const { state, store } = useWorkspace(),
    router = useRouter(),
    { resolvedTheme, setTheme } = useTheme()
  return (
    <WorkspaceNavigation
      state={state}
      store={store}
      navigate={(id) =>
        router.push(id ? "/conversations/" + id : "/conversations")
      }
      identity={<UserButton showName />}
      theme={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Toggle color theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
        </Button>
      }
    />
  )
}
