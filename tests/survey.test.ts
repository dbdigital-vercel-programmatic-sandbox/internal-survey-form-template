import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SurveyOption, SurveyQuestion } from "../lib/db/schema"
import {
  buildQuestionTree,
  summarizeAnswers,
  validateSurveyAnswers,
} from "../lib/survey"
import { validateSurveyImport } from "../lib/survey-import"

const questions: SurveyQuestion[] = [
  {
    id: 1,
    questionText: "Root question",
    multipleChoice: false,
    isActive: true,
    position: 1,
    campaignId: 1,
    stateId: 1,
    vidhanId: 10,
    parentOptionId: null,
  },
  {
    id: 2,
    questionText: "Follow-up question",
    multipleChoice: false,
    isActive: true,
    position: 2,
    campaignId: 1,
    stateId: 1,
    vidhanId: 10,
    parentOptionId: 101,
  },
]

const options: SurveyOption[] = [
  {
    id: 101,
    optionText: "Yes",
    isActive: true,
    allowCustomValue: false,
    questionId: 1,
  },
  {
    id: 102,
    optionText: "No",
    isActive: true,
    allowCustomValue: false,
    questionId: 1,
  },
  {
    id: 201,
    optionText: "Other",
    isActive: true,
    allowCustomValue: true,
    questionId: 2,
  },
]

describe("survey helpers", () => {
  it("builds a nested decision tree from flat question and option rows", () => {
    const tree = buildQuestionTree(questions, options)

    assert.equal(tree.length, 1)
    assert.equal(tree[0].id, 1)
    assert.equal(tree[0].options.length, 2)
    assert.equal(tree[0].children.length, 1)
    assert.equal(tree[0].children[0].id, 2)
  })

  it("rejects options that do not belong to the selected question", () => {
    const error = validateSurveyAnswers({
      answers: [{ question: 1, options: [201] }],
      questions,
      options,
    })

    assert.equal(error, "Option 201 is not valid for question 1.")
  })

  it("requires a custom value when the selected option allows custom input", () => {
    const error = validateSurveyAnswers({
      answers: [{ question: 2, options: [201], customValue: "" }],
      questions,
      options,
    })

    assert.equal(error, "Question 2 requires a custom value.")
  })

  it("flattens stored answers into CMS-friendly labels", () => {
    const summary = summarizeAnswers({
      answers: [{ question: 2, options: [201], customValue: "Candidate" }],
      questions,
      options,
    })

    assert.deepEqual(summary, [
      {
        questionId: 2,
        questionText: "Follow-up question",
        optionIds: [201],
        optionText: "Other",
        customValue: "Candidate",
      },
    ])
  })
})

describe("survey import validation", () => {
  it("returns format guidance when uploaded sheets are empty", () => {
    const result = validateSurveyImport([], [])

    assert.equal(result.valid, false)
    assert.ok(result.errors.includes("MLA mapping sheet has no data rows."))
    assert.ok(
      result.errors.includes("Candidate alternatives sheet has no data rows.")
    )
    assert.ok(
      result.format.mlaMapping.requiredHeaders.includes("District (English)")
    )
    assert.ok(
      result.format.candidates.requiredHeaders.includes(
        "Constituency (English) Auto-fill"
      )
    )
  })

  it("accepts a minimal MLA mapping and candidate alternatives pair", () => {
    const result = validateSurveyImport(
      [
        {
          "District (English)": "Lucknow",
          "District (Hindi)": "लखनऊ",
          "Constituency (English)": "Lucknow Central",
          "Constituency (Hindi)": "लखनऊ मध्य",
          "Sitting MLA (English)": "Ravi Das",
          "Sitting MLA (Hindi)": "रवि दास",
          "Sitting MLA Party (English)": "BJP",
        },
      ],
      [
        {
          "Constituency (English) Auto-fill": "Lucknow Central, Lucknow",
          Party: "BJP",
          "Candidate Name 1": "रवि दास",
        },
      ]
    )

    assert.equal(result.valid, true)
    assert.equal(result.counts.districts, 1)
    assert.equal(result.counts.constituencies, 1)
    assert.equal(result.counts.constituenciesWithCandidateParties, 1)
    assert.equal(result.sample[0].key, "Lucknow|Lucknow Central")
  })
})
