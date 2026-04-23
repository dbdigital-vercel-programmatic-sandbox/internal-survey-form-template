import { headers } from "next/headers"

const AUTH_URL =
  process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.bhaskarapp.com"

export async function getSession() {
  const requestHeaders = await headers()
  const cookie = requestHeaders.get("cookie")

  if (!cookie) return null

  try {
    const res = await fetch(`${AUTH_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    })

    if (!res.ok) return null

    const session = await res.json()
    if (!session || !session.user) return null

    return session as { user: { id: string; name: string; email: string }; session: { id: string } }
  } catch {
    return null
  }
}
