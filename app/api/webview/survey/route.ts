import { and, asc, desc, eq, inArray, or } from "drizzle-orm"
import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import {
  surveyCampaigns,
  surveyDistricts,
  surveyMlas,
  surveyOptions,
  surveyQuestions,
  surveyResponses,
  surveyStates,
  surveyVidhanSeatDistrictConnector,
  surveyVidhanSeats,
  type SurveyAnswerValue,
} from "@/lib/db/schema"
import {
  DEFAULT_SURVEY_CAMPAIGN_ID,
  getCandidateImageUrl,
  getPartyInfo,
  getRequiredString,
  normalizePhoneNumber,
  parsePositiveInt,
  validateSurveyAnswers,
} from "@/lib/survey"

export const dynamic = "force-dynamic"

function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured." },
    { status: 503 }
  )
}

function getCampaignId(value: unknown) {
  return parsePositiveInt(value) ?? DEFAULT_SURVEY_CAMPAIGN_ID
}

async function findExistingSubmission(
  campaignId: number,
  userId: string,
  phoneNumber: string
) {
  const [submission] = await db
    .select()
    .from(surveyResponses)
    .where(
      and(
        eq(surveyResponses.campaignId, campaignId),
        or(
          eq(surveyResponses.userId, userId),
          eq(surveyResponses.phoneNumber, phoneNumber)
        )
      )
    )
    .orderBy(desc(surveyResponses.createdAt), desc(surveyResponses.id))
    .limit(1)

  return submission ?? null
}

async function getCampaign(campaignId: number) {
  const [campaign] = await db
    .select()
    .from(surveyCampaigns)
    .where(eq(surveyCampaigns.id, campaignId))
    .limit(1)

  return campaign ?? null
}

async function getLocationsForCampaign(campaignId: number) {
  const campaign = await getCampaign(campaignId)

  if (!campaign?.stateId) {
    return { campaign, locations: { districts: [], mlaList: [] } }
  }

  const rows = await db
    .select({
      district: surveyDistricts,
      state: surveyStates,
      vidhanSeat: surveyVidhanSeats,
    })
    .from(surveyDistricts)
    .innerJoin(surveyStates, eq(surveyDistricts.stateId, surveyStates.id))
    .innerJoin(
      surveyVidhanSeatDistrictConnector,
      eq(surveyVidhanSeatDistrictConnector.districtId, surveyDistricts.id)
    )
    .innerJoin(
      surveyVidhanSeats,
      eq(surveyVidhanSeatDistrictConnector.vidhanId, surveyVidhanSeats.id)
    )
    .where(
      and(
        eq(surveyDistricts.stateId, campaign.stateId),
        eq(surveyDistricts.isActive, true),
        eq(surveyVidhanSeats.isActive, true)
      )
    )
    .orderBy(
      asc(surveyDistricts.englishName),
      asc(surveyDistricts.name),
      asc(surveyVidhanSeats.englishName),
      asc(surveyVidhanSeats.name)
    )

  const districtsById = new Map<
    number,
    (typeof rows)[number]["district"] & {
      state: (typeof rows)[number]["state"]
      vidhanSeats: Array<(typeof rows)[number]["vidhanSeat"]>
    }
  >()

  for (const row of rows) {
    const district = districtsById.get(row.district.id) ?? {
      ...row.district,
      state: row.state,
      vidhanSeats: [],
    }
    district.vidhanSeats.push(row.vidhanSeat)
    districtsById.set(row.district.id, district)
  }

  const mlaRows = await db
    .select({
      mla: surveyMlas,
      district: surveyDistricts,
      vidhan: surveyVidhanSeats,
    })
    .from(surveyMlas)
    .innerJoin(surveyDistricts, eq(surveyMlas.districtId, surveyDistricts.id))
    .innerJoin(surveyVidhanSeats, eq(surveyMlas.vidhanId, surveyVidhanSeats.id))
    .where(
      and(
        eq(surveyDistricts.stateId, campaign.stateId),
        eq(surveyMlas.isActive, true),
        eq(surveyVidhanSeats.isActive, true)
      )
    )

  return {
    campaign,
    locations: {
      districts: Array.from(districtsById.values()),
      mlaList: mlaRows.map((row) => ({
        ...row.mla,
        district: {
          id: row.district.id,
          name: row.district.name,
          englishName: row.district.englishName,
        },
        vidhan: {
          id: row.vidhan.id,
          name: row.vidhan.name,
          englishName: row.vidhan.englishName,
        },
        party: getPartyInfo(row.mla.party),
        candidateImage: getCandidateImageUrl(row.mla.image),
      })),
    },
  }
}

function readAnswers(value: unknown): SurveyAnswerValue[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const answers: SurveyAnswerValue[] = []

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null
    }

    const candidate = item as Record<string, unknown>
    const question = parsePositiveInt(candidate.question)
    const options = Array.isArray(candidate.options)
      ? candidate.options.map(parsePositiveInt)
      : null

    if (!question || !options || options.some((optionId) => !optionId)) {
      return null
    }

    answers.push({
      question,
      options: options as number[],
      customValue:
        typeof candidate.customValue === "string"
          ? candidate.customValue.trim()
          : "",
    })
  }

  return answers
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  const url = new URL(request.url)
  const campaignId = getCampaignId(url.searchParams.get("campaignId"))
  const userId = getRequiredString(url.searchParams.get("userId"))
  const phoneNumber = normalizePhoneNumber(url.searchParams.get("phoneNumber"))

  if (!userId || !phoneNumber) {
    return NextResponse.json(
      { error: "userId and phoneNumber are required." },
      { status: 400 }
    )
  }

  const { campaign, locations } = await getLocationsForCampaign(campaignId)

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 })
  }

  const submission = await findExistingSubmission(
    campaignId,
    userId,
    phoneNumber
  )

  return NextResponse.json({ campaign, locations, submission })
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const campaignId = parsePositiveInt(body.campaignId)
  const stateId = parsePositiveInt(body.stateId)
  const districtId = parsePositiveInt(body.districtId)
  const vidhanId = parsePositiveInt(body.vidhanSeatId ?? body.vidhanId)
  const userId = getRequiredString(body.userId)
  const userName = getRequiredString(body.userName)
  const phoneNumber = normalizePhoneNumber(body.phoneNumber)
  const answers = readAnswers(body.answers)

  if (
    !campaignId ||
    !stateId ||
    !districtId ||
    !vidhanId ||
    !userId ||
    !phoneNumber ||
    !answers
  ) {
    return NextResponse.json(
      {
        error:
          "campaignId, stateId, districtId, vidhanSeatId, userId, phoneNumber, and answers are required.",
      },
      { status: 400 }
    )
  }

  const existing = await findExistingSubmission(campaignId, userId, phoneNumber)

  if (existing) {
    return NextResponse.json(
      { error: "Survey already submitted.", submission: existing },
      { status: 409 }
    )
  }

  const campaign = await getCampaign(campaignId)

  if (!campaign || campaign.stateId !== stateId) {
    return NextResponse.json(
      { error: "Campaign and state do not match." },
      { status: 400 }
    )
  }

  const [location] = await db
    .select({ districtId: surveyDistricts.id, vidhanId: surveyVidhanSeats.id })
    .from(surveyDistricts)
    .innerJoin(
      surveyVidhanSeatDistrictConnector,
      eq(surveyVidhanSeatDistrictConnector.districtId, surveyDistricts.id)
    )
    .innerJoin(
      surveyVidhanSeats,
      eq(surveyVidhanSeatDistrictConnector.vidhanId, surveyVidhanSeats.id)
    )
    .where(
      and(
        eq(surveyDistricts.id, districtId),
        eq(surveyDistricts.stateId, stateId),
        eq(surveyVidhanSeats.id, vidhanId),
        eq(surveyDistricts.isActive, true),
        eq(surveyVidhanSeats.isActive, true)
      )
    )
    .limit(1)

  if (!location) {
    return NextResponse.json(
      { error: "District and Vidhan seat do not match." },
      { status: 400 }
    )
  }

  const questions = await db
    .select()
    .from(surveyQuestions)
    .where(
      and(
        eq(surveyQuestions.campaignId, campaignId),
        eq(surveyQuestions.vidhanId, vidhanId),
        eq(surveyQuestions.isActive, true)
      )
    )

  const questionIds = new Set(questions.map((question) => question.id))
  const surveyQuestionOptions =
    questionIds.size > 0
      ? await db
          .select()
          .from(surveyOptions)
          .where(inArray(surveyOptions.questionId, Array.from(questionIds)))
      : []

  const validationError = validateSurveyAnswers({
    answers,
    questions,
    options: surveyQuestionOptions,
  })

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  try {
    const [submission] = await db
      .insert(surveyResponses)
      .values({
        campaignId,
        stateId,
        districtId,
        vidhanId,
        userId,
        userName,
        phoneNumber,
        answers,
      })
      .returning()

    return NextResponse.json({ submission })
  } catch {
    const duplicate = await findExistingSubmission(
      campaignId,
      userId,
      phoneNumber
    )

    if (duplicate) {
      return NextResponse.json(
        { error: "Survey already submitted.", submission: duplicate },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: "Survey could not be submitted." },
      { status: 500 }
    )
  }
}
