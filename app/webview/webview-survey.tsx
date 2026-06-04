"use client"

/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  LoaderIcon,
  Share2Icon,
  SmartphoneIcon,
} from "lucide-react"

import { usePullToRefreshDisabler, useWebviewContext } from "@/bridge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type {
  SurveyCampaign,
  SurveyCampaignMetadata,
  SurveyResponse,
} from "@/lib/db/schema"
import {
  DEFAULT_SURVEY_CAMPAIGN_ID,
  type DecisionTreeQuestion,
  type SurveyLocationPayload,
  normalizePhoneNumber,
} from "@/lib/survey"
import { cn } from "@/lib/utils"

type WebviewUser = {
  id: string
  name: string
  phoneNumber: string
}

type SurveyView = "intro" | "selection" | "questions"
type ShareSource =
  | "Survey Intro Page"
  | "Location Selection Page"
  | "Survey Submit Page"

type SurveyLoadPayload = {
  campaign: SurveyCampaign
  locations: SurveyLocationPayload
  submission: SurveyResponse | null
}

class RequestError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = "RequestError"
    this.status = status
    this.data = data
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new RequestError(
      data?.error ?? "Request failed",
      response.status,
      data
    )
  }

  return data as T
}

function Shell({
  title = "भास्कर सर्वे",
  onBack,
  onShare,
  children,
}: {
  title?: string
  onBack: () => void
  onShare: () => void
  children: ReactNode
}) {
  return (
    <main className="min-h-svh bg-muted px-0 py-0 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col bg-background sm:min-h-[720px] sm:rounded-3xl sm:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="flex h-[72px] items-center gap-3 px-4">
            <button
              type="button"
              onClick={onBack}
              aria-label="वापस जाएं"
              className="inline-flex size-10 shrink-0 items-center justify-center text-foreground"
            >
              <ArrowLeftIcon className="size-7" strokeWidth={2.2} />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-left text-xl font-semibold text-foreground">
              {title}
            </h1>
            <button
              type="button"
              onClick={onShare}
              aria-label="सर्वे शेयर करें"
              className="inline-flex size-10 shrink-0 items-center justify-center text-foreground"
            >
              <Share2Icon className="size-5" />
            </button>
          </div>
        </header>
        {children}
      </div>
    </main>
  )
}

function LoadingScreen({
  onBack,
  onShare,
}: {
  onBack: () => void
  onShare: () => void
}) {
  return (
    <Shell onBack={onBack} onShare={onShare}>
      <div className="flex flex-1 items-center justify-center">
        <LoaderIcon className="size-12 animate-spin text-muted-foreground" />
      </div>
    </Shell>
  )
}

function MessageCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Card className="border-0 py-0">
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}

function CompletionScreen({
  variant,
  campaign,
  onClose,
  onShare,
}: {
  variant: "submitted" | "already"
  campaign: SurveyCampaign | null
  onClose: () => void
  onShare: () => void
}) {
  const title =
    variant === "submitted"
      ? "दैनिक भास्कर सर्वे में हिस्सा लेने के लिए धन्यवाद"
      : "आप दैनिक भास्कर के सर्वे में हिस्सा ले चुके हैं"

  return (
    <Shell
      title={campaign?.name ?? "भास्कर सर्वे"}
      onBack={onClose}
      onShare={onShare}
    >
      <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col items-center px-5 pt-20 pb-10 text-center">
        <img
          src="/webview-survey/submitted-illustration.svg"
          alt="Submitted"
          className="size-24"
        />
        <h2 className="mt-6 text-3xl leading-[1.45] font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          सर्वे के परिणाम जल्द दैनिक भास्कर एप पर पब्लिश किए जाएंगे
        </p>
        <Button
          type="button"
          onClick={onShare}
          className="mt-10 h-12 w-full bg-[#3E9E3E] text-base font-semibold text-white hover:bg-[#378f37]"
        >
          सर्वे दोस्तों से शेयर करें
        </Button>
      </div>
    </Shell>
  )
}

function IntroScreen({
  campaign,
  onProceed,
}: {
  campaign: SurveyCampaign
  onProceed: () => void
}) {
  const metadata = (campaign.metadata ?? {}) as SurveyCampaignMetadata

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-5">
      {metadata.introImg || metadata.bannerImg ? (
        <div className="overflow-hidden rounded-2xl bg-muted">
          <img
            src={metadata.introImg || metadata.bannerImg}
            alt="Survey intro"
            className="block max-h-72 w-full object-cover"
          />
        </div>
      ) : null}

      <div className="space-y-3 px-1">
        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
          Interactive Survey
        </Badge>
        <h2 className="text-3xl leading-tight font-semibold text-foreground">
          {campaign.name}
        </h2>
        <p className="text-base leading-7 text-muted-foreground">
          अपने जिले और विधानसभा सीट को चुनकर सर्वे में हिस्सा लें।
        </p>
      </div>

      <div className="mt-auto pb-2">
        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-lg font-semibold"
          onClick={onProceed}
        >
          आगे बढ़ें
        </Button>
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  disabled,
  placeholder,
  options,
  onChange,
}: {
  label: string
  value: number | null
  disabled?: boolean
  placeholder: string
  options: Array<{ id: number; name: string; englishName?: string | null }>
  onChange: (value: number | null) => void
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
        className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base transition-colors outline-none focus:border-ring focus:ring-3 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function MlaCard({ mla }: { mla: SurveyLocationPayload["mlaList"][number] }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 text-center text-sm font-semibold text-muted-foreground">
        विधायक
      </div>
      <div className="flex items-center gap-3">
        <div className="size-16 overflow-hidden rounded-lg bg-muted">
          {mla.candidateImage ? (
            <img
              src={mla.candidateImage}
              alt={mla.name}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{mla.name}</div>
          <div className="text-sm text-muted-foreground">
            {mla.vidhan.name}, {mla.district.name}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="size-8 overflow-hidden rounded bg-muted">
            <img
              src={mla.party.logo}
              alt={mla.party.hiName}
              className="size-full object-cover"
            />
          </div>
          <div className="max-w-20 text-xs text-muted-foreground">
            {mla.party.hiName}
          </div>
        </div>
      </div>
    </div>
  )
}

function SelectionScreen({
  campaign,
  locations,
  loadingQuestions,
  selectedDistrictId,
  selectedVidhanSeatId,
  error,
  onDistrictChange,
  onVidhanChange,
  onProceed,
}: {
  campaign: SurveyCampaign
  locations: SurveyLocationPayload
  loadingQuestions: boolean
  selectedDistrictId: number | null
  selectedVidhanSeatId: number | null
  error: string | null
  onDistrictChange: (id: number | null) => void
  onVidhanChange: (id: number | null) => void
  onProceed: () => void
}) {
  const metadata = (campaign.metadata ?? {}) as SurveyCampaignMetadata
  const selectedDistrict =
    locations.districts.find(
      (district) => district.id === selectedDistrictId
    ) ?? null
  const selectedMla =
    locations.mlaList.find((mla) => mla.vidhan.id === selectedVidhanSeatId) ??
    null

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-5">
      {metadata.bannerImg ? (
        <div className="overflow-hidden rounded-2xl bg-muted">
          <img
            src={metadata.bannerImg}
            alt="Survey banner"
            className="block max-h-56 w-full object-cover"
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">
          अपना जिला और विधानसभा सीट चुनें
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          सीट के हिसाब से सवाल दिखाए जाएंगे।
        </p>
      </div>

      <SelectField
        label="जिला"
        value={selectedDistrictId}
        placeholder="अपना जिला चुनें"
        options={locations.districts}
        onChange={(id) => {
          onDistrictChange(id)
          onVidhanChange(null)
        }}
      />

      <SelectField
        label="विधानसभा सीट"
        value={selectedVidhanSeatId}
        placeholder="अपनी विधानसभा सीट चुनें"
        disabled={!selectedDistrict}
        options={selectedDistrict?.vidhanSeats ?? []}
        onChange={onVidhanChange}
      />

      {selectedMla ? <MlaCard mla={selectedMla} /> : null}

      {selectedDistrictId && selectedVidhanSeatId && !selectedMla ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          नोट: इस सीट के लिए विधायक जानकारी उपलब्ध नहीं है।
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-auto pb-2">
        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-lg font-semibold"
          disabled={
            !selectedDistrictId || !selectedVidhanSeatId || loadingQuestions
          }
          onClick={onProceed}
        >
          {loadingQuestions ? (
            <>
              <Spinner className="size-5" />
              सवाल लोड हो रहे हैं...
            </>
          ) : (
            "आगे बढ़ें"
          )}
        </Button>
      </div>
    </div>
  )
}

type PathStep = {
  questionId: number
  optionId: number
  queueWhenLeft?: DecisionTreeQuestion[]
}

function flattenTree(questions: DecisionTreeQuestion[]) {
  const byId = new Map<number, DecisionTreeQuestion>()
  const byParentOptionId = new Map<number, DecisionTreeQuestion[]>()

  function walk(nodes: DecisionTreeQuestion[]) {
    for (const question of nodes) {
      byId.set(question.id, question)

      if (question.parentOptionId != null) {
        const list = byParentOptionId.get(question.parentOptionId) ?? []
        list.push(question)
        byParentOptionId.set(question.parentOptionId, list)
      }

      walk(question.children)
    }
  }

  walk(questions)
  byParentOptionId.forEach((list) =>
    list.sort(
      (left, right) => left.position - right.position || left.id - right.id
    )
  )

  return {
    byId,
    byParentOptionId,
    root:
      questions.find((q) => q.parentOptionId == null) ?? questions[0] ?? null,
  }
}

function HighlightedQuestionText({
  text,
  keywords,
}: {
  text: string
  keywords: string[]
}) {
  const parts = useMemo(() => {
    const escaped = keywords
      .filter(Boolean)
      .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

    if (escaped.length === 0) {
      return [text]
    }

    return text.split(new RegExp(`(${escaped.join("|")})`, "gi"))
  }, [keywords, text])

  return (
    <>
      {parts.map((part, index) =>
        keywords.some(
          (keyword) => keyword.toLowerCase() === part.toLowerCase()
        ) ? (
          <span key={`${part}-${index}`} className="text-destructive">
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  )
}

function DecisionTreeSurvey({
  campaign,
  user,
  locations,
  selectedDistrictId,
  selectedVidhanSeatId,
  questions,
  submitting,
  submitError,
  onBack,
  onSubmitted,
  onSubmitStart,
  onSubmitEnd,
  onSubmitError,
}: {
  campaign: SurveyCampaign
  user: WebviewUser
  locations: SurveyLocationPayload
  selectedDistrictId: number
  selectedVidhanSeatId: number
  questions: DecisionTreeQuestion[]
  submitting: boolean
  submitError: string | null
  onBack: () => void
  onSubmitted: (
    submission: SurveyResponse,
    variant: "submitted" | "already",
    responseLabels?: Array<string | -1>
  ) => void
  onSubmitStart: () => void
  onSubmitEnd: () => void
  onSubmitError: (message: string) => void
}) {
  const { byId, byParentOptionId, root } = useMemo(
    () => flattenTree(questions),
    [questions]
  )
  const [current, setCurrent] = useState<DecisionTreeQuestion | null>(root)
  const [path, setPath] = useState<PathStep[]>([])
  const [queue, setQueue] = useState<DecisionTreeQuestion[]>([])
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [customValues, setCustomValues] = useState<Record<number, string>>({})

  const selectedDistrict = locations.districts.find(
    (district) => district.id === selectedDistrictId
  )
  const selectedMla = locations.mlaList.find(
    (mla) => mla.vidhan.id === selectedVidhanSeatId
  )
  const metadata = (campaign.metadata ?? {}) as SurveyCampaignMetadata
  const highlightKeywords = [
    ...(metadata.highlightKeywords ?? []),
    ...(selectedMla?.name ? [selectedMla.name] : []),
  ]

  useEffect(() => {
    setCurrent(root)
    setPath([])
    setQueue([])
    setSelectedOptionId(null)
    setCustomValues({})
  }, [root])

  const nextQuestions = useCallback(
    (optionId: number) => byParentOptionId.get(optionId) ?? [],
    [byParentOptionId]
  )

  const selectedOption = current?.options.find(
    (option) => option.id === selectedOptionId
  )
  const currentCustomValue = current
    ? (customValues[current.id]?.trim() ?? "")
    : ""
  const hasValidCustomValue =
    !selectedOption?.allowCustomValue || currentCustomValue.length > 0
  const isAtEnd =
    current != null &&
    selectedOptionId != null &&
    queue.length === 0 &&
    hasValidCustomValue &&
    nextQuestions(selectedOptionId).length === 0

  function goBack() {
    if (path.length === 0) {
      if (selectedOptionId != null) {
        setSelectedOptionId(null)
        return
      }

      onBack()
      return
    }

    const previous = path[path.length - 1]
    const previousQuestion = byId.get(previous.questionId) ?? null

    setPath((value) => value.slice(0, -1))
    setCurrent(previousQuestion)
    setQueue(previous.queueWhenLeft ?? nextQuestions(previous.optionId))
    setSelectedOptionId(previous.optionId)
  }

  function moveToNext(optionId: number) {
    if (!current) {
      return
    }

    const followUps = nextQuestions(optionId)

    if (followUps.length > 0) {
      setPath((value) => [...value, { questionId: current.id, optionId }])
      setCurrent(followUps[0])
      setQueue(followUps.slice(1))
      setSelectedOptionId(null)
      return
    }

    if (queue.length > 0) {
      setPath((value) => [
        ...value,
        { questionId: current.id, optionId, queueWhenLeft: queue },
      ])
      setCurrent(queue[0])
      setQueue((value) => value.slice(1))
      setSelectedOptionId(null)
    }
  }

  function selectOption(optionId: number) {
    setSelectedOptionId(optionId)
  }

  function getFullPath() {
    if (current && selectedOptionId != null && isAtEnd) {
      return [...path, { questionId: current.id, optionId: selectedOptionId }]
    }

    return path
  }

  function getResponseLabels(fullPath: PathStep[]) {
    return fullPath.map(({ questionId, optionId }) => {
      const question = byId.get(questionId)
      return (
        question?.options.find((option) => option.id === optionId)
          ?.optionText ?? -1
      )
    })
  }

  async function submitSurvey() {
    if (
      !current ||
      selectedOptionId == null ||
      !selectedDistrict ||
      submitting
    ) {
      return
    }

    const fullPath = getFullPath()

    onSubmitStart()

    try {
      const data = await requestJson<{ submission: SurveyResponse }>(
        "/api/webview/survey",
        {
          method: "POST",
          body: JSON.stringify({
            campaignId: campaign.id,
            stateId: selectedDistrict.state.id,
            districtId: selectedDistrictId,
            vidhanSeatId: selectedVidhanSeatId,
            userId: user.id,
            userName: user.name,
            phoneNumber: user.phoneNumber,
            answers: fullPath.map((step) => ({
              question: step.questionId,
              options: [step.optionId],
              customValue: customValues[step.questionId] ?? "",
            })),
          }),
        }
      )

      onSubmitted(data.submission, "submitted", getResponseLabels(fullPath))
    } catch (err) {
      if (err instanceof RequestError && err.status === 409) {
        const existing = (err.data as { submission?: SurveyResponse | null })
          ?.submission
        if (existing) {
          onSubmitted(existing, "already")
          return
        }
      }

      onSubmitError(
        err instanceof Error ? err.message : "सर्वे सबमिट नहीं हो सका।"
      )
    } finally {
      onSubmitEnd()
    }
  }

  if (!root || !current) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-10 text-sm text-muted-foreground">
        इस सीट के लिए सवाल उपलब्ध नहीं हैं।
      </div>
    )
  }

  const activeOptions = current.options.filter((option) => option.isActive)
  const showSubmit = isAtEnd
  const canMove = selectedOptionId != null && hasValidCustomValue

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-5 py-5">
        {metadata.bannerImg ? (
          <div className="overflow-hidden rounded-2xl bg-muted">
            <img
              src={metadata.bannerImg}
              alt="Survey banner"
              className="block max-h-48 w-full object-cover"
            />
          </div>
        ) : null}

        {selectedMla && current.questionText.includes(selectedMla.name) ? (
          <MlaCard mla={selectedMla} />
        ) : null}

        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 text-xl leading-8 font-semibold text-foreground">
            <HighlightedQuestionText
              text={current.questionText}
              keywords={highlightKeywords}
            />
          </div>

          <div className="space-y-2">
            {activeOptions.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border bg-background px-4 py-3 transition-colors",
                  selectedOptionId === option.id &&
                    "border-primary bg-primary/5"
                )}
              >
                <input
                  type="radio"
                  name={`question-${current.id}`}
                  checked={selectedOptionId === option.id}
                  onChange={() => selectOption(option.id)}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="text-sm leading-6 font-medium">
                  {option.optionText}
                </span>
              </label>
            ))}
          </div>

          {selectedOption?.allowCustomValue ? (
            <input
              value={customValues[current.id] ?? ""}
              onChange={(event) =>
                setCustomValues((value) => ({
                  ...value,
                  [current.id]: event.target.value,
                }))
              }
              maxLength={40}
              placeholder="अपना जवाब लिखें"
              className="mt-4 h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
          ) : null}
        </div>

        {submitError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {submitError}
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t bg-background/95 px-5 py-4 backdrop-blur-sm">
        <Button type="button" variant="outline" size="lg" onClick={goBack}>
          पिछला पेज
        </Button>
        {showSubmit ? (
          <Button
            type="button"
            size="lg"
            disabled={!canMove || submitting}
            onClick={submitSurvey}
          >
            {submitting ? (
              <>
                <Spinner className="size-5" />
                सबमिट हो रहा है...
              </>
            ) : (
              "सबमिट"
            )}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={!canMove}
            onClick={() =>
              selectedOptionId != null && moveToNext(selectedOptionId)
            }
          >
            आगे
          </Button>
        )}
      </div>
    </div>
  )
}

export function WebviewSurvey() {
  const {
    getAppUserData,
    triggerLogin,
    closeScreen,
    shareView,
    triggerAnalyticsEvent,
  } = useWebviewContext()
  const [status, setStatus] = useState<
    "loading" | "ready" | "signed-out" | "error"
  >("loading")
  const [view, setView] = useState<SurveyView>("intro")
  const [user, setUser] = useState<WebviewUser | null>(null)
  const [campaign, setCampaign] = useState<SurveyCampaign | null>(null)
  const [locations, setLocations] = useState<SurveyLocationPayload>({
    districts: [],
    mlaList: [],
  })
  const [submission, setSubmission] = useState<SurveyResponse | null>(null)
  const [submissionVariant, setSubmissionVariant] = useState<
    "submitted" | "already"
  >("already")
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(
    null
  )
  const [selectedVidhanSeatId, setSelectedVidhanSeatId] = useState<
    number | null
  >(null)
  const [questions, setQuestions] = useState<DecisionTreeQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [questionError, setQuestionError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loginTriggeredRef = useRef(false)
  const consumedEventTriggeredRef = useRef(false)
  const surveyOpenedEventTriggeredRef = useRef(false)
  const sourceQueryParam = useMemo(() => {
    if (typeof window === "undefined") {
      return ""
    }

    return new URLSearchParams(window.location.search).get("source") || ""
  }, [])

  usePullToRefreshDisabler()

  function closeSurveyScreen() {
    try {
      closeScreen()
    } catch {
      window.history.back()
    }
  }

  const contentAnalyticsProperties = useCallback(
    (nextCampaign: SurveyCampaign | null) => ({
      Source: sourceQueryParam,
      "Content ID": nextCampaign?.id,
      "Content Title": nextCampaign?.name,
      "Content Type": "Interactive Survey",
    }),
    [sourceQueryParam]
  )
  const currentContentAnalyticsProperties = useCallback(
    () => contentAnalyticsProperties(campaign),
    [campaign, contentAnalyticsProperties]
  )
  const interactiveSurveyProperties = useCallback(
    (nextCampaign: SurveyCampaign | null) => ({
      Source: sourceQueryParam,
      "Content Type": "Interactive Survey",
      "Content Title": nextCampaign?.name,
    }),
    [sourceQueryParam]
  )

  const locationAnalyticsProperties = useCallback(() => {
    const selectedDistrict =
      locations.districts.find(
        (district) => district.id === selectedDistrictId
      ) ?? null
    const selectedVidhanSeat =
      selectedDistrict?.vidhanSeats.find(
        (seat) => seat.id === selectedVidhanSeatId
      ) ?? null

    return {
      Source: sourceQueryParam,
      District: selectedDistrict?.name,
      "Content Location": selectedVidhanSeat?.name,
      "Content Type": "Interactive Survey",
      "Content Title": campaign?.name,
    }
  }, [
    campaign?.name,
    locations.districts,
    selectedDistrictId,
    selectedVidhanSeatId,
    sourceQueryParam,
  ])

  const shareSurvey = useCallback(
    (shareSource: ShareSource) => {
      const metadata = (campaign?.metadata ?? {}) as SurveyCampaignMetadata
      const shareLink =
        metadata.shareLink || campaign?.deeplink || window.location.href
      const shareText =
        metadata.shareText ||
        "दैनिक भास्कर के इस सर्वे में हिस्सा लें\nअपनी राय बताएं"
      const shareTextAndLink = `${shareText}\n${shareLink}`

      triggerAnalyticsEvent({
        event: "Content Shared",
        properties: {
          ...currentContentAnalyticsProperties(),
          Source: shareSource,
        },
      })

      try {
        shareView({
          imageUrl: metadata.shareImage || metadata.bannerImg,
          shareTextAndLink,
        })
      } catch {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(shareTextAndLink)}`,
          "_blank",
          "noopener,noreferrer"
        )
      }
    },
    [
      campaign,
      currentContentAnalyticsProperties,
      shareView,
      triggerAnalyticsEvent,
    ]
  )

  useEffect(() => {
    let cancelled = false
    let pollId: number | null = null
    let loading = false

    const stopPolling = () => {
      if (pollId !== null) {
        window.clearInterval(pollId)
        pollId = null
      }
    }

    const loadSurvey = async () => {
      if (loading) {
        return
      }

      loading = true

      try {
        const appUserData = await getAppUserData()
        const appUser = appUserData.user

        if (!appUser?.is_signed_in || !appUser.unique_id) {
          if (!cancelled) {
            setUser(null)
            setStatus("signed-out")
            setError(null)
          }
          return
        }

        const phoneNumber = normalizePhoneNumber(appUser.phone_number)

        if (!phoneNumber) {
          stopPolling()
          if (!cancelled) {
            setStatus("error")
            setError("ऐप लॉगिन से मोबाइल नंबर नहीं मिल सका।")
          }
          return
        }

        const nextUser = {
          id: appUser.unique_id,
          name: appUser.user_name || appUser.unique_id,
          phoneNumber,
        }
        const data = await requestJson<SurveyLoadPayload>(
          `/api/webview/survey?campaignId=${DEFAULT_SURVEY_CAMPAIGN_ID}&userId=${encodeURIComponent(nextUser.id)}&phoneNumber=${encodeURIComponent(nextUser.phoneNumber)}`
        )

        stopPolling()

        if (!cancelled) {
          setUser(nextUser)
          setCampaign(data.campaign)
          setLocations(data.locations)
          setSubmission(data.submission)
          setSubmissionVariant(data.submission ? "already" : "submitted")
          setStatus("ready")
          setError(null)
          triggerAnalyticsEvent({
            event: "Interactive Survey Opened",
            properties: interactiveSurveyProperties(data.campaign),
          })
        }
      } catch (err) {
        stopPolling()
        if (!cancelled) {
          setStatus("error")
          setError(
            err instanceof Error ? err.message : "सर्वे लोड नहीं हो सका।"
          )
        }
      } finally {
        loading = false
      }
    }

    void loadSurvey()
    pollId = window.setInterval(() => {
      void loadSurvey()
    }, 1500)

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [getAppUserData, interactiveSurveyProperties, triggerAnalyticsEvent])

  useEffect(() => {
    if (!campaign?.name || consumedEventTriggeredRef.current) {
      return
    }

    const sessionKey = `interactive-consumed-${campaign.name}`
    if (window.sessionStorage.getItem(sessionKey)) {
      consumedEventTriggeredRef.current = true
      return
    }

    consumedEventTriggeredRef.current = true
    window.sessionStorage.setItem(sessionKey, "true")
    triggerAnalyticsEvent({
      event: "Interactive Survey Consumed",
      properties: {
        Source: sourceQueryParam,
        "Content Type": "Interactive Survey",
        "Content Title": campaign.name,
      },
    })
  }, [campaign, sourceQueryParam, triggerAnalyticsEvent])

  useEffect(() => {
    if (
      view !== "selection" ||
      !campaign?.id ||
      !campaign.name ||
      surveyOpenedEventTriggeredRef.current
    ) {
      return
    }

    surveyOpenedEventTriggeredRef.current = true
    triggerAnalyticsEvent({
      event: "Survey Opened",
      properties: {
        Source: "User landed on survey",
        "Content ID": campaign.id,
        "Content Title": campaign.name,
      },
    })
  }, [campaign, triggerAnalyticsEvent, view])

  useEffect(() => {
    if (status !== "signed-out" || loginTriggeredRef.current) {
      return
    }

    loginTriggeredRef.current = true

    try {
      triggerLogin({
        loginMessage: "सर्वे भरने के लिए लॉगिन करें",
        source: "Interactive Survey",
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "लॉगिन स्क्रीन नहीं खुल सकी।"
      )
    }
  }, [status, triggerLogin])

  async function loadQuestions() {
    if (!campaign || !selectedVidhanSeatId) {
      return
    }

    setLoadingQuestions(true)
    setQuestionError(null)
    setSubmitError(null)

    try {
      triggerAnalyticsEvent({
        event: "Interactive Survey User Info Submitted",
        properties: locationAnalyticsProperties(),
      })

      const data = await requestJson<{ questions: DecisionTreeQuestion[] }>(
        `/api/webview/survey/questions?campaignId=${campaign.id}&vidhanSeatId=${selectedVidhanSeatId}`
      )

      if (data.questions.length === 0) {
        setQuestionError("इस विधानसभा सीट के लिए सवाल उपलब्ध नहीं हैं।")
        return
      }

      setQuestions(data.questions)
      setView("questions")
      window.scrollTo(0, 0)
    } catch (err) {
      setQuestionError(
        err instanceof Error ? err.message : "सवाल लोड नहीं हो सके।"
      )
    } finally {
      setLoadingQuestions(false)
    }
  }

  if (status === "ready" && submission) {
    return (
      <CompletionScreen
        variant={submissionVariant}
        campaign={campaign}
        onClose={closeSurveyScreen}
        onShare={() => shareSurvey("Survey Submit Page")}
      />
    )
  }

  if (status === "loading") {
    return (
      <LoadingScreen
        onBack={closeSurveyScreen}
        onShare={() => shareSurvey("Survey Intro Page")}
      />
    )
  }

  if (status === "signed-out") {
    return (
      <Shell
        onBack={closeSurveyScreen}
        onShare={() => shareSurvey("Survey Intro Page")}
      >
        <div className="flex flex-1 flex-col justify-center px-5 py-8">
          <MessageCard
            icon={<SmartphoneIcon className="size-6" />}
            title="लॉगिन जरूरी है"
            description="इस सर्वे को भरने के लिए ऐप में लॉगिन करें।"
            action={
              <Button
                type="button"
                onClick={() => {
                  loginTriggeredRef.current = true
                  triggerLogin({
                    loginMessage: "सर्वे भरने के लिए लॉगिन करें",
                    source: "Interactive Survey",
                  })
                }}
              >
                लॉगिन करें
              </Button>
            }
          />
          {error ? (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      </Shell>
    )
  }

  if (status === "error" || !campaign || !user) {
    return (
      <Shell
        onBack={closeSurveyScreen}
        onShare={() => shareSurvey("Survey Intro Page")}
      >
        <div className="flex flex-1 flex-col justify-center px-5 py-8">
          <MessageCard
            icon={<AlertCircleIcon className="size-6" />}
            title="सर्वे लोड नहीं हो सका"
            description={error ?? "कृपया फिर से कोशिश करें।"}
            action={
              <Button type="button" onClick={() => window.location.reload()}>
                फिर से कोशिश करें
              </Button>
            }
          />
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      title={campaign.name}
      onBack={() => {
        if (view === "questions") {
          setView("selection")
          return
        }

        if (view === "selection") {
          setView("intro")
          return
        }

        closeSurveyScreen()
      }}
      onShare={() =>
        shareSurvey(
          view === "intro" ? "Survey Intro Page" : "Location Selection Page"
        )
      }
    >
      {view === "intro" ? (
        <IntroScreen
          campaign={campaign}
          onProceed={() => setView("selection")}
        />
      ) : null}

      {view === "selection" ? (
        <SelectionScreen
          campaign={campaign}
          locations={locations}
          loadingQuestions={loadingQuestions}
          selectedDistrictId={selectedDistrictId}
          selectedVidhanSeatId={selectedVidhanSeatId}
          error={questionError}
          onDistrictChange={setSelectedDistrictId}
          onVidhanChange={setSelectedVidhanSeatId}
          onProceed={() => void loadQuestions()}
        />
      ) : null}

      {view === "questions" && selectedDistrictId && selectedVidhanSeatId ? (
        <DecisionTreeSurvey
          campaign={campaign}
          user={user}
          locations={locations}
          selectedDistrictId={selectedDistrictId}
          selectedVidhanSeatId={selectedVidhanSeatId}
          questions={questions}
          submitting={isSubmitting}
          submitError={submitError}
          onBack={() => setView("selection")}
          onSubmitStart={() => {
            setIsSubmitting(true)
            setSubmitError(null)
          }}
          onSubmitEnd={() => setIsSubmitting(false)}
          onSubmitError={setSubmitError}
          onSubmitted={(nextSubmission, variant, responseLabels) => {
            setSubmission(nextSubmission)
            setSubmissionVariant(variant)
            if (variant === "submitted") {
              triggerAnalyticsEvent({
                event: "Interactive Survey Submitted",
                properties: {
                  ...locationAnalyticsProperties(),
                  Response: responseLabels ?? [],
                },
              })
            }
          }}
        />
      ) : null}
    </Shell>
  )
}
