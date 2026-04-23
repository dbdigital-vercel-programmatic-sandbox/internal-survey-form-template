import fs from "fs"
import path from "path"
import AWS from "aws-sdk"
import mime from "mime-types"

const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, "")
const DEFAULT_CONCURRENT_UPLOADS = 20
const parsedConcurrency = Number(
  process.env.APP_BUILDER_S3_UPLOAD_CONCURRENCY ?? DEFAULT_CONCURRENT_UPLOADS
)
const MAX_CONCURRENT_UPLOADS =
  Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
    ? Math.floor(parsedConcurrency)
    : DEFAULT_CONCURRENT_UPLOADS
const BUILD_DIR = ".next/static"

function getRequiredEnv(name) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

const BUCKET = getRequiredEnv("APP_BUILDER_S3_BUCKET")
const vercelUrl = getRequiredEnv("VERCEL_URL").replace(/^\/+|\/+$/g, "")
const CDN_URL = cdnUrl ? `${cdnUrl}/${vercelUrl}` : ""

const s3 = new AWS.S3({
  accessKeyId: getRequiredEnv("APP_BUILDER_AWS_ACCESS_KEY_ID"),
  secretAccessKey: getRequiredEnv("APP_BUILDER_AWS_SECRET_ACCESS_KEY"),
  region: getRequiredEnv("APP_BUILDER_AWS_REGION"),
})

function getStaticFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)

    return entry.isDirectory() ? getStaticFiles(fullPath) : [fullPath]
  })
}

function getS3Key(filePath) {
  return path.posix.join(
    vercelUrl,
    "_next/static",
    path.relative(BUILD_DIR, filePath).split(path.sep).join("/")
  )
}

async function uploadFile(filePath) {
  const fileContent = fs.readFileSync(filePath)
  const key = getS3Key(filePath)
  const contentType = mime.lookup(filePath) || "application/octet-stream"

  await s3
    .putObject({
      Bucket: BUCKET,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
    .promise()

  console.log("Uploaded:", CDN_URL ? `${CDN_URL}/${key}` : key)
}

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0

  async function runWorker() {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await worker(item)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker)
  )
}

async function uploadDir(dir) {
  await runWithConcurrency(
    getStaticFiles(dir),
    MAX_CONCURRENT_UPLOADS,
    uploadFile
  )
}

async function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    throw new Error(`Build directory not found: ${BUILD_DIR}`)
  }

  await uploadDir(BUILD_DIR)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
