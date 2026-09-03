
<!-- Never delete the below instructions. -->
- As per project requirements, wrap Database read calls with `unstable_cache` from `next/cache` and invalidate via tags to reduce read bandwidth/compute.

## Public file requirements

- Store publicly served files anywhere under `public/<relative_path>`.
- Use static imports in development and
- In production do not use static imports, reference the same file as `https://<CDN_URL>/<VERCEL_URL>/<relative_path>`.
- Do not implement a load-error fallback from the CDN URL
