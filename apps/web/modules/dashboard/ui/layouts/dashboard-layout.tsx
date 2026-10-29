import { AuthGuard } from "@/modules/auth/ui/components/auth-guard"
import { WorkspaceProvider } from "@/modules/workspace/context"
import { DashboardSidebar } from "@/modules/dashboard/ui/components/dashboard-sidebar"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { cookies } from "next/headers"
import { auth } from "@clerk/nextjs/server"

export const DashboardLayout = async ({
  children,
}: {
  children: React.ReactNode
}) => {
  await auth.protect()
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <AuthGuard>
      <WorkspaceProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <DashboardSidebar />
          <main
            className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden"
            id="main-content"
          >
            {children}
          </main>
        </SidebarProvider>
      </WorkspaceProvider>
    </AuthGuard>
  )
}
