import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { surveyResponses } from "@/lib/db/schema"
import { getSession } from "@/lib/internal/auth-session"
import { normalizePhoneNumber } from "@/lib/survey"

export const dynamic = "force-dynamic"

function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured." },
    { status: 503 }
  )
}

async function ensureSession() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  return null
}

export async function GET() {
  const unauthorized = await ensureSession()
  if (unauthorized) {
    return unauthorized
  }

  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  const items = await db
    .select()
    .from(surveyResponses)
    .orderBy(desc(surveyResponses.createdAt), desc(surveyResponses.id))

  return NextResponse.json({ items })
}

export async function DELETE(request: Request) {
  const unauthorized = await ensureSession()
  if (unauthorized) {
    return unauthorized
  }

  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  const body = await request.json()
  const phoneNumber = normalizePhoneNumber(body.phoneNumber)

  if (!phoneNumber) {
    return NextResponse.json(
      { error: "phoneNumber is required." },
      { status: 400 }
    )
  }

  const deleted = await db
    .delete(surveyResponses)
    .where(eq(surveyResponses.phoneNumber, phoneNumber))
    .returning({ id: surveyResponses.id })

  return NextResponse.json({ deletedCount: deleted.length })
}
