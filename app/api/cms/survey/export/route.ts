import { desc } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { surveyResponses } from "@/lib/db/schema"
import { getSession } from "@/lib/internal/auth-session"

export const dynamic = "force-dynamic"

function escapeCsvValue(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
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
    return NextResponse.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 }
    )
  }

  const items = await db
    .select()
    .from(surveyResponses)
    .orderBy(desc(surveyResponses.createdAt), desc(surveyResponses.id))

  const lines = [
    [
      "submitted_at",
      "user_id",
      "user_name",
      "phone_number",
      "cm_face",
      "cm_caste",
      "cm_quality",
      "nitish_should_step_down",
      "nitish_tenure_preference",
    ].join(","),
    ...items.map((item) =>
      [
        escapeCsvValue(item.createdAt.toISOString()),
        escapeCsvValue(item.userId),
        escapeCsvValue(item.userName),
        escapeCsvValue(item.phoneNumber),
        escapeCsvValue(item.cmFace),
        escapeCsvValue(item.cmCaste),
        escapeCsvValue(item.cmQuality),
        escapeCsvValue(item.nitishShouldStepDown),
        escapeCsvValue(item.nitishTenurePreference),
      ].join(",")
    ),
  ]

  return new Response(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="survey-responses.csv"',
    },
  })
}
