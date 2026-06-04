"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LoaderIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
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
import { normalizePhoneNumber, type CmsAnswerSummary } from "@/lib/survey"
import type { SurveyImportResult } from "@/lib/survey-import"

type CmsSurveyResponse = {
  id: number
  campaignId: number
  campaignName: string
  userId: string
  userName: string | null
  phoneNumber: string
  districtName: string
  vidhanSeatName: string
  mlaName: string | null
  partyName: string | null
  answersSummary: CmsAnswerSummary[]
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

function AnswersPreview({ answers }: { answers: CmsAnswerSummary[] }) {
  if (answers.length === 0) {
    return <span className="text-muted-foreground">No answers</span>
  }

  return (
    <div className="flex max-w-xl flex-col gap-2">
      {answers.map((answer, index) => (
        <div
          key={`${answer.questionId}-${index}`}
          className="rounded-lg border bg-muted/30 p-2"
        >
          <div className="line-clamp-2 text-xs font-medium">
            {index + 1}. {answer.questionText}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {answer.optionText || "-"}
            {answer.customValue ? `: ${answer.customValue}` : ""}
          </div>
        </div>
      ))}
    </div>
  )
}

function FormatBlock({
  title,
  requiredHeaders,
  optionalHeaders,
  csvExample,
}: {
  title: string
  requiredHeaders: string[]
  optionalHeaders: string[]
  csvExample: string
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-xs text-muted-foreground">
        Required: {requiredHeaders.join(", ")}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Optional: {optionalHeaders.join(", ")}
      </div>
      <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-background p-3 text-xs">
        {csvExample}
      </pre>
    </div>
  )
}

function ImportResultPanel({ result }: { result: SurveyImportResult }) {
  return (
    <div
      className={
        result.valid
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive"
      }
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {result.valid ? <CheckCircle2Icon /> : <AlertTriangleIcon />}
        {result.valid
          ? result.updated
            ? "Survey seed data updated"
            : "Sheets are valid"
          : "Sheets need fixes before update"}
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <div>MLA rows: {result.counts.mlaRows}</div>
        <div>Candidate rows: {result.counts.candidateRows}</div>
        <div>Districts: {result.counts.districts}</div>
        <div>Constituencies: {result.counts.constituencies}</div>
        <div>
          With candidates: {result.counts.constituenciesWithCandidateParties}
        </div>
      </div>

      {result.errors.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-medium">Errors</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {result.errors.slice(0, 20).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {result.errors.length > 20 ? (
            <div className="mt-2 text-xs">
              Showing first 20 of {result.errors.length} errors.
            </div>
          ) : null}
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-medium">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {result.warnings.slice(0, 10).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {result.warnings.length > 10 ? (
            <div className="mt-2 text-xs">
              Showing first 10 of {result.warnings.length} warnings.
            </div>
          ) : null}
        </div>
      ) : null}

      {result.sample.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-medium">Sample generated rows</div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {result.sample.map((item) => (
              <div
                key={item.key}
                className="rounded-md border bg-background p-2"
              >
                <div className="text-xs font-medium">{item.key}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  MLA: {item.mla?.mlaNameHindi || item.mla?.mlaName || "-"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Parties: {item.parties.join(", ") || "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!result.valid ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <FormatBlock
            title="MLA mapping CSV format"
            requiredHeaders={result.format.mlaMapping.requiredHeaders}
            optionalHeaders={result.format.mlaMapping.optionalHeaders}
            csvExample={result.format.mlaMapping.csvExample}
          />
          <FormatBlock
            title="Candidate alternatives CSV format"
            requiredHeaders={result.format.candidates.requiredHeaders}
            optionalHeaders={result.format.candidates.optionalHeaders}
            csvExample={result.format.candidates.csvExample}
          />
        </div>
      ) : null}
    </div>
  )
}

export default function CmsPage() {
  const [items, setItems] = useState<CmsSurveyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [importWorking, setImportWorking] = useState<
    "validate" | "update" | null
  >(null)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<SurveyImportResult | null>(
    null
  )
  const importFormRef = useRef<HTMLFormElement>(null)

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

  async function runSurveyImport(mode: "validate" | "update") {
    if (!importFormRef.current) {
      return
    }

    setImportWorking(mode)
    setImportError(null)
    setImportResult(null)
    setNotice(null)

    try {
      const formData = new FormData(importFormRef.current)
      formData.set("mode", mode)

      const data = await fetchJson<{ result: SurveyImportResult }>(
        "/api/cms/survey/import",
        {
          method: "POST",
          body: formData,
        }
      )

      setImportResult(data.result)

      if (data.result.updated) {
        setNotice("Survey seed data updated from the uploaded sheets.")
        await loadResponses(true)
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Unable to import survey data"
      )
    } finally {
      setImportWorking(null)
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
            Dynamic MLA survey submissions with flattened question answers.
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
            <CardDescription>Current dynamic survey entries</CardDescription>
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
              Delete all responses for one phone
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheetIcon />
            Seed survey from XLSX
          </CardTitle>
          <CardDescription>
            Upload the MLA mapping and candidate alternatives sheets, validate
            them, then update the local survey tables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={importFormRef} className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                MLA mapping sheet
                <Input
                  name="mlaFile"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={importWorking !== null}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Candidate alternatives sheet
                <Input
                  name="candidatesFile"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={importWorking !== null}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">
                Campaign ID
                <Input
                  name="campaignId"
                  defaultValue="1"
                  inputMode="numeric"
                  disabled={importWorking !== null}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Campaign name
                <Input
                  name="campaignName"
                  defaultValue="MLA Panchayat Pradhan Survey"
                  disabled={importWorking !== null}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                State
                <Input
                  name="stateName"
                  defaultValue="Uttar Pradesh"
                  disabled={importWorking !== null}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                name="deeplink"
                placeholder="Deeplink"
                disabled={importWorking !== null}
              />
              <Input
                name="keywords"
                placeholder="Highlight keywords, comma-separated"
                disabled={importWorking !== null}
              />
              <Input
                name="bannerImg"
                placeholder="Banner image URL"
                disabled={importWorking !== null}
              />
              <Input
                name="introImg"
                placeholder="Intro image URL"
                disabled={importWorking !== null}
              />
              <Input
                name="submitImg"
                placeholder="Submit image URL"
                disabled={importWorking !== null}
              />
              <Input
                name="shareImage"
                placeholder="Share image URL"
                disabled={importWorking !== null}
              />
              <Input
                name="shareLink"
                placeholder="Share link"
                disabled={importWorking !== null}
              />
              <Input
                name="shareText"
                placeholder="Share text"
                disabled={importWorking !== null}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={importWorking !== null}
                onClick={() => void runSurveyImport("validate")}
              >
                {importWorking === "validate" ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  <CheckCircle2Icon />
                )}
                Validate sheets
              </Button>
              <Button
                type="button"
                disabled={importWorking !== null}
                onClick={() => void runSurveyImport("update")}
              >
                {importWorking === "update" ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  <UploadIcon />
                )}
                Update seed data
              </Button>
              <Button type="button" variant="ghost" asChild>
                <a href="/api/cms/survey/import?template=mla">
                  MLA CSV template
                </a>
              </Button>
              <Button type="button" variant="ghost" asChild>
                <a href="/api/cms/survey/import?template=candidates">
                  Candidate CSV template
                </a>
              </Button>
            </div>
          </form>

          {importError ? (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {importError}
            </div>
          ) : null}

          {importResult ? (
            <div className="mt-4">
              <ImportResultPanel result={importResult} />
            </div>
          ) : null}
        </CardContent>
      </Card>

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
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Submitted</TableHead>
                  <TableHead className="min-w-48">Campaign</TableHead>
                  <TableHead className="min-w-36">Phone</TableHead>
                  <TableHead className="min-w-36">User</TableHead>
                  <TableHead className="min-w-48">Location</TableHead>
                  <TableHead className="min-w-44">MLA</TableHead>
                  <TableHead className="min-w-[36rem]">Answers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.campaignName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        #{item.campaignId}
                      </div>
                    </TableCell>
                    <TableCell>{item.phoneNumber}</TableCell>
                    <TableCell>
                      <div>{item.userName ?? "-"}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.userId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{item.districtName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.vidhanSeatName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{item.mlaName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.partyName ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AnswersPreview answers={item.answersSummary} />
                    </TableCell>
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
