import * as React from "react"
import {
  AlertCircleIcon,
  ExternalLinkIcon,
  ListMusicIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react"
import { cn } from "cn"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Kbd } from "@/components/ui/kbd"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { t } from "@/shared/i18n"
import {
  formatShortcut,
  nextInSeries,
  seriesPattern,
  type Mode,
  type PlaylistInfo,
  type Settings,
  type Shortcut,
  type Status,
} from "@/shared/settings"

import {
  openDeezer,
  requestSync,
  updateSettings,
  useNow,
  useSettings,
  useStatus,
} from "./store"

type AppProps = {
  /** The toolbar popup is narrow and links to the full page; the options page has room. */
  variant: "popup" | "page"
}

const number = (n: number) => n.toLocaleString(chrome.i18n.getUILanguage())

export function App({ variant }: AppProps) {
  const settings = useSettings()
  const status = useStatus()

  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        variant === "popup" ? "p-4" : "mx-auto max-w-xl px-6 py-10"
      )}
    >
      <header className="flex items-center gap-3">
        <img src="/icons/icon48.png" alt="" className="size-8 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-sm font-medium">{t("extName")}</h1>
          <p className="text-xs text-muted-foreground">{t("settingsTitle")}</p>
        </div>
      </header>

      <StatusCard status={status} />

      {/* The popup stays short: where tracks go, and a way to the full settings page. */}
      {variant === "popup" ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <SettingsIcon data-icon="inline-start" />
          {t("allSettings")}
        </Button>
      ) : settings && status !== undefined ? (
        <SettingsForm settings={settings} status={status} />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function relativeTime(at: number, now: number) {
  const format = new Intl.RelativeTimeFormat(chrome.i18n.getUILanguage(), {
    numeric: "auto",
  })
  const minutes = Math.round((at - now) / 60_000)
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(hours, "hour")
  return format.format(Math.round(hours / 24), "day")
}

function StatusCard({ status }: { status: Status | null | undefined }) {
  const now = useNow()
  const [syncing, setSyncing] = React.useState(false)

  if (status === undefined) return <Skeleton className="h-20 w-full" />

  if (!status) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListMusicIcon />
          </EmptyMedia>
          <EmptyTitle>{t("extName")}</EmptyTitle>
          <EmptyDescription>{t("statusNever")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={openDeezer}>
            {t("openDeezer")}
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const target = status.playlists.find((p) => p.id === status.targetId)
  const sync = async () => {
    setSyncing(true)
    const asked = await requestSync()
    if (!asked) await openDeezer()
    setTimeout(() => setSyncing(false), 1200)
  }
  const synced = t("statusSynced", relativeTime(status.syncedAt, now))

  return (
    <div className="flex flex-col gap-3">
      {target && (
        <Item variant="muted" size="sm">
          <ItemMedia variant="image">
            <PlaylistCover playlist={target} />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemDescription className="text-xs">
              {t("statusTarget")}
            </ItemDescription>
            <ItemTitle className="w-full">
              <span className="truncate">{target.title}</span>
            </ItemTitle>
          </ItemContent>
          <Badge variant="secondary" className="tabular-nums">
            {t("tracksCount", number(target.count))}
          </Badge>
        </Item>
      )}
      {status.error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{t("statusError", status.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex min-w-0 flex-col tabular-nums">
          {!status.error && (
            <span className="truncate">
              {t(
                "statusSummary",
                number(status.collectionIds.length),
                number(status.tracks)
              )}
            </span>
          )}
          <span className="truncate">{synced}</span>
        </div>
        <Button variant="ghost" size="xs" onClick={sync} disabled={syncing}>
          <RefreshCwIcon
            data-icon="inline-start"
            className={cn(syncing && "animate-spin")}
          />
          {t("syncNow")}
        </Button>
      </div>
    </div>
  )
}

function PlaylistCover({ playlist }: { playlist: PlaylistInfo }) {
  return playlist.picture ? (
    <img src={playlist.picture} alt="" />
  ) : (
    <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
      <ListMusicIcon />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsForm({
  settings,
  status,
}: {
  settings: Settings
  status: Status | null
}) {
  const playlists = status?.playlists ?? []
  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>{t("sectionCollections")}</FieldLegend>
        <FieldDescription>
          {t("sectionCollectionsDescription")}
        </FieldDescription>
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full"
          value={settings.mode}
          onValueChange={(mode) =>
            mode && updateSettings({ mode: mode as Mode })
          }
        >
          <ToggleGroupItem value="series" className="flex-1">
            {t("modeSeries")}
          </ToggleGroupItem>
          <ToggleGroupItem value="playlists" className="flex-1">
            {t("modePlaylists")}
          </ToggleGroupItem>
        </ToggleGroup>
        {settings.mode === "series" ? (
          <SeriesFields settings={settings} playlists={playlists} />
        ) : (
          <PlaylistFields settings={settings} playlists={playlists} />
        )}
      </FieldSet>

      <Separator />

      <FieldSet>
        <FieldLegend>{t("sectionDuplicates")}</FieldLegend>
        <SwitchField
          id="favorites"
          label={t("favoritesLabel")}
          description={t("favoritesDescription")}
          checked={settings.checkFavorites}
          onChange={(checkFavorites) => updateSettings({ checkFavorites })}
        />
        <SwitchField
          id="isrc"
          label={t("isrcLabel")}
          description={t("isrcDescription")}
          checked={settings.matchIsrc}
          onChange={(matchIsrc) => updateSettings({ matchIsrc })}
        />
      </FieldSet>

      {settings.mode === "series" && (
        <>
          <Separator />
          <RolloverFields settings={settings} playlists={playlists} />
        </>
      )}

      <Separator />

      <FieldSet>
        <FieldLegend>{t("sectionShortcut")}</FieldLegend>
        <SwitchField
          id="shortcut"
          label={t("shortcutLabel")}
          description={t("shortcutDescription")}
          checked={settings.shortcutEnabled}
          onChange={(shortcutEnabled) => updateSettings({ shortcutEnabled })}
        />
        {settings.shortcutEnabled && (
          <ShortcutRecorder
            value={settings.shortcut}
            onChange={(shortcut) => updateSettings({ shortcut })}
          />
        )}
      </FieldSet>

      <Separator />

      <FieldSet>
        <FieldLegend>{t("sectionNotifications")}</FieldLegend>
        <SwitchField
          id="toasts"
          label={t("toastsLabel")}
          description={t("toastsDescription")}
          checked={settings.toasts}
          onChange={(toasts) => updateSettings({ toasts })}
        />
      </FieldSet>
    </FieldGroup>
  )
}

function SwitchField(props: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
        <FieldDescription>{props.description}</FieldDescription>
      </FieldContent>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onChange}
      />
    </Field>
  )
}

/** Matching playlists, highest number first. */
function seriesOf(prefix: string, playlists: PlaylistInfo[]) {
  if (!prefix.trim()) return []
  const pattern = seriesPattern(prefix)
  return playlists
    .flatMap((p) => {
      const match = p.title.match(pattern)
      return match ? [{ playlist: p, number: Number(match[1]) }] : []
    })
    .sort((a, b) => b.number - a.number)
    .map(({ playlist }) => playlist)
}

function SeriesFields({
  settings,
  playlists,
}: {
  settings: Settings
  playlists: PlaylistInfo[]
}) {
  // Typed value kept locally; saved shortly after typing stops (storage.sync limits writes per minute).
  const [prefix, setPrefix] = React.useState(settings.prefix)
  React.useEffect(() => {
    if (prefix === settings.prefix || !prefix.trim()) return
    const id = setTimeout(() => updateSettings({ prefix }), 500)
    return () => clearTimeout(id)
  }, [prefix, settings.prefix])

  const series = seriesOf(prefix, playlists)
  const shown = series.slice(0, 5)
  const example = prefix.trim() || "Collection"

  return (
    <>
      <Field>
        <FieldLabel htmlFor="prefix">{t("prefixLabel")}</FieldLabel>
        <Input
          id="prefix"
          value={prefix}
          placeholder="Collection"
          onChange={(e) => setPrefix(e.target.value)}
        />
        <FieldDescription>{t("prefixDescription", example)}</FieldDescription>
      </Field>
      {playlists.length > 0 &&
        (series.length ? (
          <ItemGroup className="gap-0">
            {shown.map((playlist, i) => (
              <PlaylistRow key={playlist.id} playlist={playlist}>
                {i === 0 && <Badge>{t("targetBadge")}</Badge>}
              </PlaylistRow>
            ))}
            {series.length > shown.length && (
              <p className="px-3 pt-1 text-xs text-muted-foreground">
                +{series.length - shown.length}
              </p>
            )}
          </ItemGroup>
        ) : (
          <p className="text-sm text-muted-foreground">{t("seriesNone")}</p>
        ))}
    </>
  )
}

function PlaylistRow({
  playlist,
  children,
}: {
  playlist: PlaylistInfo
  children?: React.ReactNode
}) {
  return (
    <Item size="xs" className="rounded-xl py-1.5">
      <ItemMedia variant="image">
        <PlaylistCover playlist={playlist} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full font-normal">
          <span className="truncate">{playlist.title}</span>
        </ItemTitle>
      </ItemContent>
      {children}
      <span className="text-xs text-muted-foreground tabular-nums">
        {number(playlist.count)}
      </span>
    </Item>
  )
}

function PlaylistFields({
  settings,
  playlists,
}: {
  settings: Settings
  playlists: PlaylistInfo[]
}) {
  const checked = new Set(settings.playlistIds)
  const toggle = (id: string, on: boolean) =>
    updateSettings({
      playlistIds: on
        ? [...checked, id]
        : settings.playlistIds.filter((other) => other !== id),
    })

  if (!playlists.length)
    return <p className="text-sm text-muted-foreground">{t("statusNever")}</p>

  return (
    <>
      <Field>
        <FieldLabel htmlFor="target">{t("targetLabel")}</FieldLabel>
        <Select
          value={settings.targetId ?? undefined}
          onValueChange={(targetId) => updateSettings({ targetId })}
        >
          <SelectTrigger id="target" className="w-full">
            <SelectValue placeholder={t("targetPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {playlists.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <FieldSet>
        <FieldLabel>{t("checkLabel")}</FieldLabel>
        <FieldDescription>{t("checkDescription")}</FieldDescription>
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-2xl border p-1">
          {playlists.map((p) => {
            const isTarget = p.id === settings.targetId
            return (
              <Field
                key={p.id}
                orientation="horizontal"
                className="rounded-xl px-2 py-1.5 hover:bg-muted/60"
              >
                <Checkbox
                  id={`pl-${p.id}`}
                  checked={isTarget || checked.has(p.id)}
                  disabled={isTarget}
                  onCheckedChange={(on) => toggle(p.id, on === true)}
                />
                <FieldLabel
                  htmlFor={`pl-${p.id}`}
                  className="min-w-0 flex-1 font-normal"
                >
                  <span className="truncate">{p.title}</span>
                </FieldLabel>
                {isTarget && <Badge>{t("targetBadge")}</Badge>}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {number(p.count)}
                </span>
              </Field>
            )
          })}
        </div>
      </FieldSet>
    </>
  )
}

function RolloverFields({
  settings,
  playlists,
}: {
  settings: Settings
  playlists: PlaylistInfo[]
}) {
  const [latest] = seriesOf(settings.prefix, playlists)
  const current = latest?.title ?? `${settings.prefix.trim() || "Collection"} 1`
  const [limit, setLimit] = React.useState(String(settings.rolloverAt))
  React.useEffect(() => {
    const value = Number(limit)
    if (!Number.isInteger(value) || value < 1 || value === settings.rolloverAt)
      return
    const id = setTimeout(() => updateSettings({ rolloverAt: value }), 500)
    return () => clearTimeout(id)
  }, [limit, settings.rolloverAt])

  return (
    <FieldSet>
      <FieldLegend>{t("sectionFull")}</FieldLegend>
      <SwitchField
        id="rollover"
        label={t("rolloverLabel")}
        description={t("rolloverDescription", current, nextInSeries(current))}
        checked={settings.rollover}
        onChange={(rollover) => updateSettings({ rollover })}
      />
      {settings.rollover && (
        <Field orientation="horizontal">
          <FieldLabel htmlFor="rollover-at" className="flex-1">
            {t("rolloverAtLabel")}
          </FieldLabel>
          <Input
            id="rollover-at"
            type="number"
            min={1}
            inputMode="numeric"
            className="w-28 tabular-nums"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
      )}
    </FieldSet>
  )
}

const MODIFIER_CODES = /^(Alt|Control|Shift|Meta|OS)(Left|Right)?$/

function ShortcutRecorder({
  value,
  onChange,
}: {
  value: Shortcut
  onChange: (shortcut: Shortcut) => void
}) {
  const [recording, setRecording] = React.useState(false)

  React.useEffect(() => {
    if (!recording) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      if (event.code === "Escape") return setRecording(false)
      if (MODIFIER_CODES.test(event.code)) return
      // A bare key would fire while typing elsewhere on the page: require a modifier.
      if (!event.altKey && !event.ctrlKey && !event.metaKey) return
      onChange({
        code: event.code,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      })
      setRecording(false)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [recording, onChange])

  return (
    <Field orientation="horizontal">
      <div className="flex-1">
        {recording ? (
          <span className="text-sm text-muted-foreground">
            {t("shortcutRecording")}
          </span>
        ) : (
          <Kbd>{formatShortcut(value)}</Kbd>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRecording((on) => !on)}
      >
        {t("shortcutRecord")}
      </Button>
    </Field>
  )
}
