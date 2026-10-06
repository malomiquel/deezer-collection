// Deezer's internal API (/ajax/gw-light.php), the one the web app itself uses, called with the user's session.

export type Song = {
  SNG_ID: string | number
  SNG_TITLE?: string
  ISRC?: string
  FALLBACK?: { SNG_ID?: string | number }
  __TYPE__?: string
}

export type Playlist = {
  PLAYLIST_ID: string | number
  PARENT_USER_ID: string | number
  TITLE: string
  NB_SONG?: number
  STATUS?: number
  PLAYLIST_PICTURE?: string
  PICTURE_TYPE?: string
}

type Session = { userId: string; token: string }

let session: Session | null = null

async function gw<T>(method: string, body: unknown, token: string): Promise<T> {
  const url = `/ajax/gw-light.php?method=${method}&input=3&api_version=1.0&api_token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { results: T; error?: unknown }
  const { error } = json
  if (
    error &&
    (Array.isArray(error) ? error.length : Object.keys(error).length)
  ) {
    throw new Error(JSON.stringify(error))
  }
  return json.results
}

export class NotLoggedInError extends Error {}

export async function getSession() {
  if (session) return session
  const data = await gw<{
    USER?: { USER_ID?: string | number }
    checkForm: string
  }>("deezer.getUserData", {}, "null")
  const userId = data?.USER?.USER_ID
  if (!userId || String(userId) === "0") throw new NotLoggedInError()
  session = { userId: String(userId), token: data.checkForm }
  return session
}

/** Calls the API with the session token, renewing it once if it expired. */
async function call<T>(method: string, body: unknown): Promise<T> {
  const { token } = await getSession()
  try {
    return await gw<T>(method, body, token)
  } catch (err) {
    if (!/token/i.test((err as Error).message)) throw err
    session = null
    return gw<T>(method, body, (await getSession()).token)
  }
}

export async function getOwnedPlaylists() {
  const { userId } = await getSession()
  const profile = await call<{
    TAB?: { playlists?: { data?: Playlist[] } }
  }>("deezer.pageProfile", { user_id: userId, tab: "playlists", nb: 1000 })
  return (profile?.TAB?.playlists?.data ?? []).filter(
    (p) => String(p.PARENT_USER_ID) === userId
  )
}

export async function getAllSongs(playlistId: string) {
  const songs: Song[] = []
  for (;;) {
    const page = await call<{ data?: Song[]; total?: number }>(
      "playlist.getSongs",
      { playlist_id: playlistId, nb: 2000, start: songs.length }
    )
    const data = page?.data ?? []
    songs.push(...data)
    if (!data.length || songs.length >= (page.total ?? 0)) return songs
  }
}

/** IDs of the user's liked tracks. */
export async function getFavoriteIds() {
  const ids: string[] = []
  for (;;) {
    const page = await call<{
      data?: { SNG_ID: string | number }[]
      total?: number
    }>("song.getFavoriteIds", { nb: 10000, start: ids.length, checksum: null })
    const data = page?.data ?? []
    ids.push(...data.map((song) => String(song.SNG_ID)))
    if (!data.length || ids.length >= (page.total ?? 0)) return ids
  }
}

export function addSong(playlistId: string, songId: string | number) {
  return call("playlist.addSongs", {
    playlist_id: playlistId,
    songs: [[Number(songId), 0]],
    offset: -1,
  })
}

/** Creates an empty playlist and returns its ID. `status`: 0 public, 1 private. */
export async function createPlaylist(title: string, status: number) {
  const id = await call<string | number>("playlist.create", {
    title,
    status,
    description: "",
    songs: [],
  })
  return String(id)
}

/** Small cover URL for a playlist, as Deezer's own lists use. */
export function coverUrl(playlist: Playlist) {
  if (!playlist.PLAYLIST_PICTURE) return null
  const type = playlist.PICTURE_TYPE || "playlist"
  return `https://e-cdns-images.dzcdn.net/images/${type}/${playlist.PLAYLIST_PICTURE}/56x56-000000-80-0-0.jpg`
}
