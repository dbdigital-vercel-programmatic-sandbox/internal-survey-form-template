"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  DownloadIcon,
  LoaderIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { normalizePhoneNumber } from "@/lib/survey"

type CmsSurveyResponse = {
  id: number
  userId: string
  userName: string | null
  phoneNumber: string
  cmFace: string
  cmCaste: string
  cmQuality: string
  nitishShouldStepDown: string
  nitishTenurePreference: string
  createdAt: string
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()

  let data: unknown = null

  try {
    data = text ? (JSON.parse(text) as unknown) : null
  } catch {
    throw new Error(text.slice(0, 200) || "Request failed")
  }

  if (!response.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ?? "Request failed"
    )
  }

  return data as T
}

export default function CmsPage() {
  const [items, setItems] = useState<CmsSurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadResponses = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setRefreshing(true)
    }

    try {
      setError(null)
      const data = await fetchJson<{ items: CmsSurveyResponse[] }>(
        "/api/cms/survey",
        {
          cache: "no-store",
        }
      )
      setItems(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Responses not available")
    } finally {
      setLoading(false)
      if (showLoader) {
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadResponses()
  }, [loadResponses])

  async function handleClear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber)

    if (!normalizedPhoneNumber) {
      setError("Enter a valid phone number to clear survey data.")
      return
    }

    setClearing(true)
    setError(null)
    setNotice(null)

    try {
      const data = await fetchJson<{ deletedCount: number }>(
        "/api/cms/survey",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ phoneNumber: normalizedPhoneNumber }),
        }
      )

      setNotice(
        data.deletedCount > 0
          ? `Removed ${data.deletedCount} survey response for ${normalizedPhoneNumber}.`
          : `No survey response found for ${normalizedPhoneNumber}.`
      )
      setPhoneNumber("")
      await loadResponses()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to clear response")
    } finally {
      setClearing(false)
    }
  }

  const latestSubmission = items[0]?.createdAt

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Survey Responses</h1>
            <Badge variant="secondary">{items.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Download all submissions as CSV or clear a single response by phone
            number.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadResponses(true)}
            disabled={loading || refreshing || clearing}
          >
            <RefreshCwIcon className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button asChild>
            <a href="/api/cms/survey/export">
              <DownloadIcon />
              Download CSV
            </a>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Total submissions</CardTitle>
            <CardDescription>
              Current survey entries in the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {items.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest submission</CardTitle>
            <CardDescription>Most recent response timestamp</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-foreground">
              {latestSubmission
                ? new Date(latestSubmission).toLocaleString()
                : "No submissions yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clear by phone</CardTitle>
            <CardDescription>
              Delete a single user response using the app phone number
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={handleClear}
            >
              <Input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+919876543210"
                className="h-10"
                disabled={clearing}
              />
              <Button type="submit" variant="destructive" disabled={clearing}>
                {clearing ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  <Trash2Icon />
                )}
                Clear data
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <LoaderIcon className="mr-2 size-4 animate-spin" />
          Loading survey responses...
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No survey responses yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Submitted</TableHead>
                  <TableHead className="min-w-36">Phone</TableHead>
                  <TableHead className="min-w-36">User ID</TableHead>
                  <TableHead className="min-w-36">User name</TableHead>
                  <TableHead className="min-w-40">CM face</TableHead>
                  <TableHead className="min-w-28">Caste</TableHead>
                  <TableHead className="min-w-64">Quality</TableHead>
                  <TableHead className="min-w-28">Step down</TableHead>
                  <TableHead className="min-w-64">Tenure preference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{item.phoneNumber}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.userId}
                    </TableCell>
                    <TableCell>{item.userName ?? "-"}</TableCell>
                    <TableCell>{item.cmFace}</TableCell>
                    <TableCell>{item.cmCaste}</TableCell>
                    <TableCell>{item.cmQuality}</TableCell>
                    <TableCell>{item.nitishShouldStepDown}</TableCell>
                    <TableCell>{item.nitishTenurePreference}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
