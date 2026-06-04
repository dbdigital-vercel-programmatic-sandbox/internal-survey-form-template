import { NextResponse } from "next/server"

import { loadCmsSurveyResponses } from "@/lib/cms-survey"
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

  const items = await loadCmsSurveyResponses()
  const maxAnswers = Math.max(
    0,
    ...items.map((item) => item.answersSummary.length)
  )
  const answerHeaders = Array.from({ length: maxAnswers }, (_, index) => [
    `q${index + 1}_id`,
    `q${index + 1}_text`,
    `q${index + 1}_option_ids`,
    `q${index + 1}_option_text`,
    `q${index + 1}_custom_value`,
  ]).flat()

  const lines = [
    [
      "submitted_at",
      "campaign_id",
      "campaign_name",
      "user_id",
      "user_name",
      "phone_number",
      "state_id",
      "district_id",
      "district_name",
      "vidhan_seat_id",
      "vidhan_seat_name",
      "mla_name",
      "party_name",
      ...answerHeaders,
    ].join(","),
    ...items.map((item) => {
      const answerValues = Array.from({ length: maxAnswers }, (_, index) => {
        const answer = item.answersSummary[index]
        return answer
          ? [
              escapeCsvValue(answer.questionId),
              escapeCsvValue(answer.questionText),
              escapeCsvValue(answer.optionIds.join("|")),
              escapeCsvValue(answer.optionText),
              escapeCsvValue(answer.customValue),
            ]
          : [
              escapeCsvValue(""),
              escapeCsvValue(""),
              escapeCsvValue(""),
              escapeCsvValue(""),
              escapeCsvValue(""),
            ]
      }).flat()

      return [
        escapeCsvValue(item.createdAt),
        escapeCsvValue(item.campaignId),
        escapeCsvValue(item.campaignName),
        escapeCsvValue(item.userId),
        escapeCsvValue(item.userName),
        escapeCsvValue(item.phoneNumber),
        escapeCsvValue(item.stateId),
        escapeCsvValue(item.districtId),
        escapeCsvValue(item.districtName),
        escapeCsvValue(item.vidhanSeatId),
        escapeCsvValue(item.vidhanSeatName),
        escapeCsvValue(item.mlaName),
        escapeCsvValue(item.partyName),
        ...answerValues,
      ].join(",")
    }),
  ]

  return new Response(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="survey-responses.csv"',
    },
  })
}
