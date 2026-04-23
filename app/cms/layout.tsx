import { headers } from "next/headers"

import { getSession } from "@/lib/internal/auth-session"
import { CmsShell } from "./cms-shell"
import { LoginScreen } from "./login-screen"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.bhaskarapp.com"

async function buildLoginUrl() {
  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? ""
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https"
  const origin = `${proto}://${host}`
  const url = requestHeaders.get("x-url") ?? "/cms"

  let pathname = "/cms"
  try {
    const parsed = new URL(url, origin)
    pathname = parsed.pathname
    if (parsed.search) pathname += parsed.search
  } catch {
    // keep default
  }

  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(pathname)}`
  return `${AUTH_URL}?returnTo=${encodeURIComponent(callbackUrl)}`
}

export default async function CmsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession()

  if (!session) {
    const loginUrl = await buildLoginUrl()
    return <LoginScreen loginUrl={loginUrl} />
  }

  return <CmsShell session={session}>{children}</CmsShell>
}
