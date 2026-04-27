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

const OPENAI_API_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"
const MODEL_ID = "openai/gpt-4.1-mini"
const MAX_HISTORY_MESSAGES = 8
const MAX_SOURCE_IMAGES = 6
const MAX_MEDIA_FOR_MODEL = 6
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
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

    const mediaType = response.headers.get("content-type") ?? ""
    if (!mediaType.startsWith("image/")) {
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
  return {
    background: isHexColor(palette?.background ?? "") ? palette!.background! : DEFAULT_INFOGRAPHIC.palette.background,
    surface: isHexColor(palette?.surface ?? "") ? palette!.surface! : DEFAULT_INFOGRAPHIC.palette.surface,
    accent: isHexColor(palette?.accent ?? "") ? palette!.accent! : DEFAULT_INFOGRAPHIC.palette.accent,
    text: isHexColor(palette?.text ?? "") ? palette!.text! : DEFAULT_INFOGRAPHIC.palette.text,
    muted: isHexColor(palette?.muted ?? "") ? palette!.muted! : DEFAULT_INFOGRAPHIC.palette.muted,
  }
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

function normalizeInfographic(value: Partial<InfographicSpec> | undefined, assetIds: string[]): InfographicSpec {
  const stats = Array.isArray(value?.stats)
    ? value.stats
        .map((item) => {
          const label = typeof item?.label === "string" ? sanitizeText(item.label, 80) : ""
          const statValue = typeof item?.value === "string" ? sanitizeText(item.value, 40) : ""
          return label && statValue ? { label, value: statValue } : null
        })
        .filter((item): item is { label: string; value: string } => Boolean(item))
        .slice(0, 6)
    : []

  const sections = Array.isArray(value?.sections)
    ? value.sections
        .map((item) => {
          const heading = typeof item?.heading === "string" ? sanitizeText(item.heading, 80) : ""
          const body = normalizeStringList(item?.body, 4)
          return heading && body.length > 0 ? { heading, body } : null
        })
        .filter((item): item is { heading: string; body: string[] } => Boolean(item))
        .slice(0, 4)
    : []

  const heroAssetIds = normalizeStringList(value?.heroAssetIds, 2).filter((id) => assetIds.includes(id))
  const stripAssetIds = normalizeStringList(value?.stripAssetIds, 3).filter((id) => assetIds.includes(id))

  return {
    title: typeof value?.title === "string" ? sanitizeText(value.title, 150) : DEFAULT_INFOGRAPHIC.title,
    subtitle:
      typeof value?.subtitle === "string" ? sanitizeText(value.subtitle, 260) : DEFAULT_INFOGRAPHIC.subtitle,
    takeaway:
      typeof value?.takeaway === "string" ? sanitizeText(value.takeaway, 220) : DEFAULT_INFOGRAPHIC.takeaway,
    footer: typeof value?.footer === "string" ? sanitizeText(value.footer, 120) : DEFAULT_INFOGRAPHIC.footer,
    palette: normalizePalette(value?.palette),
    stats,
    sections,
    heroAssetIds,
    stripAssetIds,
  }
}

async function callOpenAI({
  prompt,
  history,
  sources,
  assets,
}: {
  prompt: string
  history: ChatMessage[]
  sources: ExtractedSource[]
  assets: VisualAsset[]
}) {
  const apiKey = process.env.APP_BUILDER_VERCEL_AI_GATEWAY ?? process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error("APP_BUILDER_VERCEL_AI_GATEWAY is not configured.")
  }

  const visualAssets = assets.slice(0, MAX_MEDIA_FOR_MODEL)
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
      content:
        "You are an infographic-focused newsroom assistant. Your job is to turn a user's link, uploaded images, and instructions into a sharp infographic brief. Always prefer uploaded images over scraped link images when selecting visuals. Only use scraped images when they add clear context or when user uploads are insufficient. Return valid JSON only with keys assistantMessage, infographic, and recommendedAssets. The infographic object must contain title, subtitle, takeaway, footer, palette, stats, sections, heroAssetIds, and stripAssetIds. Palette values must be 6-digit hex colors. Keep sections concise and factual.",
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
            "Create a publishable infographic plan and response for the latest user request.",
            `User request: ${sanitizeText(prompt, 2400)}`,
            sources.length > 0 ? `Scraped source context:\n${sourceSummary}` : "No source links were available.",
            assets.length > 0 ? `Available visual assets:\n${assetSummary}` : "No visual assets were available.",
            "Prefer uploaded visuals first. If you recommend assets, list their ids with uploaded assets first whenever possible.",
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
  ]

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_ID,
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
      .slice(0, 4)
      .map((item, index) => ({
        id: item.id || `upload-${index + 1}`,
        source: "upload",
        title: sanitizeText(item.name || `Upload ${index + 1}`, 80),
        mediaType: item.mediaType || "image/jpeg",
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
          mediaType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
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
          : "Generated an infographic draft from the link context and selected visuals.",
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
