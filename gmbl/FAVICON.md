# /gmbl favicon guidance

To add a favicon that only applies to the `/gmbl` section of the app, drop the artwork inside the route directory so Next.js can automatically serve it when that path is loaded.

- **Folder:** `app/gmbl/`
- **Required file:** `icon.png`
- **Recommended size:** 32×32 px (transparent background, square canvas)

If you want to supply additional formats, you can add matching files in the same folder:

- `icon.jpg` or `icon.webp` at 32×32 px if you prefer a raster format other than PNG.
- `icon.svg` for a vector version (any square viewBox works, but keep the art sized for 32×32 px when exported).

Next.js will automatically surface the `icon.*` file that lives alongside `page.tsx`, so no extra imports or metadata changes are needed once the file is in place.
