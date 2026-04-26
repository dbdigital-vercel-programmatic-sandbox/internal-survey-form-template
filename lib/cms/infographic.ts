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
}

export type SourceKind = "upload" | "link"

export type VisualAsset = {
  id: string
  source: SourceKind
  title: string
  mediaType: string
  dataUrl: string
  originUrl: string | null
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

export type InfographicSpec = {
  title: string
  subtitle: string
  takeaway: string
  footer: string
  palette: InfographicPalette
  stats: InfographicStat[]
  sections: InfographicSection[]
  heroAssetIds: string[]
  stripAssetIds: string[]
}

export type InfographicResponse = {
  assistantMessage: string
  infographic: InfographicSpec
  extractedSources: ExtractedSource[]
  assets: VisualAsset[]
}

export const DEFAULT_INFOGRAPHIC: InfographicSpec = {
  title: "Infographic Draft",
  subtitle: "Add a source link and a few images to generate a sharper visual summary.",
  takeaway: "User-provided images are given highest priority during layout selection.",
  footer: "Generated in CMS Studio",
  palette: {
    background: "#f8f4ec",
    surface: "#fffdf8",
    accent: "#9d1c1f",
    text: "#18181b",
    muted: "#57534e",
  },
  stats: [],
  sections: [],
  heroAssetIds: [],
  stripAssetIds: [],
}
