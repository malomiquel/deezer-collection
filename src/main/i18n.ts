// chrome.i18n doesn't exist in Deezer's page world: the bridge sends the messages, resolved for the browser's language.

import type { MessageKey } from "@/shared/i18n"
import type { Messages } from "@/shared/protocol"

let messages: Messages = {}

export function setMessages(next: Messages) {
  messages = next
}

export function t(key: MessageKey, ...substitutions: (string | number)[]) {
  return (messages[key] || key).replace(/\$(\d)/g, (_, n: string) =>
    String(substitutions[Number(n) - 1] ?? "")
  )
}
