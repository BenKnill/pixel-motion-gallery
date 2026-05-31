const gallery = document.querySelector("#gallery");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#gallery-count");
const intro = document.querySelector("#gallery-intro");
const modeButtons = [...document.querySelectorAll(".mode-button")];

let mode = "tap";

const response = await fetch("./gallery.json", { cache: "no-store" }).catch(() => null);
const items = response?.ok ? await response.json() : [];
const metaResponse = await fetch("./gallery-meta.json", { cache: "no-store" }).catch(() => null);
const meta = metaResponse?.ok ? await metaResponse.json() : {};

count.textContent = `${items.length} ${items.length === 1 ? "piece" : "pieces"}`;
intro.textContent = meta.intro || "";
intro.hidden = !intro.textContent;
emptyState.hidden = items.length !== 0;

for (const item of items) {
  gallery.append(renderTile(item));
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    modeButtons.forEach((other) => other.classList.toggle("active", other === button));
    document.querySelectorAll(".tile").forEach((tile) => stop(tile));

    if (mode === "loop") {
      document.querySelectorAll(".tile[data-motion='true']").forEach((tile) => play(tile, true));
    }
  });
});

function renderTile(item) {
  const tile = document.createElement("article");
  tile.className = "tile";
  tile.dataset.motion = String(Boolean(item.motion));

  const button = document.createElement("button");
  button.className = "media-button";
  button.type = "button";
  button.setAttribute("aria-label", item.motion ? `Play ${item.title}` : item.title);

  const frame = document.createElement("div");
  frame.className = "media-frame";

  const image = document.createElement("img");
  image.src = item.still;
  image.alt = item.title;
  image.loading = "lazy";
  image.decoding = "async";
  frame.append(image);

  if (item.motion) {
    const video = document.createElement("video");
    video.src = item.motion;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.loop = false;
    video.addEventListener("ended", () => stop(tile));
    frame.append(video);

    const badge = document.createElement("span");
    badge.className = "motion-badge";
    badge.textContent = "Motion Photo";
    frame.append(badge);

    button.addEventListener("click", () => {
      if (mode === "tap") toggle(tile);
    });
    tile.addEventListener("mouseenter", () => {
      if (mode === "hover") play(tile);
    });
    tile.addEventListener("mouseleave", () => {
      if (mode === "hover") stop(tile);
    });
  }

  button.append(frame);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.innerHTML = `<div><strong title="${escapeHtml(item.originalName)}">${escapeHtml(item.title)}</strong>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</div><span>${item.motion ? "Motion Photo" : "Photo"}</span>`;

  tile.append(button, caption);
  return tile;
}

function toggle(tile) {
  if (tile.classList.contains("playing")) {
    stop(tile);
  } else {
    play(tile);
  }
}

function play(tile, loopMode = false) {
  const video = tile.querySelector("video");
  if (!video) return;
  video.loop = loopMode;
  tile.classList.toggle("looping", loopMode);
  tile.classList.add("playing");
  video.play().catch(() => {
    tile.classList.remove("playing", "looping");
  });
}

function stop(tile) {
  const video = tile.querySelector("video");
  tile.classList.remove("playing", "looping");
  if (!video) return;
  video.pause();
  video.loop = false;
  video.currentTime = 0;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}
