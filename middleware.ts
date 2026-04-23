import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set("x-url", request.url)
  return response
}

export const config = {
  matcher: ["/cms/:path*"],
}
