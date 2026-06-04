import type {
  PartyInfo,
  SurveyAnswerValue,
  SurveyDistrict,
  SurveyMla,
  SurveyOption,
  SurveyQuestion,
  SurveyState,
  SurveyVidhanSeat,
} from "@/lib/db/schema"

export const SURVEY_TITLE = "बिहार के नए CM के लिए कौन हैं आपकी पसंद?"

export const SURVEY_DESCRIPTION =
  "बिहार में नई सरकार बनने जा रही है। 20 साल बाद नीतीश कुमार कुर्सी छोड़ रहे हैं। नए मुख्यमंत्री को लेकर भास्कर सबसे बड़ा सर्वे कर रहा है। अगला CM किसे होना चाहिए? इस सर्वे के जरिए आप अपनी पसंद बताइए।"

export const CM_FACE_OTHER_VALUE = "__other__"

export const SURVEY_LABELS = {
  cmFace: "1. बिहार में सीएम फेस के लिए आपकी पसंद कौन है?",
  cmCaste: "2. बिहार में किस जाति का सीएम होना चाहिए?",
  cmQuality: "3. नए CM में कौन सी क्वालिटी चाहते हैं?",
  nitishShouldStepDown:
    "4. बिहार में नीतीश के नाम पर सत्ता मिली, क्या उन्हें पद छोड़ना चाहिए?",
  nitishTenurePreference: "5. नीतीश कुमार को कब तक CM के तौर पर देखना चाहेंगे?",
  phoneNumber: "यूजर मोबाइल नंबर",
} as const

export const CM_FACE_OPTIONS = ["सम्राट चौधरी", "निशांत कुमार"] as const

export const CM_CASTE_OPTIONS = ["फॉरवर्ड", "EBC", "OBC", "दलित"] as const

export const CM_QUALITY_OPTIONS = [
  "इंफ्रास्ट्रक्चर बेहतर बनाए",
  "इंडस्ट्री-रोजगार को बढ़ावा दे",
  "लॉ एंड ऑर्डर मेंटेन करे",
  "जातीय संतुलन बनाए रखे",
  "उपरोक्त सभी",
] as const

export const NITISH_STEP_DOWN_OPTIONS = ["हां", "नहीं"] as const

export const NITISH_TENURE_OPTIONS = [
  "कम से कम 1 साल और",
  "सरकार के पूरे टर्म तक",
  "अगले चुनाव में भी वही CM चेहरा",
  "पद छोड़ देना चाहिए उम्र हो चुकी है",
] as const

export type SurveyFieldKey =
  | "cmFace"
  | "cmCaste"
  | "cmQuality"
  | "nitishShouldStepDown"
  | "nitishTenurePreference"

export const SURVEY_SUMMARY_FIELDS: Array<{
  key: SurveyFieldKey
  label: (typeof SURVEY_LABELS)[SurveyFieldKey]
}> = [
  {
    key: "cmFace",
    label: SURVEY_LABELS.cmFace,
  },
  {
    key: "cmCaste",
    label: SURVEY_LABELS.cmCaste,
  },
  {
    key: "cmQuality",
    label: SURVEY_LABELS.cmQuality,
  },
  {
    key: "nitishShouldStepDown",
    label: SURVEY_LABELS.nitishShouldStepDown,
  },
  {
    key: "nitishTenurePreference",
    label: SURVEY_LABELS.nitishTenurePreference,
  },
]

export function normalizePhoneNumber(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().replace(/[()\s-]/g, "")

  if (!normalized || !/^\+?\d+$/.test(normalized)) {
    return null
  }

  return normalized
}

export function isKnownCmFaceOption(value: string) {
  return CM_FACE_OPTIONS.includes(value as (typeof CM_FACE_OPTIONS)[number])
}

export const DEFAULT_SURVEY_CAMPAIGN_ID = 1

export const MLA_IMAGE_BASE_URL =
  "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/mla"

export const PARTIES: Record<string, PartyInfo> = {
  Congress: {
    name: "Congress",
    hiName: "कांग्रेस",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/Congress.jpg",
  },
  BJP: {
    name: "BJP",
    hiName: "भाजपा",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/BJP.jpg",
  },
  BhartiyaAdivasiParty: {
    name: "Bhartiya Adivasi Party",
    hiName: "बीएपी",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/BAP.jpg",
  },
  GondwanaGantantraParty: {
    name: "Gondwana Gantantra Party",
    hiName: "जीजीपी",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/GondwanaGanatantraParty.jpg",
  },
  Independent: {
    name: "Independent",
    hiName: "निर्दलीय",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/Others.jpg",
  },
  RashtriyaLokDal: {
    name: "Rashtriya Lok Dal",
    hiName: "आरएलडी",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/RLD.jpg",
  },
  BahujanSamajParty: {
    name: "Bahujan Samaj Party",
    hiName: "बसपा",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/BSP.jpg",
  },
  SamajwadiParty: {
    name: "Samajwadi Party",
    hiName: "सपा",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/SP.jpg",
  },
  NishadParty: {
    name: "Nishad Party",
    hiName: "निषाद पार्टी",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/NishadParty.jpg",
  },
  SuheldevBharatiyaSamajParty: {
    name: "Suheldev Bharatiya Samaj Party",
    hiName: "सुभासपा",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/SBSP.jpg",
  },
  "ApnaDal(S)": {
    name: "Apna Dal (S)",
    hiName: "अपना दल (एस)",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/ApnaDalS.jpg",
  },
  JanataDalLoktantrik: {
    name: "Janata Dal Loktantrik",
    hiName: "जनसत्ता दल लोकतांत्रिक",
    logo: "https://images.bhaskarassets.com/web2images/web-frontend/mla-report-card/party/JDL.jpg",
  },
}

export type DecisionTreeOption = {
  id: number
  optionText: string
  allowCustomValue: boolean
  isActive: boolean
}

export type DecisionTreeQuestion = {
  id: number
  questionText: string
  position: number
  parentOptionId: number | null
  options: DecisionTreeOption[]
  children: DecisionTreeQuestion[]
}

export type SurveyLocationPayload = {
  districts: Array<
    SurveyDistrict & {
      state: SurveyState
      vidhanSeats: SurveyVidhanSeat[]
    }
  >
  mlaList: Array<
    SurveyMla & {
      district: Pick<SurveyDistrict, "id" | "name" | "englishName">
      vidhan: Pick<SurveyVidhanSeat, "id" | "name" | "englishName">
      party: PartyInfo
      candidateImage: string
    }
  >
}

export type CmsAnswerSummary = {
  questionId: number
  questionText: string
  optionIds: number[]
  optionText: string
  customValue: string
}

export function parsePositiveInt(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function getRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function getPartyInfo(party: string | null | undefined): PartyInfo {
  const normalized = (party ?? "").replace(/\s+/g, "")
  return PARTIES[normalized] ?? PARTIES[party ?? ""] ?? PARTIES.Independent
}

export function getCandidateImageUrl(image: string | null | undefined) {
  if (!image) {
    return ""
  }

  if (/^https?:\/\//i.test(image)) {
    return image
  }

  return `${MLA_IMAGE_BASE_URL}/${image}`
}

export function buildQuestionTree(
  questions: SurveyQuestion[],
  options: SurveyOption[]
): DecisionTreeQuestion[] {
  const optionsByQuestionId = new Map<number, SurveyOption[]>()

  for (const option of options) {
    if (!option.isActive) {
      continue
    }

    const list = optionsByQuestionId.get(option.questionId) ?? []
    list.push(option)
    optionsByQuestionId.set(option.questionId, list)
  }

  const nodesByQuestionId = new Map<number, DecisionTreeQuestion>()

  for (const question of questions.filter((item) => item.isActive)) {
    const questionOptions = optionsByQuestionId.get(question.id) ?? []
    nodesByQuestionId.set(question.id, {
      id: question.id,
      questionText: question.questionText,
      position: question.position,
      parentOptionId: question.parentOptionId ?? null,
      options: questionOptions
        .sort((left, right) => {
          if (left.allowCustomValue !== right.allowCustomValue) {
            return left.allowCustomValue ? 1 : -1
          }
          return left.id - right.id
        })
        .map((option) => ({
          id: option.id,
          optionText: option.optionText,
          allowCustomValue: option.allowCustomValue,
          isActive: option.isActive,
        })),
      children: [],
    })
  }

  const parentQuestionIdByOptionId = new Map<number, number>()

  for (const option of options) {
    parentQuestionIdByOptionId.set(option.id, option.questionId)
  }

  const roots: DecisionTreeQuestion[] = []

  for (const question of questions) {
    const node = nodesByQuestionId.get(question.id)
    if (!node) {
      continue
    }

    if (question.parentOptionId == null) {
      roots.push(node)
      continue
    }

    const parentQuestionId = parentQuestionIdByOptionId.get(
      question.parentOptionId
    )
    const parentNode = parentQuestionId
      ? nodesByQuestionId.get(parentQuestionId)
      : null

    if (parentNode) {
      parentNode.children.push(node)
    }
  }

  const sortTree = (nodes: DecisionTreeQuestion[]) => {
    nodes.sort(
      (left, right) => left.position - right.position || left.id - right.id
    )
    for (const node of nodes) {
      sortTree(node.children)
    }
  }

  sortTree(roots)

  return roots
}

export function validateSurveyAnswers({
  answers,
  questions,
  options,
}: {
  answers: SurveyAnswerValue[]
  questions: SurveyQuestion[]
  options: SurveyOption[]
}) {
  if (!Array.isArray(answers) || answers.length === 0) {
    return "answers must include at least one answer."
  }

  const questionById = new Map(
    questions.map((question) => [question.id, question])
  )
  const optionById = new Map(options.map((option) => [option.id, option]))

  for (const answer of answers) {
    const question = questionById.get(answer.question)

    if (!question || !question.isActive) {
      return `Question ${answer.question} is not part of this survey.`
    }

    if (!Array.isArray(answer.options) || answer.options.length === 0) {
      return `Question ${answer.question} requires an option.`
    }

    if (!question.multipleChoice && answer.options.length > 1) {
      return `Question ${answer.question} only accepts one option.`
    }

    for (const optionId of answer.options) {
      const option = optionById.get(optionId)

      if (!option || !option.isActive || option.questionId !== question.id) {
        return `Option ${optionId} is not valid for question ${question.id}.`
      }

      if (option.allowCustomValue && !answer.customValue?.trim()) {
        return `Question ${question.id} requires a custom value.`
      }
    }
  }

  return null
}

export function summarizeAnswers({
  answers,
  questions,
  options,
}: {
  answers: SurveyAnswerValue[]
  questions: SurveyQuestion[]
  options: SurveyOption[]
}): CmsAnswerSummary[] {
  const questionById = new Map(
    questions.map((question) => [question.id, question])
  )
  const optionById = new Map(options.map((option) => [option.id, option]))

  return answers.map((answer) => {
    const optionIds = answer.options ?? []
    return {
      questionId: answer.question,
      questionText:
        questionById.get(answer.question)?.questionText ??
        `Question ${answer.question}`,
      optionIds,
      optionText: optionIds
        .map((optionId) => optionById.get(optionId)?.optionText ?? optionId)
        .join(" | "),
      customValue: answer.customValue?.trim() ?? "",
    }
  })
}
