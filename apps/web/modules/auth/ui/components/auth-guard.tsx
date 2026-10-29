"use client"

import { useAuth } from "@clerk/nextjs"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AuthLayout } from "../layouts/auth-layout"

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn } = useAuth(),
    router = useRouter()
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in")
  }, [isLoaded, isSignedIn, router])
  if (!isLoaded || !isSignedIn)
    return (
      <AuthLayout>
        <p role="status">Loading your workspace…</p>
      </AuthLayout>
    )
  return children
}
