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
