// Runs in Deezer's page world: it needs window.dzPlayer and Deezer's session cookies. Settings and translations
// arrive from the bridge (see bridge.ts); this script reports what it found back for the settings page.

import { listen, send } from "@/shared/protocol"
import {
  DEFAULT_SETTINGS,
  formatShortcut,
  nextInSeries,
  type Settings,
} from "@/shared/settings"

import { addSong, createPlaylist, NotLoggedInError, type Song } from "./api"
import {
  buildIndex,
  findCollection,
  remember,
  statusOf,
  type Index,
} from "./collection"
import { setMessages, t } from "./i18n"
import pageCss from "./page.css?inline"

const REFRESH_MS = 5 * 60 * 1000
const BUTTON_ID = "dzc-button"
const WRAPPER_ID = "dzc-wrapper"
const TOAST_ID = "dzc-toast"
const TOOLTIP_ID = "dzc-tooltip"

// Stroke icons matching Deezer's player icons: 24px viewBox, 16px wide like Deezer's "+",
// 1.33px strokes. The list glyph is top-heavy, so it sits 1 unit lower (5–21) to look centred.
const LIST = "M4 5.665h16M4 10.665h16M4 15.665h7.5"
const ADD = `${LIST}M17 15v6M14 18h6`
const ICONS = {
  absent: ADD,
  idle: ADD,
  present: `${LIST}M13 18l2.5 2.5 4.5-4.5`,
  loading: "M12 5a7 7 0 1 0 7 7",
  error: "M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16zM12 8v5M12 15v1.5",
}
type State = keyof typeof ICONS

declare global {
  interface Window {
    dzPlayer?: { getCurrentSong?: () => Song | null }
  }
}

let settings: Settings = DEFAULT_SETTINGS
let configured = false
let index: Index | null = null
let indexPromise: Promise<Index> | null = null
let indexError: Error | null = null
let busy = false
let lastSongId: string | number | null = null

// ---------------------------------------------------------------------------
// Collections index
// ---------------------------------------------------------------------------

function toError(err: unknown) {
  if (err instanceof NotLoggedInError) return new Error(t("errorNotLoggedIn"))
  return err instanceof Error ? err : new Error(String(err))
}

function refreshIndex() {
  indexPromise ??= buildIndex(settings)
    .then((result) => {
      index = result
      indexError = null
      return result
    })
    .catch((err: unknown) => {
      index = null
      // toError keeps SetupError instances: they carry the playlist list for the settings page.
      indexError = toError(err)
      throw indexError
    })
    .finally(() => {
      indexPromise = null
      send("bridge", { type: "status", status: statusOf(index, indexError) })
      render()
    })
  return indexPromise
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function getCurrentSong() {
  const song = window.dzPlayer?.getCurrentSong?.()
  // Only catalogue tracks (no podcasts, live radios or personal uploads with negative IDs).
  if (!song || song.__TYPE__ !== "song" || !(Number(song.SNG_ID) > 0))
    return null
  return song
}

/** In series mode, once the target is full, start the next playlist of the series and make it the target. */
async function rollOverIfFull(current: Index) {
  const { target } = current
  if (
    settings.mode !== "series" ||
    !settings.rollover ||
    target.count < settings.rolloverAt
  )
    return target
  const title = nextInSeries(target.title)
  const id = await createPlaylist(title, target.status)
  toast(t("toastCreated", target.title, title))
  current.target = { id, title, count: 0, status: target.status }
  current.collectionIds.push(id)
  return current.target
}

async function addCurrentSong() {
  if (busy) return
  const song = getCurrentSong()
  if (!song) {
    toast(t("toastNothingPlaying"), true)
    return
  }

  busy = true
  render()
  try {
    // Always re-check against fresh data: the song may have been added from elsewhere.
    const fresh = await refreshIndex()
    const existing = findCollection(fresh, song)
    if (existing) {
      toast(t("buttonPresent", existing))
      return
    }
    const target = await rollOverIfFull(fresh)
    await addSong(target.id, song.SNG_ID)
    target.count += 1
    remember(fresh.byId, fresh.byIsrc, song, target.title, settings)
    if (settings.toasts)
      toast(t("toastAdded", song.SNG_TITLE ?? "", target.title))
  } catch (err) {
    console.error("[Deezer Collection]", err)
    toast(t("toastError", toError(err).message), true)
  } finally {
    busy = false
    render()
  }
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

function getState(): { state: State; label: string } {
  const song = getCurrentSong()
  if (busy || (!index && !indexError))
    return { state: "loading", label: t("buttonChecking") }
  if (!index)
    return {
      state: "error",
      label: t("buttonUnavailable", indexError?.message ?? ""),
    }
  if (!song) return { state: "idle", label: t("buttonIdle") }
  const existing = findCollection(index, song)
  if (existing) return { state: "present", label: t("buttonPresent", existing) }
  const add = t("buttonAdd", index.target.title)
  return {
    state: "absent",
    label: settings.shortcutEnabled
      ? t("buttonShortcut", add, formatShortcut(settings.shortcut))
      : add,
  }
}

function getFavoriteButton() {
  return document.querySelector<HTMLElement>(
    '#page_player [data-testid^="add_to_favorite_button"]'
  )
}

const isOurs = (el: Element | null) =>
  !!el && (el.id === BUTTON_ID || el.id === WRAPPER_ID)

// Deezer may put each player action in its own wrapper, which carries the spacing and vertical
// alignment: mirror the favorite button's wrapper and classes instead of styling by hand.
// The button goes right after Deezer's "+" (add to playlist), which follows the heart.
function ensureButton() {
  const favorite = getFavoriteButton()
  if (!favorite) return null

  const button =
    (document.getElementById(BUTTON_ID) as HTMLButtonElement | null) ??
    createButton()
  const parent = favorite.parentElement
  const favoriteSlot =
    parent && parent.childElementCount === 1 && parent.id !== "page_player"
      ? parent
      : favorite
  let plusSlot = favoriteSlot.nextElementSibling
  while (isOurs(plusSlot)) plusSlot = plusSlot!.nextElementSibling
  const anchor = plusSlot ?? favoriteSlot

  let container: HTMLElement = button
  if (favoriteSlot !== favorite) {
    let wrapper = document.getElementById(WRAPPER_ID)
    if (!wrapper) {
      wrapper = favoriteSlot.cloneNode(false) as HTMLElement
      wrapper.id = WRAPPER_ID
      wrapper.removeAttribute("data-testid")
    }
    if (button.parentElement !== wrapper) wrapper.appendChild(button)
    container = wrapper
  }
  if (container.previousElementSibling !== anchor)
    anchor.insertAdjacentElement("afterend", container)

  // Same size, padding and hover as Deezer's buttons; state colours come from page.css.
  button.className = favorite.getAttribute("class") || "dzc-standalone"
  return button
}

/** Elements between Deezer's favorite button and its <svg>, outermost first. */
function iconWrappers(svg: SVGElement | null | undefined) {
  const favorite = getFavoriteButton()
  const wrappers: Element[] = []
  for (
    let el = svg?.parentElement;
    el && el !== favorite;
    el = el.parentElement
  )
    wrappers.unshift(el)
  return svg && favorite?.contains(svg) ? wrappers : []
}

function onActivate() {
  if (indexError && !index) {
    refreshIndex().catch(() => {})
    render()
    return
  }
  addCurrentSong()
}

function createButton() {
  const button = document.createElement("button")
  button.id = BUTTON_ID
  button.type = "button"
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    hideTooltip()
    onActivate()
  })
  button.addEventListener("mouseenter", () => showTooltip(button))
  button.addEventListener("focus", () => showTooltip(button))
  button.addEventListener("mouseleave", hideTooltip)
  button.addEventListener("blur", hideTooltip)
  return button
}

function render() {
  if (!configured) return
  const button = ensureButton()
  if (!button) return
  const { state, label } = getState()
  if (button.dataset.state === state && button.dataset.label === label) return
  button.dataset.state = state
  // The label is shown by our tooltip (see below), not the browser's `title`.
  button.dataset.label = label
  button.setAttribute("aria-label", label)
  updateTooltip(label)
  button.disabled = state === "idle"
  // Mirror the elements wrapping Deezer's icon inside its button, and reuse the icon's class,
  // so ours gets the same box and alignment. The inline style keeps our stroke rendering
  // even if that class sets a fill.
  const favoriteSvg = getFavoriteButton()?.querySelector("svg")
  let host: Element = button
  button.replaceChildren()
  for (const wrapper of iconWrappers(favoriteSvg)) {
    const clone = wrapper.cloneNode(false) as Element
    clone.removeAttribute("id")
    clone.removeAttribute("data-testid")
    host.appendChild(clone)
    host = clone
  }
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "24")
  svg.setAttribute("height", "24")
  svg.setAttribute("aria-hidden", "true")
  const svgClass = favoriteSvg?.getAttribute("class")
  if (svgClass) svg.setAttribute("class", svgClass)
  const path = document.createElementNS(NS, "path")
  path.setAttribute("d", ICONS[state])
  path.setAttribute("style", "fill:none;stroke:currentColor;stroke-width:1.33")
  svg.appendChild(path)
  host.appendChild(svg)
}

// ---------------------------------------------------------------------------
// Tooltip, drawn like Deezer's own player tooltips (styles in page.css)
// ---------------------------------------------------------------------------

const TOOLTIP_DELAY_MS = 300
let tooltipTimer: ReturnType<typeof setTimeout> | undefined

function tooltipEl() {
  let el = document.getElementById(TOOLTIP_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = TOOLTIP_ID
    el.setAttribute("role", "tooltip")
    el.setAttribute("aria-hidden", "true") // the button's aria-label already says it
    document.body.appendChild(el)
  }
  return el
}

function showTooltip(button: HTMLElement) {
  clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => {
    if (!button.isConnected) return
    const el = tooltipEl()
    el.textContent = button.dataset.label ?? ""
    const rect = button.getBoundingClientRect()
    el.style.left = `${rect.left + rect.width / 2}px`
    el.style.bottom = `${window.innerHeight - rect.top + 10}px`
    el.classList.add("dzc-visible")
  }, TOOLTIP_DELAY_MS)
}

function hideTooltip() {
  clearTimeout(tooltipTimer)
  document.getElementById(TOOLTIP_ID)?.classList.remove("dzc-visible")
}

/** Keeps an open tooltip in step with the button (e.g. "Checking…" turning into "Already in …"). */
function updateTooltip(label: string) {
  const el = document.getElementById(TOOLTIP_ID)
  if (el?.classList.contains("dzc-visible")) el.textContent = label
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer: ReturnType<typeof setTimeout> | undefined

function toast(message: string, isError = false) {
  hideTooltip()
  let el = document.getElementById(TOAST_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = TOAST_ID
    el.setAttribute("role", "status")
    document.body.appendChild(el)
  }
  el.textContent = message
  el.classList.toggle("dzc-error", isError)
  const button = document.getElementById(BUTTON_ID)
  if (button) {
    const rect = button.getBoundingClientRect()
    el.style.left = `${Math.max(8, rect.left + rect.width / 2)}px`
    el.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 10)}px`
  }
  el.classList.add("dzc-visible")
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove("dzc-visible"), 3500)
}

// ---------------------------------------------------------------------------
// Keyboard shortcut
// ---------------------------------------------------------------------------

function isTyping(event: KeyboardEvent) {
  const target = event.composedPath()[0] as HTMLElement | undefined
  return (
    !!target &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
}

window.addEventListener(
  "keydown",
  (event) => {
    const { shortcut } = settings
    if (
      !configured ||
      !settings.shortcutEnabled ||
      event.repeat ||
      event.code !== shortcut.code ||
      event.altKey !== shortcut.alt ||
      event.ctrlKey !== shortcut.ctrl ||
      event.shiftKey !== shortcut.shift ||
      event.metaKey !== shortcut.meta ||
      isTyping(event)
    )
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    onActivate()
  },
  true
)

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/** Settings that change which playlists or tracks count: the index is rebuilt when they move. */
const indexKey = (s: Settings) =>
  JSON.stringify([
    s.mode,
    s.prefix.trim().toLowerCase(),
    s.playlistIds,
    s.targetId,
    s.checkFavorites,
    s.matchIsrc,
  ])

listen("main", (message) => {
  if (message.type === "config") {
    setMessages(message.messages)
    settings = message.settings
    configured = true
    refreshIndex().catch((err) => console.warn("[Deezer Collection]", err))
  } else if (message.type === "settings") {
    const rebuild = indexKey(message.settings) !== indexKey(settings)
    settings = message.settings
    if (rebuild) {
      index = null
      indexError = null
      refreshIndex().catch(() => {})
    }
    render()
  } else if (message.type === "refresh") {
    refreshIndex().catch(() => {})
  }
})

const style = document.createElement("style")
style.dataset.deezerCollection = ""
style.textContent = pageCss
document.head.appendChild(style)

send("bridge", { type: "hello" })

// The player bar is re-rendered by Deezer: re-attach, follow track changes, refresh now and then.
setInterval(() => {
  if (!configured) return
  const songId = getCurrentSong()?.SNG_ID ?? null
  const button = document.getElementById(BUTTON_ID)
  if (songId !== lastSongId || !button?.isConnected) {
    lastSongId = songId
    render()
  }
  if (index && !busy && Date.now() - index.loadedAt > REFRESH_MS)
    refreshIndex().catch(() => {})
}, 1000)
