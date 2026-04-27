/* eslint-disable @next/next/no-img-element */
"use client"

import { useState, type ChangeEvent, type FormEvent } from "react"
import {
  DownloadIcon,
  ImagePlusIcon,
  LinkIcon,
  LoaderIcon,
  RefreshCwIcon,
  SendHorizonalIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  type ChatMessage,
  type InfographicResponse,
  type InfographicSpec,
  type UploadedAsset,
  type VisualAsset,
} from "@/lib/cms/infographic"

const MAX_ATTACHMENTS = 4
const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1600
const QUICK_REFINEMENTS = [
  "Tighten the headline and make the explainer more election-focused.",
  "Use the uploaded images more prominently and reduce generic source visuals.",
  "Add stronger stat callouts and shorten the body copy for social sharing.",
  "Shift the palette and hierarchy closer to a Hindi news explainer graphic.",
]

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function wrapText(text: string, width: number, fontSize: number) {
  const maxChars = Math.max(10, Math.floor(width / Math.max(fontSize * 0.56, 1)))
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }

    if (current) {
      lines.push(current)
    }
    current = word
  }

  if (current) {
    lines.push(current)
  }

  return lines
}

function clampLines(lines: string[], maxLines: number) {
  if (lines.length <= maxLines) {
    return lines
  }

  const nextLines = lines.slice(0, maxLines)
  const lastLine = nextLines[maxLines - 1] ?? ""
  nextLines[maxLines - 1] = lastLine.length > 3 ? `${lastLine.slice(0, -3)}...` : `${lastLine}...`
  return nextLines
}

function renderTextLines({
  lines,
  x,
  y,
  fontSize,
  lineHeight,
  color,
  weight,
}: {
  lines: string[]
  x: number
  y: number
  fontSize: number
  lineHeight: number
  color: string
  weight: number
}) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-size="${fontSize}" font-weight="${weight}" font-family="Inter, Arial, sans-serif">${escapeXml(line)}</text>`
    )
    .join("")
}

function buildInfographicSvg(spec: InfographicSpec, assets: VisualAsset[]) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const preferredHeroIds = [...spec.heroAssetIds, ...spec.stripAssetIds]
  const heroAsset = preferredHeroIds.map((id) => assetMap.get(id)).find(Boolean) ?? assets[0] ?? null
  const stripAssets = spec.stripAssetIds
    .map((id) => assetMap.get(id))
    .filter((asset): asset is VisualAsset => Boolean(asset))
    .slice(0, 3)

  if (stripAssets.length === 0 && heroAsset) {
    stripAssets.push(heroAsset)
  }

  const palette = spec.palette
  const titleLines = clampLines(wrapText(spec.title, 600, 62), 3)
  const subtitleLines = clampLines(wrapText(spec.subtitle, 600, 28), 3)
  const takeawayLines = clampLines(wrapText(spec.takeaway, 940, 32), 2)
  const sections = spec.sections.slice(0, 4)
  const stats = spec.stats.slice(0, 4)

  const sectionCards = sections
    .map((section, index) => {
      const x = index % 2 === 0 ? 60 : 535
      const y = 980 + Math.floor(index / 2) * 230
      const headingLines = clampLines(wrapText(section.heading, 370, 28), 2)
      const bulletLines = section.body
        .slice(0, 3)
        .map((item) => clampLines(wrapText(`• ${item}`, 350, 22), 2))
      let cursorY = y + 54

      const textParts = [
        `<rect x="${x}" y="${y}" width="425" height="190" rx="26" fill="${palette.surface}" opacity="0.96" />`,
        renderTextLines({
          lines: headingLines,
          x: x + 26,
          y: y + 48,
          fontSize: 28,
          lineHeight: 34,
          color: palette.text,
          weight: 800,
        }),
      ]

      cursorY += headingLines.length * 34
      for (const lines of bulletLines) {
        cursorY += 22
        textParts.push(
          renderTextLines({
            lines,
            x: x + 26,
            y: cursorY,
            fontSize: 22,
            lineHeight: 28,
            color: palette.muted,
            weight: 500,
          })
        )
        cursorY += lines.length * 28
      }

      return textParts.join("")
    })
    .join("")

  const statCards = stats
    .map((stat, index) => {
      const width = 230
      const gap = 20
      const totalWidth = stats.length * width + Math.max(stats.length - 1, 0) * gap
      const startX = (CANVAS_WIDTH - totalWidth) / 2
      const x = startX + index * (width + gap)
      return [
        `<rect x="${x}" y="760" width="${width}" height="146" rx="24" fill="${palette.surface}" opacity="0.98" />`,
        renderTextLines({
          lines: clampLines(wrapText(stat.value, 170, 42), 2),
          x: x + 24,
          y: 820,
          fontSize: 42,
          lineHeight: 48,
          color: palette.accent,
          weight: 900,
        }),
        renderTextLines({
          lines: clampLines(wrapText(stat.label, 180, 20), 2),
          x: x + 24,
          y: 872,
          fontSize: 20,
          lineHeight: 25,
          color: palette.muted,
          weight: 600,
        }),
      ].join("")
    })
    .join("")

  const stripMarkup = stripAssets
    .map((asset, index) => {
      const x = 60 + index * 320
      const clipId = `strip-clip-${index}`
      return [
        `<clipPath id="${clipId}"><rect x="${x}" y="560" width="300" height="150" rx="24" /></clipPath>`,
        `<rect x="${x}" y="560" width="300" height="150" rx="24" fill="${palette.surface}" opacity="0.94" />`,
        `<image href="${asset.dataUrl}" x="${x}" y="560" width="300" height="150" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
      ].join("")
    })
    .join("")

  const heroMarkup = heroAsset
    ? [
        `<clipPath id="hero-clip"><rect x="700" y="124" width="320" height="360" rx="34" /></clipPath>`,
        `<rect x="700" y="124" width="320" height="360" rx="34" fill="${palette.surface}" opacity="0.96" />`,
        `<image href="${heroAsset.dataUrl}" x="700" y="124" width="320" height="360" preserveAspectRatio="xMidYMid slice" clip-path="url(#hero-clip)" />`,
      ].join("")
    : `<rect x="700" y="124" width="320" height="360" rx="34" fill="${palette.surface}" opacity="0.96" />`

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
      <rect width="1080" height="1600" fill="${palette.background}" />
      <rect x="0" y="0" width="1080" height="84" fill="${palette.accent}" />
      <text x="60" y="54" fill="#ffffff" font-size="30" font-weight="800" font-family="Inter, Arial, sans-serif">CMS INFOGRAPHIC STUDIO</text>
      <circle cx="942" cy="44" r="14" fill="#ffffff" opacity="0.18" />
      <circle cx="986" cy="44" r="14" fill="#ffffff" opacity="0.18" />
      <circle cx="1030" cy="44" r="14" fill="#ffffff" opacity="0.18" />
      <rect x="60" y="124" width="600" height="360" rx="34" fill="${palette.surface}" opacity="0.97" />
      ${heroMarkup}
      ${renderTextLines({
        lines: titleLines,
        x: 94,
        y: 196,
        fontSize: 62,
        lineHeight: 72,
        color: palette.text,
        weight: 900,
      })}
      ${renderTextLines({
        lines: subtitleLines,
        x: 94,
        y: 394,
        fontSize: 28,
        lineHeight: 36,
        color: palette.muted,
        weight: 600,
      })}
      <rect x="60" y="510" width="960" height="10" rx="5" fill="${palette.accent}" opacity="0.2" />
      ${stripMarkup}
      ${statCards}
      <rect x="60" y="920" width="960" height="2" fill="${palette.accent}" opacity="0.18" />
      ${sectionCards}
      <rect x="60" y="1450" width="960" height="92" rx="30" fill="${palette.accent}" />
      ${renderTextLines({
        lines: takeawayLines,
        x: 92,
        y: 1504,
        fontSize: 32,
        lineHeight: 38,
        color: "#ffffff",
        weight: 800,
      })}
      <text x="60" y="1578" fill="${palette.muted}" font-size="20" font-weight="600" font-family="Inter, Arial, sans-serif">${escapeXml(spec.footer)}</text>
    </svg>
  `.trim()
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error(`Unable to read ${file.name}`))
    }
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function optimizeImage(file: File) {
  const originalDataUrl = await fileToDataUrl(file)

  return new Promise<UploadedAsset>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext("2d")

      if (!context) {
        reject(new Error(`Canvas unavailable for ${file.name}`))
        return
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.86)

      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        mediaType: "image/jpeg",
        dataUrl,
      })
    }
    image.onerror = () => reject(new Error(`Unable to process ${file.name}`))
    image.src = originalDataUrl
  })
}

async function downloadSvg(svg: string, fileName: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${fileName}.svg`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function downloadPng(svg: string, fileName: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = CANVAS_WIDTH
        canvas.height = CANVAS_HEIGHT
        const context = canvas.getContext("2d")

        if (!context) {
          reject(new Error("Canvas unavailable"))
          return
        }

        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0)
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error("Unable to create PNG"))
            return
          }

          const pngUrl = URL.createObjectURL(pngBlob)
          const anchor = document.createElement("a")
          anchor.href = pngUrl
          anchor.download = `${fileName}.png`
          anchor.click()
          URL.revokeObjectURL(pngUrl)
          resolve()
        }, "image/png")
      }
      image.onerror = () => reject(new Error("Unable to render infographic preview"))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const payload = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed")
  }

  return payload as T
}

export default function CmsPage() {
  const [prompt, setPrompt] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [attachments, setAttachments] = useState<UploadedAsset[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [result, setResult] = useState<InfographicResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const svg = result ? buildInfographicSvg(result.infographic, result.assets) : null
  const svgPreview = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
  const hasDraft = Boolean(result)
  const assetCount = result?.assets.length ?? 0
  const sourceCount = result?.extractedSources.length ?? 0

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    setError(null)

    try {
      const nextFiles = await Promise.all(files.slice(0, MAX_ATTACHMENTS).map((file) => optimizeImage(file)))
      setAttachments((current) => [...current, ...nextFiles].slice(0, MAX_ATTACHMENTS))
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to process images.")
    } finally {
      event.target.value = ""
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id))
  }

  function resetConversation() {
    setMessages([])
    setResult(null)
    setPrompt("")
    setError(null)
  }

  async function submitPrompt(rawPrompt: string) {
    if (!rawPrompt.trim()) {
      setError(hasDraft ? "Add a refinement request before updating the draft." : "Add a prompt before generating an infographic.")
      return
    }

    const userMessage = [rawPrompt.trim(), sourceUrl.trim() ? `Source: ${sourceUrl.trim()}` : null]
      .filter(Boolean)
      .join("\n")

    setSubmitting(true)
    setError(null)

    try {
      const response = await postJson<InfographicResponse>("/api/cms/infographic", {
        prompt: rawPrompt,
        sourceUrl,
        attachments,
        history: messages,
      })

      setMessages((current) => [
        ...current,
        { role: "user", text: userMessage },
        { role: "assistant", text: response.assistantMessage },
      ])
      setResult(response)
      setPrompt("")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to generate infographic.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submitPrompt(prompt)
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(157,28,31,0.12),_transparent_38%),linear-gradient(180deg,_rgba(248,244,236,0.9),_rgba(255,255,255,1))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <Card className="border-zinc-200/70 bg-white/90 shadow-sm backdrop-blur dark:bg-zinc-950/70">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Badge className="bg-[#9d1c1f] text-white hover:bg-[#9d1c1f]">/cms</Badge>
                  <CardTitle className="mt-3 text-2xl">Infographic Chat Studio</CardTitle>
                </div>
                <Badge variant="secondary">GPT-4.1 mini</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Paste a story link, attach a few images, and iterate on the same draft naturally. Every link is scraped for text and images before generation, while uploaded images stay highest priority.
              </p>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Source pack</p>
                    <p className="text-sm text-muted-foreground">
                      {hasDraft
                        ? "Keep the same source materials while refining the current draft."
                        : "Step 1: add the story link and preferred images for the first draft."}
                    </p>
                  </div>
                  {hasDraft ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{messages.length / 2} rounds</Badge>
                      <Button type="button" variant="outline" size="sm" onClick={resetConversation}>
                        <RefreshCwIcon />
                        Start new draft
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Story link</label>
                    <div className="relative">
                      <LinkIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                      <Input
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        placeholder="https://example.com/article"
                        className="bg-white pl-9 dark:bg-zinc-950"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Attach images</label>
                    <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:border-[#9d1c1f] hover:text-[#9d1c1f] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                      <ImagePlusIcon className="size-4" />
                      <span>{attachments.length > 0 ? `Add more (${attachments.length}/${MAX_ATTACHMENTS})` : "Add up to 4"}</span>
                      <input className="hidden" type="file" accept="image/*" multiple onChange={handleFileChange} />
                    </label>
                  </div>
                </div>

                {attachments.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <img src={attachment.dataUrl} alt={attachment.name} className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" />
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">Priority visual carried across refinements</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeAttachment(attachment.id)}>
                            <Trash2Icon />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {hasDraft ? "Refine current draft" : "Create first draft"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {hasDraft
                          ? "Describe exactly what should change in the current infographic."
                          : "Describe the angle, tone, hierarchy, and must-have facts for the initial infographic."}
                      </p>
                    </div>
                    {hasDraft ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{assetCount} usable visuals</Badge>
                        <Badge variant="secondary">{sourceCount} source pages read</Badge>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-3">
                    <Textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder={
                        hasDraft
                          ? "Example: Make the headline sharper, reduce text density in the lower cards, and use my uploaded portrait as the main hero image."
                          : "Example: Build a Hindi-first election explainer with a bold headline, 3 stat boxes, and strong visual emphasis on my uploaded images."
                      }
                      className={cn("resize-y bg-zinc-50 dark:bg-zinc-900", hasDraft ? "min-h-28" : "min-h-36")}
                    />

                    {hasDraft ? (
                      <div className="flex flex-wrap gap-2">
                        {QUICK_REFINEMENTS.map((item) => (
                          <button
                            key={item}
                            type="button"
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs font-medium text-zinc-700 transition hover:border-[#9d1c1f] hover:text-[#9d1c1f] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                            onClick={() => setPrompt(item)}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {error ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={submitting} className="bg-[#9d1c1f] text-white hover:bg-[#82171a]">
                    {submitting ? <LoaderIcon className="animate-spin" /> : <SendHorizonalIcon />}
                    {hasDraft ? "Update infographic" : "Generate infographic"}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {hasDraft
                      ? "Each follow-up keeps the same source pack and conversation context unless you change it above."
                      : "Uploaded images are sent first, then scraped link images are added as secondary context."}
                  </p>
                </div>
              </form>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <SparklesIcon className="size-4 text-[#9d1c1f]" />
                  <p className="text-sm font-semibold">Conversation</p>
                </div>
                <ScrollArea className="h-[340px] px-4 py-4">
                  {messages.length === 0 ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Start with a link and direction like: “Use my uploaded portraits as the primary visuals, extract any charts or logos from the article, and build a Hindi-first election explainer.” After the first version, keep using the refinement box above for precise edits.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message, index) => (
                        <div
                          key={`${message.role}-${index}`}
                          className={cn(
                            "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6",
                            message.role === "assistant"
                              ? "bg-white text-foreground shadow-sm dark:bg-zinc-950"
                              : "ml-auto bg-[#9d1c1f] text-white"
                          )}
                        >
                          {message.text}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-zinc-200/70 bg-white/92 shadow-sm backdrop-blur dark:bg-zinc-950/70">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Generated infographic</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Live combined visual assembled from the structured response and selected media.
                  </p>
                </div>

                {svg ? (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void downloadSvg(svg, "cms-infographic") }>
                      <DownloadIcon />
                      SVG
                    </Button>
                    <Button type="button" size="sm" className="bg-[#9d1c1f] text-white hover:bg-[#82171a]" onClick={() => void downloadPng(svg, "cms-infographic") }>
                      <DownloadIcon />
                      PNG
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {result ? (
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Title</p>
                      <p className="mt-2 text-sm font-semibold leading-6">{result.infographic.title}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Takeaway</p>
                      <p className="mt-2 text-sm leading-6 text-foreground/85">{result.infographic.takeaway}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Structure</p>
                      <p className="mt-2 text-sm leading-6 text-foreground/85">
                        {result.infographic.stats.length} stats, {result.infographic.sections.length} sections, {result.infographic.heroAssetIds.length} hero picks
                      </p>
                    </div>
                  </div>
                ) : null}

                {svgPreview ? (
                  <img src={svgPreview} alt="Generated infographic preview" className="w-full rounded-[28px] border border-zinc-200 bg-[#f8f4ec] shadow-sm dark:border-zinc-800" />
                ) : (
                  <div className="flex aspect-[27/40] items-center justify-center rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50 text-center text-sm leading-6 text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900">
                    The infographic preview appears here after the first generation.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-200/70 bg-white/92 shadow-sm backdrop-blur dark:bg-zinc-950/70">
              <CardHeader>
                <CardTitle>Extraction harness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result?.extractedSources.length ? (
                  <div className="space-y-3">
                    {result.extractedSources.map((source) => (
                      <div key={source.url} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{source.imageCount} images</Badge>
                          <a href={source.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-[#9d1c1f] underline-offset-4 hover:underline">
                            {source.title ?? source.url}
                          </a>
                        </div>
                        {source.description ? <p className="mt-2 text-sm text-muted-foreground">{source.description}</p> : null}
                        <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground/80">{source.textSnippet}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    When you include a story link, the server fetches the page, extracts readable text, collects media links, and attempts to read those images before GPT-4.1 mini builds the infographic brief.
                  </p>
                )}

                {result?.assets.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {result.assets.map((asset) => (
                      <div key={asset.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <img src={asset.dataUrl} alt={asset.title} className="aspect-[4/3] w-full rounded-xl object-cover" />
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{asset.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {asset.source === "upload" ? "Uploaded priority asset" : "Scraped source asset"}
                            </p>
                          </div>
                          <Badge variant={asset.source === "upload" ? "default" : "secondary"}>
                            {asset.source}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
