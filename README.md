# Deezer Collection

Chrome extension for **Deezer Web**: a button right after the heart and "+" in the player bar adds the track playing
to your collection, only if you don't have it yet.

## Button states

| Colour | Meaning |
|---|---|
| White | Not in your collection: a click (or the keyboard shortcut) adds it to the target playlist |
| Green | Already collected: hover to see where |
| Grey | Nothing playing (podcast, radio, nothing at all) |
| Red | Collections couldn't load: hover for the reason, click to retry |

## Install

1. Run `npm install && npm run build`, or download the zip from a release and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `dist` folder (or the unzipped folder).
4. Reload the Deezer tab.

Available in English and French, following your browser's language.

## Settings

Click the extension icon for the target playlist and sync status, then **All settings**.

- **Collections**, two ways to organise them:
  - **Numbered series**: playlists whose name starts with a prefix you choose (default "Collection") and ends with a
    number, e.g. "Collection 1", "Collection Rock 12". The highest number receives new tracks.
  - **Chosen playlists**: pick the target playlist, and which playlists to check for duplicates.
- **Duplicates**: also count liked tracks; treat the same recording on another album (same ISRC) as a duplicate.
- **When the target is full** (numbered series): create the next playlist automatically, e.g. "Collection 13" once
  "Collection 12" holds 2,000 tracks. The new playlist gets the same visibility as the previous one.
- **Keyboard shortcut**: add the playing track without clicking (default ⌥⇧C / Alt+Shift+C), ignored in text fields.
- **Notifications**: show or hide the confirmation after each add.

The settings page lists your playlists from what the Deezer tab last loaded: open Deezer once, or click **Sync now**.

## How it works

- `main.js` runs in Deezer's page (it needs the player and your session) and calls Deezer's internal API
  (`/ajax/gw-light.php`) like the web app does: no key or extra login.
- `bridge.js` runs in the extension's isolated world and relays settings and translations to it, since Deezer's page
  can't use `chrome.storage`.
- Before each add, collections are read again so a track added from elsewhere isn't duplicated. They are also refreshed
  every 5 minutes.
- Settings are synced with your Chrome account; the playlist list shown in the settings is a local cache.

## Development

React, Tailwind CSS and [shadcn/ui](https://ui.shadcn.com) (Luma style), bundled by Vite into `dist/`.

```bash
npm install
npm run build
```

## Limitations

- Deezer's internal API and player markup (`#page_player [data-testid^="add_to_favorite_button"]`) can change with
  Deezer updates.
- Only playlists you own are listed.
