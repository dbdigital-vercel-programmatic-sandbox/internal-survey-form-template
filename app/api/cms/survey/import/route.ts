import { NextResponse } from "next/server"

import {
  applySurveyImport,
  parseWorkbookRows,
  SURVEY_IMPORT_FORMAT,
  validateSurveyImport,
  type SurveyImportConfig,
} from "@/lib/survey-import"
import { getSession } from "@/lib/internal/auth-session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_CAMPAIGN_ID = 1
const DEFAULT_CAMPAIGN_NAME = "MLA Panchayat Pradhan Survey"
const DEFAULT_STATE_NAME = "Uttar Pradesh"

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

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function parseCampaignId(value: string) {
  const campaignId = Number.parseInt(value, 10)
  return Number.isFinite(campaignId) && campaignId > 0
    ? campaignId
    : DEFAULT_CAMPAIGN_ID
}

function parseKeywords(value: string) {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

function buildConfig(formData: FormData): SurveyImportConfig {
  return {
    campaignId: parseCampaignId(getFormString(formData, "campaignId")),
    campaignName:
      getFormString(formData, "campaignName") || DEFAULT_CAMPAIGN_NAME,
    stateName: getFormString(formData, "stateName") || DEFAULT_STATE_NAME,
    deeplink: getFormString(formData, "deeplink"),
    metadata: {
      bannerImg: getFormString(formData, "bannerImg") || undefined,
      introImg: getFormString(formData, "introImg") || undefined,
      submitImg: getFormString(formData, "submitImg") || undefined,
      shareLink: getFormString(formData, "shareLink") || undefined,
      shareText: getFormString(formData, "shareText") || undefined,
      shareImage: getFormString(formData, "shareImage") || undefined,
      highlightKeywords: parseKeywords(getFormString(formData, "keywords")),
    },
  }
}

async function readUploadedRows(
  formData: FormData,
  key: string,
  label: string
) {
  const value = formData.get(key)

  if (!(value instanceof File) || value.size === 0) {
    throw new Error(`${label} XLSX file is required.`)
  }

  const extension = value.name.split(".").pop()?.toLowerCase()
  if (extension && !["xlsx", "xls", "csv"].includes(extension)) {
    throw new Error(`${label} must be an .xlsx, .xls, or .csv file.`)
  }

  return parseWorkbookRows(await value.arrayBuffer())
}

export async function GET(request: Request) {
  const unauthorized = await ensureSession()
  if (unauthorized) {
    return unauthorized
  }

  const url = new URL(request.url)
  const template = url.searchParams.get("template")

  if (template === "mla") {
    return csvResponse(
      SURVEY_IMPORT_FORMAT.mlaMapping.csvExample,
      "mla-mapping-template.csv"
    )
  }

  if (template === "candidates") {
    return csvResponse(
      SURVEY_IMPORT_FORMAT.candidates.csvExample,
      "candidate-alternatives-template.csv"
    )
  }

  return NextResponse.json({ format: SURVEY_IMPORT_FORMAT })
}

export async function POST(request: Request) {
  const unauthorized = await ensureSession()
  if (unauthorized) {
    return unauthorized
  }

  if (!process.env.DATABASE_URL) {
    return databaseUnavailable()
  }

  try {
    const formData = await request.formData()
    const mode =
      getFormString(formData, "mode") === "update" ? "update" : "validate"
    const mlaRows = await readUploadedRows(formData, "mlaFile", "MLA mapping")
    const candidateRows = await readUploadedRows(
      formData,
      "candidatesFile",
      "Candidate alternatives"
    )

    if (mode === "validate") {
      return NextResponse.json({
        result: validateSurveyImport(mlaRows, candidateRows),
      })
    }

    const result = await applySurveyImport({
      mlaRows,
      candidateRows,
      config: buildConfig(formData),
    })

    return NextResponse.json({ result })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unable to import survey.",
        format: SURVEY_IMPORT_FORMAT,
      },
      { status: 400 }
    )
  }
}
