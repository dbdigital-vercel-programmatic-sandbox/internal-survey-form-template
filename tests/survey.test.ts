import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { SurveyOption, SurveyQuestion } from "../lib/db/schema"
import {
  buildQuestionTree,
  summarizeAnswers,
  validateSurveyAnswers,
} from "../lib/survey"

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
