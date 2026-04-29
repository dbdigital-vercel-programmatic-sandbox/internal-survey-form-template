export type InfographicTemplateReference = {
  id: string
  name: string
  filePath: string
  usage: string
  styleNotes: string[]
  avoid: string[]
}

export const INFOGRAPHIC_TEMPLATE_REFERENCES: InfographicTemplateReference[] = [
  {
    id: "editorial-explainer",
    name: "Editorial Hindi Explainer",
    filePath: "/cms-templates/editorial-explainer-reference.png",
    usage: "Use for overall newsroom hierarchy and explainer pacing.",
    styleNotes: [
      "Large, forceful headline zone at the top.",
      "Modular card layout with clear sectional separation.",
      "High contrast accent bars and disciplined whitespace.",
      "Information-dense but still strongly ordered.",
    ],
    avoid: [
      "Do not reuse any actual text, numbers, maps, people, logos, or icons from the sample.",
      "Do not infer factual content from the template image.",
    ],
  },
  {
    id: "scientific-longform",
    name: "Scientific Longform Infographic",
    filePath: "/cms-templates/scientific-longform-reference.png",
    usage: "Use for color blocking, section rhythm, and narrative stacking.",
    styleNotes: [
      "Tall vertical rhythm with strong chapter-like sections.",
      "Dark base with restrained accent color usage.",
      "Each section should have one clear takeaway and limited text.",
      "Graphic hierarchy should feel deliberate and premium.",
    ],
    avoid: [
      "Do not copy the carbon/climate subject matter, labels, or icons.",
      "Do not reuse any visual asset from the sample itself.",
    ],
  },
  {
    id: "minimal-data-board",
    name: "Minimal Data Board",
    filePath: "/cms-templates/minimal-data-board-reference.png",
    usage: "Use for compact chart-card composition and spacing discipline.",
    styleNotes: [
      "Compact cards with clear margins between modules.",
      "Small data visual moments instead of oversized filler blocks.",
      "Tight but readable labels and restrained body copy.",
    ],
    avoid: [
      "Do not reuse sample illustrations or sample datasets.",
      "Do not reproduce the exact template composition verbatim.",
    ],
  },
]

export function buildTemplateReferenceSummary() {
  return INFOGRAPHIC_TEMPLATE_REFERENCES.map((template) => {
    return [
      `${template.name} (${template.filePath})`,
      `Use: ${template.usage}`,
      `Style notes: ${template.styleNotes.join(" ")}`,
      `Avoid: ${template.avoid.join(" ")}`,
    ].join("\n")
  }).join("\n\n")
}
