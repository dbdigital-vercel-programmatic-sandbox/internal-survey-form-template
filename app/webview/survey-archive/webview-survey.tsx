"use client"

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  LoaderIcon,
  SmartphoneIcon,
} from "lucide-react"

import { usePullToRefreshDisabler, useWebviewContext } from "@/bridge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { SurveyResponse } from "@/lib/db/schema"
import {
  CM_CASTE_OPTIONS,
  CM_FACE_OPTIONS,
  CM_FACE_OTHER_VALUE,
  CM_QUALITY_OPTIONS,
  NITISH_STEP_DOWN_OPTIONS,
  NITISH_TENURE_OPTIONS,
  SURVEY_DESCRIPTION,
  SURVEY_LABELS,
  SURVEY_TITLE,
  normalizePhoneNumber,
} from "@/lib/survey"
import { cn } from "@/lib/utils"

type WebviewUser = {
  id: string
  name: string
  phoneNumber: string
}

type SurveyFormState = {
  cmFace: string
  cmFaceOther: string
  cmCaste: string
  cmQuality: string
  nitishShouldStepDown: string
  nitishTenurePreference: string
}

const emptyFormState: SurveyFormState = {
  cmFace: "",
  cmFaceOther: "",
  cmCaste: "",
  cmQuality: "",
  nitishShouldStepDown: "",
  nitishTenurePreference: "",
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

function QuestionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card className="gap-2 rounded-[1.75rem] border-0 bg-card/95 py-0 backdrop-blur-sm">
      <CardHeader className="gap-2 p-6 pb-2">
        <div className="text-xl leading-snug font-semibold text-foreground sm:text-2xl">
          {title} <span className="text-destructive">*</span>
        </div>
        {description ? (
          <CardDescription className="text-sm leading-6 text-muted-foreground">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="px-6 pb-6">{children}</CardContent>
    </Card>
  )
}

function RadioOption({
  name,
  value,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string
  value: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[1.35rem] bg-background/80 px-4 py-2.5 text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition-all hover:bg-accent/70 dark:bg-background/60",
        checked &&
          "bg-primary/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_32%,transparent)]",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1 size-4 accent-primary"
      />
      <span className="text-sm leading-6 font-medium text-foreground">
        {label}
      </span>
    </label>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-current", className)}
      aria-hidden
    >
      <path d="M15.152 16.689C15.624 16.62 16.609 16.088 16.816 15.517C17.022 14.946 17.022 14.454 16.965 14.345C16.9021 14.2547 16.7652 14.1894 16.5551 14.0891C16.5347 14.0794 16.5137 14.0694 16.492 14.059C16.246 13.931 15.034 13.34 14.808 13.261C14.582 13.172 14.415 13.133 14.257 13.379C14.1221 13.5777 13.7877 13.9759 13.5913 14.2098C13.5445 14.2655 13.5056 14.3119 13.479 14.344C13.331 14.511 13.193 14.531 12.947 14.403C12.91 14.3852 12.8604 14.3643 12.7997 14.3387C12.4577 14.1944 11.763 13.9014 10.968 13.182C10.229 12.532 9.73702 11.724 9.59902 11.478C9.46378 11.2532 9.56736 11.1353 9.67627 11.0113C9.68654 10.9996 9.69686 10.9879 9.70702 10.976C9.97302 10.651 10.239 10.306 10.318 10.139C10.397 9.97199 10.357 9.83399 10.298 9.70599C10.2624 9.63476 10.069 9.16486 9.87575 8.69534C9.74888 8.38708 9.62207 8.07899 9.54002 7.88399C9.36267 7.44785 9.17631 7.45466 9.03281 7.4599C9.01772 7.46045 9.00311 7.46099 8.98902 7.46099C8.84103 7.45099 8.67404 7.45099 8.51605 7.45099C8.34805 7.45099 8.08202 7.50999 7.85602 7.75599C7.84347 7.76959 7.82968 7.78428 7.81484 7.8001C7.56127 8.0703 6.99902 8.66941 6.99902 9.80399C6.99902 11.016 7.87502 12.188 8.00302 12.355C8.00802 12.3621 8.0157 12.3734 8.02601 12.3885C8.25931 12.7305 9.84068 15.049 12.208 16.068C12.7463 16.3052 13.1824 16.4496 13.5259 16.5634C13.5532 16.5725 13.5799 16.5813 13.606 16.59C14.197 16.778 14.729 16.748 15.152 16.689Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 12C2 6.48 6.49 2 12 2C14.67 2 17.18 3.039 19.07 4.929C20.96 6.819 22 9.329 22 11.999C22 17.519 17.51 21.999 12 21.999H11.989C10.319 21.999 8.679 21.579 7.219 20.789L3.619 21.624C2.885 21.794 2.233 21.122 2.427 20.393L3.33 17C2.46 15.48 2 13.76 2 12ZM17.656 6.344C16.144 4.833 14.136 4 12 4C7.589 4 4 7.589 4 12C4 13.403 4.369 14.788 5.065 16.007L5.473 16.72L4.787 19.301L7.506 18.671L8.172 19.031C9.343 19.665 10.664 20 11.99 20C16.411 20 20 16.411 20 12C20 9.865 19.167 7.856 17.656 6.344Z"
      />
    </svg>
  )
}

function StickySurveyNavbar({
  onBack,
  onShare,
}: {
  onBack: () => void
  onShare: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background shadow-[0_4px_14px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.28)]">
      <div className="flex h-[76px] items-center gap-3 px-5 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="स्क्रीन बंद करें"
          className="inline-flex size-10 shrink-0 items-center justify-center text-foreground"
        >
          <ArrowLeftIcon className="size-7" strokeWidth={2.2} />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-left text-[1.45rem] leading-none font-semibold tracking-[-0.02em] text-foreground sm:text-[1.65rem]">
          भास्कर सर्वे
        </h1>

        <button
          type="button"
          onClick={onShare}
          aria-label="WhatsApp पर शेयर करें"
          className="inline-flex size-10 shrink-0 items-center justify-center text-foreground"
        >
          <WhatsAppIcon className="size-7" />
        </button>
      </div>
    </header>
  )
}

function CompletionScreen({
  variant,
  onClose,
  onShare,
}: {
  variant: "submitted" | "already"
  onClose: () => void
  onShare: () => void
}) {
  const title =
    variant === "submitted"
      ? "दैनिक भास्कर सर्वे में हिस्सा लेने के लिए धन्यवाद"
      : "आप दैनिक भास्कर के सर्वे में हिस्सा ले चुके हैं"

  return (
    <main className="min-h-svh bg-muted px-0 py-0 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col bg-background sm:min-h-[720px] sm:rounded-[2rem] sm:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <StickySurveyNavbar onBack={onClose} onShare={onShare} />

        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col px-4 pt-20 pb-10 sm:pt-16">
          <img
            src="/webview-survey/submitted-illustration.svg"
            alt="Submitted"
            className="mx-auto size-24"
          />
          <h2 className="mt-6 text-center text-3xl leading-[1.5] font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-4 text-center text-[1.25rem] leading-[1.5] text-muted-foreground">
            सर्वे के परिणाम जल्द दैनिक भास्कर एप पर पब्लिश किए जाएंगे
          </p>

          <Button
            type="button"
            onClick={onShare}
            className="mt-10 h-12 w-full rounded-lg bg-[#3E9E3E] px-4 text-base font-semibold text-white hover:bg-[#378f37]"
          >
            <span className="inline-flex items-center gap-3">
              <img
                src="/webview-survey/whatsapp-icon.svg"
                alt="WhatsApp"
                className="size-6"
              />
              सर्वे दोस्तों से शेयर करें
            </span>
          </Button>
        </div>
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
    <main className="min-h-svh bg-muted px-0 py-0 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col bg-background sm:min-h-[720px] sm:rounded-[2rem] sm:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <StickySurveyNavbar onBack={onBack} onShare={onShare} />

        <div className="flex flex-1 items-center justify-center px-5 py-6 sm:px-6">
          <LoaderIcon className="size-14 animate-spin text-muted-foreground" />
        </div>
      </div>
    </main>
  )
}

export function WebviewSurvey() {
  const { getAppUserData, triggerLogin, closeScreen, shareView } =
    useWebviewContext()
  const [user, setUser] = useState<WebviewUser | null>(null)
  const [submission, setSubmission] = useState<SurveyResponse | null>(null)
  const [submissionVariant, setSubmissionVariant] = useState<
    "submitted" | "already" | null
  >(null)
  const [status, setStatus] = useState<
    "loading" | "ready" | "signed-out" | "error"
  >("loading")
  const [error, setError] = useState<string | null>(null)
  const [formState, setFormState] = useState<SurveyFormState>(emptyFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const loginTriggeredRef = useRef(false)
  const cmFaceOtherInputRef = useRef<HTMLInputElement>(null)

  usePullToRefreshDisabler()

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
            setSubmission(null)
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

        const data = await requestJson<{ submission: SurveyResponse | null }>(
          `/api/webview/survey?userId=${encodeURIComponent(nextUser.id)}&phoneNumber=${encodeURIComponent(nextUser.phoneNumber)}`
        )

        stopPolling()

        if (!cancelled) {
          setUser(nextUser)
          setSubmission(data.submission)
          setSubmissionVariant(data.submission ? "already" : null)
          setStatus("ready")
          setError(null)
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
  }, [getAppUserData])

  useEffect(() => {
    if (status !== "signed-out" || loginTriggeredRef.current) {
      return
    }

    loginTriggeredRef.current = true

    try {
      triggerLogin({
        loginMessage: "सर्वे भरने के लिए लॉगिन करें",
        source: "survey_webview",
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "लॉगिन स्क्रीन नहीं खुल सकी।"
      )
    }
  }, [status, triggerLogin])

  useEffect(() => {
    if (formState.cmFace !== CM_FACE_OTHER_VALUE) {
      return
    }

    const focusTimer = window.setTimeout(() => {
      const input = cmFaceOtherInputRef.current

      if (!input) {
        return
      }

      input.focus()
      input.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 80)

    return () => {
      window.clearTimeout(focusTimer)
    }
  }, [formState.cmFace])

  function updateField<K extends keyof SurveyFormState>(
    key: K,
    value: SurveyFormState[K]
  ) {
    setFormState((current) => {
      if (key === "cmFace" && value !== CM_FACE_OTHER_VALUE) {
        return {
          ...current,
          cmFace: value,
          cmFaceOther: "",
        }
      }

      return {
        ...current,
        [key]: value,
      }
    })
  }

  function openLogin() {
    loginTriggeredRef.current = true
    setError(null)
    triggerLogin({
      loginMessage: "सर्वे भरने के लिए लॉगिन करें",
      source: "survey_webview",
    })
  }

  function closeSurveyScreen() {
    try {
      closeScreen()
    } catch {
      window.history.back()
    }
  }

  function shareSurvey() {
    const shareLink = "https://dainik.bhaskar.com/iFYhPuOq71b"
    const shareTextAndLink = `*बिहार CM पर भास्कर का सबसे बड़ा सर्वे*: सम्राट या निशांत कौन है आपकी पसंद, किस जाति का मुख्यमंत्री हो, बताइए अपनी राय - ${shareLink}`
    const imageUrl =
      "https://images.bhaskarassets.com/thumb/400x226/web2images/521/2026/04/06/comp-16_1775433542.gif"

    try {
      shareView({
        imageUrl,
        shareTextAndLink,
      })
    } catch {
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareTextAndLink)}`
      window.open(whatsappUrl, "_blank", "noopener,noreferrer")
    }
  }

  const cmFace =
    formState.cmFace === CM_FACE_OTHER_VALUE
      ? formState.cmFaceOther.trim()
      : formState.cmFace

  const isFormComplete = Boolean(
    cmFace &&
    formState.cmCaste &&
    formState.cmQuality &&
    formState.nitishShouldStepDown &&
    formState.nitishTenurePreference
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user || isSubmitting) {
      return
    }

    if (
      !cmFace ||
      !formState.cmCaste ||
      !formState.cmQuality ||
      !formState.nitishShouldStepDown ||
      !formState.nitishTenurePreference
    ) {
      setError("कृपया सभी जरूरी सवालों के जवाब भरें।")
      return
    }

    setIsSubmitting(true)
    setError(null)

    void (async () => {
      try {
        const data = await requestJson<{ submission: SurveyResponse }>(
          "/api/webview/survey",
          {
            method: "POST",
            body: JSON.stringify({
              userId: user.id,
              userName: user.name,
              phoneNumber: user.phoneNumber,
              cmFace,
              cmCaste: formState.cmCaste,
              cmQuality: formState.cmQuality,
              nitishShouldStepDown: formState.nitishShouldStepDown,
              nitishTenurePreference: formState.nitishTenurePreference,
            }),
          }
        )

        setSubmission(data.submission)
        setSubmissionVariant("submitted")
        setFormState(emptyFormState)
      } catch (err) {
        if (err instanceof RequestError && err.status === 409) {
          const existing = (err.data as { submission?: SurveyResponse | null })
            ?.submission

          if (existing) {
            setSubmission(existing)
            setSubmissionVariant("already")
            setError(null)
            return
          }
        }

        setError(
          err instanceof Error ? err.message : "सर्वे सबमिट नहीं हो सका।"
        )
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  if (status === "ready" && submission) {
    return (
      <CompletionScreen
        variant={submissionVariant ?? "already"}
        onClose={closeSurveyScreen}
        onShare={shareSurvey}
      />
    )
  }

  if (status === "loading") {
    return <LoadingScreen onBack={closeSurveyScreen} onShare={shareSurvey} />
  }

  return (
    <main className="min-h-svh bg-muted px-0 py-0 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col bg-background sm:min-h-0 sm:rounded-[2rem] sm:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <StickySurveyNavbar onBack={closeSurveyScreen} onShare={shareSurvey} />

        <div className="flex flex-1 flex-col gap-5 px-5 py-5 sm:px-6 sm:py-6">
          <div className="overflow-hidden rounded-[1.5rem]">
            <img
              src="https://lh7-rt.googleusercontent.com/formsz/AN7BsVC68_P8V8-SuxyliQ0VDxERT3MDt7nEkFWXrkKtpoKOmjquZ5EisAKnFhPITzEG8EVgUs8SXgxXwUzl3f5igjuFTRBXiprmWmW-GWNA501Sz8X0tSTWg5daieB_GQm-LOA--wAEVqce1fIqcW3YVDNJxb7iCXSikUEiIHR-1_j56H9JcFxRNfJ63XSQpd1IGHm8eeGNxK9td37U=w670?key=y-tRBo9_eJp4oFp0rZTREg"
              alt="Survey banner"
              className="block h-28 w-full object-contain sm:h-36 sm:object-cover"
            />
          </div>

          <div className="space-y-3 px-1">
            <h1 className="text-[2rem] leading-tight font-semibold text-foreground sm:text-[2.4rem]">
              {SURVEY_TITLE}
            </h1>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">
              {SURVEY_DESCRIPTION}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <Badge className="rounded-full bg-primary/10 px-3 py-1 text-primary hover:bg-primary/10">
                * सभी सवाल जरूरी हैं
              </Badge>
              {isSubmitting ? (
                <span className="text-muted-foreground">
                  सबमिट हो रहा है...
                </span>
              ) : null}
            </div>
          </div>

          {error ? (
            <Card className="rounded-[1.5rem] border-destructive/20 bg-destructive/5 py-0">
              <CardContent className="flex items-start gap-3 p-5 text-sm text-destructive">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </CardContent>
            </Card>
          ) : null}

          {status === "signed-out" ? (
            <Card className="rounded-[1.5rem] border-0 py-0">
              <CardContent className="flex flex-col items-start gap-4 p-6 sm:p-8">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <SmartphoneIcon className="size-6" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold text-foreground">
                    लॉगिन जरूरी है
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    इस सर्वे को भरने के लिए ऐप में लॉगिन करें। लॉगिन स्क्रीन
                    खोलने के लिए नीचे वाले बटन का इस्तेमाल करें।
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={openLogin}
                  className="rounded-2xl px-6"
                >
                  लॉगिन करें
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {status === "ready" && !submission ? (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <QuestionCard title={SURVEY_LABELS.cmFace}>
                <div className="space-y-1.5">
                  {CM_FACE_OPTIONS.map((option) => (
                    <RadioOption
                      key={option}
                      name="cmFace"
                      value={option}
                      label={option}
                      checked={formState.cmFace === option}
                      disabled={isSubmitting}
                      onChange={(value) => updateField("cmFace", value)}
                    />
                  ))}
                  <RadioOption
                    name="cmFace"
                    value={CM_FACE_OTHER_VALUE}
                    label="अन्य"
                    checked={formState.cmFace === CM_FACE_OTHER_VALUE}
                    disabled={isSubmitting}
                    onChange={(value) => updateField("cmFace", value)}
                  />
                </div>

                {formState.cmFace === CM_FACE_OTHER_VALUE ? (
                  <Input
                    ref={cmFaceOtherInputRef}
                    value={formState.cmFaceOther}
                    onChange={(event) =>
                      updateField("cmFaceOther", event.target.value)
                    }
                    placeholder="अपना जवाब लिखें"
                    className="mt-4 h-12 rounded-2xl border-border bg-background"
                    disabled={isSubmitting}
                  />
                ) : null}
              </QuestionCard>

              <QuestionCard title={SURVEY_LABELS.cmCaste}>
                <div className="space-y-1.5">
                  {CM_CASTE_OPTIONS.map((option) => (
                    <RadioOption
                      key={option}
                      name="cmCaste"
                      value={option}
                      label={option}
                      checked={formState.cmCaste === option}
                      disabled={isSubmitting}
                      onChange={(value) => updateField("cmCaste", value)}
                    />
                  ))}
                </div>
              </QuestionCard>

              <QuestionCard title={SURVEY_LABELS.cmQuality}>
                <div className="space-y-1.5">
                  {CM_QUALITY_OPTIONS.map((option) => (
                    <RadioOption
                      key={option}
                      name="cmQuality"
                      value={option}
                      label={option}
                      checked={formState.cmQuality === option}
                      disabled={isSubmitting}
                      onChange={(value) => updateField("cmQuality", value)}
                    />
                  ))}
                </div>
              </QuestionCard>

              <QuestionCard title={SURVEY_LABELS.nitishShouldStepDown}>
                <div className="space-y-1.5">
                  {NITISH_STEP_DOWN_OPTIONS.map((option) => (
                    <RadioOption
                      key={option}
                      name="nitishShouldStepDown"
                      value={option}
                      label={option}
                      checked={formState.nitishShouldStepDown === option}
                      disabled={isSubmitting}
                      onChange={(value) =>
                        updateField("nitishShouldStepDown", value)
                      }
                    />
                  ))}
                </div>
              </QuestionCard>

              <QuestionCard title={SURVEY_LABELS.nitishTenurePreference}>
                <div className="space-y-1.5">
                  {NITISH_TENURE_OPTIONS.map((option) => (
                    <RadioOption
                      key={option}
                      name="nitishTenurePreference"
                      value={option}
                      label={option}
                      checked={formState.nitishTenurePreference === option}
                      disabled={isSubmitting}
                      onChange={(value) =>
                        updateField("nitishTenurePreference", value)
                      }
                    />
                  ))}
                </div>
              </QuestionCard>

              <div className="sticky bottom-0 -mx-5 mt-8 bg-background/95 px-5 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting || !isFormComplete}
                  aria-busy={isSubmitting}
                  className="h-14 w-full rounded-2xl text-lg font-semibold"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner className="size-5" aria-hidden="true" />
                      <span>सबमिट हो रहा है...</span>
                    </>
                  ) : (
                    "सबमिट"
                  )}
                </Button>
              </div>
            </form>
          ) : null}

          {status === "error" ? (
            <div className="flex justify-start pb-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                className="rounded-2xl"
              >
                फिर से कोशिश करें
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
