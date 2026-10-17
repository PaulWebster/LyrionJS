// ---------------------------------------------------------------------------
// Theme, keyboard, boot
// ---------------------------------------------------------------------------
// Backwards-compatibility: polyfill replaceChildren for old browsers.
(function () {
  // Only run in browser environments
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Implementation that mirrors ParentNode.replaceChildren behaviour but avoids ES6-only features
  function _replaceChildrenImpl() {
    // Convert arguments to array-like
    var nodes = arguments;
    // Remove existing children
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
    // Append new children (strings become Text nodes)
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (typeof n === 'string') {
        this.appendChild(document.createTextNode(n));
      } else if (n instanceof Node) {
        this.appendChild(n);
      } else if (n && n.nodeType) {
        // Some environments may pass nodes with different prototypes
        this.appendChild(n);
      } else if (n != null) {
        // Fallback: convert non-null non-node to string
        this.appendChild(document.createTextNode(String(n)));
      }
    }
  }

  try {
    if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
      Element.prototype.replaceChildren = _replaceChildrenImpl;
    }
    if (typeof Document !== 'undefined' && !Document.prototype.replaceChildren) {
      Document.prototype.replaceChildren = _replaceChildrenImpl;
    }
    if (typeof DocumentFragment !== 'undefined' && !DocumentFragment.prototype.replaceChildren) {
      DocumentFragment.prototype.replaceChildren = _replaceChildrenImpl;
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('replaceChildren polyfill failed to install:', e);
    }
  }
})();

function applyTheme() {
  const t = store.get('theme', 'auto');
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSheet(); document.body.classList.remove('nav-open'); return; }   // also while typing
  if (!document.body.classList.contains('ready') || !S.lms) return;   // not before the app has started
  if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ') {
    if (e.target.closest('button, [role="button"], a')) return;   // Space activates what has focus
    e.preventDefault(); togglePlay();
  }
  else if (e.key === 'ArrowRight') act(['playlist', 'index', '+1']);
  else if (e.key === 'ArrowLeft') act(['button', 'jump_rew']);
  else if (e.key === 'ArrowUp') { e.preventDefault(); act(['mixer', 'volume', '+5']); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); act(['mixer', 'volume', '-5']); }
  else if (e.key === '/') { e.preventDefault(); root('search'); }
});
// Browsers only let audio start inside a user gesture. On iPad a touch counts on touchend or
// click, not pointerdown, and the audio context must be created or resumed right there.
const unlock = () => { if (S.output) S.output.unlock(); refreshUnlock(); };
for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, unlock, true);
// Safari 17+: play as media, so the silent switch and Control Centre's silent mode don't mute it.
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }

function unreachable(msg) {
  document.getElementById('view').replaceChildren(h('div', { class: 'discover' },
    h('div', { class: 'logo' }, logo()), h('h1', { text: 'LyrionJS' }),
    h('p', { text: 'Lyrion Music Server is not answering at ' + location.host + '.' }),
    h('p', { class: 't2', text: msg || '' }),
    h('button', { class: 'btn', onclick: () => location.reload() }, icon('refresh'), 'Try again')));
}

/**
 * Inside another page's frame (Material Skin opens its Extras that way), the player stops when
 * that window closes: offer it a tab of its own, or carry on here.
 */
function leaveFrame() {
  let inFrame = true;
  try { inFrame = window.top !== window; } catch (e) { /* a parent on another origin */ }
  if (!inFrame) return Promise.resolve();
  return new Promise((resolve) => {
    document.getElementById('view').replaceChildren(h('div', { class: 'discover' },
      h('div', { class: 'logo' }, logo()), h('h1', { text: 'LyrionJS' }),
      h('p', { text: 'LyrionJS plays best in a tab of its own: in this window it stops when the window closes.' }),
      h('div', { class: 'row-btns' },
        h('a', { class: 'btn', href: location.origin + location.pathname, target: '_blank', rel: 'noopener' }, icon('play'), 'Open in a new tab'),
        h('button', { class: 'btn ghost', onclick: () => resolve() }, 'Use it here'))));
  });
}

async function boot() {
  applyTheme();
  renderNav();
  await leaveFrame();
  const menuBtnEl = document.getElementById('menuBtn');
  if (menuBtnEl) menuBtnEl.onclick = () => document.body.classList.toggle('nav-open');
  // The menu button says whether the drawer is open, whoever opened or closed it.
  new MutationObserver(() => {
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(document.body.classList.contains('nav-open')));
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const scrim = document.getElementById('scrim'); if (scrim) scrim.onclick = () => document.body.classList.remove('nav-open');

  // Wrap player button handler with diagnostics + safe invocation
  const playerBtnEl = document.getElementById('playerBtn');
  if (playerBtnEl) playerBtnEl.onclick = () => {
    try { if (typeof diag === 'function') diag('ui', 'playerBtn clicked, S.lms=' + !!S.lms); } catch (e) {}
    if (S.lms) {
      try { playerPicker(); } catch (e) { try { if (typeof diag === 'function') diag('error', 'playerPicker threw: ' + (e && e.message ? e.message : String(e))); } catch (x) {} }
    }
  };

  const localBadge = document.getElementById('localBadge'); if (localBadge) localBadge.onclick = () => renameLocal();
  const unlockEl = document.getElementById('unlock'); if (unlockEl) unlockEl.onclick = unlock;
  S.lms = new LMS();
  try {
    const v = await S.lms.rpc('', ['version', '?'], 8000);
    let name = '';
    try { name = (await S.lms.rpc('', ['pref', 'libraryname', '?'], 5000))._p2 || ''; } catch (e) { /* older LMS */ }
    S.server = { name: name || 'Lyrion Music Server', version: v._version };
  } catch (e) { unreachable(e.message); return; }
  document.getElementById('serverName').textContent = S.server.name;
  document.body.classList.add('ready');
  S.localId = macBytes().str;
  try { S.config = serverConfig = await (await fetch('/plugins/LyrionJS/config.json', { cache: 'no-store' })).json(); } catch (e) { S.config = serverConfig = {}; }
  if (S.config.enabled === 0) toast('Browser players are switched off in LMS (Settings › Plugins › LyrionJS). This page controls your other players.');
  else claimPlayerThenStart();
  history.replaceState({ d: 1 }, '');
  const saved = store.get('view', 'now');
  root(VIEWS[saved] ? saved : 'now');
  try { await pollPlayers(); } catch (e) { setConn(false, e.message); }
  if (S.target && S.players.some((p) => p.playerid === S.target)) loadPluginMenus();
  poll();
}

window.LyrionJS = { S, VERSION };   // for diagnostics from the browser console
boot();
