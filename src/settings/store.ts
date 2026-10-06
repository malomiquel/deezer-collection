import * as React from "react"

import { withDefaults, type Settings, type Status } from "@/shared/settings"

const DEEZER_URL = "https://www.deezer.com/"

export function useSettings() {
  const [settings, setSettings] = React.useState<Settings | null>(null)
  React.useEffect(() => {
    const load = () =>
      chrome.storage.sync
        .get(null)
        .then((stored) =>
          setSettings(withDefaults(stored as Partial<Settings>))
        )
    load()
    const onChanged = (_: unknown, area: string) => {
      if (area === "sync") load()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])
  return settings
}

export function updateSettings(patch: Partial<Settings>) {
  return chrome.storage.sync.set(patch)
}

/** What the Deezer tab last reported; undefined while loading, null if Deezer was never opened. */
export function useStatus() {
  const [status, setStatus] = React.useState<Status | null | undefined>()
  React.useEffect(() => {
    const load = () =>
      chrome.storage.local
        .get({ status: null })
        .then(({ status }) => setStatus(status as Status | null))
    load()
    const onChanged = (_: unknown, area: string) => {
      if (area === "local") load()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])
  return status
}

/** Asks open Deezer tabs to reload the collections; resolves to how many were asked. */
export async function requestSync() {
  const tabs = await chrome.tabs.query({ url: `${DEEZER_URL}*` })
  await Promise.all(
    tabs.map((tab) =>
      tab.id
        ? chrome.tabs.sendMessage(tab.id, { type: "refresh" }).catch(() => {})
        : undefined
    )
  )
  return tabs.length
}

export function openDeezer() {
  return chrome.tabs.create({ url: DEEZER_URL })
}

/** Re-renders every `ms` so relative times ("2 minutes ago") stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = React.useState(Date.now)
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
