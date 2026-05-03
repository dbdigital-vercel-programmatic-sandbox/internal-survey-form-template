export type ChatRole = "user" | "assistant"

export type ChatMessage = {
  role: ChatRole
  text: string
}

export type UploadedAsset = {
  id: string
  name: string
  mediaType: string
  dataUrl: string
  width?: number
  height?: number
}

export type SourceKind = "upload" | "link"

export type VisualAsset = {
  id: string
  source: SourceKind
  title: string
  mediaType: string
  dataUrl: string
  originUrl: string | null
  width?: number
  height?: number
}

export type ExtractedSource = {
  url: string
  title: string | null
  description: string | null
  textSnippet: string
  imageCount: number
}

export type InfographicPalette = {
  background: string
  surface: string
  accent: string
  text: string
  muted: string
}

export type InfographicStat = {
  label: string
  value: string
}

export type InfographicSection = {
  heading: string
  body: string[]
}

export type InfographicLayoutVariant =
  | "split-hero"
  | "image-lead"
  | "data-lead"
  | "editorial-mosaic"
  | "timeline-focus"

export type InfographicLanguage = "en" | "hi" | "mixed"

export type InfographicFact = {
  label: string
  value: string
  detail: string
}

export type InfographicArtDirection = {
  visualStyle: string
  composition: string
  typography: string
  colorDirection: string
  imagePrompt: string
  negativePrompt: string
  mustIncludeText: string[]
  avoid: string[]
}

export type InfographicQa = {
  approved: boolean
  summary: string
  issues: string[]
}

export type GeneratedInfographicImage = {
  status: "generated" | "fallback"
  model: string
  dataUrl: string | null
  mimeType: string | null
  prompt: string
  revisedPrompt: string | null
  error: string | null
}

export type InfographicSpec = {
  contentLanguage: InfographicLanguage
  title: string
  subtitle: string
  takeaway: string
  footer: string
  layoutVariant: InfographicLayoutVariant
  palette: InfographicPalette
  stats: InfographicStat[]
  sections: InfographicSection[]
  heroAssetIds: string[]
  stripAssetIds: string[]
}

export type InfographicResponse = {
  assistantMessage: string
  infographic: InfographicSpec
  facts: InfographicFact[]
  artDirection: InfographicArtDirection
  qa: InfographicQa
  finalImage: GeneratedInfographicImage
  renderMode: "model-image" | "deterministic-svg"
  extractedSources: ExtractedSource[]
  assets: VisualAsset[]
}

export const DEFAULT_INFOGRAPHIC: InfographicSpec = {
  contentLanguage: "en",
  title: "Infographic Draft",
  subtitle: "Add a source link and a few images to generate a sharper article-led infographic draft.",
  takeaway: "Uploaded images and article images should be used directly when available.",
  footer: "Editorial infographic draft",
  layoutVariant: "editorial-mosaic",
  palette: {
    background: "#f4efe7",
    surface: "#fffaf2",
    accent: "#9d1c1f",
    text: "#111827",
    muted: "#4b5563",
  },
  stats: [],
  sections: [],
  heroAssetIds: [],
  stripAssetIds: [],
}
