# Pixel Motion Gallery

This is a static GitHub Pages gallery for Google Pixel Motion Photos.

Pixel Motion Photos are not plain videos. Android's Motion Photo format stores a still image plus an appended short video in one file, with XMP metadata saying where the video starts. This project extracts the motion part during the build so a browser can play it, but the public page presents each item as one Motion Photo: still first, motion in the same frame, then back to the still.

## Add Your Photos

Put original Pixel Motion Photo files in `incoming/` while importing and reviewing them. That folder is ignored by Git so private/raw imports do not get published by accident.

After review, copy only public-safe selections into `curated/`. The GitHub Pages build reads from `curated/`, not `incoming/`.

The filenames often look like:

```text
PXL_20260531_123456789.MP.jpg
PXL_20260531_123456789.MP.JPG
```

Use the original files from the phone when possible. Some sharing paths flatten Motion Photos into ordinary still JPEGs.

On macOS, Android phones do not usually appear as normal Finder drives. Use OpenMTP and copy from the phone's `DCIM/Camera` folder into this project's `incoming/` folder:

```text
/Users/boxer/Documents/Codex/2026-05-31/i-have-a-bunch-of-pixel/outputs/pixel-motion-gallery/incoming
```

Keep the phone unlocked and set USB Preferences to **File transfer / Android Auto**.

On this Pixel/Mac setup, USB import worked best after a clean unplug/replug with transfer apps closed. The phone may need **USB controlled by connected device** for the computer to host the transfer session.

## Build Locally

```sh
npm run build
npm run serve
```

Open the printed localhost URL. The generated static site is in `site/`.

## Publish On GitHub

1. Create a new GitHub repository.
2. Upload this whole folder to the repository.
3. Upload your original Pixel Motion Photo files into `incoming/`.
4. In repository settings, enable GitHub Pages with **GitHub Actions** as the source.
5. Push to `main`, or run the `Publish Pixel Motion Gallery` workflow manually.

The GitHub Action builds `site/` and deploys it as a static page.

## What The Build Does

- Reads `.jpg`, `.jpeg`, `.heic`, and `.avif` files from `incoming/`.
- Looks for Motion Photo XMP metadata.
- Extracts the appended `video/mp4` or `video/quicktime` payload.
- Writes browser-ready still frames to `site/assets/stills/`.
- Writes browser-playable hidden motion clips to `site/assets/motion/`.
- Writes `site/gallery.json` for the gallery UI.

If a file has no motion payload, it still appears as a normal still image.

## Notes

Browser video support depends on the codec Pixel used inside the extracted MP4. If one clip does not play in a browser, it can usually be transcoded to browser-friendly H.264 later while keeping the same gallery structure.
