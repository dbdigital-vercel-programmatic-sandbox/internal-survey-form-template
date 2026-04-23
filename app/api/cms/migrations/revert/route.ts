import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { getSession } from "@/lib/internal/auth-session"

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const db = getDb()
    const result = await db.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations
          WHERE id = (
            SELECT id FROM drizzle.__drizzle_migrations
            ORDER BY created_at DESC
            LIMIT 1
          )
          RETURNING id`,
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No migrations to revert" },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, error: null })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    )
  }
}
