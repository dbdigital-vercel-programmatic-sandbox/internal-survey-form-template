import { redirect } from "next/navigation"

import { getSession } from "@/lib/internal/auth-session"

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.bhaskarapp.com"

function sanitizeNext(next: string | undefined | null): string {
  if (!next || typeof next !== "string") return "/cms"

  // Only allow internal paths starting with /cms
  if (!next.startsWith("/cms")) return "/cms"

  // Reject protocol-relative URLs or anything with ://
  if (next.includes("://") || next.startsWith("//")) return "/cms"

  return next
}

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = sanitizeNext(params.next as string | undefined)

  const session = await getSession()

  if (session) {
    redirect(next)
  }

  // Not authenticated — redirect to central auth
  const callbackUrl = `/auth/callback?next=${encodeURIComponent(next)}`
  redirect(`${AUTH_URL}?returnTo=${encodeURIComponent(callbackUrl)}`)
}
