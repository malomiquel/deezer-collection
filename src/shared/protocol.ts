// Messages between the bridge (isolated world, has chrome.*) and the main script (Deezer's page world, has the
// player and the session). They travel over window.postMessage, tagged so other page messages are ignored.

import type { Settings, Status } from "./settings"

const TAG = "deezer-collection"

/** Messages already resolved for the browser's language; "$1", "$2"… mark substitutions. */
export type Messages = Record<string, string>

export type ToMain =
  | { type: "config"; settings: Settings; messages: Messages }
  | { type: "settings"; settings: Settings }
  | { type: "refresh" }

export type ToBridge = { type: "hello" } | { type: "status"; status: Status }

type Envelope<T> = { tag: typeof TAG; to: "main" | "bridge"; message: T }

export function send(to: "main", message: ToMain): void
export function send(to: "bridge", message: ToBridge): void
export function send(to: "main" | "bridge", message: ToMain | ToBridge) {
  window.postMessage(
    { tag: TAG, to, message } satisfies Envelope<unknown>,
    location.origin
  )
}

export function listen(to: "main", handler: (message: ToMain) => void): void
export function listen(to: "bridge", handler: (message: ToBridge) => void): void
export function listen(
  to: "main" | "bridge",
  handler: (message: never) => void
) {
  window.addEventListener("message", (event: MessageEvent) => {
    // Only this window's own messages: frames and other origins can't talk to us.
    if (event.source !== window || event.origin !== location.origin) return
    const data = event.data as Partial<Envelope<never>> | null
    if (data?.tag !== TAG || data.to !== to || !data.message) return
    handler(data.message)
  })
}
