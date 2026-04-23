import { execSync } from "child_process"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/internal/auth-session"

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const output = execSync("npx drizzle-kit generate", {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 30_000,
    })
    return NextResponse.json({ success: true, output, error: null })
  } catch (e) {
    const message =
      e instanceof Error
        ? (e as Error & { stderr?: string }).stderr || e.message
        : String(e)
    return NextResponse.json(
      { success: false, output: null, error: message },
      { status: 500 },
    )
  }
}
