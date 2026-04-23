"use client"

import { WebviewProvider } from "@/bridge"

export function WebviewClientProvider({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <WebviewProvider>{children}</WebviewProvider>
}
