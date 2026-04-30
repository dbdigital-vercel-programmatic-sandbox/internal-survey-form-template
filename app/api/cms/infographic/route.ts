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

const CHAT_API_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"
const IMAGE_API_URL = "https://ai-gateway.vercel.sh/v1/images/generations"
const FACTS_MODEL_ID = process.env.CMS_INFOGRAPHIC_FACTS_MODEL ?? "openai/gpt-5.3-chat"
const ART_DIRECTION_MODEL_ID = process.env.CMS_INFOGRAPHIC_ART_MODEL ?? "openai/gpt-5.3-chat"
const QA_MODEL_ID = process.env.CMS_INFOGRAPHIC_QA_MODEL ?? "openai/gpt-5.3-chat"
const IMAGE_MODEL_ID = process.env.CMS_INFOGRAPHIC_IMAGE_MODEL ?? "openai/gpt-image-2"
const MAX_HISTORY_MESSAGES = 8
const MAX_SOURCE_IMAGES = 6
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
      content?: string
    }
  }>
} & T

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
    /<source[^>]+srcset=["']([^"']+)["']/gi,
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

function normalizePalette(palette: Partial<InfographicSpec["palette"]> | undefined) {
  const background = isHexColor(palette?.background ?? "") ? palette!.background! : DEFAULT_INFOGRAPHIC.palette.background
  const surface = isHexColor(palette?.surface ?? "") ? palette!.surface! : DEFAULT_INFOGRAPHIC.palette.surface
  const accentCandidate = isHexColor(palette?.accent ?? "") ? palette!.accent! : DEFAULT_INFOGRAPHIC.palette.accent
  const textCandidate = isHexColor(palette?.text ?? "") ? palette!.text! : DEFAULT_INFOGRAPHIC.palette.text
  const mutedCandidate = isHexColor(palette?.muted ?? "") ? palette!.muted! : DEFAULT_INFOGRAPHIC.palette.muted

  const accent = contrastRatio("#ffffff", accentCandidate) >= 4.5 ? accentCandidate : DEFAULT_INFOGRAPHIC.palette.accent
  const text =
    contrastRatio(textCandidate, surface) >= 4.5
      ? textCandidate
      : bestReadableText(surface, [DEFAULT_INFOGRAPHIC.palette.text, "#111827", "#0f172a", "#ffffff"])
  const muted =
    contrastRatio(mutedCandidate, surface) >= 3
      ? mutedCandidate
      : bestReadableText(surface, [DEFAULT_INFOGRAPHIC.palette.muted, text, "#374151", "#6b7280"])

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
  recommended,
  fallback,
  limit,
}: {
  current: string[]
  uploaded: string[]
  recommended: string[]
  fallback: string[]
  limit: number
}) {
  return Array.from(new Set([...uploaded, ...current, ...recommended, ...fallback])).slice(0, limit)
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

  return JSON.parse(content) as T
}

function buildAssetSummary(assets: VisualAsset[]) {
  return assets
    .map((asset) => `${asset.id} | ${asset.source} | ${asset.title}${asset.originUrl ? ` | ${asset.originUrl}` : ""}`)
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
  return {
    visualStyle:
      typeof (value as InfographicArtDirection | undefined)?.visualStyle === "string"
        ? sanitizeText((value as InfographicArtDirection).visualStyle, 240)
        : "Premium Hindi news explainer poster with layered editorial composition.",
    composition:
      typeof (value as InfographicArtDirection | undefined)?.composition === "string"
        ? sanitizeText((value as InfographicArtDirection).composition, 320)
        : "Large political headline, dense modular panels, strong central hierarchy, textured background, and poster-like callouts.",
    typography:
      typeof (value as InfographicArtDirection | undefined)?.typography === "string"
        ? sanitizeText((value as InfographicArtDirection).typography, 220)
        : "Bold Devanagari-first display typography with compact supporting labels and high-contrast numeric callouts.",
    colorDirection:
      typeof (value as InfographicArtDirection | undefined)?.colorDirection === "string"
        ? sanitizeText((value as InfographicArtDirection).colorDirection, 220)
        : "Use warm editorial neutrals with red, saffron, and green accents while preserving readability.",
    imagePrompt:
      typeof (value as InfographicArtDirection | undefined)?.imagePrompt === "string"
        ? sanitizeText((value as InfographicArtDirection).imagePrompt, 6000)
        : `Create a vertical Hindi election explainer infographic poster with the headline ${infographic.title}.`,
    negativePrompt:
      typeof (value as InfographicArtDirection | undefined)?.negativePrompt === "string"
        ? sanitizeText((value as InfographicArtDirection).negativePrompt, 1000)
        : "Avoid website UI chrome, low-contrast text, empty panels, generic stock illustrations, gibberish text, and weak hierarchy.",
    mustIncludeText:
      normalizeStringList((value as InfographicArtDirection | undefined)?.mustIncludeText, 10, 120).length > 0
        ? normalizeStringList((value as InfographicArtDirection | undefined)?.mustIncludeText, 10, 120)
        : fallbackText,
    avoid:
      normalizeStringList((value as InfographicArtDirection | undefined)?.avoid, 10, 120).length > 0
        ? normalizeStringList((value as InfographicArtDirection | undefined)?.avoid, 10, 120)
        : ["webpage layout", "generic dashboard cards", "tiny unreadable labels"],
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

function normalizeInfographic(value: Partial<InfographicSpec> | undefined, assetIds: string[]): InfographicSpec {
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
      : sections.length >= 5
        ? "timeline-focus"
        : assetIds.length >= 3
          ? "editorial-mosaic"
          : DEFAULT_INFOGRAPHIC.layoutVariant

  return {
    title: typeof value?.title === "string" ? sanitizeText(value.title, 96) : DEFAULT_INFOGRAPHIC.title,
    subtitle: typeof value?.subtitle === "string" ? sanitizeText(value.subtitle, 180) : DEFAULT_INFOGRAPHIC.subtitle,
    takeaway: typeof value?.takeaway === "string" ? sanitizeText(value.takeaway, 220) : DEFAULT_INFOGRAPHIC.takeaway,
    footer: typeof value?.footer === "string" ? sanitizeText(value.footer, 120) : DEFAULT_INFOGRAPHIC.footer,
    layoutVariant,
    palette: normalizePalette(value?.palette),
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
}: {
  mode: "setup" | "refinement"
  prompt: string
  history: ChatMessage[]
  sources: ExtractedSource[]
  assets: VisualAsset[]
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
          "Return concise but publishable infographic copy in Hindi or mixed Hindi-English matching the user request.",
          "Do not design a website. Plan an editorial vertical poster infographic.",
          "Prefer dense but readable modules, not sparse marketing copy.",
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
              sources.length > 0 ? `Scraped source context:\n${sourceSummary}` : "No source links were available.",
              assets.length > 0 ? `Available visual assets:\n${assetSummary}` : "No visual assets were available.",
              "Return facts, a structured infographic spec, and recommended asset ids.",
              "Title should be strong and editorial. Subtitle should add context. Stats and sections may be denser than a simple social card if the story demands it.",
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
}: {
  prompt: string
  sources: ExtractedSource[]
  assets: VisualAsset[]
  infographic: InfographicSpec
  facts: InfographicFact[]
}) {
  const templateSummary = buildTemplateReferenceSummary()
  const templateImages = await loadTemplateReferenceImages()
  const sourceSummary = buildSourceSummary(sources)
  const assetSummary = buildAssetSummary(assets)
  const visualAssets = assets.slice(0, Math.min(4, MAX_MEDIA_FOR_MODEL))

  return callChatJson<InfographicArtDirection>({
    model: ART_DIRECTION_MODEL_ID,
    schema: ART_DIRECTION_SCHEMA,
    messages: [
      {
        role: "system",
        content: [
          "You are an art director for premium Hindi-first newsroom explainers.",
          "Your output will drive a final image model, so write a highly specific prompt for a single vertical editorial infographic image.",
          "The image must feel like a finished poster, not a web page, dashboard, or slide deck.",
          "Push for layered composition, dense but legible hierarchy, textured backgrounds, infographic modules, badges, callouts, maps, icons, silhouettes, and editorial polish when relevant.",
          "Preserve factual text from the infographic plan. Avoid inventing numbers or districts.",
          "Reference samples are only style guidance; never copy their content or logos.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `User request: ${sanitizeText(prompt, 2400)}`,
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
              `Style-only template references:\n${templateSummary}`,
              "Write the image prompt so the model renders a complete, publication-ready infographic poster with readable Hindi-first typography, strong headline treatment, and distinct information zones.",
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
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
}) {
  const factLines = facts.slice(0, 10).map((fact) => `${fact.label}: ${fact.value} - ${fact.detail}`).join("\n")
  const requiredText = Array.from(
    new Set([infographic.title, infographic.subtitle, infographic.takeaway, ...artDirection.mustIncludeText].filter(Boolean))
  )
    .slice(0, 8)
    .join("\n")

  return [
    artDirection.imagePrompt,
    `Visual style: ${artDirection.visualStyle}`,
    `Composition: ${artDirection.composition}`,
    `Typography: ${artDirection.typography}`,
    `Color direction: ${artDirection.colorDirection}`,
    `Canvas: single vertical infographic poster, 1024x1536, full-bleed, print-ready visual polish.`,
    `Required headline and text elements to appear cleanly and prominently:\n${requiredText}`,
    factLines ? `Facts to visually encode through boxes, labels, maps, callouts, seals, arrows, charts, or modular sections:\n${factLines}` : "",
    `Negative constraints: ${artDirection.negativePrompt}`,
    artDirection.avoid.length > 0 ? `Also avoid: ${artDirection.avoid.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

async function generateFinalImage({
  infographic,
  facts,
  artDirection,
}: {
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
}): Promise<GeneratedInfographicImage> {
  const prompt = buildFinalImagePrompt({ infographic, facts, artDirection })

  try {
    const response = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL_ID,
        prompt,
        size: "1024x1536",
      }),
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
      status: "generated",
      model: IMAGE_MODEL_ID,
      dataUrl: `data:image/png;base64,${image.b64_json}`,
      mimeType: "image/png",
      prompt,
      revisedPrompt: image.revised_prompt ? sanitizeText(image.revised_prompt, 4000) : null,
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
      error: error instanceof Error ? error.message : "Image generation failed.",
    }
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
          ...(finalImage.dataUrl
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
      }))

    const pageImages = pages.flatMap((page) => page.imageUrls.map((url) => ({ page, url })))
    const downloadedImages = await Promise.all(
      pageImages.slice(0, MAX_SOURCE_IMAGES).map(async ({ url }, index) => {
        const dataUrl = await remoteImageToDataUrl(url)
        if (!dataUrl) {
          return null
        }

        return {
          id: `link-${index + 1}`,
          source: "link" as const,
          title: `Source image ${index + 1}`,
          mediaType: getDataUrlMediaType(dataUrl) || "image/jpeg",
          dataUrl,
          originUrl: url,
        }
      })
    )

    const linkAssets = downloadedImages.filter((item): item is DownloadedLinkAsset => Boolean(item))
    const assets: VisualAsset[] = [...uploadedAssets, ...linkAssets]
    const sourceSummaries = pages.map((page) => page.source)
    const history = (body.history ?? []).filter((message) => message.role === "user" || message.role === "assistant")

    const factsResult = await callFactsModel({
      mode,
      prompt,
      history,
      sources: sourceSummaries,
      assets,
    })

    const assetIds = assets.map((asset) => asset.id)
    const uploadedAssetIds = uploadedAssets.map((asset) => asset.id)
    const recommendedAssets = normalizeStringList(factsResult.recommendedAssets, 6).filter((id) => assetIds.includes(id))
    const infographic = normalizeInfographic(factsResult.infographic, assetIds)

    infographic.heroAssetIds = preferAssetIds({
      current: infographic.heroAssetIds,
      uploaded: uploadedAssetIds,
      recommended: recommendedAssets,
      fallback: assetIds,
      limit: 3,
    })

    infographic.stripAssetIds = preferAssetIds({
      current: infographic.stripAssetIds,
      uploaded: uploadedAssetIds,
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
      }),
      infographic
    )
    const finalImage = await generateFinalImage({ infographic, facts, artDirection })
    const qa = normalizeQa(await callQaModel({ infographic, facts, artDirection, finalImage }))
    const renderMode = finalImage.status === "generated" ? "model-image" : "svg-fallback"

    const assistantMessageSource =
      typeof factsResult.assistantMessage === "string"
        ? sanitizeText(factsResult.assistantMessage, 900)
        : `Built a ${renderMode === "model-image" ? "model-rendered" : "fallback-rendered"} infographic draft with ${facts.length} key facts and ${infographic.sections.length} content modules.`

    const assistantMessage =
      finalImage.status === "generated"
        ? assistantMessageSource
        : `${assistantMessageSource} Image generation fell back to the internal renderer: ${finalImage.error ?? "unknown error"}`

    const result: InfographicResponse = {
      assistantMessage,
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
