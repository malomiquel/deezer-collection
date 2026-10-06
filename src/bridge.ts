// Isolated-world content script: the main script runs in Deezer's own world (it needs the player and the session)
// where chrome.* doesn't exist. This bridge hands it settings and translations, and stores the status it reports.

import messages from "../public/_locales/en/messages.json"
import { listen, send, type Messages } from "./shared/protocol"
import { withDefaults, type Settings } from "./shared/settings"

/** Every message for the browser's language, with "$1", "$2"… left in place for the main script to fill. */
function resolveMessages(): Messages {
  const slots = ["$1", "$2", "$3", "$4"]
  return Object.fromEntries(
    Object.keys(messages).map((key) => [
      key,
      chrome.i18n.getMessage(key, slots),
    ])
  )
}

async function loadSettings() {
  const stored = (await chrome.storage.sync.get(null)) as Partial<Settings>
  return withDefaults(stored)
}

listen("bridge", async (message) => {
  if (message.type === "hello") {
    send("main", {
      type: "config",
      settings: await loadSettings(),
      messages: resolveMessages(),
    })
  } else if (message.type === "status") {
    await chrome.storage.local.set({ status: message.status })
  }
})

chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area === "sync")
    send("main", { type: "settings", settings: await loadSettings() })
})

// "Sync now" in the settings page.
chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type === "refresh") send("main", { type: "refresh" })
})
