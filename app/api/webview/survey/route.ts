import { desc, eq, or } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { surveyResponses } from "@/lib/db/schema"
import { normalizePhoneNumber } from "@/lib/survey"

export const dynamic = "force-dynamic"

const SURVEY_CLOSED_MESSAGE =
  "दैनिक भास्कर एप के सर्वे में शामिल होने का समय खत्म हो चुका है।"

function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured." },
    { status: 503 }
  )
}

function getRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

async function findExistingSubmission(userId: string, phoneNumber: string) {
  const [submission] = await db
    .select()
    .from(surveyResponses)
    .where(
      or(
        eq(surveyResponses.userId, userId),
        eq(surveyResponses.phoneNumber, phoneNumber)
      )
    )
    .orderBy(desc(surveyResponses.createdAt), desc(surveyResponses.id))
    .limit(1)

  return submission ?? null
}

export async function GET(request: Request) {
  const url = new URL(request.url)

  if (url.searchParams.get("includeClosedState") === "true") {
    return NextResponse.json({
      submission: null,
      closed: true,
      message: SURVEY_CLOSED_MESSAGE,
    })
  }

  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  const userId = getRequiredString(url.searchParams.get("userId"))
  const phoneNumber = normalizePhoneNumber(url.searchParams.get("phoneNumber"))

  if (!userId || !phoneNumber) {
    return NextResponse.json(
      { error: "userId and phoneNumber are required." },
      { status: 400 }
    )
  }

  const submission = await findExistingSubmission(userId, phoneNumber)

  return NextResponse.json({ submission })
}

export async function POST() {
  return NextResponse.json(
    {
      error: SURVEY_CLOSED_MESSAGE,
      closed: true,
    },
    { status: 410 }
  )
}
