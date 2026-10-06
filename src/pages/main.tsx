import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/inter"
import "@/index.css"
import { App } from "@/settings/App"

document.documentElement.lang = chrome.i18n.getUILanguage()
document.title = chrome.i18n.getMessage("extName")

const dark = matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches)
applyTheme()
dark.addEventListener("change", applyTheme)

const variant = document.body.dataset.variant === "page" ? "page" : "popup"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App variant={variant} />
  </StrictMode>
)
