import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"

import {
  DEFAULT_INFOGRAPHIC,
  type ChatMessage,
  type ExtractedSource,
  type InfographicResponse,
  type InfographicSpec,
  type UploadedAsset,
  type VisualAsset,
} from "@/lib/cms/infographic"
import {
  INFOGRAPHIC_TEMPLATE_REFERENCES,
  buildTemplateReferenceSummary,
} from "@/lib/cms/templates"

const OPENAI_API_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"
const FINAL_MODEL_ID = process.env.CMS_INFOGRAPHIC_FINAL_MODEL ?? "openai/gpt-4.1"
const REFINEMENT_MODEL_ID =
  process.env.CMS_INFOGRAPHIC_REFINEMENT_MODEL ?? "openai/gpt-4.1-mini"
const MAX_HISTORY_MESSAGES = 8
const MAX_SOURCE_IMAGES = 6
const MAX_MEDIA_FOR_MODEL = 6
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const SUPPORTED_MODEL_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const INFOGRAPHIC_PRE_PROMPT = [
  "Treat every output as a fixed-layout visual design infographic (poster style), not a freeform poster.",
  "All copy must be layout-safe. No title, subtitle, stat, section heading, bullet, takeaway, or footer may overflow, clip, collide, or depend on tiny text to fit.",
  "Prefer shorter copy over fuller copy. If a fact does not fit cleanly, omit or compress it.",
  "Never use ellipses, clipped phrases, placeholder copy, or visibly truncated labels as a way to force text into the layout.",
  "Use strong typography hierarchy. Title, subtitle, stats, section headings, and body text must each stay concise and visually distinct.",
  "Never produce empty information modules. Every stat card and section card must contain meaningful visible text.",
  "Enforce contrast discipline. White or near-white panels must use dark readable text. Dark panels may use white text. Do not use low-contrast muted text where content must be read.",
  "Choose a palette that is safe for the actual layout: accent areas must remain readable with white text, and white content cards must remain readable with dark body text.",
  "Use short slot-aware copy limits: title max 8 words, subtitle max 16 words, stat labels max 3 words, stat values compact, section headings max 3 words, section bullets max 12 words, takeaway max 24 words, footer compact.",
  "Assume each section card shows at most 1 to 2 short bullets. Write those bullets so they fit on one line when possible.",
  "Avoid source images whose own embedded text becomes unreadable when cropped. Prefer visuals that still work in tight portrait and thumbnail crops.",
  "Do not add generic product chrome, platform branding, or filler labels unless the user explicitly asks for them.",
  "Use reference templates only for spacing, hierarchy, density, and presentation quality. Never copy their content.",
  "Before finalizing, self-check for clipped text, weak contrast, empty panels, awkward cropping, repeated points, and loose spacing."
].join(" ")
const INFOGRAPHIC_WORKFLOW = [
  "Follow this workflow exactly before you return the visual design infographic (poster style) JSON.",
  "1. Read the user prompt and every available source carefully, then identify only the really important points that must appear in the visual design infographic (poster style).",
  "2. Review all available visuals and identify the strongest images that are truly worth featuring. Prefer uploaded images first, then scraped images only when they add real context.",
  "3. Based on the final amount of content and the available media, choose the most suitable editorial theme, layout rhythm, and visual hierarchy.",
  "4. If no template is a strong fit, invent a cleaner custom theme instead of forcing a weak one.",
  "5. Never solve space problems by shrinking text too far or by using ellipses. Rewrite copy shorter or remove lower-priority content instead.",
  "6. If the draft feels overcrowded, aggressively cut semi-important points until the visual design infographic (poster style) feels sharp and intentional.",
  "7. If the draft feels too empty, revisit the sources and add one or two more meaningful facts or modules, but only when they improve the composition.",
  "8. Before finalizing, review the full visual design infographic (poster style) mentally and remove anything that feels off-topic, repetitive, awkwardly phrased, weakly supported, or visually out of balance.",
  "9. The final output should feel like a polished, editorial, story-specific visual design infographic (poster style), not a generic CMS template."
].join(" ")
const INFOGRAPHIC_RESPONSE_SCHEMA = {
  name: "infographic_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      assistantMessage: { type: "string" },
      recommendedAssets: {
        type: "array",
        items: { type: "string" },
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
            enum: ["split-hero", "image-lead", "data-lead"],
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
    required: ["assistantMessage", "recommendedAssets", "infographic"],
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

type OpenAIResult = {
  assistantMessage?: unknown
  infographic?: Partial<InfographicSpec>
  recommendedAssets?: unknown
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
  return candidates
    .filter(isHexColor)
    .sort((left, right) => contrastRatio(right, background) - contrastRatio(left, background))[0] ?? DEFAULT_INFOGRAPHIC.palette.text
}

function normalizeStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeText(item, 240))
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

function normalizeInfographic(value: Partial<InfographicSpec> | undefined, assetIds: string[]): InfographicSpec {
  const stats = Array.isArray(value?.stats)
    ? value.stats
        .map((item) => {
          const label = typeof item?.label === "string" ? sanitizeText(item.label, 28) : ""
          const statValue = typeof item?.value === "string" ? sanitizeText(item.value, 28) : ""
          return label && statValue ? { label, value: statValue } : null
        })
        .filter((item): item is { label: string; value: string } => Boolean(item))
        .slice(0, 4)
    : []

  const sections = Array.isArray(value?.sections)
    ? value.sections
        .map((item) => {
          const heading = typeof item?.heading === "string" ? sanitizeText(item.heading, 32) : ""
          const body = Array.isArray(item?.body)
            ? item.body
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => sanitizeText(entry, 72))
                .filter(Boolean)
                .slice(0, 2)
            : []
          return heading && body.length > 0 ? { heading, body } : null
        })
        .filter((item): item is { heading: string; body: string[] } => Boolean(item))
        .slice(0, 3)
    : []

  const heroAssetIds = normalizeStringList(value?.heroAssetIds, 2).filter((id) => assetIds.includes(id))
  const stripAssetIds = normalizeStringList(value?.stripAssetIds, 3).filter((id) => assetIds.includes(id))
  const layoutVariant =
    value?.layoutVariant === "image-lead" || value?.layoutVariant === "data-lead" || value?.layoutVariant === "split-hero"
      ? value.layoutVariant
      : assetIds.length >= 2 && stats.length <= 2
        ? "image-lead"
        : stats.length >= 3
          ? "data-lead"
          : DEFAULT_INFOGRAPHIC.layoutVariant

  return {
    title: typeof value?.title === "string" ? sanitizeText(value.title, 72) : DEFAULT_INFOGRAPHIC.title,
    subtitle:
      typeof value?.subtitle === "string" ? sanitizeText(value.subtitle, 140) : DEFAULT_INFOGRAPHIC.subtitle,
    takeaway:
      typeof value?.takeaway === "string" ? sanitizeText(value.takeaway, 160) : DEFAULT_INFOGRAPHIC.takeaway,
    footer: typeof value?.footer === "string" ? sanitizeText(value.footer, 90) : DEFAULT_INFOGRAPHIC.footer,
    layoutVariant,
    palette: normalizePalette(value?.palette),
    stats,
    sections,
    heroAssetIds,
    stripAssetIds,
  }
}

async function callOpenAI({
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
  const apiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY ?? process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error("APP_BUILDER_VERCEL_AI_GATEWAY is not configured.")
  }

  const modelId = mode === "refinement" ? REFINEMENT_MODEL_ID : FINAL_MODEL_ID
  const visualAssets = assets.slice(0, MAX_MEDIA_FOR_MODEL)
  const templateSummary = buildTemplateReferenceSummary()
  const templateImages = await loadTemplateReferenceImages()
  const assetSummary = assets
    .map((asset) => `${asset.id} | ${asset.source} | ${asset.title}${asset.originUrl ? ` | ${asset.originUrl}` : ""}`)
    .join("\n")

  const sourceSummary = sources
    .map(
      (source) =>
        [`URL: ${source.url}`, source.title ? `Title: ${source.title}` : null, source.description ? `Description: ${source.description}` : null, `Snippet: ${source.textSnippet.slice(0, 900)}`, `Image count: ${source.imageCount}`]
          .filter(Boolean)
          .join("\n")
    )
    .join("\n\n")

  const messages = [
    {
      role: "system",
      content: [
        "You are a newsroom assistant focused on creating a visual design infographic (poster style). Your job is to turn a user's link, uploaded images, and instructions into a sharp visual design infographic (poster style) brief.",
        "Always prefer uploaded images over scraped link images when selecting visuals. Only use scraped images when they add clear context or when user uploads are insufficient.",
        "Return valid JSON only with keys assistantMessage, infographic, and recommendedAssets. The infographic object must contain title, subtitle, takeaway, footer, layoutVariant, palette, stats, sections, heroAssetIds, and stripAssetIds. Palette values must be 6-digit hex colors. This object represents a visual design infographic (poster style).",
        "Choose layoutVariant deliberately from split-hero, image-lead, or data-lead based on the story's content density and visual strength.",
        "Keep sections concise and factual. Treat any reference templates as style inspiration only. Never copy or paraphrase their text, facts, subject matter, logos, maps, charts, or embedded images.",
        INFOGRAPHIC_WORKFLOW,
        INFOGRAPHIC_PRE_PROMPT,
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
            "Create a publishable visual design infographic (poster style) plan and response for the latest user request.",
            `User request: ${sanitizeText(prompt, 2400)}`,
            sources.length > 0 ? `Scraped source context:\n${sourceSummary}` : "No source links were available.",
            assets.length > 0 ? `Available visual assets:\n${assetSummary}` : "No visual assets were available.",
            `Style-only template references:\n${templateSummary}`,
            `Required workflow: ${INFOGRAPHIC_WORKFLOW}`,
            `Permanent layout safety rules: ${INFOGRAPHIC_PRE_PROMPT}`,
            "Choose exactly one layoutVariant for the final visual design infographic (poster style): split-hero for balanced explainers, image-lead when visuals should dominate, or data-lead when stats and modular facts carry the story.",
            "Prefer uploaded visuals first. If you recommend assets, list their ids with uploaded assets first whenever possible.",
            "Generate layout-safe copy: short title, compact subtitle, brief takeaway, concise stat labels, and short section bullets so the infographic remains presentable with no overlaps.",
            "Aim for premium visual design infographic (poster style) quality with disciplined spacing, strong hierarchy, clear sectioning, and visually distinct information modules.",
            templateImages.length > 0
              ? "The final images in this request are template references only. Use them only for style, density, spacing, and hierarchy. Never use their subject matter, text, numbers, logos, maps, charts, or embedded images as output content."
              : "",
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
  ]

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      response_format: {
        type: "json_schema",
        json_schema: INFOGRAPHIC_RESPONSE_SCHEMA,
      },
      messages,
    }),
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenAI request failed")
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("OpenAI did not return content.")
  }

  return JSON.parse(content) as OpenAIResult
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

    const linkAssets = downloadedImages.filter(
      (item): item is DownloadedLinkAsset => Boolean(item)
    )
    const assets: VisualAsset[] = [...uploadedAssets, ...linkAssets]
    const sourceSummaries = pages.map((page) => page.source)
    const openAIResult = await callOpenAI({
      mode,
      prompt,
      history: (body.history ?? []).filter((message) => message.role === "user" || message.role === "assistant"),
      sources: sourceSummaries,
      assets,
    })

    const assetIds = assets.map((asset) => asset.id)
    const uploadedAssetIds = uploadedAssets.map((asset) => asset.id)
    const recommendedAssets = normalizeStringList(openAIResult.recommendedAssets, 5).filter((id) => assetIds.includes(id))
    const normalizedInfographic = normalizeInfographic(openAIResult.infographic, assetIds)

    normalizedInfographic.heroAssetIds = preferAssetIds({
      current: normalizedInfographic.heroAssetIds,
      uploaded: uploadedAssetIds,
      recommended: recommendedAssets,
      fallback: assetIds,
      limit: 2,
    })

    normalizedInfographic.stripAssetIds = preferAssetIds({
      current: normalizedInfographic.stripAssetIds,
      uploaded: uploadedAssetIds,
      recommended: recommendedAssets,
      fallback: assetIds,
      limit: 3,
    })

    const result: InfographicResponse = {
      assistantMessage:
        typeof openAIResult.assistantMessage === "string"
          ? sanitizeText(openAIResult.assistantMessage, 1200)
          : "Generated a visual design infographic (poster style) draft from the link context and selected visuals.",
      infographic: normalizedInfographic,
      extractedSources: sourceSummaries,
      assets,
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate infographic."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
