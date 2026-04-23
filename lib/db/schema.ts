import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

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

export const surveyResponses = pgTable("survey_responses", {
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

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert
export type SurveyResponse = typeof surveyResponses.$inferSelect
export type NewSurveyResponse = typeof surveyResponses.$inferInsert
