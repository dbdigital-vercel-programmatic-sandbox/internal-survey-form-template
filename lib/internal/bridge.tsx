"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ============================================================================
 * Webview Native Bridge for Third-Party Coding Agents
 * ============================================================================
 *
 * PURPOSE:
 * This file provides a React context/provider that exposes a curated subset of
 * native app bridge methods to web content running inside Android/iOS webviews.
 * The native app injects interfaces on the `window` object (`AndroidInterface`
 * on Android, `webkit.messageHandlers` on iOS). This module wraps those raw
 * interfaces into a type-safe React context so components can consume native
 * functionality via hooks.
 *
 * AVAILABLE FUNCTIONALITY:
 * - `isWebview` / `isAndroidClient` / `isIOSClient` — platform detection flags
 * - `getAppUserData()` — returns authenticated user & device info from the app
 * - `closeScreen()` — closes the current webview screen in the native app
 * - `enablePullToRefresh(val)` — enable/disable native pull-to-refresh gesture
 * - `openViaDeepLinkJsonData(jsonData)` — open a native screen via deep link
 * - `triggerLogin({ loginMessage, source })` — opens the native login screen
 * - `shareView(imageUrl, shareTextAndLink?)` — triggers native share sheet
 *
 * HOOKS (derived from the context):
 * - `useWebviewContext()` — access all bridge methods and flags
 * - `useIsWebview()` — boolean, whether running inside a webview
 * - `useIsUserSignedIn(pollingInterval?)` — polls app for sign-in status
 * - `usePullToRefreshDisabler()` — disables pull-to-refresh on mount, re-enables on unmount
 *
 * HOW TO USE:
 * Import `WebviewProvider` and wrap your webview routes/children in a layout file:
 *
 *   ```tsx
 *   // app/webview/layout.tsx
 *   import { WebviewProvider } from "@/bridge";
 *
 *   export default function Layout({ children }: { children: React.ReactNode }) {
 *     return <WebviewProvider>{children}</WebviewProvider>;
 *   }
 *   ```
 *
 * Then consume inside any child component:
 *
 *   ```tsx
 *   import { useWebviewContext } from "@/bridge";
 *
 *   function MyComponent() {
 *     const { closeScreen, getAppUserData } = useWebviewContext();
 *     // ...
 *   }
 *   ```
 *
 * ⚠️  IMPORTANT INSTRUCTIONS FOR LLM / CODING AGENTS:
 * 1. DO NOT modify this file. It is a stable API surface for webview integration.
 *    If you need additional bridge methods, ask the user — they will update this
 *    file manually.
 * 2. DO NOT hallucinate or invent parameters for bridge methods. Every method's
 *    signature is strictly typed below. If you are unsure about a method's
 *    parameters or return type, ask the user for clarification.
 * 3. Only use the exports from this file: WebviewProvider, useWebviewContext,
 *    useIsWebview, useIsUserSignedIn, usePullToRefreshDisabler.
 * 4. `triggerLogin` is available via `useWebviewContext()`. It accepts
 *    `{ loginMessage: string; source: string }` — do not invent extra fields.
 * ============================================================================
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { LoaderIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Native bridge interface detection
// ---------------------------------------------------------------------------

const android = (globalThis?.window as any)?.AndroidInterface
const ios = (globalThis?.window as any)?.webkit?.messageHandlers

const isWebview = !!(android || ios?.openFullWeb)
const isAndroidClient = !!android
const isIOSClient = !!ios?.openFullWeb

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const getUniqueCallbackMethod = (callback: (res: any) => void): string => {
  const win: any = globalThis.window
  if (!win) {
    return ""
  }

  const functionName: any = `fn${Math.floor(Math.random() * 10000000000)}`
  win[functionName] = callback

  return functionName
}

// ---------------------------------------------------------------------------
// Bridge methods
// ---------------------------------------------------------------------------

const closeScreen = () => {
  if (isAndroidClient) {
    if (android.closeScreenV2) {
      android.closeScreenV2()
      return
    }
    android.closeScreen()
  } else {
    if (ios.closeScreenV2) {
      ios.closeScreenV2.postMessage("")
      return
    }
    ios.closeScreen.postMessage("")
  }
}

interface IAppUserData {
  db_id: string // unique id assigned to device, e.g. '2232343'
  app_version: string // version name of app, e.g. '7.0'
  app_version_code: string // version code of app, e.g. '390'
  app_platform: string // 'android' or 'ios'
  auth_token: string // auth token of app, e.g. 'a6oaq3edtz59'
  user?: {
    unique_id: string
    is_signed_in: boolean
    phone_number: string // e.g. '+917906097279'
    user_name: string
    photo_url: string
  }
}

const getAppUserData = (): Promise<IAppUserData> => {
  return new Promise((resolve) => {
    if (isAndroidClient) {
      if (android.getAppUserDataV2) {
        resolve(JSON.parse(android.getAppUserDataV2()))
        return null
      }
      resolve(android.getAppUserData())
      return null
    }
    const callback = getUniqueCallbackMethod((res) => {
      resolve(res)
      return ""
    })

    if (ios.getAppUserDataV2) {
      ios.getAppUserDataV2.postMessage({ callback })
      return null
    }

    ios.getAppUserData.postMessage({ callback })
  })
}

const enablePullToRefresh = (val: boolean) => {
  if (isAndroidClient) {
    return android.enablePullToRefresh(`${val}`)
  }

  return ios.enablePullToRefresh.postMessage(`${val}`)
}

const triggerLogin = (params: { loginMessage: string; source: string }) => {
  openViaDeepLinkJsonData({
    jsonData: {
      link: {
        uri: "bhaskar://login/",
        data: {
          loginMessage: params.loginMessage,
          skipLogin: "false",
          source: params.source,
        },
      },
    },
    source: params.source,
  })
}

const openViaDeepLinkJsonData = (jsonData: any) => {
  try {
    if (isAndroidClient) {
      if (android.openViaDeepLinkJsonData) {
        android.openViaDeepLinkJsonData(JSON.stringify(jsonData))
      }
      return
    }

    if (ios.openViaDeepLinkJsonData) {
      ios.openViaDeepLinkJsonData.postMessage(jsonData)
    }
  } catch (err) {
    console.error(err)
  }
}

/**
 * Trigger native share sheet.
 * @param imageUrl      — optional image to share
 * @param shareTextAndLink — optional text+link template, e.g. "*Headline text* — <link>"
 */
const shareView = (params: {
  imageUrl?: string
  shareTextAndLink?: string
}) => {
  if (isWebview) {
    const payload = {
      imageUrl: params.imageUrl,
      overrideTemplate: params.shareTextAndLink,
    }
    if (isAndroidClient) {
      android.shareArticleV2?.(JSON.stringify(payload))
    } else {
      ios.shareArticleV2?.postMessage(payload)
    }
  } else {
    navigator.share?.({
      text: params.shareTextAndLink,
    })
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface WebviewContextValue {
  isWebview: boolean
  isAndroidClient: boolean
  isIOSClient: boolean
  getAppUserData: () => Promise<IAppUserData>
  closeScreen: () => void
  enablePullToRefresh: (val: boolean) => void
  openViaDeepLinkJsonData: (jsonData: any) => void
  triggerLogin: (params: { loginMessage: string; source: string }) => void
  shareView: (params: { imageUrl?: string; shareTextAndLink?: string }) => void
}

const WebviewContext = createContext<WebviewContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const mockContextValue: WebviewContextValue = {
  isWebview: true,
  isAndroidClient: true,
  isIOSClient: false,
  getAppUserData: () =>
    Promise.resolve({
      db_id: "0000000",
      app_version: "0.0",
      app_version_code: "0",
      app_platform: "android",
      auth_token: "mock_token",
      user: {
        unique_id: "mock_user",
        is_signed_in: true,
        phone_number: "+910000000000",
        user_name: "Mock User",
        photo_url: "",
      },
    }),
  closeScreen: () => {
    globalThis.window?.history?.back()
  },
  enablePullToRefresh: () => {
    throw new Error("enablePullToRefresh is not available in mock mode")
  },
  openViaDeepLinkJsonData: () => {
    throw new Error("openViaDeepLinkJsonData is not available in mock mode")
  },
  triggerLogin: () => {
    throw new Error("triggerLogin is not available in mock mode")
  },
  shareView: () => {
    throw new Error("shareView is not available in mock mode")
  },
}

export function WebviewProvider({
  children,
  mockInDevMode = process.env.NODE_ENV === "development",
}: {
  children: ReactNode
  mockInDevMode?: boolean
}) {
  if (!isWebview && !mockInDevMode) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-6">
        <LoaderIcon className="size-14 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <WebviewContext.Provider
      value={
        isWebview
          ? {
              isWebview,
              isAndroidClient,
              isIOSClient,
              getAppUserData,
              closeScreen,
              enablePullToRefresh,
              openViaDeepLinkJsonData,
              triggerLogin,
              shareView,
            }
          : mockContextValue
      }
    >
      {children}
    </WebviewContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useWebviewContext(): WebviewContextValue {
  const ctx = useContext(WebviewContext)
  if (!ctx) {
    throw new Error("useWebviewContext must be used within a <WebviewProvider>")
  }
  return ctx
}

export const useIsWebview = () => {
  const [webview, setWebview] = useState(true)
  useEffect(() => {
    setWebview(isWebview)
  }, [])

  return webview
}

export const useIsUserSignedIn = (pollingInterval: number = 250) => {
  const [isUserSignedIn, setIsUserSignedIn] = useState<boolean | undefined>(
    undefined
  )
  const [appUserData, setAppUserData] = useState<IAppUserData | null>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    let isRunning = false

    const run = async () => {
      if (isRunning) return
      isRunning = true
      try {
        if (!isWebview) {
          setIsUserSignedIn(false)
          isRunning = false
          return
        }

        const userData = await getAppUserData()
        setAppUserData(userData)
        const signedIn = !!userData.user?.is_signed_in
        setIsUserSignedIn(signedIn)

        if (signedIn && interval) {
          clearInterval(interval)
          interval = null
        }
      } finally {
        isRunning = false
      }
    }

    run()
    interval = setInterval(run, pollingInterval)
    return () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
  }, [pollingInterval])

  return { isUserSignedIn, appUserData }
}

export const usePullToRefreshDisabler = () => {
  useEffect(() => {
    if (isWebview) {
      enablePullToRefresh(false)
    }

    return () => {
      if (isWebview) {
        enablePullToRefresh(true)
      }
    }
  }, [])
}
