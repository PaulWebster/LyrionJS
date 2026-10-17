1|   // -- Players -----------------------------------------------------------------
2|   function groupOf(id) {
3|     for (const g of S.syncgroups) { const m = String(g.sync_members || '').split(','); if (m.includes(id)) return m; }
4|     return null;
5|   }
6|   
7|   VIEWS.players = () => {
8|     const list = h('div', { class: 'players' });
9|     let gen = 0;
10|     async function render() {
11|       const my = ++gen;   // renders overlap (each button re-renders): only the newest is shown
12|       const rows = await Promise.all(S.players.map(async (p) => {
13|         let st = {};
14|         try { st = await S.lms.rpc(p.playerid, ['status', '-', 1, 'tags:al']); } catch (e) { /* offline */ }
15|         const t = (st.playlist_loop || [])[0] || {};
16|         const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.abs(+st['mixer volume'] || 0), class: 'vol', 'aria-label': 'Volume of ' + p.name });
17|         vol.addEventListener('input', debounce(() => act(['mixer', 'volume', vol.value], null, p.playerid), 120));
18|         const g = groupOf(p.playerid);
19|         const on = +st.power === 1 || st.power === undefined;
20|         return h('div', { class: 'pcard' + (p.playerid === S.target ? ' sel' : '') },
21|           h('div', { class: 'pcard-head' },
22|             icon(isLocal(p.playerid) ? 'laptop' : 'speaker'),
23|             h('div', { class: 'meta' }, h('div', { class: 't1', text: p.name + (isLocal(p.playerid) ? ' (this browser)' : '') }),
24|               h('div', { class: 't2', text: [p.modelname || p.model, !+p.connected ? 'disconnected' : (!on ? 'off' : st.mode === 'play' ? 'playing' : st.mode), g ? 'synced with ' + g.filter((x) =>[...]
25|             +p.canpoweroff ? btn('power', on ? 'Switch off' : 'Switch on', () => act(['power', on ? 0 : 1], null, p.playerid).then(render), on ? 'on' : '') : null),
26|           t.title ? h('div', { class: 'pcard-now', text: [t.title, t.artist].filter(Boolean).join(' — ') }) : null,
27|           h('div', { class: 'pcard-ctrls' },
28|             btn(st.mode === 'play' ? 'pause' : 'play', 'Play/pause', () => act(st.mode === 'play' ? ['pause', 1] : ['play'], null, p.playerid).then(render)),
29|             vol,
30|             h('button', { class: 'btn ghost sm', onclick: () => { setTarget(p.playerid); render(); } }, p.playerid === S.target ? 'Controlling' : 'Control'),
31|             h('button', { class: 'btn ghost sm', onclick: () => syncMenu(p.playerid, render) }, icon('sync'), 'Sync…'),
32|             isLocal(p.playerid) ? h('button', { class: 'btn ghost sm', onclick: () => renameLocal().then(render) }, icon('edit'), 'Rename…') : null));
33|       }));
34|       if (my !== gen) return;
35|       list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty', text: 'No players are connected to the server.' })]));
36|     }
37|     return { title: 'Players', el: h('div', {}, h('p', { class: 'view-sub', text: 'Every player LMS knows, including this browser. Sync players to play the same music in step.' }), list), onShow: [...]
38|   };
39|   
40|   function syncMenu(id, after) {
41|     const g = groupOf(id) || [];
42|     const others = S.players.filter((p) => p.playerid !== id);
43|     sheet('Sync ' + playerName(id) + ' with…', [
44|       ...others.map((p) => ({ label: p.name, icon: isLocal(p.playerid) ? 'laptop' : 'speaker', checked: g.includes(p.playerid), run: async () => {
45|         if (g.includes(p.playerid)) await rpc(['sync', '-'], p.playerid);
46|         else await rpc(['sync', p.playerid], id);
47|         toast(g.includes(p.playerid) ? 'Unsynced ' + p.name : 'Synced ' + p.name); await pollPlayers(); after && after();
48|       } })),
49|       g.length ? { sep: true } : null,
50|       g.length ? { label: 'Leave the group', icon: 'close', run: async () => { await rpc(['sync', '-'], id); toast('Unsynced'); await pollPlayers(); after && after(); } } : null,
51|     ]);
52|   }
53|   
54|   function renderPlayerButton() {
55|     const b = document.getElementById('playerBtn');
56|     try { if (typeof diag === 'function') diag('ui', 'renderPlayerButton: target=' + String(S.target)); } catch (e) {}
57|     b.replaceChildren(icon(isLocal(S.target) ? 'laptop' : 'speaker'), h('span', { text: playerName(S.target) }), icon('down', 'caret'));
58|   }
59|   function playerPicker() {
60|     try {
61|       if (typeof diag === 'function') diag('ui', 'playerPicker invoked: players=' + (S.players ? S.players.length : 0) + ' target=' + String(S.target));
62|     } catch (e) {}
63|     try {
64|       sheet('Choose a player', [
65|         ...S.players.map((p) => ({ label: p.name + (isLocal(p.playerid) ? ' (this browser)' : ''), icon: isLocal(p.playerid) ? 'laptop' : 'speaker', checked: p.playerid === S.target, run: () => setT[...]
66|       { sep: true },
67|       S.target ? { label: 'Sync this player…', icon: 'sync', run: () => syncMenu(S.target) } : null,
68|       S.target ? { label: 'Transfer playback here from…', icon: 'next_up', run: () => transferMenu() } : null,
69|       S.local ? { label: 'Rename this browser…', icon: 'edit', run: () => renameLocal() } : null,
70|       { label: 'All players', icon: 'speaker', run: () => root('players') },
71|     ]);
72|     } catch (e) { try { if (typeof diag === 'function') diag('error', 'playerPicker() exception: ' + (e && e.message ? e.message : String(e))); } catch (x) {} fail(e); }
73|   }
74|   const TRANSFER_MAX = 2000;   // tracks moved at most (one request each)
75|   let transferring = false;
76|   function transferMenu() {
77|     const to = S.target;
78|     sheet('Move playback to ' + playerName(to) + ' from…', S.players.filter((p) => p.playerid !== to).map((p) => ({
78.1|       label: p.name, icon: 'speaker', run: async () => {
78.2|         if (transferring) return toast('Already moving playback…');
78.3|         transferring = true;
78.4|         try {
78.5|           // Read the queue and position there first: nothing changes here unless there's something to move.
78.6|           const st = await S.lms.rpc(p.playerid, ['status', '-', 1]);
78.7|           const q = await S.lms.rpc(p.playerid, ['status', 0, TRANSFER_MAX, 'tags:u']);
78.8|           const loop = q.playlist_loop || [];
78.9|           const cur = +st.playlist_cur_index || 0;
78.10|           const urls = loop.map((t) => t.url).filter(Boolean);
78.11|           if (!urls.length) return toast('Nothing to move: ' + p.name + '\'s queue is empty');
78.12|           // The playing track's place among the tracks that can be moved.
78.13|           const index = loop.slice(0, cur).filter((t) => t.url).length;
78.14|           const cut = +q.playlist_tracks > TRANSFER_MAX;
78.15|           toast(`Moving ${plural(urls.length, 'track')}${cut ? ` (the first ${TRANSFER_MAX})` : ''}…`);
78.16|           await S.lms.rpc(to, ['playlist', 'clear']);
78.17|           for (const u of urls) await S.lms.rpc(to, ['playlist', 'add', u]);
78.18|           await S.lms.rpc(to, ['playlist', 'index', Math.min(index, urls.length - 1)]);
78.19|           if (+st.time) await S.lms.rpc(to, ['time', st.time]);
78.20|           await S.lms.rpc(p.playerid, ['pause', 1]);   // only once the move is complete
78.21|           toast('Moved playback to ' + playerName(to)); pollSoon();
78.22|         } catch (e) {
78.23|           fail(new Error('Moving playback stopped part-way (' + p.name + ' carries on): ' + e.message));
78.24|         } finally { transferring = false; }
78.25|       },
78.26|     })));
79|   }
80|   
81|   // -- Alarms ------------------------------------------------------------------
82|   const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
83|   VIEWS.alarms = () => {
84|     const list = h('div', { class: 'list' });
85|     const master = h('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Alarms enabled' });
86|     master.addEventListener('change', () => act(['playerpref', 'alarmsEnabled', master.checked ? 1 : 0], master.checked ? 'Alarms on' : 'Alarms off'));
87|     async function load() {
88|       if (!S.target) return;
89|       try {
90|         const [r, en] = await Promise.all([rpc(['alarms', 0, 100, 'filter:all']), rpc(['playerpref', 'alarmsEnabled', '?'])]);
91|         master.checked = +en._p2 === 1;
92|         const al = r.alarms_loop || [];
93|         list.replaceChildren(...(al.length ? al.map((a) => {
94|           const sw = h('input', { type: 'checkbox', class: 'switch', checked: +a.enabled === 1, 'aria-label': 'Enabled' });
95|           sw.addEventListener('change', () => act(['alarm', 'update', 'id:' + a.id, 'enabled:' + (sw.checked ? 1 : 0)]));
96|           const days = String(a.dow || '').split(',').filter((x) => x !== '').map((d) => DAYS[+d]).join(' ');
97|           return h('div', { class: 'row' }, icon('alarm'),
98|             h('div', { class: 'meta' }, h('div', { class: 't1 big', text: fmtClock(+a.time) }), h('div', { class: 't2', text: [days || 'Never', +a.repeat ? 'repeats' : 'once', 'volume ' + a.volum[...]
99|             sw, btn('delete', 'Delete alarm', async () => { if (await confirm2('Delete this alarm?')) { await act(['alarm', 'delete', 'id:' + a.id], 'Alarm deleted'); load(); } }));
100|         }) : [h('div', { class: 'empty', text: 'No alarms on ' + playerName(S.target) + '.' })]));
101|       } catch (e) { fail(e); }
102|     }
103|     async function add() {
104|       const time = h('input', { type: 'time', class: 'field', value: '07:00', 'aria-label': 'Time' });
105|       const boxes = DAYS.map((d, i) => h('label', { class: 'day' }, h('input', { type: 'checkbox', checked: i > 0 && i < 6, value: i }), d));
106|       const vol = h('input', { type: 'range', min: 0, max: 100, value: 40, class: 'vol', 'aria-label': 'Volume' });
107|       const form = h('form', { class: 'prompt', onsubmit: async (e) => {
108|         e.preventDefault();
109|         const [hh, mm] = time.value.split(':').map(Number);
110|         const dow = boxes.map((b) => b.firstChild).filter((c) => c.checked).map((c) => c.value).join(',');
111|         closeSheet();
112|         await act(['alarm', 'add', 'time:' + (hh * 3600 + mm * 60), 'dow:' + dow, 'enabled:1', 'repeat:1', 'volume:' + vol.value], 'Alarm set');
113|         load();
114|       } }, time, h('div', { class: 'days' }, boxes), h('label', { class: 'lbl' }, 'Volume', vol),
115|       h('p', { class: 't2', text: 'The alarm plays the current queue (or LMS\'s default alarm sound).' }),
116|       h('div', { class: 'row-btns' }, h('button', { class: 'btn', type: 'submit' }, 'Add alarm')));
117|       sheet('New alarm on ' + playerName(S.target), [{ el: form }]);
118|     }
119|     return { title: 'Alarms', el: h('div', {}, h('label', { class: 'setting' }, h('span', { text: 'Alarms enabled on this player' }), master), list), onShow: load, perPlayer: true, actions: [btn([...]
120|   };
