import { desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  surveyCampaigns,
  surveyDistricts,
  surveyMlas,
  surveyOptions,
  surveyQuestions,
  surveyResponses,
  surveyVidhanSeats,
  type SurveyAnswerValue,
  type SurveyOption,
  type SurveyQuestion,
} from "@/lib/db/schema"
import {
  getPartyInfo,
  summarizeAnswers,
  type CmsAnswerSummary,
} from "@/lib/survey"

export type CmsSurveyResponse = {
  id: number
  campaignId: number
  campaignName: string
  userId: string
  userName: string | null
  phoneNumber: string
  stateId: number
  districtId: number
  districtName: string
  vidhanSeatId: number
  vidhanSeatName: string
  mlaName: string | null
  partyName: string | null
  answers: SurveyAnswerValue[]
  answersSummary: CmsAnswerSummary[]
  createdAt: string
}

export async function loadCmsSurveyResponses(): Promise<CmsSurveyResponse[]> {
  const rows = await db
    .select({
      response: surveyResponses,
      campaign: surveyCampaigns,
      district: surveyDistricts,
      vidhan: surveyVidhanSeats,
      mla: surveyMlas,
    })
    .from(surveyResponses)
    .innerJoin(
      surveyCampaigns,
      eq(surveyResponses.campaignId, surveyCampaigns.id)
    )
    .innerJoin(
      surveyDistricts,
      eq(surveyResponses.districtId, surveyDistricts.id)
    )
    .innerJoin(
      surveyVidhanSeats,
      eq(surveyResponses.vidhanId, surveyVidhanSeats.id)
    )
    .leftJoin(surveyMlas, eq(surveyResponses.vidhanId, surveyMlas.vidhanId))
    .orderBy(desc(surveyResponses.createdAt), desc(surveyResponses.id))

  const questionIds = new Set<number>()
  const optionIds = new Set<number>()

  for (const row of rows) {
    for (const answer of row.response.answers) {
      questionIds.add(answer.question)
      for (const optionId of answer.options ?? []) {
        optionIds.add(optionId)
      }
    }
  }

  const questions: SurveyQuestion[] =
    questionIds.size > 0
      ? await db
          .select()
          .from(surveyQuestions)
          .where(inArray(surveyQuestions.id, Array.from(questionIds)))
      : []
  const options: SurveyOption[] =
    optionIds.size > 0
      ? await db
          .select()
          .from(surveyOptions)
          .where(inArray(surveyOptions.id, Array.from(optionIds)))
      : []

  return rows.map((row) => ({
    id: row.response.id,
    campaignId: row.response.campaignId,
    campaignName: row.campaign.name,
    userId: row.response.userId,
    userName: row.response.userName,
    phoneNumber: row.response.phoneNumber,
    stateId: row.response.stateId,
    districtId: row.response.districtId,
    districtName: row.district.name,
    vidhanSeatId: row.response.vidhanId,
    vidhanSeatName: row.vidhan.name,
    mlaName: row.mla?.name ?? null,
    partyName: row.mla ? getPartyInfo(row.mla.party).hiName : null,
    answers: row.response.answers,
    answersSummary: summarizeAnswers({
      answers: row.response.answers,
      questions,
      options,
    }),
    createdAt: row.response.createdAt.toISOString(),
  }))
}
