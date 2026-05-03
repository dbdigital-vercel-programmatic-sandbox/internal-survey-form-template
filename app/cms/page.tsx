/* eslint-disable @next/next/no-img-element */
"use client"

import { useState, type ChangeEvent, type FormEvent } from "react"
import {
  DownloadIcon,
  ImagePlusIcon,
  LinkIcon,
  LoaderIcon,
  LockIcon,
  MessageSquareIcon,
  PencilIcon,
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
  type InfographicLayoutVariant,
  type InfographicResponse,
  type InfographicSpec,
  type UploadedAsset,
  type VisualAsset,
} from "@/lib/cms/infographic"
import { buildInfographicSvg as buildSharedInfographicSvg } from "@/lib/cms/render-svg"

const MAX_ATTACHMENTS = 4
const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1600
const DISPLAY_FONT_STACK = "'Noto Sans Devanagari', 'Hind', 'Mukta', 'Nirmala UI', Inter, Arial, sans-serif"
const BODY_FONT_STACK = "'Noto Sans Devanagari', 'Hind', 'Mukta', 'Nirmala UI', Inter, Arial, sans-serif"
const QUICK_REFINEMENTS = [
  "Tighten the headline and make the explainer more election-focused.",
  "Use the uploaded images more prominently and reduce generic source visuals.",
  "Add stronger stat callouts and shorten the body copy for social sharing.",
  "Shift the palette and hierarchy closer to a Hindi news explainer graphic.",
]

let textMeasureContext: CanvasRenderingContext2D | null = null

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function getTextMeasureContext() {
  if (textMeasureContext || typeof document === "undefined") {
    return textMeasureContext
  }

  const canvas = document.createElement("canvas")
  textMeasureContext = canvas.getContext("2d")
  return textMeasureContext
}

function measureTextWidth(text: string, fontSize: number, weight: number, fontFamily = BODY_FONT_STACK) {
  const context = getTextMeasureContext()
  if (!context) {
    return text.length * fontSize * 0.58
  }

  context.font = `${weight} ${fontSize}px ${fontFamily}`
  return context.measureText(text).width
}

function wrapText(text: string, width: number, fontSize: number, weight = 600, fontFamily = BODY_FONT_STACK) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (measureTextWidth(next, fontSize, weight, fontFamily) <= width) {
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

  return lines.slice(0, maxLines)
}

function renderTextLines({
  lines,
  x,
  y,
  fontSize,
  lineHeight,
  color,
  weight,
  fontFamily = BODY_FONT_STACK,
}: {
  lines: string[]
  x: number
  y: number
  fontSize: number
  lineHeight: number
  color: string
  weight: number
  fontFamily?: string
}) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-size="${fontSize}" font-weight="${weight}" font-family="${fontFamily}">${escapeXml(line)}</text>`
    )
    .join("")
}

function renderBackdrop(spec: InfographicSpec) {
  return `
    <defs>
      <linearGradient id="paperGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${spec.palette.background}" />
        <stop offset="100%" stop-color="${spec.palette.surface}" />
      </linearGradient>
      <radialGradient id="accentHalo" cx="50%" cy="18%" r="70%">
        <stop offset="0%" stop-color="${spec.palette.accent}" stop-opacity="0.07" />
        <stop offset="100%" stop-color="${spec.palette.accent}" stop-opacity="0" />
      </radialGradient>
      <filter id="panelShadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.08" />
      </filter>
      <pattern id="dotField" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.2" fill="${spec.palette.accent}" fill-opacity="0.04" />
      </pattern>
    </defs>
    <rect width="1080" height="1600" fill="url(#paperGlow)" />
    <rect width="1080" height="1600" fill="url(#accentHalo)" />
    <rect x="38" y="38" width="1004" height="1524" rx="40" fill="url(#dotField)" opacity="0.34" />
  `.trim()
}

function renderKicker(text: string, palette: InfographicSpec["palette"]) {
  const lines = clampLines(wrapText(text, 260, 24, 800, DISPLAY_FONT_STACK), 2)
  return [
    `<rect x="54" y="42" width="308" height="60" rx="20" fill="#ffffff" stroke="${palette.accent}" stroke-opacity="0.2" filter="url(#panelShadow)" />`,
    renderTextLines({
      lines,
      x: 86,
      y: 80,
      fontSize: 24,
      lineHeight: 26,
      color: palette.accent,
      weight: 800,
      fontFamily: DISPLAY_FONT_STACK,
    }),
  ].join("")
}

function renderImageFrame(
  asset: VisualAsset | null,
  {
    x,
    y,
    width,
    height,
    radius,
    clipId,
  }: {
    x: number
    y: number
    width: number
    height: number
    radius: number
    clipId: string
  }
) {
  if (!asset) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#ffffff" filter="url(#panelShadow)" />`
  }

  return [
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" /></clipPath>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#ffffff" filter="url(#panelShadow)" />`,
    `<image href="${asset.dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="none" stroke="#ffffff" stroke-opacity="0.95" stroke-width="4" />`,
  ].join("")
}

function renderStatGrid({
  stats,
  palette,
  x,
  y,
  width,
  columns,
  cardHeight,
  gapX = 18,
  gapY = 18,
}: {
  stats: InfographicSpec["stats"]
  palette: InfographicSpec["palette"]
  x: number
  y: number
  width: number
  columns: number
  cardHeight: number
  gapX?: number
  gapY?: number
}) {
  if (stats.length === 0) {
    return { markup: "", height: 0 }
  }

  const safeColumns = Math.max(1, Math.min(columns, stats.length))
  const cardWidth = (width - gapX * (safeColumns - 1)) / safeColumns
  const rows = Math.ceil(stats.length / safeColumns)

  return {
    markup: stats
      .map((stat, index) => {
        const column = index % safeColumns
        const row = Math.floor(index / safeColumns)
        const cardX = x + column * (cardWidth + gapX)
        const cardY = y + row * (cardHeight + gapY)
          const valueLines = clampLines(wrapText(stat.value, cardWidth - 48, 34, 900, DISPLAY_FONT_STACK), 2)
          const labelLines = clampLines(wrapText(stat.label, cardWidth - 48, 18, 700, BODY_FONT_STACK), 2)
        const valueStartY = cardY + 56
        const labelStartY = valueStartY + valueLines.length * 40 + 14

        return [
          `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="22" fill="#ffffff" stroke="${palette.accent}" stroke-opacity="0.12" filter="url(#panelShadow)" />`,
          `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="12" rx="22" fill="${palette.accent}" />`,
          renderTextLines({
            lines: valueLines,
            x: cardX + 24,
            y: valueStartY,
            fontSize: 34,
            lineHeight: 40,
            color: palette.accent,
            weight: 900,
            fontFamily: DISPLAY_FONT_STACK,
          }),
          renderTextLines({
            lines: labelLines,
            x: cardX + 24,
            y: labelStartY,
            fontSize: 18,
            lineHeight: 22,
            color: palette.muted,
            weight: 700,
            fontFamily: BODY_FONT_STACK,
          }),
        ].join("")
      })
      .join(""),
    height: rows * cardHeight + Math.max(0, rows - 1) * gapY,
  }
}

function renderStackSections({
  sections,
  palette,
  x,
  y,
  width,
  accentWidth = 232,
}: {
  sections: InfographicSpec["sections"]
  palette: InfographicSpec["palette"]
  x: number
  y: number
  width: number
  accentWidth?: number
}) {
  if (sections.length === 0) {
    return { markup: "", height: 0 }
  }

  const cardHeight = 152
  const gap = 18

  return {
    markup: sections
      .map((section, index) => {
        const cardY = y + index * (cardHeight + gap)
        const headingLines = clampLines(wrapText(section.heading, accentWidth - 52, 26, 800, DISPLAY_FONT_STACK), 2)
        const bulletLines = section.body.map((item) => clampLines(wrapText(`• ${item}`, width - accentWidth - 74, 20, 500, BODY_FONT_STACK), 2))
        let cursorY = cardY + 34 + headingLines.length * 28

        const textParts = [
          `<rect x="${x}" y="${cardY}" width="${width}" height="${cardHeight}" rx="24" fill="#ffffff" stroke="${palette.accent}" stroke-opacity="0.1" filter="url(#panelShadow)" />`,
          `<rect x="${x}" y="${cardY}" width="${accentWidth}" height="${cardHeight}" rx="24" fill="${palette.accent}" />`,
          renderTextLines({
            lines: headingLines,
            x: x + 26,
            y: cardY + 50,
            fontSize: 26,
            lineHeight: 31,
            color: "#ffffff",
            weight: 800,
            fontFamily: DISPLAY_FONT_STACK,
          }),
        ]

        for (const lines of bulletLines) {
          cursorY += 20
          textParts.push(
            renderTextLines({
              lines,
              x: x + accentWidth + 40,
              y: cursorY,
              fontSize: 20,
              lineHeight: 24,
              color: palette.text,
              weight: 500,
              fontFamily: BODY_FONT_STACK,
            })
          )
          cursorY += lines.length * 24
        }

        return textParts.join("")
      })
      .join(""),
    height: sections.length * cardHeight + Math.max(0, sections.length - 1) * gap,
  }
}

function renderColumnSections({
  sections,
  palette,
  x,
  y,
  width,
  columns,
  cardHeight,
  gapX = 18,
  gapY = 18,
}: {
  sections: InfographicSpec["sections"]
  palette: InfographicSpec["palette"]
  x: number
  y: number
  width: number
  columns: number
  cardHeight: number
  gapX?: number
  gapY?: number
}) {
  if (sections.length === 0) {
    return { markup: "", height: 0 }
  }

  const safeColumns = Math.max(1, Math.min(columns, sections.length))
  const cardWidth = (width - gapX * (safeColumns - 1)) / safeColumns
  const rows = Math.ceil(sections.length / safeColumns)

  return {
    markup: sections
      .map((section, index) => {
        const column = index % safeColumns
        const row = Math.floor(index / safeColumns)
        const cardX = x + column * (cardWidth + gapX)
        const cardY = y + row * (cardHeight + gapY)
        const headingLines = clampLines(wrapText(section.heading, cardWidth - 44, 24, 800, DISPLAY_FONT_STACK), 2)
        const bulletLines = section.body.flatMap((item) => clampLines(wrapText(`• ${item}`, cardWidth - 50, 19, 600, BODY_FONT_STACK), 2))

        return [
          `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="24" fill="#ffffff" stroke="${palette.accent}" stroke-opacity="0.1" filter="url(#panelShadow)" />`,
          `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="10" rx="24" fill="${palette.accent}" />`,
          renderTextLines({
            lines: headingLines,
            x: cardX + 22,
            y: cardY + 52,
            fontSize: 24,
            lineHeight: 28,
            color: palette.text,
            weight: 800,
            fontFamily: DISPLAY_FONT_STACK,
          }),
          renderTextLines({
            lines: bulletLines,
            x: cardX + 22,
            y: cardY + 110,
            fontSize: 19,
            lineHeight: 24,
            color: palette.muted,
            weight: 600,
            fontFamily: BODY_FONT_STACK,
          }),
        ].join("")
      })
      .join(""),
    height: rows * cardHeight + Math.max(0, rows - 1) * gapY,
  }
}

function renderTakeawayBand(spec: InfographicSpec, y: number, height: number) {
  return [
    `<rect x="54" y="${y}" width="972" height="${height}" rx="28" fill="#ffffff" stroke="${spec.palette.accent}" stroke-opacity="0.22" filter="url(#panelShadow)" />`,
    renderTextLines({
      lines: clampLines(wrapText(spec.takeaway, 914, 30, 800, DISPLAY_FONT_STACK), 2),
      x: 88,
      y: y + 64,
      fontSize: 30,
      lineHeight: 36,
      color: spec.palette.text,
      weight: 800,
      fontFamily: DISPLAY_FONT_STACK,
    }),
  ].join("")
}

function resolveLayoutVariant(spec: InfographicSpec, assetCount: number): InfographicLayoutVariant {
  if (
    spec.layoutVariant === "split-hero" ||
    spec.layoutVariant === "image-lead" ||
    spec.layoutVariant === "data-lead" ||
    spec.layoutVariant === "editorial-mosaic" ||
    spec.layoutVariant === "timeline-focus"
  ) {
    return spec.layoutVariant
  }

  if (spec.sections.length >= 5) {
    return "timeline-focus"
  }

  if (spec.stats.length >= 6) {
    return "data-lead"
  }

  if (assetCount >= 3) {
    return "editorial-mosaic"
  }

  return "split-hero"
}

function buildInfographicSvg(spec: InfographicSpec, assets: VisualAsset[]) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const preferredHeroIds = [...spec.heroAssetIds, ...spec.stripAssetIds]
  const heroAsset = preferredHeroIds.map((id) => assetMap.get(id)).find(Boolean) ?? assets[0] ?? null
  const supportAssets = spec.stripAssetIds
    .map((id) => assetMap.get(id))
    .filter((asset): asset is VisualAsset => Boolean(asset))
    .filter((asset) => asset.id !== heroAsset?.id)
    .slice(0, 5)

  if (supportAssets.length === 0) {
    supportAssets.push(...assets.filter((asset) => asset.id !== heroAsset?.id).slice(0, 5))
  }

  const palette = spec.palette
  const sections = spec.sections
  const stats = spec.stats
  const layoutVariant = resolveLayoutVariant(spec, assets.length)

  if (layoutVariant === "editorial-mosaic") {
    const titleLines = clampLines(wrapText(spec.title, 584, 58, 900, DISPLAY_FONT_STACK), 4)
    const subtitleLines = clampLines(wrapText(spec.subtitle, 584, 25, 600, BODY_FONT_STACK), 4)
    const statGrid = renderStatGrid({
      stats,
      palette,
      x: 54,
      y: 648,
      width: 972,
      columns: Math.min(4, Math.max(2, stats.length >= 6 ? 4 : 3)),
      cardHeight: stats.length > 4 ? 138 : 150,
      gapX: 18,
      gapY: 18,
    })
    const sectionGrid = renderColumnSections({
      sections,
      palette,
      x: 54,
      y: 648 + statGrid.height + 34,
      width: 972,
      columns: Math.min(3, Math.max(1, sections.length >= 4 ? 3 : 2)),
      cardHeight: sections.length > 4 ? 214 : 240,
      gapX: 18,
      gapY: 18,
    })
    const heroStrip = supportAssets
      .slice(0, 3)
      .map((asset, index) =>
        renderImageFrame(asset, { x: 718 + index * 100, y: 490, width: 88, height: 78, radius: 16, clipId: `mosaic-support-${index}` })
      )
      .join("")
    const takeawayY = Math.min(1398, 648 + statGrid.height + 34 + sectionGrid.height + 30)

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
        ${renderBackdrop(spec)}
        ${renderKicker("चुनाव एक्सप्लेनर", palette)}
        <rect x="54" y="118" width="638" height="496" rx="34" fill="${palette.surface}" filter="url(#panelShadow)" />
        <rect x="54" y="118" width="638" height="12" rx="34" fill="${palette.accent}" />
        ${renderImageFrame(heroAsset, { x: 716, y: 118, width: 310, height: 350, radius: 30, clipId: "mosaic-hero" })}
        ${heroStrip}
        <circle cx="970" cy="542" r="56" fill="#ffffff" filter="url(#panelShadow)" />
        <text x="970" y="556" text-anchor="middle" fill="${palette.accent}" font-size="26" font-weight="900" font-family="${DISPLAY_FONT_STACK}">VS</text>
        ${renderTextLines({ lines: titleLines, x: 88, y: 210, fontSize: 58, lineHeight: 64, color: palette.text, weight: 900, fontFamily: DISPLAY_FONT_STACK })}
        ${renderTextLines({ lines: subtitleLines, x: 88, y: 470, fontSize: 25, lineHeight: 32, color: palette.muted, weight: 600, fontFamily: BODY_FONT_STACK })}
        <line x1="54" y1="630" x2="1026" y2="630" stroke="${palette.accent}" stroke-opacity="0.22" stroke-width="3" />
        ${statGrid.markup}
        ${sectionGrid.markup}
        ${renderTakeawayBand(spec, takeawayY, 120)}
        <text x="54" y="1562" fill="${palette.muted}" font-size="18" font-weight="700" font-family="${BODY_FONT_STACK}">${escapeXml(spec.footer)}</text>
      </svg>
    `.trim()
  }

  if (layoutVariant === "timeline-focus") {
    const titleLines = clampLines(wrapText(spec.title, 860, 54, 900, DISPLAY_FONT_STACK), 3)
    const subtitleLines = clampLines(wrapText(spec.subtitle, 860, 24, 600, BODY_FONT_STACK), 3)
    const statGrid = renderStatGrid({ stats, palette, x: 54, y: 334, width: 972, columns: Math.min(4, Math.max(2, stats.length)), cardHeight: 140 })
    const sectionStack = renderStackSections({ sections, palette, x: 54, y: 334 + statGrid.height + 28, width: 972, accentWidth: 236 })
    const heroBadge = supportAssets[0]
      ? renderImageFrame(supportAssets[0], { x: 808, y: 164, width: 218, height: 138, radius: 24, clipId: "timeline-support" })
      : ""
    const takeawayY = Math.min(1412, 334 + statGrid.height + 28 + sectionStack.height + 26)

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
        ${renderBackdrop(spec)}
        ${renderKicker("डीप डाइव", palette)}
        <rect x="54" y="118" width="972" height="184" rx="34" fill="${palette.surface}" filter="url(#panelShadow)" />
        <rect x="54" y="118" width="972" height="12" rx="34" fill="${palette.accent}" />
        ${heroBadge}
        ${renderTextLines({ lines: titleLines, x: 88, y: 194, fontSize: 54, lineHeight: 60, color: palette.text, weight: 900, fontFamily: DISPLAY_FONT_STACK })}
        ${renderTextLines({ lines: subtitleLines, x: 88, y: 282, fontSize: 24, lineHeight: 30, color: palette.muted, weight: 600, fontFamily: BODY_FONT_STACK })}
        ${statGrid.markup}
        ${sectionStack.markup}
        ${renderTakeawayBand(spec, takeawayY, 116)}
        <text x="54" y="1562" fill="${palette.muted}" font-size="18" font-weight="700" font-family="${BODY_FONT_STACK}">${escapeXml(spec.footer)}</text>
      </svg>
    `.trim()
  }

  if (layoutVariant === "image-lead") {
    const titleLines = clampLines(wrapText(spec.title, 320, 52, 900, DISPLAY_FONT_STACK), 4)
    const subtitleLines = clampLines(wrapText(spec.subtitle, 320, 24, 600, BODY_FONT_STACK), 4)
    const statGrid = renderStatGrid({ stats, palette, x: 54, y: 634, width: 972, columns: 2, cardHeight: 148, gapX: 20, gapY: 20 })
    const sectionGrid = renderColumnSections({
      sections,
      palette,
      x: 54,
      y: 634 + statGrid.height + 38,
      width: 972,
      columns: Math.min(3, Math.max(1, sections.length)),
      cardHeight: sections.length > 3 ? 228 : 270,
      gapX: 18,
      gapY: 18,
    })
    const takeawayY = 634 + statGrid.height + 38 + sectionGrid.height + 34
    const supportMarkup = supportAssets
      .slice(0, 3)
      .map((asset, index) => renderImageFrame(asset, { x: 782 + index * 82, y: 500, width: 74, height: 74, radius: 16, clipId: `image-lead-support-${index}` }))
      .join("")

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
        ${renderBackdrop(spec)}
        ${renderKicker("विजुअल ब्रीफ", palette)}
        <rect x="54" y="108" width="394" height="478" rx="30" fill="${palette.surface}" filter="url(#panelShadow)" />
        <rect x="54" y="108" width="394" height="10" fill="${palette.accent}" />
        ${renderImageFrame(heroAsset, { x: 472, y: 108, width: 554, height: 478, radius: 30, clipId: "image-lead-hero" })}
        ${supportMarkup}
        ${renderTextLines({
          lines: titleLines,
          x: 88,
          y: 190,
          fontSize: 52,
          lineHeight: 58,
          color: palette.text,
          weight: 900,
          fontFamily: DISPLAY_FONT_STACK,
        })}
        ${renderTextLines({
          lines: subtitleLines,
          x: 88,
          y: 432,
          fontSize: 24,
          lineHeight: 30,
          color: palette.muted,
          weight: 600,
          fontFamily: BODY_FONT_STACK,
        })}
        <line x1="54" y1="606" x2="1026" y2="606" stroke="${palette.accent}" stroke-opacity="0.18" stroke-width="3" />
        ${statGrid.markup}
        ${sectionGrid.markup}
        ${renderTakeawayBand(spec, takeawayY, 132)}
        <text x="54" y="1562" fill="${palette.muted}" font-size="18" font-weight="700" font-family="${BODY_FONT_STACK}">${escapeXml(spec.footer)}</text>
      </svg>
    `.trim()
  }

  if (layoutVariant === "data-lead") {
    const titleLines = clampLines(wrapText(spec.title, 840, 52, 900, DISPLAY_FONT_STACK), 3)
    const subtitleLines = clampLines(wrapText(spec.subtitle, 840, 24, 600, BODY_FONT_STACK), 3)
    const statGrid = renderStatGrid({ stats, palette, x: 54, y: 364, width: 634, columns: Math.min(2, stats.length || 2), cardHeight: stats.length > 4 ? 144 : 156 })
    const sectionStack = renderStackSections({ sections, palette, x: 54, y: 730, width: 972, accentWidth: 220 })
    const supportMarkup = supportAssets
      .slice(0, 2)
      .map((asset, index) => renderImageFrame(asset, { x: 718 + index * 150, y: 606, width: 140, height: 88, radius: 18, clipId: `data-lead-support-${index}` }))
      .join("")

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
        ${renderBackdrop(spec)}
        ${renderKicker("डेटा फोकस", palette)}
        <rect x="54" y="108" width="972" height="214" rx="30" fill="${palette.surface}" filter="url(#panelShadow)" />
        <rect x="54" y="108" width="972" height="10" fill="${palette.accent}" />
        ${renderTextLines({
          lines: titleLines,
          x: 88,
          y: 190,
          fontSize: 52,
          lineHeight: 58,
          color: palette.text,
          weight: 900,
          fontFamily: DISPLAY_FONT_STACK,
        })}
        ${renderTextLines({
          lines: subtitleLines,
          x: 88,
          y: 286,
          fontSize: 24,
          lineHeight: 30,
          color: palette.muted,
          weight: 600,
          fontFamily: BODY_FONT_STACK,
        })}
        ${statGrid.markup}
        ${renderImageFrame(heroAsset, { x: 718, y: 364, width: 308, height: 224, radius: 28, clipId: "data-lead-hero" })}
        ${supportMarkup}
        <line x1="54" y1="712" x2="1026" y2="712" stroke="${palette.accent}" stroke-opacity="0.18" stroke-width="3" />
        ${sectionStack.markup}
        ${renderTakeawayBand(spec, 1288, 128)}
        <text x="54" y="1562" fill="${palette.muted}" font-size="18" font-weight="700" font-family="${BODY_FONT_STACK}">${escapeXml(spec.footer)}</text>
      </svg>
    `.trim()
  }

  const titleLines = clampLines(wrapText(spec.title, 560, 54, 900, DISPLAY_FONT_STACK), 3)
  const subtitleLines = clampLines(wrapText(spec.subtitle, 560, 24, 600, BODY_FONT_STACK), 3)
  const statGrid = renderStatGrid({ stats, palette, x: 54, y: 644, width: 972, columns: Math.min(4, Math.max(2, stats.length)), cardHeight: stats.length > 4 ? 138 : 150 })
  const sectionStack = renderStackSections({ sections, palette, x: 54, y: 644 + statGrid.height + 52, width: 972 })
  const supportMarkup = supportAssets
    .slice(0, 2)
    .map((asset, index) => renderImageFrame(asset, { x: 734 + index * 152, y: 486, width: 140, height: 116, radius: 18, clipId: `split-support-${index}` }))
    .join("")
  const takeawayY = 644 + statGrid.height + 52 + sectionStack.height + 42

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
      ${renderBackdrop(spec)}
      ${renderKicker("स्टोरी फ्रेम", palette)}
      <rect x="54" y="108" width="652" height="496" rx="30" fill="${palette.surface}" filter="url(#panelShadow)" />
      <rect x="54" y="108" width="652" height="10" fill="${palette.accent}" />
      ${renderImageFrame(heroAsset, { x: 734, y: 118, width: 292, height: 350, radius: 28, clipId: "split-hero" })}
      ${supportMarkup}
      ${renderTextLines({
        lines: titleLines,
        x: 88,
        y: 220,
        fontSize: 54,
        lineHeight: 60,
        color: palette.text,
        weight: 900,
        fontFamily: DISPLAY_FONT_STACK,
      })}
      ${renderTextLines({
        lines: subtitleLines,
        x: 88,
        y: 414,
        fontSize: 24,
        lineHeight: 30,
        color: palette.muted,
        weight: 600,
        fontFamily: BODY_FONT_STACK,
      })}
      <line x1="54" y1="622" x2="1026" y2="622" stroke="${palette.accent}" stroke-opacity="0.18" stroke-width="3" />
      ${statGrid.markup}
      ${sectionStack.markup}
      ${renderTakeawayBand(spec, takeawayY, 114)}
      <text x="54" y="1562" fill="${palette.muted}" font-size="18" font-weight="700" font-family="${BODY_FONT_STACK}">${escapeXml(spec.footer)}</text>
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
        width: canvas.width,
        height: canvas.height,
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

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a")
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
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
  const [setupPrompt, setSetupPrompt] = useState("")
  const [refinementPrompt, setRefinementPrompt] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [attachments, setAttachments] = useState<UploadedAsset[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [result, setResult] = useState<InfographicResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingSourcePack, setEditingSourcePack] = useState(false)

  const svg = result ? buildSharedInfographicSvg(result.infographic, result.assets) : null
  const svgPreview = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
  const finalImageDataUrl = result?.finalImage.dataUrl ?? null
  const previewImage = finalImageDataUrl ?? svgPreview
  const hasDraft = Boolean(result)
  const assetCount = result?.assets.length ?? 0
  const sourceCount = result?.extractedSources.length ?? 0
  const sourcePackEditable = !hasDraft || editingSourcePack

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
    if (!sourcePackEditable) {
      return
    }

    setAttachments((current) => current.filter((item) => item.id !== id))
  }

  function resetConversation() {
    setMessages([])
    setResult(null)
    setSetupPrompt("")
    setRefinementPrompt("")
    setError(null)
    setEditingSourcePack(false)
  }

  async function submitPrompt(rawPrompt: string, mode: "setup" | "refinement") {
    if (!rawPrompt.trim()) {
      setError(mode === "refinement" ? "Add a refinement request before updating the draft." : "Add a prompt before generating a visual design infographic (poster style).")
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
        mode,
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
      if (mode === "setup") {
        setSetupPrompt("")
      } else {
        setRefinementPrompt("")
      }
      setEditingSourcePack(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to generate a visual design infographic (poster style).")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submitPrompt(setupPrompt, "setup")
  }

  async function handleRefinementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await submitPrompt(refinementPrompt, "refinement")
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(250,248,244,0.96),_rgba(255,255,255,1))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <Card className="border-zinc-200/70 bg-white/90 shadow-sm backdrop-blur dark:bg-zinc-950/70">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Badge className="bg-[#9d1c1f] text-white hover:bg-[#9d1c1f]">/cms</Badge>
                  <CardTitle className="mt-3 text-2xl">Infographic Chat Studio</CardTitle>
                </div>
                <Badge variant="secondary">GPT-5.3 chat + image render</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Paste a story link, attach a few images, and iterate on the same draft naturally. The pipeline now extracts facts, builds art direction, and generates a final image. If image generation fails, the request now errors instead of showing a fallback as a finished result.
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Style-reference infographic samples can be added at `public/cms-templates/`. They are used only for layout and visual quality guidance, never for factual content or image reuse.
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
                  <div className="flex flex-wrap items-center gap-2">
                    {hasDraft ? <Badge variant="secondary">{messages.length / 2} rounds</Badge> : null}
                    {hasDraft ? (
                      <Badge variant={sourcePackEditable ? "outline" : "secondary"}>
                        {sourcePackEditable ? "Source pack editable" : "Source pack locked"}
                      </Badge>
                    ) : null}
                    {hasDraft ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSourcePack((current) => !current)}
                      >
                        {sourcePackEditable ? <LockIcon /> : <PencilIcon />}
                        {sourcePackEditable ? "Lock source pack" : "Edit source pack"}
                      </Button>
                    ) : null}
                    {hasDraft ? (
                      <Button type="button" variant="outline" size="sm" onClick={resetConversation}>
                        <RefreshCwIcon />
                        Start new draft
                      </Button>
                    ) : null}
                  </div>
                </div>

                {hasDraft && !sourcePackEditable ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white/90 p-3 text-sm text-muted-foreground dark:border-zinc-800 dark:bg-zinc-950/80">
                    Follow-up chats automatically reuse this link and these uploaded images. Nothing changes here unless you explicitly unlock and edit the source pack.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Story link</label>
                    <div className="relative">
                      <LinkIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                      <Input
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        disabled={!sourcePackEditable}
                        placeholder="https://example.com/article"
                        className="bg-white pl-9 dark:bg-zinc-950"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Attach images</label>
                    <label className={cn(
                      "flex h-10 items-center justify-center gap-2 rounded-md border border-dashed px-4 text-sm font-medium transition dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200",
                      sourcePackEditable
                        ? "cursor-pointer border-zinc-300 bg-white text-zinc-700 hover:border-[#9d1c1f] hover:text-[#9d1c1f]"
                        : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500"
                    )}>
                      <ImagePlusIcon className="size-4" />
                      <span>
                        {sourcePackEditable
                          ? attachments.length > 0
                            ? `Add more (${attachments.length}/${MAX_ATTACHMENTS})`
                            : "Add up to 4"
                          : "Unlock to change"}
                      </span>
                      <input className="hidden" type="file" accept="image/*" multiple disabled={!sourcePackEditable} onChange={handleFileChange} />
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
                          <Button type="button" variant="ghost" size="icon" disabled={!sourcePackEditable} onClick={() => removeAttachment(attachment.id)}>
                            <Trash2Icon />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {!hasDraft ? (
                <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
                  <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Create first draft</p>
                      <p className="text-sm text-muted-foreground">
                        Step 2: describe the angle, tone, hierarchy, and must-have facts for the initial visual design infographic (poster style).
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={setupPrompt}
                        onChange={(event) => setSetupPrompt(event.target.value)}
                        placeholder="Example: Build a Hindi-first visual design infographic (poster style) with a bold headline, 3 stat boxes, and strong visual emphasis on my uploaded images."
                        className="min-h-36 resize-y bg-zinc-50 dark:bg-zinc-900"
                      />
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
                      Generate visual design infographic
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Uploaded images are sent first, then scraped link images are added as secondary context.
                    </p>
                  </div>
                </form>
              ) : (
                <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-start gap-3">
                    <MessageSquareIcon className="mt-0.5 size-5 text-[#9d1c1f]" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Follow-up updates happen in the refinement chat</p>
                      <p className="text-sm text-muted-foreground">
                        Use the separate chat window on the right to improve the current visual design infographic (poster style). It automatically reuses the locked source pack and the prior conversation.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-zinc-200/70 bg-white/92 shadow-sm backdrop-blur dark:bg-zinc-950/70">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Generated infographic</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Only the model-rendered final image is treated as success.
                  </p>
                </div>

                {result ? (
                  <div className="flex items-center gap-2">
                    {result.finalImage.dataUrl ? (
                      <Button type="button" size="sm" className="bg-[#9d1c1f] text-white hover:bg-[#82171a]" onClick={() => downloadDataUrl(result.finalImage.dataUrl!, "cms-infographic.png") }>
                        <DownloadIcon />
                        PNG
                      </Button>
                    ) : null}
                    {svg ? (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => void downloadSvg(svg, "cms-infographic") }>
                          <DownloadIcon />
                          SVG
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void downloadPng(svg, "cms-infographic-preview") }>
                          <DownloadIcon />
                          Preview PNG
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {result ? (
                  <div className="mb-4 grid gap-3 sm:grid-cols-4">
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
                        {result.infographic.layoutVariant}, {result.infographic.stats.length} stats, {result.infographic.sections.length} sections, {result.infographic.heroAssetIds.length} hero picks
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Render</p>
                      <p className="mt-2 text-sm leading-6 text-foreground/85">Image model: {result.finalImage.model}</p>
                    </div>
                  </div>
                ) : null}

                {previewImage ? (
                  <img src={previewImage} alt="Generated infographic preview" className="w-full rounded-[28px] border border-zinc-200 bg-[#f8f4ec] shadow-sm dark:border-zinc-800" />
                ) : (
                  <div className="flex aspect-[27/40] items-center justify-center rounded-[28px] border border-dashed border-zinc-300 bg-zinc-50 text-center text-sm leading-6 text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900">
                    The infographic preview appears here after the first generation.
                  </div>
                )}

                {result ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="font-semibold text-foreground">QA</p>
                    <p className="mt-2 text-foreground/85">{result.qa.summary}</p>
                    {result.qa.issues.length > 0 ? <p className="mt-2 text-muted-foreground">Issues: {result.qa.issues.join(" | ")}</p> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {hasDraft ? (
              <Card className="border-zinc-200/70 bg-white/92 shadow-sm backdrop-blur dark:bg-zinc-950/70">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Refinement chat</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Send update requests here. The same link, uploaded images, scraped source context, and prior responses are reused automatically.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{assetCount} visuals</Badge>
                      <Badge variant="secondary">{sourceCount} sources</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                      <SparklesIcon className="size-4 text-[#9d1c1f]" />
                      <p className="text-sm font-semibold">Conversation</p>
                    </div>
                    <ScrollArea className="h-[280px] px-4 py-4">
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
                    </ScrollArea>
                  </div>

                  <form className="space-y-3" onSubmit={(event) => void handleRefinementSubmit(event)}>
                    <Textarea
                      value={refinementPrompt}
                      onChange={(event) => setRefinementPrompt(event.target.value)}
                      placeholder="Example: Make the headline sharper, reduce text density in the lower cards, and use my uploaded portrait as the main hero image."
                      className="min-h-28 resize-y bg-zinc-50 dark:bg-zinc-900"
                    />

                    <div className="flex flex-wrap gap-2">
                      {QUICK_REFINEMENTS.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs font-medium text-zinc-700 transition hover:border-[#9d1c1f] hover:text-[#9d1c1f] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                          onClick={() => setRefinementPrompt(item)}
                        >
                          {item}
                        </button>
                      ))}
                    </div>

                    {error ? (
                      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="submit" disabled={submitting} className="bg-[#9d1c1f] text-white hover:bg-[#82171a]">
                        {submitting ? <LoaderIcon className="animate-spin" /> : <SendHorizonalIcon />}
                        Update visual design infographic
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Follow-up requests reattach the current source URL and uploaded images automatically.
                      </p>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-zinc-200/70 bg-white/92 shadow-sm backdrop-blur dark:bg-zinc-950/70">
              <CardHeader>
                <CardTitle>Extraction harness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result?.facts.length ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Key facts</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {result.facts.map((fact, index) => (
                        <div key={`${fact.label}-${index}`} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{fact.label}</p>
                          <p className="mt-2 text-lg font-semibold leading-7">{fact.value}</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{fact.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <p className="text-sm font-semibold">Art direction</p>
                    <p className="mt-2 text-sm leading-6 text-foreground/85">{result.artDirection.visualStyle}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.artDirection.composition}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Must include: {result.artDirection.mustIncludeText.join(" | ")}</p>
                  </div>
                ) : null}

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
                    When you include a story link, the server fetches the page, extracts readable text, collects media links, turns them into a structured facts plan, writes an art-direction prompt, and then attempts a final image render. If that render fails, the request now returns an error instead of pretending the backup preview is a final output.
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
