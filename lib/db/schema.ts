import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export type SurveyCampaignMetadata = {
  bannerImg?: string
  introImg?: string
  submitImg?: string
  shareLink?: string
  shareText?: string
  shareImage?: string
  highlightKeywords?: string[]
}

export type SurveyAnswerValue = {
  question: number
  options?: number[]
  customValue?: string
}

export type PartyInfo = {
  name: string
  hiName: string
  logo: string
}

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const todos = pgTable(
  "todos",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    completed: boolean("completed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("todos_user_id_idx").on(table.userId),
  })
)

export const surveyStates = pgTable("survey_states", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cid: text("cid").notNull().default("521"),
  isActive: boolean("is_active").default(true).notNull(),
  position: integer("position").default(1).notNull(),
})

export const surveyCampaigns = pgTable("survey_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  deeplink: text("deeplink").notNull().default(""),
  stateId: integer("state_id").references(() => surveyStates.id),
  metadata: jsonb("metadata").$type<SurveyCampaignMetadata>(),
})

export const surveyDistricts = pgTable(
  "survey_districts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    englishName: text("english_name"),
    stateId: integer("state_id")
      .notNull()
      .references(() => surveyStates.id),
    isActive: boolean("is_active").default(true).notNull(),
    position: integer("position").default(1).notNull(),
  },
  (table) => ({
    stateIdx: index("survey_districts_state_id_idx").on(table.stateId),
  })
)

export const surveyVidhanSeats = pgTable("survey_vidhan_seats", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  englishName: text("english_name"),
  isActive: boolean("is_active").default(true).notNull(),
})

export const surveyVidhanSeatDistrictConnector = pgTable(
  "survey_vidhan_seat_district_connector",
  {
    districtId: integer("district_id")
      .notNull()
      .references(() => surveyDistricts.id),
    vidhanId: integer("vidhan_id")
      .notNull()
      .references(() => surveyVidhanSeats.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.districtId, table.vidhanId] }),
    vidhanIdx: index("survey_vidhan_district_vidhan_id_idx").on(table.vidhanId),
  })
)

export const surveyQuestions = pgTable(
  "survey_questions",
  {
    id: serial("id").primaryKey(),
    questionText: text("question_text").notNull(),
    multipleChoice: boolean("multiple_choice").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    position: integer("position").default(1).notNull(),
    campaignId: integer("campaign_id").references(() => surveyCampaigns.id),
    stateId: integer("state_id").references(() => surveyStates.id),
    vidhanId: integer("vidhan_id").references(() => surveyVidhanSeats.id),
    parentOptionId: integer("parent_option_id"),
  },
  (table) => ({
    campaignVidhanIdx: index("survey_questions_campaign_vidhan_idx").on(
      table.campaignId,
      table.vidhanId
    ),
    parentOptionIdx: index("survey_questions_parent_option_idx").on(
      table.parentOptionId
    ),
  })
)

export const surveyOptions = pgTable(
  "survey_options",
  {
    id: serial("id").primaryKey(),
    optionText: text("option_text").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    allowCustomValue: boolean("custom_value").default(false).notNull(),
    questionId: integer("question_id")
      .notNull()
      .references(() => surveyQuestions.id),
  },
  (table) => ({
    questionIdx: index("survey_options_question_id_idx").on(table.questionId),
  })
)

export const surveyMlas = pgTable(
  "survey_mla",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    image: text("image").notNull().default(""),
    position: text("position"),
    caste: text("caste").notNull().default("GEN"),
    gender: text("gender").notNull().default("Male"),
    party: text("party").notNull().default("Independent"),
    education: text("education").notNull().default("Graduate"),
    region: text("region").notNull().default(""),
    isPartOfMinistry: boolean("is_part_of_ministry").default(false).notNull(),
    isFirstTimeMinister: boolean("is_first_time_minister")
      .default(false)
      .notNull(),
    age: integer("age").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    districtId: integer("district_id")
      .notNull()
      .references(() => surveyDistricts.id),
    vidhanId: integer("vidhan_id")
      .notNull()
      .references(() => surveyVidhanSeats.id),
  },
  (table) => ({
    vidhanUnique: uniqueIndex("survey_mla_vidhan_id_unique").on(table.vidhanId),
    districtIdx: index("survey_mla_district_id_idx").on(table.districtId),
  })
)

export const legacySurveyResponses = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  userName: text("user_name"),
  phoneNumber: text("phone_number").notNull().unique(),
  cmFace: text("cm_face").notNull(),
  cmCaste: text("cm_caste").notNull(),
  cmQuality: text("cm_quality").notNull(),
  nitishShouldStepDown: text("nitish_should_step_down").notNull(),
  nitishTenurePreference: text("nitish_tenure_preference").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const surveyVidhanAnswers = pgTable(
  "survey_vidhan_answers",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => surveyCampaigns.id),
    stateId: integer("state_id")
      .notNull()
      .references(() => surveyStates.id),
    districtId: integer("district_id")
      .notNull()
      .references(() => surveyDistricts.id),
    vidhanId: integer("vidhan_id")
      .notNull()
      .references(() => surveyVidhanSeats.id),
    userId: text("user_id").notNull(),
    userName: text("user_name"),
    phoneNumber: text("phone_number").notNull(),
    answers: jsonb("answers").$type<SurveyAnswerValue[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    campaignPhoneUnique: uniqueIndex(
      "survey_vidhan_answers_campaign_phone_unique"
    ).on(table.campaignId, table.phoneNumber),
    campaignUserUnique: uniqueIndex(
      "survey_vidhan_answers_campaign_user_unique"
    ).on(table.campaignId, table.userId),
    createdAtIdx: index("survey_vidhan_answers_created_at_idx").on(
      table.createdAt
    ),
  })
)

export const surveyResponses = surveyVidhanAnswers

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert
export type SurveyState = typeof surveyStates.$inferSelect
export type NewSurveyState = typeof surveyStates.$inferInsert
export type SurveyCampaign = typeof surveyCampaigns.$inferSelect
export type NewSurveyCampaign = typeof surveyCampaigns.$inferInsert
export type SurveyDistrict = typeof surveyDistricts.$inferSelect
export type NewSurveyDistrict = typeof surveyDistricts.$inferInsert
export type SurveyVidhanSeat = typeof surveyVidhanSeats.$inferSelect
export type NewSurveyVidhanSeat = typeof surveyVidhanSeats.$inferInsert
export type SurveyQuestion = typeof surveyQuestions.$inferSelect
export type NewSurveyQuestion = typeof surveyQuestions.$inferInsert
export type SurveyOption = typeof surveyOptions.$inferSelect
export type NewSurveyOption = typeof surveyOptions.$inferInsert
export type SurveyMla = typeof surveyMlas.$inferSelect
export type NewSurveyMla = typeof surveyMlas.$inferInsert
export type SurveyResponse = typeof surveyResponses.$inferSelect
export type NewSurveyResponse = typeof surveyResponses.$inferInsert
export type LegacySurveyResponse = typeof legacySurveyResponses.$inferSelect

export type SurveyLocationDistrict = SurveyDistrict & {
  state: SurveyState
  vidhanSeats: SurveyVidhanSeat[]
}

export type SurveyMlaWithParty = SurveyMla & {
  vidhan: SurveyVidhanSeat
  district: SurveyDistrict
  partyInfo: PartyInfo
}
