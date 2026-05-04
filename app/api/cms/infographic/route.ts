import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"

import {
  DEFAULT_INFOGRAPHIC,
  type ChatMessage,
  type ExtractedSource,
  type GeneratedInfographicImage,
  type InfographicArtDirection,
  type InfographicFact,
  type InfographicLanguage,
  type InfographicQa,
  type InfographicResponse,
  type InfographicSpec,
  type UploadedAsset,
  type VisualAsset,
} from "@/lib/cms/infographic"
import {
  INFOGRAPHIC_TEMPLATE_REFERENCES,
  buildTemplateReferenceSummary,
} from "@/lib/cms/templates"
import { buildInfographicSvgDataUrl, buildPosterOverlayCompositeSvgDataUrl, describeOverlayPlan } from "@/lib/cms/render-svg"

const CHAT_API_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"
const IMAGE_API_URL = "https://ai-gateway.vercel.sh/v1/images/generations"
const IMAGE_EDIT_API_URL = "https://ai-gateway.vercel.sh/v1/images/edits"
const FACTS_MODEL_ID = process.env.CMS_INFOGRAPHIC_FACTS_MODEL ?? "openai/gpt-5.3-chat"
const ART_DIRECTION_MODEL_ID = process.env.CMS_INFOGRAPHIC_ART_MODEL ?? "openai/gpt-5.3-chat"
const QA_MODEL_ID = process.env.CMS_INFOGRAPHIC_QA_MODEL ?? "openai/gpt-5.3-chat"
const IMAGE_MODEL_ID = process.env.CMS_INFOGRAPHIC_IMAGE_MODEL ?? "openai/gpt-image-2"
const MAX_HISTORY_MESSAGES = 8
const MAX_SOURCE_IMAGES = 18
const MAX_MEDIA_FOR_MODEL = 6
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const SUPPORTED_MODEL_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const INFOGRAPHIC_LAYOUT_VARIANTS = [
  "split-hero",
  "image-lead",
  "data-lead",
  "editorial-mosaic",
  "timeline-focus",
] as const

type ThemePaletteKey = Exclude<keyof typeof THEME_PALETTES, "general">

const THEME_PALETTES = {
  politics: {
    background: "#f4efe7",
    surface: "#fffaf2",
    accent: "#9d1c1f",
    text: "#111827",
    muted: "#4b5563",
  },
  business: {
    background: "#eef4f1",
    surface: "#fbfefc",
    accent: "#0f766e",
    text: "#0f172a",
    muted: "#475569",
  },
  technology: {
    background: "#eef2ff",
    surface: "#f8faff",
    accent: "#4338ca",
    text: "#111827",
    muted: "#475569",
  },
  health: {
    background: "#eef8f5",
    surface: "#fbfffd",
    accent: "#0f766e",
    text: "#0f172a",
    muted: "#52606d",
  },
  environment: {
    background: "#eef7ed",
    surface: "#fbfffa",
    accent: "#2f6f3e",
    text: "#17212b",
    muted: "#52606d",
  },
  sports: {
    background: "#fff5eb",
    surface: "#fffdf8",
    accent: "#c2410c",
    text: "#111827",
    muted: "#4b5563",
  },
  crisis: {
    background: "#f7f1ed",
    surface: "#fffaf7",
    accent: "#b45309",
    text: "#1f2937",
    muted: "#5b6472",
  },
  culture: {
    background: "#faf0f6",
    surface: "#fffafd",
    accent: "#a21caf",
    text: "#1f2937",
    muted: "#5b6472",
  },
  general: DEFAULT_INFOGRAPHIC.palette,
} satisfies Record<string, InfographicSpec["palette"]>

const FACTS_SCHEMA = {
  name: "infographic_facts",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      assistantMessage: { type: "string" },
      recommendedAssets: {
        type: "array",
        items: { type: "string" },
      },
      facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            detail: { type: "string" },
          },
          required: ["label", "value", "detail"],
        },
      },
      infographic: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          subtitle: { type: "string" },
          takeaway: { type: "string" },
          footer: { type: "string" },
          contentLanguage: {
            type: "string",
            enum: ["en", "hi", "mixed"],
          },
          layoutVariant: {
            type: "string",
            enum: [...INFOGRAPHIC_LAYOUT_VARIANTS],
          },
          heroAssetIds: {
            type: "array",
            items: { type: "string" },
          },
          stripAssetIds: {
            type: "array",
            items: { type: "string" },
          },
          palette: {
            type: "object",
            additionalProperties: false,
            properties: {
              background: { type: "string" },
              surface: { type: "string" },
              accent: { type: "string" },
              text: { type: "string" },
              muted: { type: "string" },
            },
            required: ["background", "surface", "accent", "text", "muted"],
          },
          stats: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                heading: { type: "string" },
                body: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["heading", "body"],
            },
          },
        },
        required: [
          "title",
          "subtitle",
          "takeaway",
          "footer",
          "contentLanguage",
          "layoutVariant",
          "palette",
          "stats",
          "sections",
          "heroAssetIds",
          "stripAssetIds",
        ],
      },
    },
    required: ["assistantMessage", "recommendedAssets", "facts", "infographic"],
  },
} as const

const ART_DIRECTION_SCHEMA = {
  name: "infographic_art_direction",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      visualStyle: { type: "string" },
      composition: { type: "string" },
      typography: { type: "string" },
      colorDirection: { type: "string" },
      imagePrompt: { type: "string" },
      negativePrompt: { type: "string" },
      mustIncludeText: {
        type: "array",
        items: { type: "string" },
      },
      avoid: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "visualStyle",
      "composition",
      "typography",
      "colorDirection",
      "imagePrompt",
      "negativePrompt",
      "mustIncludeText",
      "avoid",
    ],
  },
} as const

const QA_SCHEMA = {
  name: "infographic_qa",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      approved: { type: "boolean" },
      summary: { type: "string" },
      issues: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["approved", "summary", "issues"],
  },
} as const

const ASSET_USAGE_SCHEMA = {
  name: "infographic_asset_usage",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      usesUploadedImage: { type: "boolean" },
      usesArticleImage: { type: "boolean" },
      shouldFallbackToDeterministicRender: { type: "boolean" },
      summary: { type: "string" },
    },
    required: ["usesUploadedImage", "usesArticleImage", "shouldFallbackToDeterministicRender", "summary"],
  },
} as const

const WEBSITE_IMAGE_ANALYSIS_SCHEMA = {
  name: "website_image_analyser",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      keep: { type: "boolean" },
      confidence: { type: "number" },
      role: { type: "string" },
      summary: { type: "string" },
    },
    required: ["keep", "confidence", "role", "summary"],
  },
} as const

const POSTER_REVIEW_SCHEMA = {
  name: "poster_review",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      approved: { type: "boolean" },
      summary: { type: "string" },
      issues: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["approved", "summary", "issues"],
  },
} as const

const IDENTITY_REVIEW_SCHEMA = {
  name: "identity_review",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      approved: { type: "boolean" },
      preservesPrimaryIdentity: { type: "boolean" },
      preservesSupportingIdentity: { type: "boolean" },
      summary: { type: "string" },
      issues: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["approved", "preservesPrimaryIdentity", "preservesSupportingIdentity", "summary", "issues"],
  },
} as const

type RequestBody = {
  prompt: string
  mode?: "setup" | "refinement"
  sourceUrl?: string
  attachments?: UploadedAsset[]
  history?: ChatMessage[]
}

type ScrapedPage = {
  source: ExtractedSource
  imageUrls: string[]
}

type DownloadedLinkAsset = {
  id: string
  source: "link"
  title: string
  mediaType: string
  dataUrl: string
  originUrl: string
}

type FactsResult = {
  assistantMessage?: unknown
  recommendedAssets?: unknown
  facts?: unknown
  infographic?: Partial<InfographicSpec>
}

type ChatCompletionPayload<T> = {
  error?: { message?: string }
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
} & T

type AssetUsageResult = {
  usesUploadedImage?: unknown
  usesArticleImage?: unknown
  shouldFallbackToDeterministicRender?: unknown
  summary?: unknown
}

type WebsiteImageAnalysisResult = {
  keep?: unknown
  confidence?: unknown
  role?: unknown
  summary?: unknown
}

type IdentityReviewResult = {
  approved?: unknown
  preservesPrimaryIdentity?: unknown
  preservesSupportingIdentity?: unknown
  summary?: unknown
  issues?: unknown
}

function normalizeMediaType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? ""
}

function isSupportedModelImageType(value: string) {
  return SUPPORTED_MODEL_IMAGE_TYPES.has(normalizeMediaType(value))
}

function getDataUrlMediaType(value: string) {
  const match = value.match(/^data:([^;,]+)[;,]/i)
  return normalizeMediaType(match?.[1] ?? "")
}

function isModelReadableDataUrlImage(value: string | null) {
  if (!value) {
    return false
  }

  return SUPPORTED_MODEL_IMAGE_TYPES.has(getDataUrlMediaType(value))
}

function fileExtensionToMediaType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === ".png") return "image/png"
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".webp") return "image/webp"
  if (extension === ".gif") return "image/gif"
  return null
}

function sanitizeText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function extractUrls(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? []
  return Array.from(
    new Set(matches.map((match) => normalizeUrl(match)).filter((value): value is string => Boolean(value)))
  )
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function detectPreferredLanguage({
  prompt,
  sources,
}: {
  prompt: string
  sources: ExtractedSource[]
}): InfographicLanguage {
  const haystack = [prompt, ...sources.flatMap((source) => [source.title ?? "", source.description ?? "", source.textSnippet.slice(0, 1200)])].join(" ")
  const devanagariCount = countMatches(haystack, /[\u0900-\u097F]/g)
  const latinWordCount = countMatches(haystack, /\b[a-zA-Z]{2,}\b/g)

  if (devanagariCount > 0 && latinWordCount > 10) {
    return "mixed"
  }

  if (devanagariCount > latinWordCount) {
    return "hi"
  }

  return "en"
}

function describeLanguage(language: InfographicLanguage) {
  if (language === "hi") {
    return "Hindi"
  }

  if (language === "mixed") {
    return "mixed Hindi-English"
  }

  return "English"
}

function matchMeta(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapeRegExp(key)}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escapeRegExp(key)}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapeRegExp(key)}["']`, "i"),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return sanitizeText(match[1], 500)
    }
  }

  return null
}

function matchTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return titleMatch?.[1] ? sanitizeText(stripTags(titleMatch[1]), 200) : null
}

function resolveMaybeUrl(baseUrl: string, raw: string) {
  try {
    const cleaned = raw.replace(/&amp;/g, "&").trim()
    if (!cleaned || cleaned.startsWith("data:")) {
      return null
    }
    return new URL(cleaned, baseUrl).toString()
  } catch {
    return null
  }
}

function extractImageUrls(html: string, pageUrl: string) {
  const urls = new Set<string>()
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["'][^>]+content=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+data-src=["']([^"']+)["']/gi,
    /<img[^>]+data-lazy-src=["']([^"']+)["']/gi,
    /<img[^>]+data-original=["']([^"']+)["']/gi,
    /<source[^>]+srcset=["']([^"']+)["']/gi,
    /<source[^>]+data-srcset=["']([^"']+)["']/gi,
    /["'](https?:\/\/[^"']+\.(?:png|jpe?g|webp|gif))["']/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(html)
    while (match) {
      const rawValue = match[1]?.split(",")[0]?.trim()
      const resolved = rawValue ? resolveMaybeUrl(pageUrl, rawValue.split(" ")[0] ?? rawValue) : null
      if (resolved) {
        urls.add(resolved)
      }
      match = pattern.exec(html)
    }
  }

  return Array.from(urls).slice(0, MAX_SOURCE_IMAGES)
}

async function fetchPage(url: string): Promise<ScrapedPage | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 CMSStudioBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    })

    const contentType = response.headers.get("content-type") ?? ""
    if (!response.ok || !contentType.includes("text/html")) {
      return null
    }

    const html = await response.text()
    const title = matchMeta(html, "og:title") ?? matchTitle(html)
    const description =
      matchMeta(html, "description") ?? matchMeta(html, "og:description") ?? matchMeta(html, "twitter:description")

    const textSnippet = sanitizeText(stripTags(html), 3500)
    const imageUrls = extractImageUrls(html, url)

    return {
      source: {
        url,
        title,
        description,
        textSnippet,
        imageCount: imageUrls.length,
      },
      imageUrls,
    }
  } catch {
    return null
  }
}

async function remoteImageToDataUrl(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 CMSStudioBot/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    const mediaType = normalizeMediaType(response.headers.get("content-type") ?? "")
    if (!isSupportedModelImageType(mediaType)) {
      return null
    }

    const lengthHeader = response.headers.get("content-length")
    if (lengthHeader && Number(lengthHeader) > MAX_IMAGE_BYTES) {
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return null
    }

    return `data:${mediaType};base64,${buffer.toString("base64")}`
  } catch {
    return null
  }
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "")
  if (normalized.length !== 6) {
    return null
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function relativeLuminance(value: string) {
  const rgb = hexToRgb(value)
  if (!rgb) {
    return 0
  }

  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function bestReadableText(background: string, candidates: string[]) {
  return candidates.filter(isHexColor).sort((left, right) => contrastRatio(right, background) - contrastRatio(left, background))[0] ?? DEFAULT_INFOGRAPHIC.palette.text
}

function keywordScore(haystack: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0)
}

function selectThemePalette({
  prompt,
  sources,
}: {
  prompt: string
  sources: ExtractedSource[]
}) {
  const haystack = [
    prompt,
    ...sources.flatMap((source) => [source.title ?? "", source.description ?? "", source.textSnippet.slice(0, 1800)]),
  ]
    .join(" ")
    .toLowerCase()

  const scoredThemes = [
    {
      key: "politics",
      score: keywordScore(haystack, ["election", "poll", "vote", "voter", "seat", "assembly", "parliament", "bjp", "congress", "candidate", "district", "hindi"]),
    },
    {
      key: "business",
      score: keywordScore(haystack, ["market", "stock", "economy", "business", "trade", "gdp", "startup", "revenue", "inflation", "bank"]),
    },
    {
      key: "technology",
      score: keywordScore(haystack, ["ai", "technology", "tech", "software", "chip", "startup", "app", "internet", "digital", "platform"]),
    },
    {
      key: "health",
      score: keywordScore(haystack, ["health", "hospital", "disease", "virus", "medical", "doctor", "patient", "nutrition", "vaccine"]),
    },
    {
      key: "environment",
      score: keywordScore(haystack, ["climate", "weather", "rain", "forest", "pollution", "river", "water", "heatwave", "environment"]),
    },
    {
      key: "sports",
      score: keywordScore(haystack, ["cricket", "match", "league", "tournament", "goal", "player", "sports", "team", "score"]),
    },
    {
      key: "crisis",
      score: keywordScore(haystack, ["war", "conflict", "attack", "earthquake", "flood", "disaster", "accident", "fire", "death"]),
    },
    {
      key: "culture",
      score: keywordScore(haystack, ["film", "festival", "culture", "music", "cinema", "fashion", "art", "heritage", "celebrity"]),
    },
  ] satisfies Array<{ key: ThemePaletteKey; score: number }>

  scoredThemes.sort((left, right) => right.score - left.score)

  const topTheme = scoredThemes[0]
  return topTheme && topTheme.score > 0 ? THEME_PALETTES[topTheme.key] : THEME_PALETTES.general
}

function normalizePalette(
  palette: Partial<InfographicSpec["palette"]> | undefined,
  fallbackPalette: InfographicSpec["palette"] = DEFAULT_INFOGRAPHIC.palette
) {
  const background = isHexColor(palette?.background ?? "") ? palette!.background! : fallbackPalette.background
  const surface = isHexColor(palette?.surface ?? "") ? palette!.surface! : fallbackPalette.surface
  const accentCandidate = isHexColor(palette?.accent ?? "") ? palette!.accent! : fallbackPalette.accent
  const textCandidate = isHexColor(palette?.text ?? "") ? palette!.text! : fallbackPalette.text
  const mutedCandidate = isHexColor(palette?.muted ?? "") ? palette!.muted! : fallbackPalette.muted

  const accent = contrastRatio("#ffffff", accentCandidate) >= 4.5 ? accentCandidate : fallbackPalette.accent
  const text =
    contrastRatio(textCandidate, surface) >= 4.5
      ? textCandidate
      : bestReadableText(surface, [fallbackPalette.text, DEFAULT_INFOGRAPHIC.palette.text, "#111827", "#0f172a", "#ffffff"])
  const muted =
    contrastRatio(mutedCandidate, surface) >= 3
      ? mutedCandidate
      : bestReadableText(surface, [fallbackPalette.muted, DEFAULT_INFOGRAPHIC.palette.muted, text, "#374151", "#6b7280"])

  return {
    background,
    surface,
    accent,
    text,
    muted,
  }
}

function normalizeStringList(value: unknown, maxItems: number, maxLength = 240) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function preferAssetIds({
  current,
  uploaded,
  linked,
  recommended,
  fallback,
  limit,
}: {
  current: string[]
  uploaded: string[]
   linked: string[]
  recommended: string[]
  fallback: string[]
  limit: number
}) {
  const ordered = Array.from(new Set([...current, ...recommended, ...uploaded, ...linked, ...fallback]))
  const next: string[] = []

  const pushIfPresent = (ids: string[]) => {
    for (const id of ids) {
      if (ordered.includes(id) && !next.includes(id) && next.length < limit) {
        next.push(id)
        break
      }
    }
  }

  if (uploaded.length > 0) {
    pushIfPresent(uploaded)
  }

  if (linked.length > 0) {
    pushIfPresent(linked)
  }

  for (const id of ordered) {
    if (!next.includes(id)) {
      next.push(id)
    }

    if (next.length >= limit) {
      break
    }
  }

  return next.slice(0, limit)
}

async function loadTemplateReferenceImages() {
  const references = await Promise.all(
    INFOGRAPHIC_TEMPLATE_REFERENCES.map(async (template) => {
      const absolutePath = path.join(process.cwd(), "public", template.filePath.replace(/^\//, ""))
      const mediaType = fileExtensionToMediaType(absolutePath)

      if (!mediaType || !isSupportedModelImageType(mediaType)) {
        return null
      }

      try {
        const buffer = await readFile(absolutePath)
        return {
          id: template.id,
          dataUrl: `data:${mediaType};base64,${buffer.toString("base64")}`,
        }
      } catch {
        return null
      }
    })
  )

  return references.filter((item): item is { id: string; dataUrl: string } => Boolean(item))
}

function getApiKey() {
  const apiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("APP_BUILDER_VERCEL_AI_GATEWAY is not configured.")
  }
  return apiKey
}

async function callChatJson<T>({
  model,
  schema,
  messages,
}: {
  model: string
  schema: { name: string; schema: object }
  messages: Array<{ role: string; content: unknown }>
}) {
  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: "json_schema",
        json_schema: schema,
      },
      messages,
    }),
  })

  const payload = (await response.json()) as ChatCompletionPayload<T>
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "AI request failed")
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("AI did not return content.")
  }

  const rawContent =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((item) => {
              if (typeof item === "string") {
                return item
              }

              if (typeof item?.text === "string") {
                return item.text
              }

              return ""
            })
            .join("")
        : ""

  const normalizedContent = rawContent.trim()
  if (!normalizedContent) {
    throw new Error("AI returned empty content.")
  }

  const jsonCandidate = normalizedContent.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? normalizedContent

  try {
    return JSON.parse(jsonCandidate) as T
  } catch {
    throw new Error(`AI returned non-JSON content: ${sanitizeText(normalizedContent, 220)}`)
  }
}

function buildAssetSummary(assets: VisualAsset[]) {
  return assets
    .map((asset, index) => {
      const priority = asset.source === "upload" ? "primary-reference" : index === 0 ? "article-hero" : "article-support"
      return `${asset.id} | ${priority} | ${asset.source} | ${asset.title}${asset.originUrl ? ` | ${asset.originUrl}` : ""}`
    })
    .join("\n")
}

function buildReferenceRoleSummary(infographic: InfographicSpec, assets: VisualAsset[]) {
  const references = pickReferenceAssets(infographic, assets)

  return references
    .map((asset, index) => {
      const role = index === 0 ? "primary identity anchor" : index === 1 ? "secondary supporting identity" : "context support"
      const dimensions = asset.width && asset.height ? ` | ${asset.width}x${asset.height}` : ""
      return `- ${asset.id}: ${role} | ${asset.source} | ${asset.title}${dimensions}${asset.originUrl ? ` | ${asset.originUrl}` : ""}`
    })
    .join("\n")
}

function buildSourceSummary(sources: ExtractedSource[]) {
  return sources
    .map((source) =>
      [
        `URL: ${source.url}`,
        source.title ? `Title: ${source.title}` : null,
        source.description ? `Description: ${source.description}` : null,
        `Snippet: ${source.textSnippet.slice(0, 1200)}`,
        `Image count: ${source.imageCount}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n")
}

function normalizeFacts(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const label = typeof item?.label === "string" ? sanitizeText(item.label, 40) : ""
      const factValue = typeof item?.value === "string" ? sanitizeText(item.value, 64) : ""
      const detail = typeof item?.detail === "string" ? sanitizeText(item.detail, 180) : ""
      return label && factValue && detail ? { label, value: factValue, detail } : null
    })
    .filter((item): item is InfographicFact => Boolean(item))
    .slice(0, 12)
}

function normalizeArtDirection(value: unknown, infographic: InfographicSpec): InfographicArtDirection {
  const fallbackText = [infographic.title, infographic.subtitle, infographic.takeaway].filter(Boolean)
  const languageLabel = describeLanguage(infographic.contentLanguage)
  return {
    visualStyle:
      typeof (value as InfographicArtDirection | undefined)?.visualStyle === "string"
        ? sanitizeText((value as InfographicArtDirection).visualStyle, 240)
        : `Clean ${languageLabel} newsroom explainer with restrained editorial styling and a believable print-magazine feel.`,
    composition:
      typeof (value as InfographicArtDirection | undefined)?.composition === "string"
        ? sanitizeText((value as InfographicArtDirection).composition, 320)
        : "Simple visual hierarchy, one dominant hero image, a few supporting modules, quiet background treatment, and clear separation between story blocks.",
    typography:
      typeof (value as InfographicArtDirection | undefined)?.typography === "string"
        ? sanitizeText((value as InfographicArtDirection).typography, 220)
        : `Confident ${languageLabel} headline typography with readable supporting labels and restrained emphasis.`,
    colorDirection:
      typeof (value as InfographicArtDirection | undefined)?.colorDirection === "string"
        ? sanitizeText((value as InfographicArtDirection).colorDirection, 220)
        : "Use muted editorial neutrals and only a small amount of accent color, keeping the palette close to the source imagery when possible.",
    imagePrompt:
      typeof (value as InfographicArtDirection | undefined)?.imagePrompt === "string"
        ? sanitizeText((value as InfographicArtDirection).imagePrompt, 6000)
        : `Create a vertical ${languageLabel} news explainer layout for ${infographic.title} with a natural, grounded editorial tone.`,
    negativePrompt:
      typeof (value as InfographicArtDirection | undefined)?.negativePrompt === "string"
        ? sanitizeText((value as InfographicArtDirection).negativePrompt, 1000)
        : "Avoid website UI chrome, low-contrast text, empty panels, generic stock illustrations, gibberish text, overdramatic lighting, excessive textures, neon accents, and weak hierarchy.",
    mustIncludeText:
      normalizeStringList((value as InfographicArtDirection | undefined)?.mustIncludeText, 10, 120).length > 0
        ? normalizeStringList((value as InfographicArtDirection | undefined)?.mustIncludeText, 10, 120)
        : fallbackText,
    avoid:
      normalizeStringList((value as InfographicArtDirection | undefined)?.avoid, 10, 120).length > 0
        ? normalizeStringList((value as InfographicArtDirection | undefined)?.avoid, 10, 120)
        : ["webpage layout", "generic dashboard cards", "tiny unreadable labels", "overdesigned cinematic effects", "fake stock-photo look"],
  }
}

function normalizeQa(value: unknown): InfographicQa {
  return {
    approved: Boolean((value as InfographicQa | undefined)?.approved),
    summary:
      typeof (value as InfographicQa | undefined)?.summary === "string"
        ? sanitizeText((value as InfographicQa).summary, 240)
        : "QA did not return a summary.",
    issues: normalizeStringList((value as InfographicQa | undefined)?.issues, 8, 180),
  }
}

function normalizeInfographic(
  value: Partial<InfographicSpec> | undefined,
  assetIds: string[],
  fallbackPalette: InfographicSpec["palette"],
  fallbackLanguage: InfographicLanguage
): InfographicSpec {
  const stats = Array.isArray(value?.stats)
    ? value.stats
        .map((item) => {
          const label = typeof item?.label === "string" ? sanitizeText(item.label, 32) : ""
          const statValue = typeof item?.value === "string" ? sanitizeText(item.value, 44) : ""
          return label && statValue ? { label, value: statValue } : null
        })
        .filter((item): item is { label: string; value: string } => Boolean(item))
        .slice(0, 8)
    : []

  const sections = Array.isArray(value?.sections)
    ? value.sections
        .map((item) => {
          const heading = typeof item?.heading === "string" ? sanitizeText(item.heading, 40) : ""
          const body = Array.isArray(item?.body)
            ? item.body
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => sanitizeText(entry, 120))
                .filter(Boolean)
                .slice(0, 4)
            : []
          return heading && body.length > 0 ? { heading, body } : null
        })
        .filter((item): item is { heading: string; body: string[] } => Boolean(item))
        .slice(0, 8)
    : []

  const heroAssetIds = normalizeStringList(value?.heroAssetIds, 3).filter((id) => assetIds.includes(id))
  const stripAssetIds = normalizeStringList(value?.stripAssetIds, 6).filter((id) => assetIds.includes(id))
  const layoutVariant = INFOGRAPHIC_LAYOUT_VARIANTS.includes(value?.layoutVariant as (typeof INFOGRAPHIC_LAYOUT_VARIANTS)[number])
    ? (value?.layoutVariant as InfographicSpec["layoutVariant"])
    : stats.length >= 6
      ? "data-lead"
      : assetIds.length >= 2 && stats.length <= 4
        ? "image-lead"
      : sections.length >= 5
        ? "timeline-focus"
        : assetIds.length >= 3
          ? "editorial-mosaic"
          : DEFAULT_INFOGRAPHIC.layoutVariant

  return {
    contentLanguage:
      value?.contentLanguage === "en" || value?.contentLanguage === "hi" || value?.contentLanguage === "mixed"
        ? value.contentLanguage
        : fallbackLanguage,
    title: typeof value?.title === "string" ? sanitizeText(value.title, 96) : DEFAULT_INFOGRAPHIC.title,
    subtitle: typeof value?.subtitle === "string" ? sanitizeText(value.subtitle, 180) : DEFAULT_INFOGRAPHIC.subtitle,
    takeaway: typeof value?.takeaway === "string" ? sanitizeText(value.takeaway, 220) : DEFAULT_INFOGRAPHIC.takeaway,
    footer: typeof value?.footer === "string" ? sanitizeText(value.footer, 120) : DEFAULT_INFOGRAPHIC.footer,
    layoutVariant,
    palette: normalizePalette(value?.palette, fallbackPalette),
    stats,
    sections,
    heroAssetIds,
    stripAssetIds,
  }
}

async function callFactsModel({
  mode,
  prompt,
  history,
  sources,
  assets,
  preferredLanguage,
}: {
  mode: "setup" | "refinement"
  prompt: string
  history: ChatMessage[]
  sources: ExtractedSource[]
  assets: VisualAsset[]
  preferredLanguage: InfographicLanguage
}) {
  const assetSummary = buildAssetSummary(assets)
  const sourceSummary = buildSourceSummary(sources)
  const visualAssets = assets.slice(0, MAX_MEDIA_FOR_MODEL)

  return callChatJson<FactsResult>({
    model: FACTS_MODEL_ID,
    schema: FACTS_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are a newsroom researcher and infographic planner.",
          "Extract only the most relevant facts, election math, geography, and narrative context from the provided source material.",
          `Return concise but publishable infographic copy in ${describeLanguage(preferredLanguage)} matching the user request and source material.`,
          "Do not translate an English story into Hindi unless the user explicitly asks for Hindi.",
          "Do not design a website. Plan an editorial vertical poster infographic.",
          "Prefer clear, grounded modules, not sparse marketing copy or hyper-stylized poster theatrics.",
          "When visuals are available, treat uploaded images as primary references and article images as secondary support.",
          "When both uploaded and article images exist, choose the layout and asset ids so both are visibly represented instead of collapsing to only one source.",
          "Do not keep reusing the same generic warm-red palette unless the subject matter and visuals clearly justify it.",
          mode === "refinement"
            ? "Respect the prior direction from the conversation when revising the facts plan."
            : "Produce a strong first-pass facts plan with a decisive editorial hierarchy.",
        ].join(" "),
      },
      ...history.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
        role: message.role,
        content: message.text,
      })),
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `User request: ${sanitizeText(prompt, 2400)}`,
              `Primary language to preserve: ${describeLanguage(preferredLanguage)}`,
              sources.length > 0 ? `Scraped source context:\n${sourceSummary}` : "No source links were available.",
              assets.length > 0 ? `Available visual assets:\n${assetSummary}` : "No visual assets were available.",
              "Return facts, a structured infographic spec, and recommended asset ids.",
              "Title should be strong and editorial. Subtitle should add context. Stats and sections may be denser than a simple social card if the story demands it.",
              "Set the palette from the story mood and the visible cues in the provided images when possible.",
              "If good photos are available and the story is not overwhelmingly data-heavy, prefer an image-led composition.",
              "If uploaded images and scraped article images are both available, explicitly recommend assets from both sets.",
              "Avoid fluff, repetition, weak hedging, and generic poster language.",
            ].join("\n\n"),
          },
          ...visualAssets.map((asset) => ({
            type: "image_url",
            image_url: {
              url: asset.dataUrl,
            },
          })),
        ],
      },
    ],
  })
}

async function callArtDirectionModel({
  prompt,
  sources,
  assets,
  infographic,
  facts,
  preferredLanguage,
}: {
  prompt: string
  sources: ExtractedSource[]
  assets: VisualAsset[]
  infographic: InfographicSpec
  facts: InfographicFact[]
  preferredLanguage: InfographicLanguage
}) {
  const templateSummary = buildTemplateReferenceSummary()
  const templateImages = await loadTemplateReferenceImages()
  const sourceSummary = buildSourceSummary(sources)
  const assetSummary = buildAssetSummary(assets)
  const referenceRoleSummary = buildReferenceRoleSummary(infographic, assets)
  const visualAssets = assets.slice(0, Math.min(4, MAX_MEDIA_FOR_MODEL))

  return callChatJson<InfographicArtDirection>({
    model: ART_DIRECTION_MODEL_ID,
    schema: ART_DIRECTION_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          `You are an art director for premium ${describeLanguage(preferredLanguage)} newsroom explainers.`,
          "Your output will drive a final image model, so write a highly specific prompt for a single vertical editorial infographic image.",
          "The image must feel like a finished poster, not a web page, dashboard, or slide deck.",
          "Keep the styling grounded and believable: calm composition, restrained textures, modest accent usage, and clear hierarchy without theatrical excess.",
          "Preserve factual text from the infographic plan. Avoid inventing numbers or districts.",
          "Reference samples are only style guidance; never copy their content or logos.",
          "Uploaded images are the primary visual anchors. Article images are supporting references.",
          "When both uploaded and article images are available, the composition must visibly use both, with uploaded imagery leading and article imagery reinforcing context.",
          "Treat the strongest supplied image as a subject-identity anchor: preserve the recognizable person, object, or scene from that image while redesigning the surrounding poster composition.",
          "Do not replace the supplied subject with a generic stock substitute, unrelated athlete, different object, or unrelated setting.",
          "Derive the palette from the subject matter and the actual hues, lighting, and emotional tone visible in the supplied images when they are available.",
          "Avoid defaulting every story to the same red-beige editorial look.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `User request: ${sanitizeText(prompt, 2400)}`,
              `Primary language to preserve: ${describeLanguage(preferredLanguage)}`,
              `Infographic title: ${infographic.title}`,
              `Subtitle: ${infographic.subtitle}`,
              `Takeaway: ${infographic.takeaway}`,
              `Layout direction: ${infographic.layoutVariant}`,
              `Palette: background ${infographic.palette.background}, surface ${infographic.palette.surface}, accent ${infographic.palette.accent}`,
              facts.length > 0
                ? `Key facts:\n${facts.map((fact) => `- ${fact.label}: ${fact.value} (${fact.detail})`).join("\n")}`
                : "No structured facts were available.",
              sources.length > 0 ? `Source context:\n${sourceSummary}` : "No source context was available.",
              assets.length > 0 ? `Available visuals:\n${assetSummary}` : "No visuals were available.",
              referenceRoleSummary ? `Reference roles to preserve:\n${referenceRoleSummary}` : "",
              `Style-only template references:\n${templateSummary}`,
              `Write the image prompt so the model renders a complete, publication-ready infographic poster with readable ${describeLanguage(preferredLanguage)} typography, distinct information zones, and a more natural editorial finish.`,
              "If source or uploaded photos are available, explicitly place them as hero/supporting imagery rather than replacing them with generic stock-style substitutes.",
              "Preserve subject identity from the primary anchor image and redesign only the surrounding crop, lighting, framing, background, and infographic structure.",
              "Create clean text-safe areas around the preserved subject instead of covering or deleting it.",
              "Do not overdesign the page with dramatic glows, intense texture, extreme contrast, or flashy decorative elements.",
              "Explicitly avoid a browser screenshot, SaaS dashboard, wireframe, or web card grid aesthetic.",
            ].join("\n\n"),
          },
          ...visualAssets.map((asset) => ({
            type: "image_url",
            image_url: {
              url: asset.dataUrl,
            },
          })),
          ...templateImages.map((image) => ({
            type: "image_url",
            image_url: {
              url: image.dataUrl,
            },
          })),
        ],
      },
    ],
  })
}

function buildFinalImagePrompt({
  infographic,
  facts,
  artDirection,
  assets,
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
  assets: VisualAsset[]
}) {
  const factLines = facts.slice(0, 10).map((fact) => `${fact.label}: ${fact.value} - ${fact.detail}`).join("\n")
  const requiredText = Array.from(
    new Set([infographic.title, infographic.subtitle, infographic.takeaway, ...artDirection.mustIncludeText].filter(Boolean))
  )
    .slice(0, 8)
    .join("\n")
  const referenceRoleSummary = buildReferenceRoleSummary(infographic, assets)

  return [
    artDirection.imagePrompt,
    `Visual style: ${artDirection.visualStyle}`,
    `Composition: ${artDirection.composition}`,
    `Typography: ${artDirection.typography}`,
    `Color direction: ${artDirection.colorDirection}`,
    `Canvas: single vertical infographic poster, 1024x1536, full-bleed, print-ready visual polish.`,
    referenceRoleSummary
      ? `Reference imagery roles:\n${referenceRoleSummary}`
      : "",
    "Use the primary identity anchor as the subject foundation for the poster. Preserve the recognizable person, object, uniform, pose, and scene cues from that supplied image.",
    "You may redesign the surrounding composition, lighting, background, crop, textures, borders, and infographic modules, but do not replace the primary subject with a generic substitute.",
    "Supporting references may inform secondary faces, context, venue, or match atmosphere, but should not overpower the primary identity anchor.",
    "Extract the needed visual essence from the supplied pixels and restage it in a cleaner editorial composition when necessary, while keeping the subject clearly recognizable.",
    "Create strong negative space and typography-safe zones around the preserved subject rather than letting text collide with it.",
    `Required headline and text elements to appear cleanly and prominently:\n${requiredText}`,
    factLines ? `Facts to visually encode through boxes, labels, maps, callouts, seals, arrows, charts, or modular sections:\n${factLines}` : "",
    `Negative constraints: ${artDirection.negativePrompt}`,
    artDirection.avoid.length > 0 ? `Also avoid: ${artDirection.avoid.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) {
    return null
  }

  const mediaType = normalizeMediaType(match[1] ?? "") || "image/png"
  const extension = mediaType.split("/")[1] ?? "png"
  const buffer = Buffer.from(match[2] ?? "", "base64")
  return new File([buffer], `${fileName}.${extension}`, { type: mediaType })
}

function pickReferenceAssets(infographic: InfographicSpec, assets: VisualAsset[]) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const orderedIds = [
    ...infographic.heroAssetIds,
    ...infographic.stripAssetIds,
    ...assets.filter((asset) => asset.source === "upload").map((asset) => asset.id),
    ...assets.filter((asset) => asset.source === "link").map((asset) => asset.id),
    ...assets.map((asset) => asset.id),
  ]

  const orderedAssets = Array.from(new Set(orderedIds))
    .map((id) => assetMap.get(id))
    .filter((asset): asset is VisualAsset => Boolean(asset))

  const picked: VisualAsset[] = []
  const pushFirstOfSource = (source: VisualAsset["source"]) => {
    const match = orderedAssets.find((asset) => asset.source === source && !picked.some((item) => item.id === asset.id))
    if (match) {
      picked.push(match)
    }
  }

  pushFirstOfSource("upload")
  pushFirstOfSource("link")

  for (const asset of orderedAssets) {
    if (!picked.some((item) => item.id === asset.id)) {
      picked.push(asset)
    }

    if (picked.length >= 4) {
      break
    }
  }

  return picked.slice(0, 4)
}

async function requestRenderedImage({
  url,
  body,
  isMultipart = false,
}: {
  url: string
  body: BodyInit
  isMultipart?: boolean
}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    },
    body,
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
    data?: Array<{
      b64_json?: string
      revised_prompt?: string
    }>
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Image generation failed")
  }

  const image = payload.data?.[0]
  if (!image?.b64_json) {
    throw new Error("Image generation returned no image data.")
  }

  return {
    dataUrl: `data:image/png;base64,${image.b64_json}`,
    revisedPrompt: image.revised_prompt ? sanitizeText(image.revised_prompt, 4000) : null,
  }
}

async function analyzeWebsiteImage({
  prompt,
  sources,
  asset,
}: {
  prompt: string
  sources: ExtractedSource[]
  asset: VisualAsset
}) {
  const sourceSummary = buildSourceSummary(sources)

  return callChatJson<WebsiteImageAnalysisResult>({
    model: QA_MODEL_ID,
    schema: WEBSITE_IMAGE_ANALYSIS_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are website-image-analyser.",
          "Your job is to decide whether a scraped website image is worth using in an infographic for the given story.",
          "Reject useless thumbnails, decorative icons, logos, navigation graphics, reaction buttons, maps pins, interface elements, emoji-like graphics, and low-information filler images.",
          "Keep images only if they add editorial value, subject clarity, location context, event context, or supporting evidence.",
          "Do not evaluate user-uploaded images here; only scraped website images.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Infographic request: ${sanitizeText(prompt, 2400)}`,
              sources.length > 0 ? `Source context:\n${sourceSummary}` : "No source context was available.",
              `Candidate website image: ${asset.title}`,
              `Origin URL: ${asset.originUrl ?? "unknown"}`,
              "Return keep=false if this is likely a thumbnail, decorative icon, or weak contextual image.",
            ].join("\n\n"),
          },
          {
            type: "image_url",
            image_url: {
              url: asset.dataUrl,
            },
          },
        ],
      },
    ],
  })
}

async function filterWebsiteImages({
  prompt,
  sources,
  assets,
}: {
  prompt: string
  sources: ExtractedSource[]
  assets: VisualAsset[]
}) {
  const reviewed = await Promise.all(
    assets.map(async (asset) => {
      try {
        const result = await analyzeWebsiteImage({ prompt, sources, asset })
        return {
          asset,
          keep: Boolean(result.keep),
          confidence: typeof result.confidence === "number" ? result.confidence : 0,
        }
      } catch {
        return {
          asset,
          keep: false,
          confidence: 0,
        }
      }
    })
  )

  const kept = reviewed
    .filter((item) => item.keep)
    .sort((left, right) => right.confidence - left.confidence)
    .map((item) => item.asset)

  return kept.slice(0, MAX_SOURCE_IMAGES)
}

async function reviewReservedPhotoPoster({
  infographic,
  posterDataUrl,
  assets,
}: {
  infographic: InfographicSpec
  posterDataUrl: string
  assets: VisualAsset[]
}) {
  return callChatJson<InfographicQa>({
    model: QA_MODEL_ID,
    schema: POSTER_REVIEW_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are reviewing an AI-generated infographic poster before real source images are composited into reserved slots.",
          "Check whether the composition is strong, the typography is readable, and the reserved image windows are clean and suitable for real-photo replacement.",
          "Check whether each reserved image window leaves accurate dedicated space and makes the final inserted image feel like a native part of the infographic rather than a pasted overlay.",
          "If the reserved image areas clash with the layout, cover important text, feel awkward, leave too little breathing room, or the overall impact is weak, reject it.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Title: ${infographic.title}`,
              `Subtitle: ${infographic.subtitle}`,
              `Reserved overlay plan:\n${describeOverlayPlan(assets)}`,
              "Judge whether this poster will still look good after the real source images are inserted into those reserved windows.",
              "Specifically verify that the reserved windows have accurate space, proper visual framing, and enough separation from nearby text or graphic elements.",
            ].join("\n\n"),
          },
          {
            type: "image_url",
            image_url: {
              url: posterDataUrl,
            },
          },
        ],
      },
    ],
  })
}

async function generateFinalImage({
  infographic,
  facts,
  artDirection,
  assets,
  promptOverride,
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
  assets: VisualAsset[]
  promptOverride?: string
}): Promise<GeneratedInfographicImage> {
  const prompt = promptOverride ?? buildFinalImagePrompt({ infographic, facts, artDirection, assets })
  const referenceAssets = pickReferenceAssets(infographic, assets)
  const errors: string[] = []

  try {
    if (referenceAssets.length > 0) {
      const formData = new FormData()
      formData.append("model", IMAGE_MODEL_ID)
      formData.append("prompt", prompt)
      formData.append("size", "1024x1536")

      for (const [index, asset] of referenceAssets.entries()) {
        const file = dataUrlToFile(asset.dataUrl, `reference-${index + 1}`)
        if (file) {
          formData.append("image[]", file)
        }
      }

      try {
        const editedImage = await requestRenderedImage({
          url: IMAGE_EDIT_API_URL,
          body: formData,
          isMultipart: true,
        })

        return {
          status: "generated",
          model: IMAGE_MODEL_ID,
          dataUrl: editedImage.dataUrl,
          mimeType: "image/png",
          prompt,
          revisedPrompt: editedImage.revisedPrompt,
          error: null,
        }
      } catch (error) {
        errors.push(error instanceof Error ? `image edit failed: ${error.message}` : "image edit failed")
      }
    }

    const generatedImage = await requestRenderedImage({
      url: IMAGE_API_URL,
      body: JSON.stringify({
        model: IMAGE_MODEL_ID,
        prompt,
        size: "1024x1536",
      }),
    })

    return {
      status: "generated",
      model: IMAGE_MODEL_ID,
      dataUrl: generatedImage.dataUrl,
      mimeType: "image/png",
      prompt,
      revisedPrompt: generatedImage.revisedPrompt,
      error: null,
    }
  } catch (error) {
    return {
      status: "fallback",
      model: IMAGE_MODEL_ID,
      dataUrl: null,
      mimeType: null,
      prompt,
      revisedPrompt: null,
      error:
        error instanceof Error
          ? [...errors, error.message].join(" | ") || "Image generation failed."
          : errors.join(" | ") || "Image generation failed.",
    }
  }
}

function buildReservedPhotoPosterPrompt({
  infographic,
  facts,
  artDirection,
  assets,
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
  assets: VisualAsset[]
}) {
  const hasUpload = assets.some((asset) => asset.source === "upload")
  const hasArticle = assets.some((asset) => asset.source === "link")
  const factLines = facts.slice(0, 8).map((fact) => `${fact.label}: ${fact.value} - ${fact.detail}`).join("\n")

  return [
    `Create a complete vertical editorial infographic poster for ${infographic.title}.`,
    `Subtitle: ${infographic.subtitle}`,
    `Takeaway: ${infographic.takeaway}`,
    factLines ? `Key facts:\n${factLines}` : "",
    `Visual style: ${artDirection.visualStyle}`,
    `Composition: ${artDirection.composition}`,
    `Typography: ${artDirection.typography}`,
    `Color direction: ${artDirection.colorDirection}`,
    "The poster should be publication-ready and visually rich with the same overall quality as a fully AI-generated editorial graphic.",
    "Important: reserve dedicated clean photo windows for compositing real source images later.",
    "Do not place important text or key icons inside these photo windows.",
    hasUpload || hasArticle ? `Reserved photo window plan:\n${describeOverlayPlan(assets)}` : "",
    "Inside the reserved photo windows, use only subtle dark gradient placeholders or neutral blurred fills. Do not place real people, sports gear, landmarks, logos, or text there.",
    "Generate the rest of the poster completely: headline, subheadline, sections, stats, mood, background, and supporting infographic design everywhere outside those windows.",
    "Keep headline and all essential text away from the reserved windows so nothing important gets covered after compositing.",
    "Leave accurate negative space around each reserved image window so inserted website or uploaded images feel built into the poster.",
    "Use local framing devices around the reserved windows such as matching card edges, glow, stroke rhythm, shadow, or composition anchors so the inserted images belong naturally.",
    `Visual style: ${artDirection.visualStyle}`,
    "Do not translate the language unless explicitly requested.",
  ].join("\n\n")
}

async function generateReservedPhotoPoster({
  infographic,
  facts,
  artDirection,
  assets,
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
  assets: VisualAsset[]
}) {
  const initialPrompt = buildReservedPhotoPosterPrompt({ infographic, facts, artDirection, assets })

  try {
    let generatedImage = await requestRenderedImage({
      url: IMAGE_API_URL,
      body: JSON.stringify({
        model: IMAGE_MODEL_ID,
        prompt: initialPrompt,
        size: "1024x1536",
      }),
    })

    const review = await reviewReservedPhotoPoster({
      infographic,
      posterDataUrl: generatedImage.dataUrl,
      assets,
    })

    if (!review.approved) {
      generatedImage = await requestRenderedImage({
        url: IMAGE_API_URL,
        body: JSON.stringify({
          model: IMAGE_MODEL_ID,
          prompt: [
            initialPrompt,
            `Regeneration feedback: ${sanitizeText(review.summary, 200)}`,
            review.issues.length > 0 ? `Fix these issues:\n${review.issues.map((issue) => `- ${sanitizeText(issue, 200)}`).join("\n")}` : "",
            "Improve composition, keep key text clear, and make the reserved photo windows feel intentional, editorial, and spatially correct for the inserted images.",
          ]
            .filter(Boolean)
            .join("\n\n"),
          size: "1024x1536",
        }),
      })
    }

    return generatedImage.dataUrl
  } catch {
    return null
  }
}

async function callQaModel({
  infographic,
  facts,
  artDirection,
  finalImage,
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
  finalImage: GeneratedInfographicImage
}) {
  return callChatJson<InfographicQa>({
    model: QA_MODEL_ID,
    schema: QA_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are a strict editorial QA reviewer for infographic posters.",
          "Check factual alignment, clarity of hierarchy, likely readability of text, and whether the output drifted into a web-page aesthetic.",
          "If you see issues, list concise actionable problems. If the image is unavailable, review the planned output and prompt instead.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Title: ${infographic.title}`,
              `Subtitle: ${infographic.subtitle}`,
              `Takeaway: ${infographic.takeaway}`,
              `Layout: ${infographic.layoutVariant}`,
              facts.length > 0
                ? `Facts:\n${facts.map((fact) => `- ${fact.label}: ${fact.value} (${fact.detail})`).join("\n")}`
                : "No structured facts were available.",
              `Art direction summary: ${artDirection.visualStyle} ${artDirection.composition}`,
              `Generation mode: ${finalImage.status}`,
              `Generation error: ${finalImage.error ?? "none"}`,
              `Prompt used:\n${finalImage.revisedPrompt ?? finalImage.prompt}`,
            ].join("\n\n"),
          },
          ...(isModelReadableDataUrlImage(finalImage.dataUrl)
            ? [
                {
                  type: "image_url",
                  image_url: {
                    url: finalImage.dataUrl,
                  },
                },
              ]
            : []),
        ],
      },
    ],
  })
}

function normalizeAssetUsage(value: AssetUsageResult, hasUploads: boolean, hasArticleImages: boolean) {
  const usesUploadedImage = Boolean(value.usesUploadedImage)
  const usesArticleImage = Boolean(value.usesArticleImage)
  const shouldFallback = Boolean(value.shouldFallbackToDeterministicRender)
  const summary = typeof value.summary === "string" ? sanitizeText(value.summary, 240) : "Asset usage QA did not return a summary."

  return {
    usesUploadedImage,
    usesArticleImage,
    shouldFallbackToDeterministicRender:
      shouldFallback || (hasUploads && !usesUploadedImage) || (hasArticleImages && !usesArticleImage),
    summary,
  }
}

async function callAssetUsageModel({
  infographic,
  finalImage,
  assets,
}: {
  infographic: InfographicSpec
  finalImage: GeneratedInfographicImage
  assets: VisualAsset[]
}) {
  const uploadedAssets = assets.filter((asset) => asset.source === "upload").slice(0, 2)
  const articleAssets = assets.filter((asset) => asset.source === "link").slice(0, 2)

  if (!finalImage.dataUrl || (uploadedAssets.length === 0 && articleAssets.length === 0)) {
    return {
      usesUploadedImage: uploadedAssets.length === 0,
      usesArticleImage: articleAssets.length === 0,
      shouldFallbackToDeterministicRender: false,
      summary: "No multimodal asset-usage check was required.",
    }
  }

  return callChatJson<AssetUsageResult>({
    model: QA_MODEL_ID,
    schema: ASSET_USAGE_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are checking whether a generated infographic visibly uses supplied reference images.",
          "Treat direct recognizable reuse of the supplied image content as required, not optional inspiration.",
          "If the output replaces the reference with a generic substitute, say it is not used.",
          "If any required source set is missing, request deterministic fallback.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Title: ${infographic.title}`,
              `Uploaded reference count: ${uploadedAssets.length}`,
              `Article reference count: ${articleAssets.length}`,
              "Judge whether the final infographic visibly contains the uploaded references and article references.",
              "Return fallback=true if the output does not clearly use the required imagery.",
            ].join("\n\n"),
          },
          {
            type: "image_url",
            image_url: {
              url: finalImage.dataUrl,
            },
          },
          ...uploadedAssets.map((asset) => ({
            type: "image_url",
            image_url: {
              url: asset.dataUrl,
            },
          })),
          ...articleAssets.map((asset) => ({
            type: "image_url",
            image_url: {
              url: asset.dataUrl,
            },
          })),
        ],
      },
    ],
  })
}

function normalizeIdentityReview(value: IdentityReviewResult, hasSupportingIdentity: boolean) {
  const approved = Boolean(value.approved)
  const preservesPrimaryIdentity = Boolean(value.preservesPrimaryIdentity)
  const preservesSupportingIdentity = hasSupportingIdentity ? Boolean(value.preservesSupportingIdentity) : true
  const summary = typeof value.summary === "string" ? sanitizeText(value.summary, 240) : "Identity review did not return a summary."
  const issues = normalizeStringList(value.issues, 8, 200)

  return {
    approved: approved && preservesPrimaryIdentity && preservesSupportingIdentity,
    preservesPrimaryIdentity,
    preservesSupportingIdentity,
    summary,
    issues,
  }
}

async function callIdentityReviewModel({
  infographic,
  finalImage,
  assets,
}: {
  infographic: InfographicSpec
  finalImage: GeneratedInfographicImage
  assets: VisualAsset[]
}) {
  const references = pickReferenceAssets(infographic, assets)
  const hasSupportingIdentity = references.length > 1

  if (!finalImage.dataUrl || !isModelReadableDataUrlImage(finalImage.dataUrl) || references.length === 0) {
    return {
      approved: references.length === 0,
      preservesPrimaryIdentity: references.length === 0,
      preservesSupportingIdentity: !hasSupportingIdentity,
      summary: "No identity review was required.",
      issues: [],
    }
  }

  return callChatJson<IdentityReviewResult>({
    model: QA_MODEL_ID,
    schema: IDENTITY_REVIEW_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are checking whether a generated infographic preserved subject identity from supplied reference images while redesigning the rest of the poster.",
          "Primary identity preservation is mandatory.",
          "If the main person, object, scene, or visual anchor was replaced by a generic substitute, reject it.",
          "Allow editorial restaging, background changes, lighting changes, and composition redesign only if the subject remains clearly recognizable.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Title: ${infographic.title}`,
              `Reference roles:\n${buildReferenceRoleSummary(infographic, assets)}`,
              "Judge whether the final image preserves the main subject identity from the primary anchor and, when applicable, supporting subject/context identity from secondary references.",
            ].join("\n\n"),
          },
          {
            type: "image_url",
            image_url: {
              url: finalImage.dataUrl,
            },
          },
          ...references.slice(0, 3).map((asset) => ({
            type: "image_url",
            image_url: {
              url: asset.dataUrl,
            },
          })),
        ],
      },
    ],
  }).then((value) => normalizeIdentityReview(value, hasSupportingIdentity))
}

function buildDeterministicImage({
  infographic,
  assets,
  prompt,
  reason,
  model = "deterministic-svg",
}: {
  infographic: InfographicSpec
  assets: VisualAsset[]
  prompt: string
  reason: string
  model?: string
}): GeneratedInfographicImage {
  return {
    status: "generated",
    model,
    dataUrl: buildInfographicSvgDataUrl(infographic, assets),
    mimeType: "image/svg+xml",
    prompt,
    revisedPrompt: null,
    error: reason,
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    const mode = body.mode === "refinement" ? "refinement" : "setup"
    const prompt = sanitizeText(body.prompt ?? "", 3000)

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 })
    }

    const urlCandidates = new Set<string>()
    const sourceUrl = body.sourceUrl ? normalizeUrl(body.sourceUrl) : null
    if (sourceUrl) {
      urlCandidates.add(sourceUrl)
    }

    for (const url of extractUrls(prompt)) {
      urlCandidates.add(url)
    }

    const pages = (await Promise.all(Array.from(urlCandidates).map((url) => fetchPage(url)))).filter(
      (page): page is ScrapedPage => Boolean(page)
    )

    const uploadedAssets: VisualAsset[] = (body.attachments ?? [])
      .filter((item) => item.dataUrl?.startsWith("data:image/"))
      .filter((item) => isSupportedModelImageType(item.mediaType || getDataUrlMediaType(item.dataUrl)))
      .slice(0, 4)
      .map((item, index) => ({
        id: item.id || `upload-${index + 1}`,
        source: "upload",
        title: sanitizeText(item.name || `Upload ${index + 1}`, 80),
        mediaType: normalizeMediaType(item.mediaType || getDataUrlMediaType(item.dataUrl) || "image/jpeg"),
        dataUrl: item.dataUrl,
        originUrl: null,
        width: typeof item.width === "number" && item.width > 0 ? item.width : undefined,
        height: typeof item.height === "number" && item.height > 0 ? item.height : undefined,
      }))

    const pageImages = pages.flatMap((page) => page.imageUrls.map((url) => ({ page, url })))
    const downloadedImages = await Promise.all(
      pageImages.slice(0, MAX_SOURCE_IMAGES).map(async ({ page, url }, index) => {
        const dataUrl = await remoteImageToDataUrl(url)
        if (!dataUrl) {
          return null
        }

        const pageTitle = page.source.title ? sanitizeText(page.source.title, 56) : null
        const host = new URL(url).hostname.replace(/^www\./, "")

        return {
          id: `link-${index + 1}`,
          source: "link" as const,
          title: sanitizeText(pageTitle ? `${pageTitle} image ${index + 1}` : `${host} image ${index + 1}`, 80),
          mediaType: getDataUrlMediaType(dataUrl) || "image/jpeg",
          dataUrl,
          originUrl: url,
        }
      })
    )

    const sourceSummaries = pages.map((page) => page.source)
    const rawLinkAssets = downloadedImages.filter((item): item is DownloadedLinkAsset => Boolean(item))
    const linkAssets = await filterWebsiteImages({
      prompt,
      sources: sourceSummaries,
      assets: rawLinkAssets,
    })
    const assets: VisualAsset[] = [...uploadedAssets, ...linkAssets]
    const history = (body.history ?? []).filter((message) => message.role === "user" || message.role === "assistant")
    const fallbackPalette = selectThemePalette({ prompt, sources: sourceSummaries })
    const preferredLanguage = detectPreferredLanguage({ prompt, sources: sourceSummaries })

    const factsResult = await callFactsModel({
      mode,
      prompt,
      history,
      sources: sourceSummaries,
      assets,
      preferredLanguage,
    })

    const assetIds = assets.map((asset) => asset.id)
    const uploadedAssetIds = uploadedAssets.map((asset) => asset.id)
    const linkedAssetIds = linkAssets.map((asset) => asset.id)
    const recommendedAssets = normalizeStringList(factsResult.recommendedAssets, 6).filter((id) => assetIds.includes(id))
    const infographic = normalizeInfographic(factsResult.infographic, assetIds, fallbackPalette, preferredLanguage)

    infographic.heroAssetIds = preferAssetIds({
      current: infographic.heroAssetIds,
      uploaded: uploadedAssetIds,
      linked: linkedAssetIds,
      recommended: recommendedAssets,
      fallback: assetIds,
      limit: 3,
    })

    infographic.stripAssetIds = preferAssetIds({
      current: infographic.stripAssetIds,
      uploaded: uploadedAssetIds,
      linked: linkedAssetIds,
      recommended: recommendedAssets,
      fallback: assetIds,
      limit: 6,
    })

    const facts = normalizeFacts(factsResult.facts)
    const artDirection = normalizeArtDirection(
      await callArtDirectionModel({
        prompt,
        sources: sourceSummaries,
        assets,
        infographic,
        facts,
        preferredLanguage,
      }),
      infographic
    )
    let finalImage = await generateFinalImage({ infographic, facts, artDirection, assets })
    let renderMode: InfographicResponse["renderMode"] = "model-image"

    const fallbackToComposite = async (reason: string) => {
      const reservedPhotoPoster = assets.length > 0 ? await generateReservedPhotoPoster({ infographic, facts, artDirection, assets }) : null

      if (reservedPhotoPoster) {
        return {
          image: {
            status: "generated" as const,
            model: `${IMAGE_MODEL_ID}+overlay-composite`,
            dataUrl: buildPosterOverlayCompositeSvgDataUrl(reservedPhotoPoster, assets),
            mimeType: "image/svg+xml",
            prompt: buildFinalImagePrompt({ infographic, facts, artDirection, assets }),
            revisedPrompt: null,
            error: reason,
          },
          mode: "hybrid-svg" as const,
        }
      }

      return {
        image: buildDeterministicImage({
          infographic,
          assets,
          prompt: finalImage.revisedPrompt ?? finalImage.prompt,
          reason,
        }),
        mode: "deterministic-svg" as const,
      }
    }

    if (finalImage.status !== "generated" || !finalImage.dataUrl) {
      const fallback = await fallbackToComposite(
        `Model render failed, using asset-composited fallback. ${finalImage.error ?? ""}`.trim()
      )
      finalImage = fallback.image
      renderMode = fallback.mode
    } else if (assets.length > 0) {
      const identityReview = await callIdentityReviewModel({ infographic, finalImage, assets })

      if (!identityReview.approved) {
        const revisedPrompt = [
          finalImage.revisedPrompt ?? finalImage.prompt,
          `Identity preservation feedback: ${identityReview.summary}`,
          identityReview.issues.length > 0
            ? `Fix these identity issues:\n${identityReview.issues.map((issue) => `- ${issue}`).join("\n")}`
            : "",
          "Preserve the recognizable primary anchor subject from the supplied image while redesigning only the surrounding poster treatment.",
        ]
          .filter(Boolean)
          .join("\n\n")

        finalImage = await generateFinalImage({
          infographic,
          facts,
          artDirection,
          assets,
          promptOverride: revisedPrompt,
        })

        if (finalImage.status === "generated" && finalImage.dataUrl) {
          const secondIdentityReview = await callIdentityReviewModel({ infographic, finalImage, assets })
          if (!secondIdentityReview.approved) {
            const fallback = await fallbackToComposite(`Identity-preservation fallback: ${secondIdentityReview.summary}`)
            finalImage = fallback.image
            renderMode = fallback.mode
          }
        } else {
          const fallback = await fallbackToComposite(
            `Identity-preservation regeneration failed, using asset-composited fallback. ${finalImage.error ?? ""}`.trim()
          )
          finalImage = fallback.image
          renderMode = fallback.mode
        }
      }

      if (renderMode === "model-image") {
        const assetUsage = normalizeAssetUsage(
          await callAssetUsageModel({ infographic, finalImage, assets }),
          uploadedAssets.length > 0,
          linkAssets.length > 0
        )

        if (assetUsage.shouldFallbackToDeterministicRender) {
          const fallback = await fallbackToComposite(`Asset enforcement fallback: ${assetUsage.summary}`)
          finalImage = fallback.image
          renderMode = fallback.mode
        }
      }
    }

    const qa = normalizeQa(await callQaModel({ infographic, facts, artDirection, finalImage }))

    const assistantMessageSource =
      typeof factsResult.assistantMessage === "string"
        ? sanitizeText(factsResult.assistantMessage, 900)
        : `Built an infographic draft with ${facts.length} key facts and ${infographic.sections.length} content modules.`

    const result: InfographicResponse = {
      assistantMessage: assistantMessageSource,
      infographic,
      facts,
      artDirection,
      qa,
      finalImage,
      renderMode,
      extractedSources: sourceSummaries,
      assets,
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate infographic."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
