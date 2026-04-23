import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/neon-http/migrator"
import { getDb } from "@/lib/db"
import { getSession } from "@/lib/internal/auth-session"

const UNAUTHORIZED = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 })

interface JournalEntry {
  tag: string
  when: number
  breakpoints: boolean
}

interface AppliedMigration {
  id: number
  hash: string
  created_at: string
}

const MIGRATIONS_DIR = join(process.cwd(), "drizzle")

export async function GET() {
  const session = await getSession()
  if (!session) return UNAUTHORIZED()

  try {
    const journalPath = join(MIGRATIONS_DIR, "meta", "_journal.json")

    if (!existsSync(journalPath)) {
      return NextResponse.json({ migrations: [], error: null })
    }

    const journal = JSON.parse(readFileSync(journalPath, "utf-8"))
    const entries: JournalEntry[] = journal.entries ?? []

    let applied: AppliedMigration[] = []
    try {
      const db = getDb()
      const result = await db.execute(
        sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC`,
      )
      applied = result.rows as unknown as AppliedMigration[]
    } catch {
      // Table doesn't exist yet — no migrations applied
    }

    const migrations = entries.map((entry, index) => {
      const sqlPath = join(MIGRATIONS_DIR, `${entry.tag}.sql`)
      const sqlContent = existsSync(sqlPath)
        ? readFileSync(sqlPath, "utf-8")
        : ""
      const appliedRecord = applied[index]

      return {
        tag: entry.tag,
        when: entry.when,
        sqlContent,
        applied: !!appliedRecord,
        appliedAt: appliedRecord?.created_at
          ? new Date(Number(appliedRecord.created_at)).toISOString()
          : null,
        hash: appliedRecord?.hash ?? null,
        id: appliedRecord?.id ?? null,
      }
    })

    return NextResponse.json({ migrations, error: null })
  } catch (e) {
    return NextResponse.json(
      { migrations: [], error: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function POST() {
  const session = await getSession()
  if (!session) return UNAUTHORIZED()

  try {
    const db = getDb()
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    return NextResponse.json({ success: true, error: null })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 },
    )
  }
}
