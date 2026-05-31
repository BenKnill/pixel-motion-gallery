import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const inputDir = join(root, process.env.GALLERY_INPUT_DIR || "curated");
const srcDir = join(root, "src");
const siteDir = join(root, "site");
const stillDir = join(siteDir, "assets", "stills");
const motionDir = join(siteDir, "assets", "motion");
const curation = await readCuration();

const supported = new Set([".jpg", ".jpeg", ".heic", ".avif"]);

await rm(siteDir, { recursive: true, force: true });
await mkdir(stillDir, { recursive: true });
await mkdir(motionDir, { recursive: true });
await copyFile(join(srcDir, "index.html"), join(siteDir, "index.html"));
await copyFile(join(srcDir, "styles.css"), join(siteDir, "styles.css"));
await copyFile(join(srcDir, "app.js"), join(siteDir, "app.js"));

const files = (await readdir(inputDir))
  .filter((file) => supported.has(extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const gallery = [];

for (const file of files) {
  const path = join(inputDir, file);
  const bytes = await readFile(path);
  const info = extractMotionInfo(bytes);
  const slug = makeSlug(file, bytes);
  const ext = extname(file).toLowerCase() || ".jpg";
  const stillName = `${slug}${normalizeImageExt(ext)}`;
  const motionName = `${slug}.${info.motionMime === "video/quicktime" ? "mov" : "mp4"}`;

  if (info.videoStart !== null) {
    await writeFile(join(stillDir, stillName), stripMotionBytes(bytes, info.videoStart, ext));
    await writeFile(join(motionDir, motionName), bytes.subarray(info.videoStart));
  } else {
    await copyFile(path, join(stillDir, stillName));
  }

  gallery.push({
    title: curation.items?.[file]?.title || titleFromFile(file),
    note: curation.items?.[file]?.note || "",
    originalName: file,
    still: `./assets/stills/${stillName}`,
    motion: info.videoStart !== null ? `./assets/motion/${motionName}` : null,
    detectedBy: info.detectedBy,
    bytes: (await stat(path)).size
  });
}

await writeFile(join(siteDir, "gallery.json"), `${JSON.stringify(gallery, null, 2)}\n`);
await writeFile(join(siteDir, "gallery-meta.json"), `${JSON.stringify({ intro: curation.intro || "" }, null, 2)}\n`);

console.log(`Built ${gallery.length} gallery item${gallery.length === 1 ? "" : "s"} in ${siteDir}`);
const motionCount = gallery.filter((item) => item.motion).length;
console.log(`Detected ${motionCount} Pixel Motion Photo file${motionCount === 1 ? "" : "s"}.`);

function extractMotionInfo(buffer) {
  const xmp = extractXmp(buffer);
  const fromContainer = xmp ? parseContainerLength(xmp) : null;
  if (fromContainer) {
    return {
      videoStart: buffer.length - fromContainer.length,
      motionMime: fromContainer.mime,
      detectedBy: "xmp-container"
    };
  }

  const fromMicroVideo = xmp ? parseMicroVideoOffset(xmp) : null;
  if (fromMicroVideo) {
    return {
      videoStart: buffer.length - fromMicroVideo,
      motionMime: "video/mp4",
      detectedBy: "xmp-microvideo-offset"
    };
  }

  const fromFtyp = findLastMp4Start(buffer);
  if (fromFtyp !== null) {
    return {
      videoStart: fromFtyp,
      motionMime: "video/mp4",
      detectedBy: "mp4-ftyp-scan"
    };
  }

  return {
    videoStart: null,
    motionMime: null,
    detectedBy: "none"
  };
}

function extractXmp(buffer) {
  const ascii = buffer.toString("latin1");
  const start = ascii.indexOf("<x:xmpmeta");
  if (start === -1) return null;

  const closing = "</x:xmpmeta>";
  const end = ascii.indexOf(closing, start);
  if (end === -1) return null;

  return buffer.subarray(start, end + closing.length).toString("utf8");
}

function parseContainerLength(xmp) {
  const chunks = xmp.split(/<rdf:li\b/i);
  for (const chunk of chunks) {
    if (!/MotionPhoto/i.test(chunk) || !/video\/(?:mp4|quicktime)/i.test(chunk)) continue;

    const length = readNumberAttr(chunk, [
      "Item:Length",
      "GContainerItem:Length",
      "ContainerItem:Length"
    ]);
    if (!length) continue;

    const mime = readStringAttr(chunk, [
      "Item:Mime",
      "GContainerItem:Mime",
      "ContainerItem:Mime"
    ]) || "video/mp4";

    return { length, mime };
  }

  const videoNearLength = xmp.match(/video\/(?:mp4|quicktime)[\s\S]{0,800}?(?:Item|GContainerItem|ContainerItem):Length=["'](\d+)["']/i)
    || xmp.match(/(?:Item|GContainerItem|ContainerItem):Length=["'](\d+)["'][\s\S]{0,800}?video\/(?:mp4|quicktime)/i);

  if (!videoNearLength) return null;
  return {
    length: Number(videoNearLength[1]),
    mime: /video\/quicktime/i.test(videoNearLength[0]) ? "video/quicktime" : "video/mp4"
  };
}

function parseMicroVideoOffset(xmp) {
  const attribute = xmp.match(/(?:Camera|GCamera):MicroVideoOffset=["'](\d+)["']/i);
  if (attribute) return Number(attribute[1]);

  const element = xmp.match(/<(?:Camera|GCamera):MicroVideoOffset>(\d+)<\/(?:Camera|GCamera):MicroVideoOffset>/i);
  return element ? Number(element[1]) : null;
}

function readNumberAttr(text, names) {
  const value = readStringAttr(text, names);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readStringAttr(text, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}=["']([^"']+)["']`, "i"));
    if (match) return match[1];
  }
  return null;
}

function findLastMp4Start(buffer) {
  const marker = Buffer.from("ftyp", "ascii");
  for (let index = buffer.length - marker.length; index >= 4; index -= 1) {
    if (!buffer.subarray(index, index + marker.length).equals(marker)) continue;

    const start = index - 4;
    const boxSize = buffer.readUInt32BE(start);
    if (boxSize >= 8 && boxSize < 1024 && start > 0) {
      return start;
    }
  }
  return null;
}

function stripMotionBytes(buffer, videoStart, ext) {
  if (ext === ".jpg" || ext === ".jpeg") {
    for (let index = videoStart - 2; index >= 0; index -= 1) {
      if (buffer[index] === 0xff && buffer[index + 1] === 0xd9) {
        return buffer.subarray(0, index + 2);
      }
    }
  }

  if ((ext === ".heic" || ext === ".avif") && videoStart >= 8) {
    const boxType = buffer.subarray(videoStart - 4, videoStart).toString("ascii");
    if (boxType === "mpvd") {
      return buffer.subarray(0, videoStart - 8);
    }
  }

  return buffer.subarray(0, videoStart);
}

function makeSlug(file, bytes) {
  const base = basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "photo";
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

function normalizeImageExt(ext) {
  return ext === ".jpeg" ? ".jpg" : ext;
}

function titleFromFile(file) {
  return basename(file, extname(file))
    .replace(/(?:_?MP)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || file;
}

async function readCuration() {
  try {
    return JSON.parse(await readFile(join(root, "curation.json"), "utf8"));
  } catch {
    return { intro: "", items: {} };
  }
}
