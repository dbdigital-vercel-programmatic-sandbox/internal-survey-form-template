"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  LoaderIcon,
  PlayIcon,
  Undo2Icon,
  WandSparklesIcon,
} from "lucide-react"

interface Migration {
  tag: string
  when: number
  sqlContent: string
  applied: boolean
  appliedAt: string | null
  hash: string | null
  id: number | null
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text.slice(0, 200))
  }
}

export default function MigrationsPage() {
  const [migrations, setMigrations] = useState<Migration[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchMigrations = useCallback(async (clearError = true) => {
    try {
      if (clearError) setError(null)
      const data = await fetchJson<{
        migrations: Migration[]
        error: string | null
      }>("/api/cms/migrations")
      if (data.error) {
        setError(data.error)
      } else {
        setMigrations(data.migrations)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMigrations()
  }, [fetchMigrations])

  const busy = applying || reverting || generating

  async function generateMigrations() {
    setGenerating(true)
    setError(null)
    try {
      const data = await fetchJson<{
        success: boolean
        output: string | null
        error: string | null
      }>("/api/cms/migrations/generate", { method: "POST" })
      if (data.error) {
        setError(data.error)
      }
      await fetchMigrations(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function applyMigrations() {
    setApplying(true)
    setError(null)
    try {
      const data = await fetchJson<{
        success: boolean
        error: string | null
      }>("/api/cms/migrations", { method: "POST" })
      if (data.error) {
        setError(data.error)
      }
      await fetchMigrations(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  async function revertLast() {
    setReverting(true)
    setError(null)
    try {
      const data = await fetchJson<{
        success: boolean
        error: string | null
      }>("/api/cms/migrations/revert", { method: "POST" })
      if (data.error) {
        setError(data.error)
      }
      await fetchMigrations(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReverting(false)
    }
  }

  const pendingCount = migrations.filter((m) => !m.applied).length
  const appliedCount = migrations.filter((m) => m.applied).length

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Database Migrations</h1>
          <p className="text-muted-foreground text-sm">
            Manage Drizzle schema migrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generateMigrations}
            disabled={busy}
          >
            {generating ? (
              <LoaderIcon className="animate-spin" />
            ) : (
              <WandSparklesIcon />
            )}
            Generate
          </Button>
          {appliedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={revertLast}
              disabled={busy}
            >
              {reverting ? (
                <LoaderIcon className="animate-spin" />
              ) : (
                <Undo2Icon />
              )}
              Revert last
            </Button>
          )}
          {pendingCount > 0 && (
            <Button size="sm" onClick={applyMigrations} disabled={busy}>
              {applying ? (
                <LoaderIcon className="animate-spin" />
              ) : (
                <PlayIcon />
              )}
              Apply {pendingCount} pending
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground flex items-center justify-center py-12 text-sm">
          <LoaderIcon className="mr-2 size-4 animate-spin" />
          Loading migrations...
        </div>
      ) : migrations.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center py-12 text-sm">
          <p>No migrations found.</p>
          <p className="mt-1">
            Click{" "}
            <strong className="text-foreground">Generate</strong> to create
            migrations from your schema.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Migration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Applied at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {migrations.map((m, i) => (
              <TableRow key={m.tag}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {i}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-mono text-sm hover:underline"
                    onClick={() =>
                      setExpanded(expanded === m.tag ? null : m.tag)
                    }
                  >
                    {m.tag}
                  </button>
                  {expanded === m.tag && (
                    <pre className="bg-muted mt-2 max-h-60 overflow-auto rounded-lg p-3 text-xs">
                      <code>{m.sqlContent || "-- empty migration --"}</code>
                    </pre>
                  )}
                </TableCell>
                <TableCell>
                  {m.applied ? (
                    <Badge variant="secondary">
                      <CheckCircle2Icon className="text-emerald-500" />
                      Applied
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <CircleDotIcon className="text-amber-500" />
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-xs">
                  {m.appliedAt
                    ? new Date(m.appliedAt).toLocaleString()
                    : "\u2014"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-muted-foreground mt-4 text-xs">
        <strong>Note:</strong> Revert removes the migration tracking record but
        does not undo schema changes. Use it to re-run a migration after editing
        its SQL.
      </p>
    </div>
  )
}
