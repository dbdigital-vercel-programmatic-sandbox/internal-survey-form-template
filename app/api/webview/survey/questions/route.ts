import { and, asc, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { surveyOptions, surveyQuestions } from "@/lib/db/schema"
import {
  DEFAULT_SURVEY_CAMPAIGN_ID,
  buildQuestionTree,
  parsePositiveInt,
} from "@/lib/survey"

export const dynamic = "force-dynamic"

function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured." },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  const url = new URL(request.url)
  const campaignId =
    parsePositiveInt(url.searchParams.get("campaignId")) ??
    DEFAULT_SURVEY_CAMPAIGN_ID
  const vidhanSeatId = parsePositiveInt(url.searchParams.get("vidhanSeatId"))

  if (!vidhanSeatId) {
    return NextResponse.json(
      { error: "vidhanSeatId is required." },
      { status: 400 }
    )
  }

  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(
      and(
        eq(surveyQuestions.campaignId, campaignId),
        eq(surveyQuestions.vidhanId, vidhanSeatId),
        eq(surveyQuestions.isActive, true)
      )
    )
    .orderBy(asc(surveyQuestions.position), asc(surveyQuestions.id))

  if (questions.length === 0) {
    return NextResponse.json({ questions: [] })
  }

  const options = await db
    .select()
    .from(surveyOptions)
    .where(
      and(
        inArray(
          surveyOptions.questionId,
          questions.map((question) => question.id)
        ),
        eq(surveyOptions.isActive, true)
      )
    )
    .orderBy(asc(surveyOptions.id))

  return NextResponse.json({ questions: buildQuestionTree(questions, options) })
}
