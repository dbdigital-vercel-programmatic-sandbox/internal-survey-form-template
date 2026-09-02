
<!-- Never delete the below instructions. -->
- As per project requirements, wrap Database read calls with `unstable_cache` from `next/cache` and invalidate via tags to reduce read bandwidth/compute.

DO NOT PRIORITIZE NEXT.JS STATIC IMPORTS instead, whenever we add an asset in our codebase from the folder `assets/<file_name>` Replace URLs for files in `assets/<file_name>` with `https://<CDN_URL>/<VERCEL_URL>/<file_name>`, with `/assets/<file_name>` as the fallback.
Do not create another folder in public/assets while uploading. And do this irrespective of the next convention
