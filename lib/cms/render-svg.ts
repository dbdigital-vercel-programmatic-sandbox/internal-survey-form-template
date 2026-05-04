import type { InfographicSpec, VisualAsset } from "@/lib/cms/infographic"

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1600
const DISPLAY_FONT_STACK = "'Noto Sans Devanagari', 'Hind', 'Mukta', 'Nirmala UI', Inter, Arial, sans-serif"
const BODY_FONT_STACK = "'Noto Sans Devanagari', 'Hind', 'Mukta', 'Nirmala UI', Inter, Arial, sans-serif"

type OverlaySlot = {
  x: number
  y: number
  width: number
  height: number
  radius: number
  clipId: string
  label: "hero" | "support"
}

type OverlayPlacement = {
  asset: VisualAsset
  slot: OverlaySlot
}

function getStoryBriefLabel(language: InfographicSpec["contentLanguage"]) {
  if (language === "hi") {
    return "स्टोरी ब्रीफ"
  }

  if (language === "mixed") {
    return "Story Brief"
  }

  return "Story Brief"
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function measureTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.56
}

function wrapText(text: string, width: number, fontSize: number) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (measureTextWidth(next, fontSize) <= width) {
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
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#ffffff" stroke="#d4d4d8" />`
  }

  const aspectRatio = asset.width && asset.height ? asset.width / asset.height : null
  const isExtremeWide = aspectRatio !== null && aspectRatio >= 1.75
  const isExtremeTall = aspectRatio !== null && aspectRatio <= 0.72
  const shouldProtectFullImage = asset.source === "upload" && (isExtremeWide || isExtremeTall)
  const preserveAspectRatio = shouldProtectFullImage ? "xMidYMid meet" : "xMidYMid slice"

  return [
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" /></clipPath>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#ffffff" stroke="#d4d4d8" />`,
    shouldProtectFullImage
      ? `<image href="${asset.dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.2" clip-path="url(#${clipId})" />`
      : "",
    `<image href="${asset.dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${preserveAspectRatio}" clip-path="url(#${clipId})" />`,
  ].join("")
}

function renderStatCards(spec: InfographicSpec, y: number) {
  const stats = spec.stats.slice(0, 4)
  if (stats.length === 0) {
    return { markup: "", height: 0 }
  }

  const gap = 18
  const cardWidth = (972 - gap * (stats.length - 1)) / stats.length

  return {
    markup: stats
      .map((stat, index) => {
        const x = 54 + index * (cardWidth + gap)
        const valueLines = clampLines(wrapText(stat.value, cardWidth - 36, 26), 2)
        const labelLines = clampLines(wrapText(stat.label, cardWidth - 36, 16), 2)
        return [
          `<rect x="${x}" y="${y}" width="${cardWidth}" height="140" rx="20" fill="#ffffff" stroke="${spec.palette.accent}" stroke-opacity="0.18" />`,
          `<rect x="${x}" y="${y}" width="${cardWidth}" height="8" rx="20" fill="${spec.palette.accent}" />`,
          renderTextLines({
            lines: valueLines,
            x: x + 18,
            y: y + 50,
            fontSize: 26,
            lineHeight: 30,
            color: spec.palette.text,
            weight: 800,
            fontFamily: DISPLAY_FONT_STACK,
          }),
          renderTextLines({
            lines: labelLines,
            x: x + 18,
            y: y + 102,
            fontSize: 16,
            lineHeight: 20,
            color: spec.palette.muted,
            weight: 600,
          }),
        ].join("")
      })
      .join(""),
    height: 140,
  }
}

function renderSections(spec: InfographicSpec, y: number) {
  const sections = spec.sections.slice(0, 6)
  if (sections.length === 0) {
    return { markup: "", height: 0 }
  }

  const columns = sections.length >= 4 ? 2 : 1
  const gap = 18
  const cardWidth = columns === 2 ? 477 : 972
  const cardHeight = 156

  return {
    markup: sections
      .map((section, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        const x = 54 + column * (cardWidth + gap)
        const cardY = y + row * (cardHeight + gap)
        const headingLines = clampLines(wrapText(section.heading, cardWidth - 36, 22), 2)
        const bodyLines = clampLines(section.body.flatMap((item) => wrapText(`• ${item}`, cardWidth - 36, 17)), 4)

        return [
          `<rect x="${x}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="22" fill="#ffffff" stroke="${spec.palette.accent}" stroke-opacity="0.14" />`,
          `<rect x="${x}" y="${cardY}" width="${cardWidth}" height="8" rx="22" fill="${spec.palette.accent}" />`,
          renderTextLines({
            lines: headingLines,
            x: x + 18,
            y: cardY + 42,
            fontSize: 22,
            lineHeight: 27,
            color: spec.palette.text,
            weight: 800,
            fontFamily: DISPLAY_FONT_STACK,
          }),
          renderTextLines({
            lines: bodyLines,
            x: x + 18,
            y: cardY + 86,
            fontSize: 17,
            lineHeight: 22,
            color: spec.palette.muted,
            weight: 500,
          }),
        ].join("")
      })
      .join(""),
    height: Math.ceil(sections.length / columns) * cardHeight + Math.max(0, Math.ceil(sections.length / columns) - 1) * gap,
  }
}

function pickAssets(spec: InfographicSpec, assets: VisualAsset[]) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
  const preferredIds = [...spec.heroAssetIds, ...spec.stripAssetIds, ...assets.map((asset) => asset.id)]
  const ordered = Array.from(new Set(preferredIds))
    .map((id) => assetMap.get(id))
    .filter((asset): asset is VisualAsset => Boolean(asset))

  const hero = ordered[0] ?? null
  const support = ordered.filter((asset) => asset.id !== hero?.id).slice(0, 4)
  return { hero, support }
}

export function buildInfographicSvg(
  spec: InfographicSpec,
  assets: VisualAsset[],
  options?: {
    backdropImageDataUrl?: string | null
  }
) {
  const { hero, support } = pickAssets(spec, assets)
  const titleLines = clampLines(wrapText(spec.title, 360, 50), 4)
  const subtitleLines = clampLines(wrapText(spec.subtitle, 360, 22), 5)
  const statGrid = renderStatCards(spec, 668)
  const sections = renderSections(spec, 668 + statGrid.height + (statGrid.height > 0 ? 28 : 0))
  const takeawayY = 668 + statGrid.height + sections.height + (sections.height > 0 ? 54 : 0)
  const backdropImageDataUrl = options?.backdropImageDataUrl ?? null

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
      <defs>
        <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${spec.palette.background}" />
          <stop offset="100%" stop-color="${spec.palette.surface}" />
        </linearGradient>
        <linearGradient id="panelShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.96" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1600" fill="url(#paper)" />
      ${backdropImageDataUrl ? `<image href="${backdropImageDataUrl}" x="0" y="0" width="1080" height="1600" preserveAspectRatio="xMidYMid slice" opacity="0.42" />` : ""}
      <rect width="1080" height="1600" fill="#0f172a" fill-opacity="0.18" />
      <rect x="54" y="44" width="220" height="46" rx="16" fill="#ffffff" stroke="${spec.palette.accent}" stroke-opacity="0.2" />
      <text x="78" y="73" fill="${spec.palette.accent}" font-size="22" font-weight="800" font-family="${DISPLAY_FONT_STACK}">${escapeXml(getStoryBriefLabel(spec.contentLanguage))}</text>

      <rect x="54" y="116" width="394" height="520" rx="28" fill="url(#panelShade)" stroke="${spec.palette.accent}" stroke-opacity="0.18" />
      <rect x="54" y="116" width="394" height="10" rx="28" fill="${spec.palette.accent}" />
      ${renderTextLines({ lines: titleLines, x: 84, y: 196, fontSize: 50, lineHeight: 56, color: spec.palette.text, weight: 900, fontFamily: DISPLAY_FONT_STACK })}
      ${renderTextLines({ lines: subtitleLines, x: 84, y: 438, fontSize: 22, lineHeight: 28, color: spec.palette.muted, weight: 600 })}

      ${renderImageFrame(hero, { x: 472, y: 116, width: 554, height: 382, radius: 28, clipId: "hero-image" })}
      ${support
        .slice(0, 4)
        .map((asset, index) => renderImageFrame(asset, { x: 472 + index * 141, y: 516, width: 130, height: 120, radius: 18, clipId: `support-${index}` }))
        .join("")}

      ${statGrid.markup}
      ${sections.markup}

      <rect x="54" y="${Math.min(1458, takeawayY)}" width="972" height="96" rx="24" fill="url(#panelShade)" stroke="${spec.palette.accent}" stroke-opacity="0.2" />
      ${renderTextLines({
        lines: clampLines(wrapText(spec.takeaway, 920, 28), 2),
        x: 82,
        y: Math.min(1516, takeawayY + 58),
        fontSize: 28,
        lineHeight: 34,
        color: spec.palette.text,
        weight: 800,
        fontFamily: DISPLAY_FONT_STACK,
      })}
      <text x="54" y="1582" fill="${spec.palette.muted}" font-size="18" font-weight="700" font-family="${BODY_FONT_STACK}">${escapeXml(spec.footer)}</text>
    </svg>
  `.trim()
}

export function buildInfographicSvgDataUrl(spec: InfographicSpec, assets: VisualAsset[]) {
  const svg = buildInfographicSvg(spec, assets)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function buildHybridInfographicSvgDataUrl(
  spec: InfographicSpec,
  assets: VisualAsset[],
  backdropImageDataUrl: string | null
) {
  const svg = buildInfographicSvg(spec, assets, { backdropImageDataUrl })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function renderOverlayCard(
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
    return ""
  }

  return [
    `<filter id="shadow-${clipId}" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000000" flood-opacity="0.28" /></filter>`,
    `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" /></clipPath>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#ffffff" fill-opacity="0.96" filter="url(#shadow-${clipId})" />`,
    `<image href="${asset.dataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="4" />`,
  ].join("")
}

function buildOverlayAssetSequence(assets: VisualAsset[]) {
  const uploaded = assets.filter((asset) => asset.source === "upload")
  const linked = assets.filter((asset) => asset.source === "link")
  const hero = uploaded[0] ?? linked[0] ?? null
  const support = [...uploaded.slice(1), ...linked, ...assets].filter((asset) => asset.id !== hero?.id)
  return { hero, support: support.filter((asset, index, list) => list.findIndex((item) => item.id === asset.id) === index) }
}

export function buildOverlayPlan(assets: VisualAsset[]) {
  const { hero, support } = buildOverlayAssetSequence(assets)
  if (!hero) {
    return { hero: null, placements: [] as OverlayPlacement[] }
  }

  const heroRatio = hero?.width && hero?.height ? hero.width / hero.height : 1.3
  const isWideHero = heroRatio >= 1.2
  const heroSlot: OverlaySlot = isWideHero
    ? { x: 590, y: 112, width: 388, height: 244, radius: 26, clipId: "overlay-hero", label: "hero" }
    : { x: 724, y: 112, width: 254, height: 346, radius: 26, clipId: "overlay-hero", label: "hero" }

  const compactSupportY = isWideHero ? 382 : 484
  const supportSlots: OverlaySlot[] = [
    { x: 590, y: compactSupportY, width: 122, height: 122, radius: 18, clipId: "overlay-support-0", label: "support" },
    { x: 728, y: compactSupportY, width: 122, height: 122, radius: 18, clipId: "overlay-support-1", label: "support" },
    { x: 866, y: compactSupportY, width: 112, height: 122, radius: 18, clipId: "overlay-support-2", label: "support" },
  ]

  const placements: OverlayPlacement[] = [{ asset: hero, slot: heroSlot }]

  support.slice(0, supportSlots.length).forEach((asset, index) => {
    placements.push({ asset, slot: supportSlots[index]! })
  })

  return { hero, placements }
}

export function describeOverlayPlan(assets: VisualAsset[]) {
  const plan = buildOverlayPlan(assets)

  return plan.placements
    .map(({ asset, slot }, index) => {
      const ratio = asset.width && asset.height ? (asset.width / asset.height).toFixed(2) : "unknown"
      return `${index + 1}. ${slot.label} window for ${asset.source === "upload" ? "uploaded" : "article"} image \"${asset.title}\" at x=${slot.x}, y=${slot.y}, width=${slot.width}, height=${slot.height}, radius=${slot.radius}, aspect=${ratio}. This window must feel intentionally built into the poster, with enough breathing room so borders, labels, and nearby elements do not collide with the inserted image.`
    })
    .join("\n")
}

export function buildPosterOverlayCompositeSvgDataUrl(backgroundDataUrl: string, assets: VisualAsset[]) {
  const plan = buildOverlayPlan(assets)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
      <rect width="1080" height="1600" fill="#0f172a" />
      <image href="${backgroundDataUrl}" x="0" y="0" width="1080" height="1600" preserveAspectRatio="xMidYMid slice" />
      ${plan.placements
        .map(({ asset, slot }) => renderOverlayCard(asset, slot))
        .join("")}
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
