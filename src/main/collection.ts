// Which playlists form the collection (per the settings), and which tracks they already hold.

import {
  seriesPattern,
  type PlaylistInfo,
  type Settings,
  type Status,
} from "@/shared/settings"

import {
  coverUrl,
  getAllSongs,
  getFavoriteIds,
  getOwnedPlaylists,
  type Playlist,
  type Song,
} from "./api"
import { t } from "./i18n"

export type Target = {
  id: string
  title: string
  count: number
  status: number
}

export type Index = {
  target: Target
  /** Song ID → title of the playlist holding it. */
  byId: Map<string, string>
  /** ISRC → title of the playlist holding it (only when matching recordings). */
  byIsrc: Map<string, string>
  playlists: PlaylistInfo[]
  collectionIds: string[]
  favorites: number
  loadedAt: number
}

/** The settings don't point at usable playlists. Carries the playlist list so the settings page can fix it. */
export class SetupError extends Error {
  playlists: PlaylistInfo[] = []
}

function pickCollections(playlists: Playlist[], settings: Settings) {
  if (settings.mode === "series") {
    const pattern = seriesPattern(settings.prefix)
    const series = playlists.flatMap((p) => {
      const match = p.TITLE.match(pattern)
      return match ? [{ p, number: Number(match[1]) }] : []
    })
    if (!series.length)
      throw new SetupError(t("errorNoSeries", settings.prefix.trim()))
    const latest = series.reduce((a, b) => (b.number > a.number ? b : a))
    return { collections: series.map(({ p }) => p), target: latest.p }
  }
  const target = playlists.find(
    (p) => String(p.PLAYLIST_ID) === settings.targetId
  )
  if (!target) throw new SetupError(t("errorNoTarget"))
  const wanted = new Set([...settings.playlistIds, String(target.PLAYLIST_ID)])
  return {
    collections: playlists.filter((p) => wanted.has(String(p.PLAYLIST_ID))),
    target,
  }
}

export async function buildIndex(settings: Settings): Promise<Index> {
  const playlists = await getOwnedPlaylists()
  const infos: PlaylistInfo[] = playlists.map((p) => ({
    id: String(p.PLAYLIST_ID),
    title: p.TITLE,
    count: Number(p.NB_SONG ?? 0),
    picture: coverUrl(p),
    isPublic: Number(p.STATUS ?? 0) === 0,
  }))

  let picked
  try {
    picked = pickCollections(playlists, settings)
  } catch (err) {
    if (err instanceof SetupError) err.playlists = infos
    throw err
  }
  const { collections, target } = picked

  const byId = new Map<string, string>()
  const byIsrc = new Map<string, string>()
  const [contents, favoriteIds] = await Promise.all([
    Promise.all(collections.map((c) => getAllSongs(String(c.PLAYLIST_ID)))),
    settings.checkFavorites ? getFavoriteIds() : Promise.resolve([]),
  ])
  let targetCount = 0
  contents.forEach((songs, i) => {
    const playlist = collections[i]!
    if (playlist === target) targetCount = songs.length
    for (const song of songs)
      remember(byId, byIsrc, song, playlist.TITLE, settings)
  })
  const liked = t("likedTracks")
  for (const id of favoriteIds) if (!byId.has(id)) byId.set(id, liked)

  return {
    target: {
      id: String(target.PLAYLIST_ID),
      title: target.TITLE,
      count: targetCount,
      status: Number(target.STATUS ?? 1),
    },
    byId,
    byIsrc,
    playlists: infos,
    collectionIds: collections.map((c) => String(c.PLAYLIST_ID)),
    favorites: favoriteIds.length,
    loadedAt: Date.now(),
  }
}

export function remember(
  byId: Map<string, string>,
  byIsrc: Map<string, string>,
  song: Song,
  title: string,
  settings: Settings
) {
  byId.set(String(song.SNG_ID), title)
  if (song.FALLBACK?.SNG_ID) byId.set(String(song.FALLBACK.SNG_ID), title)
  if (settings.matchIsrc && song.ISRC) byIsrc.set(song.ISRC, title)
}

/** Title of the collection holding this song (same ID, or same recording when enabled), or null. */
export function findCollection(index: Index, song: Song) {
  return (
    index.byId.get(String(song.SNG_ID)) ??
    (song.FALLBACK?.SNG_ID
      ? index.byId.get(String(song.FALLBACK.SNG_ID))
      : undefined) ??
    (song.ISRC ? index.byIsrc.get(song.ISRC) : undefined) ??
    null
  )
}

export function statusOf(index: Index | null, error: Error | null): Status {
  return {
    syncedAt: Date.now(),
    playlists:
      index?.playlists ?? (error instanceof SetupError ? error.playlists : []),
    collectionIds: index?.collectionIds ?? [],
    targetId: index?.target.id ?? null,
    tracks: index ? index.byId.size : 0,
    favorites: index?.favorites ?? 0,
    error: error?.message ?? null,
  }
}
