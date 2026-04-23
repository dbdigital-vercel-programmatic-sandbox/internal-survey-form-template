import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"

let _db: NeonHttpDatabase | undefined

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set")
    }
    const sql = neon(process.env.DATABASE_URL)
    _db = drizzle({ client: sql })
  }
  return _db
}

export const db = new Proxy({} as NeonHttpDatabase, {
  get(_target, prop, receiver) {
    const instance = getDb()
    const value = Reflect.get(instance, prop, receiver)
    return typeof value === "function" ? value.bind(instance) : value
  },
})
