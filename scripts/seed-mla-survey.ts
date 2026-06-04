import * as XLSX from "xlsx"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
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
} from "../lib/db/schema"

type Row = Record<string, unknown>

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

function getArg(name: string, fallback = "") {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

function hasArg(name: string) {
  return process.argv.includes(name)
}

function getInputPaths() {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
}

function getRows(path: string): Row[] {
  const workbook = XLSX.readFile(path)
  const sheetName = workbook.SheetNames[0]
  return XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName])
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

function buildSurveyModel(mlaRows: Row[], candidateRows: Row[]) {
  const uniqueDistricts = new Set<string>()
  const districtEnglishToHindi = new Map<string, string>()
  const constituencyEnglishToHindi = new Map<string, string>()
  const constituencyToMla = new Map<
    string,
    {
      mlaName: string
      mlaNameHindi: string
      passedAway: boolean
      districtEnglish: string
      party: string
      photo: string
    }
  >()
  const constituencyToParties = new Map<string, string[]>()
  const constituencyPartyToCandidates = new Map<string, string[]>()

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

  for (const row of candidateRows) {
    const cell = getStrAny(
      row,
      "Constituency (English) Auto-fill",
      "Constituency"
    )
    const parsed = parseAltConstituencyCell(cell)

    if (!parsed) {
      continue
    }

    const districtEnglish = parsed.district
    const constituencyEnglish = parsed.constituency
    const key = districtEnglish
      ? vidhanKey(districtEnglish, constituencyEnglish)
      : Array.from(constituencyToMla.keys()).find((candidateKey) =>
          candidateKey.endsWith(`|${constituencyEnglish}`)
        )

    if (!key) {
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

    for (let index = 1; index <= 8; index += 1) {
      const candidate = getStrAny(row, `Candidate Name ${index}`)
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate)
      }
    }

    constituencyPartyToCandidates.set(partyKey, candidates)
  }

  return {
    uniqueDistricts,
    districtEnglishToHindi,
    constituencyEnglishToHindi,
    constituencyToMla,
    constituencyToParties,
    constituencyPartyToCandidates,
  }
}

function getMetadata(): SurveyCampaignMetadata {
  return {
    bannerImg: getArg("--banner-img") || undefined,
    introImg: getArg("--intro-img") || undefined,
    submitImg: getArg("--submit-img") || undefined,
    shareLink: getArg("--share-link") || undefined,
    shareText: getArg("--share-text") || undefined,
    shareImage: getArg("--share-image") || undefined,
    highlightKeywords: getArg("--highlight")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  }
}

async function main() {
  const [mlaSheetPath, candidatesSheetPath] = getInputPaths()
  const shouldWrite = hasArg("--write")
  const campaignId = Number.parseInt(getArg("--campaign-id", "1"), 10)
  const campaignName =
    getArg("--campaign-name") || "MLA Panchayat Pradhan Survey"
  const stateName = getArg("--state-name") || "Uttar Pradesh"
  const deeplink = getArg("--deeplink")

  if (!mlaSheetPath || !candidatesSheetPath) {
    throw new Error(
      "Usage: pnpm seed:mla-survey <mla-sheet.xlsx> <candidates-sheet.xlsx> [--write] [--campaign-id 1]"
    )
  }

  const mlaRows = getRows(mlaSheetPath)
  const candidateRows = getRows(candidatesSheetPath)
  const model = buildSurveyModel(mlaRows, candidateRows)
  const constituencies = Array.from(model.constituencyToMla.keys())

  const dryRunSummary = {
    mode: shouldWrite ? "write" : "dry-run",
    campaignId,
    campaignName,
    stateName,
    counts: {
      mlaRows: mlaRows.length,
      candidateRows: candidateRows.length,
      districts: model.uniqueDistricts.size,
      constituencies: constituencies.length,
      constituenciesWithCandidateParties: model.constituencyToParties.size,
    },
    sample: constituencies.slice(0, 3).map((key) => ({
      key,
      mla: model.constituencyToMla.get(key),
      parties: model.constituencyToParties.get(key) ?? [],
    })),
  }

  console.log(JSON.stringify(dryRunSummary, null, 2))

  if (!shouldWrite) {
    return
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when --write is passed.")
  }

  const existingState = await db
    .select()
    .from(surveyStates)
    .where(eq(surveyStates.name, stateName))
    .limit(1)
  const [state] =
    existingState.length > 0
      ? existingState
      : await db
          .insert(surveyStates)
          .values({ name: stateName, cid: "521", position: 1 })
          .returning()

  const [campaign] = await db
    .insert(surveyCampaigns)
    .values({
      id: campaignId,
      name: campaignName,
      deeplink,
      stateId: state.id,
      metadata: getMetadata(),
    })
    .onConflictDoUpdate({
      target: surveyCampaigns.id,
      set: {
        name: campaignName,
        deeplink,
        stateId: state.id,
        metadata: getMetadata(),
      },
    })
    .returning()

  const districtIdByEnglish = new Map<string, number>()

  for (const districtEnglish of model.uniqueDistricts) {
    const districtHindi =
      model.districtEnglishToHindi.get(districtEnglish) ?? districtEnglish
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
              name: districtHindi,
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
    if (row.vidhan.englishName) {
      vidhanIdByKey.set(
        vidhanKey(row.district.englishName ?? "", row.vidhan.englishName),
        row.vidhan.id
      )
    }
    vidhanIdByKey.set(
      vidhanKey(row.district.englishName ?? "", row.vidhan.name),
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
    const [, constituencyEnglish] = key.split("|")
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

    console.log(`Seeded questions for ${constituencyEnglish}`)
  }

  console.log("Seed completed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
