const isProd = process.env.NODE_ENV === "production"
const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, "")
const vercelUrl = process.env.VERCEL_URL?.replace(/^\/+|\/+$/g, "")

/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: isProd && cdnUrl && vercelUrl ? `https://${cdnUrl}/${vercelUrl}` : "",
}

export default nextConfig
