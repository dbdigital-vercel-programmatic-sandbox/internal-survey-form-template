import { WebviewClientProvider } from "./webview-client-provider"

export default function WebviewLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <WebviewClientProvider>{children}</WebviewClientProvider>
}
