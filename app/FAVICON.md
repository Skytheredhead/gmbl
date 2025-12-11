# gmbl favicon guidance

To add a favicon for the standalone gmbl site, drop the artwork inside the root app directory so Next.js can automatically serve it for every route.

- **Folder:** `app/`
- **Required file:** `icon.png`
- **Recommended size:** 32×32 px (transparent background, square canvas)

If you want to supply additional formats, you can add matching files in the same folder:

- `icon.jpg` or `icon.webp` at 32×32 px if you prefer a raster format other than PNG.
- `icon.svg` for a vector version (any square viewBox works, but keep the art sized for 32×32 px when exported).

Next.js will automatically surface the `icon.*` file that lives alongside `page.tsx`, so no extra imports or metadata changes are needed once the file is in place.
