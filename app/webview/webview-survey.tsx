"use client"

import Image from "next/image"
import { XIcon } from "lucide-react"

import { usePullToRefreshDisabler, useWebviewContext } from "@/bridge"

const BLOCKER_MESSAGE =
  "दैनिक भास्कर एप के सर्वे में शामिल होने का समय खत्म हो चुका है।"

export function WebviewSurvey() {
  const { closeScreen } = useWebviewContext()

  usePullToRefreshDisabler()

  function closeSurveyScreen() {
    try {
      closeScreen()
    } catch {
      window.history.back()
    }
  }

  return (
    <main className="min-h-svh bg-muted px-0 py-0 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col bg-background sm:min-h-[720px] sm:rounded-[2rem] sm:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <div className="flex justify-end px-4 pt-4 sm:px-5 sm:pt-5">
          <button
            type="button"
            onClick={closeSurveyScreen}
            aria-label="स्क्रीन बंद करें"
            className="inline-flex size-10 items-center justify-center text-[#7F7F7F]"
          >
            <XIcon className="size-8" strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="flex w-full max-w-[328px] flex-col items-center gap-10 text-center">
            <Image
              src="/webview-survey/expired-clock.svg"
              alt="समय समाप्त"
              width={96}
              height={96}
              className="size-24"
            />

            <h1 className="font-[Noto_Sans_Devanagari_UI] text-4xl leading-[1.5] font-semibold tracking-[-0.02em] text-[#2B2B2B] dark:text-white">
              {BLOCKER_MESSAGE}
            </h1>
          </div>
        </div>
      </div>
    </main>
  )
}
