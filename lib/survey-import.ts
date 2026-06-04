import * as XLSX from "xlsx"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  surveyCampaigns,
  surveyDistricts,
  surveyMlas,
  surveyOptions,
  surveyQuestions,
  surveyStates,
  surveyVidhanSeatDistrictConnector,
  surveyVidhanSeats,
  type SurveyCampaignMetadata,
} from "@/lib/db/schema"

type Row = Record<string, unknown>

type MlaInfo = {
  mlaName: string
  mlaNameHindi: string
  passedAway: boolean
  districtEnglish: string
  party: string
  photo: string
}

type SurveyImportModel = {
  uniqueDistricts: Set<string>
  districtEnglishToHindi: Map<string, string>
  constituencyEnglishToHindi: Map<string, string>
  constituencyToMla: Map<string, MlaInfo>
  constituencyToParties: Map<string, string[]>
  constituencyPartyToCandidates: Map<string, string[]>
}

export type SurveyImportConfig = {
  campaignId: number
  campaignName: string
  stateName: string
  deeplink: string
  metadata: SurveyCampaignMetadata
}

export type SurveyImportResult = {
  mode: "validate" | "update"
  valid: boolean
  errors: string[]
  warnings: string[]
  counts: {
    mlaRows: number
    candidateRows: number
    districts: number
    constituencies: number
    constituenciesWithCandidateParties: number
  }
  sample: Array<{
    key: string
    mla: MlaInfo | undefined
    parties: string[]
  }>
  format: SurveyImportFormat
  updated?: boolean
}

export type SurveyImportFormat = {
  mlaMapping: {
    requiredHeaders: string[]
    optionalHeaders: string[]
    csvExample: string
  }
  candidates: {
    requiredHeaders: string[]
    optionalHeaders: string[]
    csvExample: string
  }
}

export const SURVEY_IMPORT_FORMAT: SurveyImportFormat = {
  mlaMapping: {
    requiredHeaders: [
      "District (English)",
      "Constituency (English)",
      "Sitting MLA (Hindi) or Sitting MLA (English)",
      "Sitting MLA Party (English) or Sitting MLA Party (Hindi)",
    ],
    optionalHeaders: [
      "District (Hindi)",
      "Constituency (Hindi)",
      "Photo (250 X 250px)",
      "Remark",
    ],
    csvExample: [
      "District (English),District (Hindi),Constituency (English),Constituency (Hindi),Sitting MLA (English),Sitting MLA (Hindi),Sitting MLA Party (English),Sitting MLA Party (Hindi),Photo (250 X 250px),Remark",
      "Lucknow,लखनऊ,Lucknow Central,लखनऊ मध्य,Ravi Das,रवि दास,BJP,भाजपा,ravi-das.jpg,",
    ].join("\n"),
  },
  candidates: {
    requiredHeaders: [
      "Constituency (English) Auto-fill",
      "Party",
      "Candidate Name 1",
    ],
    optionalHeaders: [
      "Candidate Name 2",
      "Candidate Name 3",
      "Candidate Name 4",
      "Candidate Name 5",
      "Candidate Name 6",
      "Candidate Name 7",
      "Candidate Name 8",
    ],
    csvExample: [
      "Constituency (English) Auto-fill,Party,Candidate Name 1,Candidate Name 2,Candidate Name 3,Candidate Name 4,Candidate Name 5,Candidate Name 6,Candidate Name 7,Candidate Name 8",
      '"Lucknow Central, Lucknow",BJP,रवि दास,अमित वर्मा,,,,,,',
    ].join("\n"),
  },
}

const PARTY_MAP: Record<string, string> = {
  BJP: "BJP",
  भाजपा: "BJP",
  "समाजवादी पार्टी": "Samajwadi Party",
  "समाजवादी पार्टी ": "Samajwadi Party",
  SP: "Samajwadi Party",
  "बहुजन समाज पार्टी": "Bahujan Samaj Party",
  "बहुजन समाज पार्टी ": "Bahujan Samaj Party",
  BSP: "Bahujan Samaj Party",
  कॉंग्रेस: "Congress",
  Congress: "Congress",
  सुभासपा: "Suheldev Bharatiya Samaj Party",
  "निषाद पार्टी": "Nishad Party",
  "निषाद पार्टी ": "Nishad Party",
  "लोकदल (आरएलडी)": "Rashtriya Lok Dal",
  RLD: "Rashtriya Lok Dal",
  आरएलडी: "Rashtriya Lok Dal",
  "जनसत्ता लोकतान्त्रिक दल": "Janata Dal Loktantrik",
  "जनसत्ता लोकतान्त्रिक दल ": "Janata Dal Loktantrik",
  "अपना दल (एस)": "Apna Dal (S)",
  "अपना दल (एस) ": "Apna Dal (S)",
  Independent: "Independent",
}

const DEFAULT_MLA_CASTE = "GEN"
const DEFAULT_MLA_GENDER = "Male"
const DEFAULT_MLA_EDUCATION = "Graduate"
const DEFAULT_MLA_REGION = "PashchimiUP"

export function parseWorkbookRows(buffer: ArrayBuffer): Row[] {
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    return []
  }

  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], {
    defval: "",
  })
}

function getStrAny(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value != null && String(value).trim() !== "") {
      return String(value).trim()
    }
  }

  for (const wanted of keys) {
    const wantedLower = wanted.toLowerCase()
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().includes(wantedLower)) {
        const value = row[key]
        if (value != null && String(value).trim() !== "") {
          return String(value).trim()
        }
      }
    }
  }

  return ""
}

function isPassedAway(remark: string) {
  const normalized = remark.toLowerCase()
  return normalized.includes("नोट:") || normalized.includes("दिवंगत")
}

function vidhanKey(districtEnglish: string, constituencyEnglish: string) {
  return `${districtEnglish.trim()}|${constituencyEnglish.trim()}`
}

function parseAltConstituencyCell(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const index = normalized.indexOf(", ")

  if (index === -1) {
    return { district: "", constituency: normalized }
  }

  return {
    district: normalized.slice(index + 2).trim(),
    constituency: normalized.slice(0, index).trim(),
  }
}

function replacePlaceholders(
  text: string,
  mlaNameHindi: string,
  partyNameHindi?: string
) {
  return text
    .replace(/\$\$mla_name\$\$/g, mlaNameHindi)
    .replace(/\$\$partyName\$\$/g, partyNameHindi ?? "")
}

function validateRows(mlaRows: Row[], candidateRows: Row[]) {
  const errors: string[] = []
  const warnings: string[] = []

  if (mlaRows.length === 0) {
    errors.push("MLA mapping sheet has no data rows.")
  }

  if (candidateRows.length === 0) {
    errors.push("Candidate alternatives sheet has no data rows.")
  }

  for (const [index, row] of mlaRows.entries()) {
    const rowNumber = index + 2
    const districtEnglish = getStrAny(row, "District (English)", "District")
    const constituencyEnglish = getStrAny(
      row,
      "Constituency (English)",
      "Constituency"
    )
    const mlaName =
      getStrAny(row, "Sitting MLA (Hindi)") ||
      getStrAny(row, "Sitting MLA (English)", "Sitting MLA")
    const party =
      getStrAny(row, "Sitting MLA Party (English)") ||
      getStrAny(row, "Sitting MLA Party (Hindi)", "Party")

    if (!districtEnglish) {
      errors.push(
        `MLA mapping row ${rowNumber}: District (English) is required.`
      )
    }
    if (!constituencyEnglish) {
      errors.push(
        `MLA mapping row ${rowNumber}: Constituency (English) is required.`
      )
    }
    if (!mlaName) {
      warnings.push(
        `MLA mapping row ${rowNumber}: sitting MLA name is blank; "Unknown" will be used.`
      )
    }
    if (!party) {
      warnings.push(
        `MLA mapping row ${rowNumber}: party is blank; Independent will be used.`
      )
    }
  }

  for (const [index, row] of candidateRows.entries()) {
    const rowNumber = index + 2
    const cell = getStrAny(
      row,
      "Constituency (English) Auto-fill",
      "Constituency"
    )
    const party = getStrAny(row, "Party")
    const hasCandidate = Array.from({ length: 8 }, (_, candidateIndex) =>
      getStrAny(row, `Candidate Name ${candidateIndex + 1}`)
    ).some(Boolean)

    if (!cell) {
      errors.push(
        `Candidates row ${rowNumber}: Constituency (English) Auto-fill is required.`
      )
    }
    if (!party) {
      errors.push(`Candidates row ${rowNumber}: Party is required.`)
    }
    if (!hasCandidate) {
      errors.push(
        `Candidates row ${rowNumber}: at least Candidate Name 1 is required.`
      )
    }
  }

  return { errors, warnings }
}

function buildSurveyModel(mlaRows: Row[], candidateRows: Row[]) {
  const uniqueDistricts = new Set<string>()
  const districtEnglishToHindi = new Map<string, string>()
  const constituencyEnglishToHindi = new Map<string, string>()
  const constituencyToMla = new Map<string, MlaInfo>()
  const constituencyToParties = new Map<string, string[]>()
  const constituencyPartyToCandidates = new Map<string, string[]>()
  const warnings: string[] = []
  const errors: string[] = []

  for (const row of mlaRows) {
    const districtEnglish = getStrAny(row, "District (English)", "District")
    const districtHindi = getStrAny(row, "District (Hindi)") || districtEnglish
    const constituencyEnglish = getStrAny(
      row,
      "Constituency (English)",
      "Constituency"
    )
    const constituencyHindi =
      getStrAny(row, "Constituency (Hindi)") || constituencyEnglish
    const mlaName = getStrAny(row, "Sitting MLA (English)", "Sitting MLA")
    const mlaNameHindi = getStrAny(row, "Sitting MLA (Hindi)") || mlaName
    const party = getStrAny(
      row,
      "Sitting MLA Party (English)",
      "Sitting MLA Party (Hindi)",
      "Party"
    )
    const photo = getStrAny(row, "Photo (250 X 250px)", "Photo")
    const remark = getStrAny(row, "Remark")

    if (!districtEnglish || !constituencyEnglish) {
      continue
    }

    const key = vidhanKey(districtEnglish, constituencyEnglish)
    uniqueDistricts.add(districtEnglish)
    districtEnglishToHindi.set(districtEnglish, districtHindi)
    constituencyEnglishToHindi.set(constituencyEnglish, constituencyHindi)
    constituencyToMla.set(key, {
      mlaName,
      mlaNameHindi,
      passedAway: isPassedAway(remark),
      districtEnglish,
      party,
      photo,
    })
  }

  for (const [index, row] of candidateRows.entries()) {
    const cell = getStrAny(
      row,
      "Constituency (English) Auto-fill",
      "Constituency"
    )
    const parsed = parseAltConstituencyCell(cell)

    if (!parsed) {
      continue
    }

    const key = parsed.district
      ? vidhanKey(parsed.district, parsed.constituency)
      : Array.from(constituencyToMla.keys()).find((candidateKey) =>
          candidateKey.endsWith(`|${parsed.constituency}`)
        )

    if (!key || !constituencyToMla.has(key)) {
      errors.push(
        `Candidates row ${index + 2}: constituency "${cell}" was not found in the MLA mapping sheet.`
      )
      continue
    }

    const party = getStrAny(row, "Party")
    if (!party) {
      continue
    }

    const parties = constituencyToParties.get(key) ?? []
    if (!parties.includes(party)) {
      parties.push(party)
    }
    constituencyToParties.set(key, parties)

    const partyKey = `${key}|${party}`
    const candidates = constituencyPartyToCandidates.get(partyKey) ?? []

    for (let candidateIndex = 1; candidateIndex <= 8; candidateIndex += 1) {
      const candidate = getStrAny(row, `Candidate Name ${candidateIndex}`)
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }

    constituencyPartyToCandidates.set(partyKey, candidates)
  }

  for (const key of constituencyToMla.keys()) {
    if (!constituencyToParties.has(key)) {
      warnings.push(
        `No candidate alternatives were found for ${key}; party/candidate follow-up questions may have no options.`
      )
    }
  }

  return {
    model: {
      uniqueDistricts,
      districtEnglishToHindi,
      constituencyEnglishToHindi,
      constituencyToMla,
      constituencyToParties,
      constituencyPartyToCandidates,
    },
    errors,
    warnings,
  }
}

function createResult({
  mode,
  mlaRows,
  candidateRows,
  model,
  errors,
  warnings,
  updated,
}: {
  mode: "validate" | "update"
  mlaRows: Row[]
  candidateRows: Row[]
  model: SurveyImportModel
  errors: string[]
  warnings: string[]
  updated?: boolean
}): SurveyImportResult {
  const constituencies = Array.from(model.constituencyToMla.keys())

  return {
    mode,
    valid: errors.length === 0,
    errors,
    warnings,
    counts: {
      mlaRows: mlaRows.length,
      candidateRows: candidateRows.length,
      districts: model.uniqueDistricts.size,
      constituencies: constituencies.length,
      constituenciesWithCandidateParties: model.constituencyToParties.size,
    },
    sample: constituencies.slice(0, 5).map((key) => ({
      key,
      mla: model.constituencyToMla.get(key),
      parties: model.constituencyToParties.get(key) ?? [],
    })),
    format: SURVEY_IMPORT_FORMAT,
    updated,
  }
}

export function validateSurveyImport(mlaRows: Row[], candidateRows: Row[]) {
  const rowValidation = validateRows(mlaRows, candidateRows)
  const built = buildSurveyModel(mlaRows, candidateRows)
  const errors = [...rowValidation.errors, ...built.errors]
  const warnings = [...rowValidation.warnings, ...built.warnings]

  return createResult({
    mode: "validate",
    mlaRows,
    candidateRows,
    model: built.model,
    errors,
    warnings,
  })
}

export async function applySurveyImport({
  mlaRows,
  candidateRows,
  config,
}: {
  mlaRows: Row[]
  candidateRows: Row[]
  config: SurveyImportConfig
}) {
  const validation = validateSurveyImport(mlaRows, candidateRows)

  if (!validation.valid) {
    return validation
  }

  const built = buildSurveyModel(mlaRows, candidateRows)
  const model = built.model
  const constituencies = Array.from(model.constituencyToMla.keys())
  const existingState = await db
    .select()
    .from(surveyStates)
    .where(eq(surveyStates.name, config.stateName))
    .limit(1)
  const [state] =
    existingState.length > 0
      ? existingState
      : await db
          .insert(surveyStates)
          .values({ name: config.stateName, cid: "521", position: 1 })
          .returning()

  const [campaign] = await db
    .insert(surveyCampaigns)
    .values({
      id: config.campaignId,
      name: config.campaignName,
      deeplink: config.deeplink,
      stateId: state.id,
      metadata: config.metadata,
    })
    .onConflictDoUpdate({
      target: surveyCampaigns.id,
      set: {
        name: config.campaignName,
        deeplink: config.deeplink,
        stateId: state.id,
        metadata: config.metadata,
      },
    })
    .returning()

  const districtIdByEnglish = new Map<string, number>()

  for (const districtEnglish of model.uniqueDistricts) {
    const existing = await db
      .select()
      .from(surveyDistricts)
      .where(
        and(
          eq(surveyDistricts.stateId, state.id),
          eq(surveyDistricts.englishName, districtEnglish)
        )
      )
      .limit(1)
    const [district] =
      existing.length > 0
        ? existing
        : await db
            .insert(surveyDistricts)
            .values({
              name:
                model.districtEnglishToHindi.get(districtEnglish) ??
                districtEnglish,
              englishName: districtEnglish,
              stateId: state.id,
              position: 1,
            })
            .returning()
    districtIdByEnglish.set(districtEnglish, district.id)
  }

  const vidhanIdByKey = new Map<string, number>()
  const existingVidhanRows = await db
    .select({
      district: surveyDistricts,
      vidhan: surveyVidhanSeats,
    })
    .from(surveyDistricts)
    .innerJoin(
      surveyVidhanSeatDistrictConnector,
      eq(surveyVidhanSeatDistrictConnector.districtId, surveyDistricts.id)
    )
    .innerJoin(
      surveyVidhanSeats,
      eq(surveyVidhanSeatDistrictConnector.vidhanId, surveyVidhanSeats.id)
    )
    .where(eq(surveyDistricts.stateId, state.id))

  for (const row of existingVidhanRows) {
    const districtEnglish = row.district.englishName ?? ""
    if (row.vidhan.englishName) {
      vidhanIdByKey.set(
        vidhanKey(districtEnglish, row.vidhan.englishName),
        row.vidhan.id
      )
    }
    vidhanIdByKey.set(
      vidhanKey(districtEnglish, row.vidhan.name),
      row.vidhan.id
    )
  }

  for (const key of constituencies) {
    const [districtEnglish, constituencyEnglish] = key.split("|")
    const districtId = districtIdByEnglish.get(districtEnglish)
    if (!districtId) {
      continue
    }

    let vidhanId = vidhanIdByKey.get(key)
    if (!vidhanId) {
      const [vidhan] = await db
        .insert(surveyVidhanSeats)
        .values({
          name:
            model.constituencyEnglishToHindi.get(constituencyEnglish) ??
            constituencyEnglish,
          englishName: constituencyEnglish,
        })
        .returning()
      vidhanId = vidhan.id
      vidhanIdByKey.set(key, vidhanId)
    }

    await db
      .insert(surveyVidhanSeatDistrictConnector)
      .values({ districtId, vidhanId })
      .onConflictDoNothing()
  }

  for (const key of constituencies) {
    const [districtEnglish] = key.split("|")
    const districtId = districtIdByEnglish.get(districtEnglish)
    const vidhanId = vidhanIdByKey.get(key)
    const mla = model.constituencyToMla.get(key)

    if (!districtId || !vidhanId || !mla) {
      continue
    }

    const party = PARTY_MAP[mla.party] ?? mla.party ?? "Independent"

    await db
      .insert(surveyMlas)
      .values({
        name: mla.mlaNameHindi || mla.mlaName || "Unknown",
        image: mla.photo || "",
        districtId,
        vidhanId,
        caste: DEFAULT_MLA_CASTE,
        gender: DEFAULT_MLA_GENDER,
        party,
        education: DEFAULT_MLA_EDUCATION,
        region: DEFAULT_MLA_REGION,
        isPartOfMinistry: false,
        isFirstTimeMinister: false,
        age: 0,
      })
      .onConflictDoUpdate({
        target: surveyMlas.vidhanId,
        set: {
          name: mla.mlaNameHindi || mla.mlaName || "Unknown",
          image: mla.photo || "",
          districtId,
          party,
          isActive: true,
        },
      })
  }

  for (const key of constituencies) {
    const vidhanId = vidhanIdByKey.get(key)
    const mla = model.constituencyToMla.get(key)

    if (!vidhanId || !mla) {
      continue
    }

    const existingQuestions = await db
      .select({ id: surveyQuestions.id })
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.campaignId, campaign.id),
          eq(surveyQuestions.vidhanId, vidhanId)
        )
      )

    if (existingQuestions.length > 0) {
      await db.delete(surveyOptions).where(
        inArray(
          surveyOptions.questionId,
          existingQuestions.map((question) => question.id)
        )
      )
      await db.delete(surveyQuestions).where(
        inArray(
          surveyQuestions.id,
          existingQuestions.map((question) => question.id)
        )
      )
    }

    const parties = model.constituencyToParties.get(key) ?? []
    const mlaName = mla.mlaNameHindi || mla.mlaName || "विधायक"

    const insertQuestion = async (
      questionText: string,
      position: number,
      parentOptionId: number | null
    ) => {
      const [question] = await db
        .insert(surveyQuestions)
        .values({
          questionText,
          multipleChoice: false,
          position,
          campaignId: campaign.id,
          stateId: state.id,
          vidhanId,
          parentOptionId,
        })
        .returning()
      return question.id
    }

    const insertOption = async (
      optionText: string,
      questionId: number,
      allowCustomValue = false
    ) => {
      const [option] = await db
        .insert(surveyOptions)
        .values({ optionText, questionId, allowCustomValue })
        .returning()
      return option.id
    }

    const insertPartyCandidateFlow = async (
      parentOptionId: number,
      position: number
    ) => {
      const partyQuestionId = await insertQuestion(
        "आप 2027 में किस पार्टी के प्रत्याशी को विधायक बनाना चाहते हैं?",
        position,
        parentOptionId
      )

      for (const party of parties) {
        const partyOptionId = await insertOption(party, partyQuestionId)
        const candidates =
          model.constituencyPartyToCandidates.get(`${key}|${party}`) ?? []
        const candidateQuestionId = await insertQuestion(
          replacePlaceholders(
            "$$partyName$$ से आप किसे उम्मीदवार बनाना चाहते हैं ?",
            mlaName,
            party
          ),
          position + 1,
          partyOptionId
        )

        for (const candidate of candidates) {
          await insertOption(candidate, candidateQuestionId)
        }
        await insertOption("अन्य", candidateQuestionId, true)
      }
    }

    if (mla.passedAway) {
      const rootQuestionId = await insertQuestion(
        "आप 2027 में किस पार्टी के प्रत्याशी को विधायक बनाना चाहते हैं?",
        1,
        null
      )

      for (const party of parties) {
        const partyOptionId = await insertOption(party, rootQuestionId)
        const candidates =
          model.constituencyPartyToCandidates.get(`${key}|${party}`) ?? []
        const candidateQuestionId = await insertQuestion(
          replacePlaceholders(
            "$$partyName$$ से आप किसे उम्मीदवार बनाना चाहते हैं ?",
            mlaName,
            party
          ),
          2,
          partyOptionId
        )

        for (const candidate of candidates) {
          await insertOption(candidate, candidateQuestionId)
        }
        await insertOption("अन्य", candidateQuestionId, true)
      }

      continue
    }

    const rootQuestionId = await insertQuestion(
      replacePlaceholders(
        "आपके विधायक $$mla_name$$ को 2027 में टिकट मिलना चाहिए ?",
        mlaName
      ),
      1,
      null
    )
    const yesOptionId = await insertOption("हाँ", rootQuestionId)
    const noOptionId = await insertOption("नहीं", rootQuestionId)
    const cantSayOptionId = await insertOption(
      "अभी कह नहीं सकते",
      rootQuestionId
    )

    const yesQuestionId = await insertQuestion(
      replacePlaceholders("$$mla_name$$ को टिकट क्यों मिलना चाहिए?", mlaName),
      2,
      yesOptionId
    )
    await insertOption("अच्छा काम किया", yesQuestionId)
    await insertOption("मेरी जाति के हैं", yesQuestionId)
    await insertOption("व्यवहार अच्छा है", yesQuestionId)

    const noQuestionId = await insertQuestion(
      replacePlaceholders(
        "$$mla_name$$ को टिकट क्यों नहीं मिलना चाहिए?",
        mlaName
      ),
      3,
      noOptionId
    )
    await insertOption("काम नहीं कराया", noQuestionId)
    await insertOption("व्यवहार खराब है", noQuestionId)
    await insertOption("मेरी जाति के नहीं हैं", noQuestionId)
    await insertPartyCandidateFlow(noOptionId, 4)
    await insertPartyCandidateFlow(cantSayOptionId, 7)
  }

  return {
    ...validation,
    mode: "update" as const,
    updated: true,
  }
}
