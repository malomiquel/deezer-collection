// Translations live in public/_locales/<lang>/messages.json; Chrome picks the browser's language, English otherwise.

import type messages from "../../public/_locales/en/messages.json"

export type MessageKey = keyof typeof messages

/** The translated message, with substitutions filled in order. For extension pages and the bridge. */
export function t(key: MessageKey, ...substitutions: (string | number)[]) {
  return chrome.i18n.getMessage(key, substitutions.map(String)) || key
}
