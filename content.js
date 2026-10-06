// Runs in the page's MAIN world: it needs window.dzPlayer and Deezer's session cookies.
(() => {
  'use strict';

  // Playlists named "Collection …<number>" (e.g. "Collection Malo 10"); the highest number is the target.
  const COLLECTION_PATTERN = /^collection\b.*?(\d+)\s*$/i;
  const REFRESH_MS = 5 * 60 * 1000;
  const BUTTON_ID = 'dzc-button';
  const WRAPPER_ID = 'dzc-wrapper';
  const TOAST_ID = 'dzc-toast';

  // Stroke icons matching Deezer's player icons: 24px viewBox, 16px wide like Deezer's "+",
  // 1.33px strokes. The list glyph is top-heavy, so it sits 1 unit lower (5–21) to look centred.
  const LIST = 'M4 5.665h16M4 10.665h16M4 15.665h7.5';
  const ICONS = {
    add: `${LIST}M17 15v6M14 18h6`,
    present: `${LIST}M13 18l2.5 2.5 4.5-4.5`,
    loading: 'M12 5a7 7 0 1 0 7 7',
    error: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16zM12 8v5M12 15v1.5'
  };

  let session = null; // { userId, token }
  let index = null; // { latest, byId, byIsrc, loadedAt }
  let indexPromise = null;
  let indexError = null;
  let busy = false;
  let lastSongId = null;

  // ---------------------------------------------------------------------------
  // Deezer internal API (same one the web app uses)
  // ---------------------------------------------------------------------------

  async function gw(method, body, token) {
    const url = `/ajax/gw-light.php?method=${method}&input=3&api_version=1.0&api_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { method: 'POST', credentials: 'include', body: JSON.stringify(body || {}) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const error = json.error;
    if (error && (Array.isArray(error) ? error.length : Object.keys(error).length)) {
      throw new Error(JSON.stringify(error));
    }
    return json.results;
  }

  async function getSession() {
    if (session) return session;
    const data = await gw('deezer.getUserData', {}, 'null');
    const userId = data?.USER?.USER_ID;
    if (!userId || String(userId) === '0') throw new Error('Non connecté à Deezer.');
    session = { userId: String(userId), token: data.checkForm };
    return session;
  }

  // Calls the API with the session token, renewing it once if it expired.
  async function call(method, body) {
    const { token } = await getSession();
    try {
      return await gw(method, body, token);
    } catch (err) {
      if (!/token/i.test(err.message)) throw err;
      session = null;
      return gw(method, body, (await getSession()).token);
    }
  }

  async function getAllSongs(playlistId) {
    const songs = [];
    for (;;) {
      const page = await call('playlist.getSongs', { playlist_id: playlistId, nb: 2000, start: songs.length });
      const data = page?.data || [];
      songs.push(...data);
      if (!data.length || songs.length >= (page.total ?? 0)) return songs;
    }
  }

  // ---------------------------------------------------------------------------
  // Collections index
  // ---------------------------------------------------------------------------

  async function buildIndex() {
    const { userId } = await getSession();
    const profile = await call('deezer.pageProfile', { user_id: userId, tab: 'playlists', nb: 1000 });
    const collections = (profile?.TAB?.playlists?.data || [])
      .filter((p) => String(p.PARENT_USER_ID) === userId && COLLECTION_PATTERN.test(p.TITLE))
      .map((p) => ({
        id: String(p.PLAYLIST_ID),
        title: p.TITLE,
        number: Number(p.TITLE.match(COLLECTION_PATTERN)[1])
      }));
    if (!collections.length) throw new Error('Aucune playlist « Collection N » trouvée.');

    const latest = collections.reduce((a, b) => (b.number > a.number ? b : a));
    const byId = new Map();
    const byIsrc = new Map();

    const contents = await Promise.all(collections.map((c) => getAllSongs(c.id)));
    contents.forEach((songs, i) => {
      const { title } = collections[i];
      for (const song of songs) {
        byId.set(String(song.SNG_ID), title);
        if (song.FALLBACK?.SNG_ID) byId.set(String(song.FALLBACK.SNG_ID), title);
        if (song.ISRC) byIsrc.set(song.ISRC, title);
      }
    });

    return { latest, byId, byIsrc, loadedAt: Date.now() };
  }

  function refreshIndex() {
    if (!indexPromise) {
      indexPromise = buildIndex()
        .then((result) => {
          index = result;
          indexError = null;
          return result;
        })
        .catch((err) => {
          indexError = err;
          throw err;
        })
        .finally(() => {
          indexPromise = null;
          render();
        });
    }
    return indexPromise;
  }

  // Returns the title of the collection holding this song (same ID or same recording/ISRC), or null.
  function findCollection(song) {
    if (!index) return null;
    return index.byId.get(String(song.SNG_ID))
      || (song.FALLBACK?.SNG_ID && index.byId.get(String(song.FALLBACK.SNG_ID)))
      || (song.ISRC && index.byIsrc.get(song.ISRC))
      || null;
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------

  function getCurrentSong() {
    const song = window.dzPlayer?.getCurrentSong?.();
    // Only catalogue tracks (no podcasts, live radios or personal uploads with negative IDs).
    if (!song || song.__TYPE__ !== 'song' || !(Number(song.SNG_ID) > 0)) return null;
    return song;
  }

  async function addCurrentSong() {
    if (busy) return;
    const song = getCurrentSong();
    if (!song) {
      toast('Aucun titre en cours de lecture.', true);
      return;
    }

    busy = true;
    render();
    try {
      // Always re-check against fresh data: the song may have been added from elsewhere.
      await refreshIndex();
      const existing = findCollection(song);
      if (existing) {
        toast(`Déjà dans « ${existing} »`);
        return;
      }
      const { latest } = index;
      await call('playlist.addSongs', { playlist_id: latest.id, songs: [[Number(song.SNG_ID), 0]], offset: -1 });
      index.byId.set(String(song.SNG_ID), latest.title);
      if (song.ISRC) index.byIsrc.set(song.ISRC, latest.title);
      toast(`« ${song.SNG_TITLE} » ajouté à « ${latest.title} »`);
    } catch (err) {
      console.error('[Deezer Collection]', err);
      toast(`Erreur : ${err.message}`, true);
    } finally {
      busy = false;
      render();
    }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  function getState() {
    const song = getCurrentSong();
    if (busy || (!index && !indexError)) return { state: 'loading', label: 'Vérification des collections…' };
    if (!index) return { state: 'error', label: `Collections indisponibles : ${indexError.message} (cliquer pour réessayer)` };
    if (!song) return { state: 'idle', label: 'Aucun titre en cours' };
    const existing = findCollection(song);
    if (existing) return { state: 'present', label: `Déjà dans « ${existing} »` };
    return { state: 'absent', label: `Ajouter à « ${index.latest.title} »` };
  }

  function getFavoriteButton() {
    return document.querySelector('#page_player [data-testid^="add_to_favorite_button"]');
  }

  // Deezer puts each player action in its own wrapper, which carries the spacing and vertical
  // alignment: mirror the favorite button's wrapper and classes instead of styling by hand.
  function ensureButton() {
    const favorite = getFavoriteButton();
    if (!favorite) return null;

    const button = document.getElementById(BUTTON_ID) || createButton();
    const parent = favorite.parentElement;
    const anchor = parent && parent.childElementCount === 1 && parent.id !== 'page_player' ? parent : favorite;

    let container = button;
    if (anchor !== favorite) {
      let wrapper = document.getElementById(WRAPPER_ID);
      if (!wrapper) {
        wrapper = anchor.cloneNode(false);
        wrapper.id = WRAPPER_ID;
        wrapper.removeAttribute('data-testid');
      }
      if (button.parentElement !== wrapper) wrapper.appendChild(button);
      container = wrapper;
    }
    if (container.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', container);

    // Same size, padding and hover as Deezer's buttons; state colours come from content.css.
    const favoriteClass = favorite.getAttribute('class');
    button.className = favoriteClass || 'dzc-standalone';
    return button;
  }

  // Elements between Deezer's favorite button and its <svg>, outermost first.
  function iconWrappers(svg) {
    const favorite = getFavoriteButton();
    const wrappers = [];
    for (let el = svg?.parentElement; el && el !== favorite; el = el.parentElement) wrappers.unshift(el);
    return svg && favorite?.contains(svg) ? wrappers : [];
  }

  function createButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (indexError && !index) {
        refreshIndex().catch(() => {});
        render();
        return;
      }
      addCurrentSong();
    });
    return button;
  }

  function render() {
    const button = ensureButton();
    if (!button) return;
    const { state, label } = getState();
    if (button.dataset.state === state && button.title === label) return;
    button.dataset.state = state;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.disabled = state === 'idle';
    // Mirror the elements wrapping Deezer's icon inside its button, and reuse the icon's class,
    // so ours gets the same box and alignment. The inline style keeps our stroke rendering
    // even if that class sets a fill.
    const favoriteSvg = getFavoriteButton()?.querySelector('svg');
    const svgClass = (favoriteSvg?.getAttribute('class') || '').replace(/"/g, '');
    let host = button;
    button.replaceChildren();
    for (const wrapper of iconWrappers(favoriteSvg)) {
      const clone = wrapper.cloneNode(false);
      clone.removeAttribute('id');
      clone.removeAttribute('data-testid');
      host.appendChild(clone);
      host = clone;
    }
    host.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"${svgClass ? ` class="${svgClass}"` : ''}>`
      + `<path d="${ICONS[state] || ICONS.add}" style="fill:none;stroke:currentColor;stroke-width:1.33"/></svg>`;
  }

  let toastTimer = null;

  function toast(message, isError = false) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('dzc-error', isError);
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      const rect = button.getBoundingClientRect();
      el.style.left = `${Math.max(8, rect.left + rect.width / 2)}px`;
      el.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 10)}px`;
    }
    el.classList.add('dzc-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('dzc-visible'), 3500);
  }

  // ---------------------------------------------------------------------------
  // Main loop: the player bar is re-rendered by Deezer, so re-attach and follow track changes.
  // ---------------------------------------------------------------------------

  function tick() {
    const songId = getCurrentSong()?.SNG_ID ?? null;
    const button = document.getElementById(BUTTON_ID);
    const detached = !button || !button.isConnected;
    if (songId !== lastSongId || detached) {
      lastSongId = songId;
      render();
    }
    if (index && !busy && Date.now() - index.loadedAt > REFRESH_MS) refreshIndex().catch(() => {});
  }

  refreshIndex().catch((err) => console.warn('[Deezer Collection]', err));
  setInterval(tick, 1000);
  tick();
})();
