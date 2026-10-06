// Settings (chrome.storage.sync) and the status the Deezer tab publishes for the settings page (chrome.storage.local).

/**
 * How collections are found:
 * - "series": playlists named "<prefix> … <number>"; the highest number receives new tracks.
 * - "playlists": playlists picked by hand, plus one picked as the target.
 */
export type Mode = "series" | "playlists"

/** A keyboard shortcut, matched on KeyboardEvent.code so it works whatever the keyboard layout. */
export type Shortcut = {
  code: string
  alt: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean
}

export type Settings = {
  mode: Mode
  /** Series mode: the start of the playlist names, e.g. "Collection". */
  prefix: string
  /** Playlists mode: playlists checked for duplicates. */
  playlistIds: string[]
  /** Playlists mode: where new tracks go. */
  targetId: string | null
  /** Also count liked tracks ("Favourite tracks") as already collected. */
  checkFavorites: boolean
  /** Also match the same recording released on another album (ISRC). */
  matchIsrc: boolean
  /** Series mode: create the next playlist of the series once the target holds `rolloverAt` tracks. */
  rollover: boolean
  rolloverAt: number
  shortcutEnabled: boolean
  shortcut: Shortcut
  toasts: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "series",
  prefix: "Collection",
  playlistIds: [],
  targetId: null,
  checkFavorites: false,
  matchIsrc: true,
  rollover: false,
  rolloverAt: 2000,
  shortcutEnabled: true,
  shortcut: { code: "KeyC", alt: true, ctrl: false, shift: true, meta: false },
  toasts: true,
}

export type PlaylistInfo = {
  id: string
  title: string
  count: number
  /** Cover URL, when the playlist has one. */
  picture: string | null
  isPublic: boolean
}

/** What the Deezer tab last saw, so the settings page can list playlists without calling Deezer itself. */
export type Status = {
  syncedAt: number
  playlists: PlaylistInfo[]
  collectionIds: string[]
  targetId: string | null
  /** Tracks across collections (and liked tracks when checked). */
  tracks: number
  favorites: number
  error: string | null
}

/** Settings as stored, completed with defaults for keys added in later versions. */
export function withDefaults(stored: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    shortcut: { ...DEFAULT_SETTINGS.shortcut, ...stored?.shortcut },
  }
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Matches "<prefix> … <number>" and captures the number, e.g. "Collection Rock 10" → 10. */
export function seriesPattern(prefix: string) {
  return new RegExp(`^${escapeRegExp(prefix.trim())}\\b.*?(\\d+)\\s*$`, "i")
}

/** "Collection Rock 09" → "Collection Rock 10" (keeps zero padding). */
export function nextInSeries(title: string) {
  return title.replace(
    /(\d+)(\s*)$/,
    (_, digits: string, space: string) =>
      String(Number(digits) + 1).padStart(digits.length, "0") + space
  )
}

/** "⌥⇧C" on macOS, "Alt+Shift+C" elsewhere. */
export function formatShortcut(shortcut: Shortcut) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform)
  const key = shortcut.code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace(/^Arrow/, "")
  const parts = mac
    ? [
        shortcut.ctrl && "⌃",
        shortcut.alt && "⌥",
        shortcut.shift && "⇧",
        shortcut.meta && "⌘",
      ]
    : [
        shortcut.ctrl && "Ctrl",
        shortcut.alt && "Alt",
        shortcut.shift && "Shift",
        shortcut.meta && "Win",
      ]
  return [...parts.filter(Boolean), key].join(mac ? "" : "+")
}
