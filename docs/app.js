// 靈蘭：畫面與存檔。規則都在 engine.js，這裡只依引擎回傳的 log 呈現。
(function () {
  const D = LL_DATA, E = LL_ENGINE, R = D.RULES;
  const SAVE_KEY = 'linglan.save.v1';
  const TOUR_KEY = 'linglan.tour';
  const MODE_KEY = 'linglan.mode';
  const UNLOCK_KEY = 'linglan.unlocked';
  const CLEARED_KEY = 'linglan.cleared';
  const SEASON_KEY = 'linglan.season';
  const LINE_MS = 280;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null;
  let sumTimer = 0;

  // ---------- 存檔 ----------
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, state: game })); } catch (e) { /* 私密瀏覽等情況，略過 */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && data.v === 1 && E.isValidState(data.state)) return data.state;
    } catch (e) { /* 讀不到就當作沒有存檔 */ }
    return null;
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 略過 */ } }
  function flag(key, set) {
    try { if (set) localStorage.setItem(key, '1'); return !!localStorage.getItem(key); } catch (e) { return false; }
  }

  function exportSave() {
    const state = game || load();
    if (!state) { toast('目前沒有進度可以匯出'); return; }
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const name = `靈蘭進度-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    const blob = new Blob([JSON.stringify({ app: 'linglan', v: 1, savedAt: d.toISOString(), state }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('已匯出進度');
  }
  function importSave(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || data.app !== 'linglan' || data.v !== 1 || !E.isValidState(data.state)) throw new Error('bad');
        if ((game || load()) && !confirm('匯入後會取代目前的進度，確定嗎？')) return;
        game = data.state;
        save();
        toast('已匯入進度');
        showGame();
      } catch (e) {
        toast('這個檔案不是靈蘭的進度備份');
      }
    };
    reader.onerror = () => toast('讀取檔案失敗');
    reader.readAsText(file);
  }

  // ---------- 小工具 ----------
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.textContent = ''; }, 2600);
  }
  const M = el => D.MINISTERS[el];
  const title = el => M(el).title;
  const who = el => `${M(el).title}（${M(el).organ}）`;
  const sign = n => (n > 0 ? '+' : '−') + Math.abs(n);
  const fill = t => t.replace('{DISPEL}', RR().WEATHER_DISPEL).replace('{OVER}', RR().OVER_AT);
  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Date.now() ^ (Math.random() * 4294967296)) >>> 0; }
  }
  function openDlg(id) { const d = $(id); if (!d.open) d.showModal(); d.scrollTop = 0; }
  function closeDlg(id) { const d = $(id); if (d.open) d.close(); }
  const season = s => D.SEASONS[s.season];
  const RR = () => E.rulesOf(game);
  // 挑燈的代價，例如「君主 −3、大匠 −2」
  const lampCost = () => RR().LAMP_COST.map(([el, d]) => `${title(el)} ${sign(d)}`).join('、');
  // 看過解說的徵兆（每局分開記），新手模式要看過才在牌上標「可化解」
  const READ_KEY = 'linglan.read';
  let readList = null;
  function readSet() {
    if (!readList) { try { readList = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); } catch (e) { readList = []; } if (!Array.isArray(readList)) readList = []; }
    return readList;
  }
  const readKey = (s, id) => `${s.seed}:${s.season}:${id}`;
  const isRead = (s, id) => readSet().includes(readKey(s, id));
  function markRead(s, id) {
    const list = readSet(), k = readKey(s, id);
    if (list.includes(k)) return;
    list.push(k);
    while (list.length > 60) list.shift();
    try { localStorage.setItem(READ_KEY, JSON.stringify(list)); } catch (e) { /* 略過 */ }
  }
  // 這件事在牌上要不要標「可化解」
  function hinted(s, id) {
    const h = E.rulesOf(s).FIX_HINT;
    return h === 'always' || (h === 'read' && isRead(s, id));
  }
  const unlocked = () => flag(UNLOCK_KEY);
  function chosenMode() {
    if (!unlocked()) return D.MODE_ORDER[0];
    try { const m = localStorage.getItem(MODE_KEY); if (D.MODES[m]) return m; } catch (e) { /* 略過 */ }
    return D.MODE_ORDER[0];
  }
  // 過關過的季節（任一難度）。舊版只記錄解鎖正常難度，視為春季已過關。
  function cleared() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(CLEARED_KEY) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    if (unlocked() && !list.includes(D.SEASONS[0].id)) list.push(D.SEASONS[0].id);
    return list;
  }
  function markCleared(si) {
    const list = cleared();
    const id = D.SEASONS[si].id;
    if (!list.includes(id)) list.push(id);
    try { localStorage.setItem(CLEARED_KEY, JSON.stringify(list)); } catch (e) { /* 略過 */ }
  }
  const seasonOpen = si => si === 0 || (D.SEASONS[si] && cleared().includes(D.SEASONS[si - 1].id));
  function chosenSeason() {
    let si = 0;
    try { si = parseInt(localStorage.getItem(SEASON_KEY), 10) || 0; } catch (e) { si = 0; }
    return seasonOpen(si) ? si : 0;
  }
  function setSeason(si) { try { localStorage.setItem(SEASON_KEY, String(si)); } catch (e) { /* 略過 */ } }
  function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 略過 */ } }

  // 這張牌和當季的關係：順時、逆時或無
  function timing(s, cardId) {
    const tag = D.CARDS[cardId].tag, se = season(s);
    if (tag === se.tag) return 'shun';
    if (tag === D.OPPOSITE[se.tag]) return 'ni';
    return '';
  }

  // ---------- 繪製 ----------
  function renderRegion(el, s) {
    const box = document.querySelector(`.region[data-el="${el}"]`);
    const m = M(el);
    const v = s.qi[el];
    const st = E.statusOf(v, s);
    const away = s.leave[el];
    let bar = '';
    for (let i = 1; i <= R.QI_MAX; i++) bar += `<i class="${i <= v ? 'on' : ''}"></i>`;
    box.classList.toggle('away', !!away);
    box.setAttribute('aria-label', `${m.title}，${m.organ}，${el}，氣 ${v}，${st}${away ? '，告假中' : ''}`);
    box.innerHTML = `<span class="head"><span class="title">${m.title}</span><span class="el">${el}</span></span>`
      + `<span class="organ">${m.organ}</span>`
      + `<span class="bar" aria-hidden="true">${bar}</span>`
      + `<span class="val"><b>${v}</b><span class="st ${st}">${st}</span></span>`
      + (away ? '<span class="away-tag">告假</span>' : '');
  }
  function renderTop(s) {
    const se = season(s);
    $('term').textContent = se.terms[s.turn - 1];
    $('turn-no').textContent = `第 ${s.turn} 旬・共 ${R.TURNS} 旬・${D.MODES[s.mode || 'normal'].name}`;
    $('season-tag').textContent = `${se.name}・${se.tag}`;
    $('season-tag').dataset.el = se.el;
    $('de').textContent = s.de;
    $('goal').innerHTML = `<b>目標</b>平安度過 ${R.TURNS} 旬，別讓大臣的氣掉到 ${R.LEAVE_AT} 以下`;
  }
  function renderEvents(s) {
    const box = $('events');
    if (!s.events.length) { box.innerHTML = '<span class="none">朝中無事</span>'; return; }
    box.innerHTML = '';
    s.events.forEach((e, i) => {
      const def = D.EVENTS[e.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ev' + (e.stage === 'woe' ? ' woe' : '') + (E.rulesOf(s).FIX_HINT === 'read' && !isRead(s, e.id) ? ' unread' : '');
      b.dataset.el = def.el;
      b.innerHTML = `<small>${e.stage === 'woe' ? '禍患' : '徵兆'}</small>${def.name}<span class="tap">看解說</span>`;
      b.addEventListener('click', () => showEvent(i));
      box.appendChild(b);
    });
  }
  function renderTokens(s) {
    const box = $('tokens');
    const total = Math.max(s.tokens, 0);
    let html = '<span>令</span>';
    for (let i = 0; i < total; i++) html += '<i>令</i>';
    if (!total) html += '<span>已用完，該就寢了</span>';
    box.innerHTML = html;
    box.setAttribute('aria-label', `還可以下 ${total} 道令`);
    $('btn-lamp').disabled = s.lamp || !!s.over;
    $('btn-lamp').textContent = s.lamp ? '已挑燈' : '挑燈';
    $('btn-sleep').disabled = !!s.over;
    $('btn-sleep').classList.toggle('nudge', total === 0 && !s.over);
  }
  function fxLines(card) {
    const lines = card.fx.map(([el, d]) => `<span class="${d > 0 ? 'up' : 'down'}">${title(el)} ${sign(d)}</span>`);
    if (card.draw) lines.push(`<span>再抽 ${card.draw} 張</span>`);
    return lines.join('');
  }
  function renderHand(s) {
    const box = $('hand');
    box.innerHTML = '';
    for (let i = 0; i < R.HAND; i++) {
      const id = s.hand[i];
      const b = document.createElement('button');
      b.type = 'button';
      if (!id) { b.className = 'card empty'; b.disabled = true; b.setAttribute('aria-label', '空位'); box.appendChild(b); continue; }
      const c = D.CARDS[id];
      const can = E.canPlay(s, i);
      const t = timing(s, id);
      const ev = s.events.find(e => E.matches(id, e.id) && hinted(s, e.id));
      const badges = [];
      if (ev) badges.push('<span class="badge fix">可化解</span>');
      if (t === 'shun') badges.push('<span class="badge shun">順時</span>');
      if (t === 'ni') badges.push(`<span class="badge ni">逆時・${title(season(s).el)} −${RR().SEASON_LOSS}</span>`);
      b.className = 'card' + (ev ? ' fixes' : '');
      b.dataset.el = c.el;
      b.disabled = !can.ok;
      b.setAttribute('aria-label', `${c.name}，${title(c.el)}的牌，${c.tag}。${c.fx.map(([el, d]) => title(el) + sign(d)).join('，')}${c.draw ? '，再抽一張' : ''}${ev ? '。可化解' + D.EVENTS[ev.id].name : ''}${t === 'shun' ? '。順時' : t === 'ni' ? '。逆時' : ''}${can.ok ? '' : '。' + can.reason}`);
      b.innerHTML = `<span class="top"><span class="cel">${c.el}</span><span class="tag">${c.tag}</span></span>`
        + `<span class="name">${c.name}</span><span class="fx">${fxLines(c)}</span>`
        + (badges.length ? `<span class="badges">${badges.join('')}</span>` : '')
        + (can.ok ? '' : `<span class="why">${can.reason}</span>`);
      b.addEventListener('click', () => onPlay(i));
      box.appendChild(b);
    }
  }
  function render() {
    const s = game;
    renderTop(s);
    D.ELEMENTS.forEach(el => renderRegion(el, s));
    renderEvents(s);
    renderTokens(s);
    renderHand(s);
  }

  // ---------- 紀錄文字 ----------
  // 回傳 { text, tone }；tone 為 up、down、good、bad 或空字串
  function describe(e, s) {
    const se = season(s);
    switch (e.type) {
      case 'turn': return { text: `${D.SEASONS[e.season].terms[e.turn - 1]}，第 ${e.turn} 旬開始。`, tone: '' };
      case 'omen': return { text: `早上傳來徵兆：「${D.EVENTS[e.id].name}」。${E.rulesOf(s).FIX_HINT === 'read' ? '點開看天師的解說，能化解的牌就會標出來。' : '點開看天師的解說，想想該派誰處理。'}`, tone: 'bad' };
      case 'play': return { text: `下令：${D.CARDS[e.card].name}。`, tone: '' };
      case 'shun': return { text: `這張屬「${se.tag}」，順應${se.name}天。`, tone: 'good' };
      case 'ni': return { text: `這張屬「${D.CARDS[e.card].tag}」，與${se.name}天的「${se.tag}」相逆。`, tone: 'bad' };
      case 'lamp': return { text: `挑燈夜讀，多一道令。就寢時${lampCost()}。`, tone: '' };
      case 'rest':
        if (e.lamp) return { text: '昨夜挑燈，睡得太晚。', tone: 'bad' };
        return e.ok ? { text: `${D.RESTS[e.rest].name}，作息合時。`, tone: 'good' } : { text: `${D.RESTS[e.rest].name}，與${se.name}天的作息不合，沒有加分。`, tone: 'bad' };
      case 'resolve': return { text: `化解了「${D.EVENTS[e.id].name}」${e.stage === 'omen' ? '，防患於未然' : ''}。`, tone: 'good' };
      case 'dispel': return { text: `${title(D.EVENTS[e.id].el)}夠強壯，「${D.EVENTS[e.id].name}」自行消散了。`, tone: 'good' };
      case 'woe': return { text: `「${D.EVENTS[e.id].name}」沒有當天處理，成了禍患：之後每旬 ${title(D.EVENTS[e.id].el)} −${RR().WOE_DAMAGE}。`, tone: 'bad' };
      case 'leave': return e.on ? { text: `${who(e.el)}撐不住，告假了。他的牌暫時不能用。`, tone: 'bad' } : { text: `${title(e.el)}恢復元氣，回朝了。`, tone: 'good' };
      case 'reshuffle': return { text: '用過的牌洗回牌庫。', tone: '' };
      case 'aid': return { text: `天師替陛下備好了「${D.CARDS[e.card].name}」，可以化解「${D.EVENTS[e.id].name}」。`, tone: 'good' };
      case 'qi': {
        const r = String(e.reason);
        const w = title(e.el);
        const tone = e.delta > 0 ? 'up' : 'down';
        const d = sign(e.delta);
        if (r === 'card') return { text: `${w} ${d}。`, tone };
        if (r === 'rest') return { text: `睡得好，${w} ${d}。`, tone };
        if (r === 'lamp') return { text: `熬夜傷神，${w} ${d}。`, tone };
        if (r === 'shun') return { text: `順時而為，${w} ${d}。`, tone };
        if (r === 'ni') return { text: `逆時而為，${w} ${d}。`, tone };
        if (r.startsWith('woe:')) return { text: `禍患「${D.EVENTS[r.slice(4)].name}」：${w} ${d}。`, tone };
        if (r.startsWith('gen:')) return { text: `${title(r.slice(4))}氣盛，帶動${w} ${d}（${r.slice(4)}生${e.el}）。`, tone };
        if (r.startsWith('over:')) return { text: `${title(r.slice(5))}過亢，壓得${w} ${d}（${r.slice(5)}剋${e.el}）。`, tone };
        if (r === 'overself') return { text: `${w}過亢，自己也耗損 ${d}。`, tone };
        return { text: '', tone: '' };
      }
      case 'de':
        if (e.reason === 'tag') return { text: `這一旬有順時而治，德 ${sign(e.delta)}。`, tone: 'good' };
        if (e.reason === 'balance') return { text: `季末五方安和，德 ${sign(e.delta)}。`, tone: 'good' };
        if (e.reason === 'omen' || e.reason === 'dispel') return { text: `治於未病，德 ${sign(e.delta)}。`, tone: 'good' };
        return { text: `德 ${sign(e.delta)}。`, tone: 'good' };
      default: return { text: '', tone: '' };
    }
  }
  const visible = log => log.filter(e => e.type !== 'draw' && e.type !== 'tokens' && e.type !== 'clamp');

  // ---------- 地圖上的浮動數字 ----------
  function floatAt(el, delta) {
    const box = document.querySelector(`.region[data-el="${el}"]`);
    if (!box || !delta) return;
    const f = document.createElement('span');
    f.className = 'float ' + (delta > 0 ? 'up' : 'down');
    f.textContent = sign(delta);
    box.appendChild(f);
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    setTimeout(() => f.remove(), 1100);
  }
  function floatDiff(before, after) {
    D.ELEMENTS.forEach(el => floatAt(el, after.qi[el] - before.qi[el]));
  }

  // ---------- 操作 ----------
  function onPlay(i) {
    if (!game) return;
    const check = E.canPlay(game, i);
    if (!check.ok) { toast(check.reason); return; }
    const before = game;
    const r = E.playCard(game, i);
    game = r.state;
    save();
    render();
    floatDiff(before, game);
    $('narration').innerHTML = visible(r.log).map(e => describe(e, before)).filter(x => x.text)
      .map(x => `<span class="${x.tone}">${x.text}</span>`).join('');
  }
  function onLamp() {
    if (!game) return;
    const r = E.burnLamp(game);
    if (r.log[0].type === 'denied') { toast(r.log[0].reason); return; }
    game = r.state;
    save();
    $('narration').textContent = describe(r.log[0], game).text;
    render();
  }
  function onSleep() {
    if (!game || game.over) return;
    const se = season(game);
    const notes = [];
    if (game.lamp) notes.push(`今晚挑過燈了，怎麼睡都算熬夜：${lampCost()}。`);
    else notes.push(se.restQuote);
    if (game.tokens > 0) notes.push(`還有 ${game.tokens} 道令沒下。`);
    $('sleep-note').textContent = notes.join('');
    document.querySelectorAll('#rests button').forEach(b => {
      b.classList.toggle('right', !game.lamp && b.dataset.rest === se.rest);
    });
    openDlg('dlg-sleep');
  }
  function onRest(rest) {
    closeDlg('dlg-sleep');
    const before = game;
    const r = E.endTurn(game, rest);
    if (r.log[0].type === 'denied') { toast(r.log[0].reason); return; }
    game = r.state;
    save();
    showSummary(before, r.log);
  }

  // 結算小結：一行一行出現，點一下全部顯示
  function showSummary(before, log) {
    const entries = visible(log);
    const cut = entries.findIndex(e => e.type === 'turn');
    const settle = cut === -1 ? entries : entries.slice(0, cut);
    const next = cut === -1 ? [] : entries.slice(cut);
    const lines = settle.filter(e => e.type !== 'over').map(e => describe(e, before)).filter(x => x.text);
    if (!lines.length) lines.push({ text: '這一夜平平靜靜。', tone: '' });
    if (next.length) {
      lines.push({ text: '', tone: 'sep' });
      next.map(e => describe(e, game)).filter(x => x.text).forEach(x => lines.push(x));
    }
    $('sum-kind').textContent = `${season(before).terms[before.turn - 1]}・第 ${before.turn} 旬結束`;
    $('sum-title').textContent = game.over ? (game.over.win ? '一季平安過去' : '王國撐不下去了') : '這一夜發生的事';
    $('sum-next').textContent = game.over ? '看結果' : `迎接${season(game).terms[game.turn - 1]}`;
    const list = $('sum-list');
    list.innerHTML = '';
    let k = 0;
    const add = () => {
      if (k >= lines.length) return;
      const x = lines[k++];
      const li = document.createElement('li');
      li.className = x.tone;
      li.textContent = x.text;
      list.appendChild(li);
    };
    const all = () => { clearInterval(sumTimer); while (k < lines.length) add(); };
    clearInterval(sumTimer);
    if (reduceMotion) all();
    else { add(); sumTimer = setInterval(() => { add(); if (k >= lines.length) clearInterval(sumTimer); }, LINE_MS); }
    list.onclick = all;
    $('sum-next').onclick = () => {
      all();
      closeDlg('dlg-sum');
      render();
      floatDiff(before, game);
      $('narration').textContent = game.over ? '' : '新的一旬。先看看徵兆，再下令。';
      if (game.over) showOver();
    };
    openDlg('dlg-sum');
  }

  function startNew(mode, si) {
    const r = E.newGame(newSeed(), mode || chosenMode(), si === undefined ? chosenSeason() : si);
    game = r.state;
    save();
    try { const gc = window.goatcounter; if (gc && gc.count) gc.count({ path: 'linglan-play', title: '靈蘭即位', event: true, no_session: true }); } catch (e) { /* 略過 */ }
    showGame();
    $('narration').innerHTML = `<span>${fill(season(game).intro)}</span>` + visible(r.log).map(e => describe(e, game)).filter(x => x.text).map(x => `<span class="${x.tone}">${x.text}</span>`).join('');
    if (!flag(TOUR_KEY)) startTour();
  }

  // ---------- 天師導覽 ----------
  const TOUR = [
    { target: null, text: '陛下即位了。古人把身體看成一座王國：心是君主，肝是將軍，脾胃是司倉，肺是宰相，腎是大匠。陛下，就是這個身體的主人。' },
    { target: 'kingdom', text: '每位都有「氣」，從 0 到 10。在 4 到 8 之間最安穩，太低會生病告假，太高也會出問題。點人物可以看詳細說明。' },
    { target: 'goal', text: () => `目標是平安度過 ${R.TURNS} 旬。大臣的氣掉到 ${R.LEAVE_AT} 以下就會告假；兩位同時告假，或君主的氣歸零，王國就撐不下去了。` },
    { target: 'events', text: () => `早上傳來的徵兆，是身體出狀況前的小訊號。點開看我的解說。當天化解德最高；拖過一天就成了禍患，每旬扣 ${RR().WOE_DAMAGE} 點氣。` },
    { target: 'hand', text: () => `點一張牌，就是下一道令。${RR().FIX_HINT === 'read' ? '看過徵兆的解說後，能處理它的牌會標上「可化解」。' : '要自己判斷哪張牌能處理徵兆。'}「順時」的牌順著季節，有額外好處；「逆時」的牌會傷人，能免則免。` },
    { target: 'tokens', text: '每旬能下的令有限。君主的氣越高，令就越多，所以睡眠很重要。' },
    { target: 'btn-sleep', text: '令用完就就寢。選對作息，君主隔天精神更好。「挑燈」能多一道令，但很傷身，非不得已別用。好了，開始治理吧。' }
  ];
  let tourStep = 0;
  function startTour() {
    ['dlg-menu', 'dlg-help'].forEach(closeDlg);
    tourStep = 0;
    $('coach').hidden = false;
    showTourStep();
  }
  function clearTarget() { document.querySelectorAll('.coach-on').forEach(x => x.classList.remove('coach-on')); }
  function showTourStep() {
    clearTarget();
    const st = TOUR[tourStep];
    const text = typeof st.text === 'function' ? st.text() : st.text;
    $('coach-text').textContent = text;
    $('coach-step').textContent = `${tourStep + 1} / ${TOUR.length}`;
    $('coach-next').textContent = tourStep === TOUR.length - 1 ? '開始治理' : '下一步';
    const bubble = $('coach-bubble');
    bubble.classList.remove('at-top', 'at-bottom');
    if (st.target) {
      const t = $(st.target);
      t.classList.add('coach-on');
      t.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      setTimeout(() => {
        const rect = t.getBoundingClientRect();
        bubble.classList.add(rect.top + rect.height / 2 > window.innerHeight / 2 ? 'at-top' : 'at-bottom');
      }, reduceMotion ? 0 : 350);
    } else {
      bubble.classList.add('at-bottom');
    }
    $('coach-next').focus();
  }
  function endTour() {
    clearTarget();
    $('coach').hidden = true;
    flag(TOUR_KEY, true);
  }

  // ---------- 畫面切換 ----------
  function showTitle() {
    ['dlg-over', 'dlg-menu', 'dlg-sleep', 'dlg-event', 'dlg-sum', 'dlg-minister'].forEach(closeDlg);
    endTourQuiet();
    const saved = load();
    $('btn-continue').hidden = !(saved && !saved.over);
    $('btn-new').textContent = saved && !saved.over ? '重新即位' : '即位';
    renderSeasons();
    renderModes();
    $('title-view').hidden = false;
    $('game-view').hidden = true;
    window.scrollTo(0, 0);
  }
  const SEASON_NAMES = ['春', '夏', '秋', '冬'];
  function renderSeasons() {
    const box = $('seasons');
    const cur = chosenSeason();
    box.hidden = !seasonOpen(1);
    $('lead-season').textContent = `讓王國平安度過這個${D.SEASONS[cur].name}天。`;
    if (box.hidden) return;
    box.innerHTML = '';
    SEASON_NAMES.forEach((name, si) => {
      const b = document.createElement('button');
      b.type = 'button';
      const exists = !!D.SEASONS[si];
      const open = exists && seasonOpen(si);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(si === cur));
      b.disabled = !open;
      b.innerHTML = `<b>${name}</b><small>${!exists ? '製作中' : open ? (cleared().includes(D.SEASONS[si].id) ? '已過關' : '可挑戰') : '未解鎖'}</small>`;
      if (exists) b.dataset.el = D.SEASONS[si].el;
      b.addEventListener('click', () => { setSeason(si); renderSeasons(); });
      box.appendChild(b);
    });
  }
  function renderModes() {
    const box = $('modes');
    const open = unlocked();
    box.hidden = !open;
    $('mode-note').textContent = open ? D.MODES[chosenMode()].desc : `第一次治理從${D.MODES[D.MODE_ORDER[0]].name}開始，過關後可以挑戰${D.MODES[D.MODE_ORDER[1]].name}難度。`;
    if (!open) return;
    const cur = chosenMode();
    box.innerHTML = '';
    D.MODE_ORDER.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(m === cur));
      b.textContent = D.MODES[m].name;
      b.addEventListener('click', () => { setMode(m); renderModes(); });
      box.appendChild(b);
    });
  }
  function endTourQuiet() { clearTarget(); $('coach').hidden = true; }
  function showGame() {
    $('title-view').hidden = true;
    $('game-view').hidden = false;
    render();
    if (!$('narration').textContent) $('narration').textContent = '先點開徵兆看看，再點牌下令；令用完就就寢。';
    if (game.over) showOver();
  }
  function showEvent(i) {
    const e = game.events[i];
    if (!e) return;
    const def = D.EVENTS[e.id];
    $('ev-kind').textContent = (e.stage === 'woe' ? '禍患' : '徵兆') + '・' + (def.kind === 'weather' ? '天候' : '情緒');
    $('ev-name').textContent = def.name;
    $('ev-omen').textContent = def.omen;
    $('ev-woe').hidden = e.stage !== 'woe';
    $('ev-woe').textContent = `已經拖成禍患：每旬結算時 ${title(def.el)} −${RR().WOE_DAMAGE}，直到化解為止。現在化解，德只有 +${RR().DE_WOE}。`;
    $('ev-why').textContent = fill(def.why);
    $('ev-quote').textContent = `「${def.quote}」`;
    markRead(game, e.id);
    render();
    openDlg('dlg-event');
  }
  function showMinister(el) {
    if (!game) return;
    const m = M(el), v = game.qi[el];
    $('mi-kind').textContent = `${m.dir}方・${el}`;
    $('mi-name').textContent = `${m.title}・${m.organ}`;
    $('mi-line').textContent = `「${m.line}」`;
    const parts = [`氣 ${v}，${E.statusOf(v, game)}。`];
    if (game.leave[el]) parts.push(`正在告假，氣回到 ${R.RETURN_AT} 以上才會回朝。`);
    else if (el !== D.SOVEREIGN && v <= R.LEAVE_AT + 1) parts.push(`快撐不住了，再掉到 ${R.LEAVE_AT} 以下就會告假。`);
    if (v >= RR().GEN_AT) parts.push(`氣盛，結算時會帶動${title(D.GEN[el])}（${el}生${D.GEN[el]}）。`);
    if (v >= RR().OVER_AT) parts.push(`過亢，結算時會壓制${title(D.CTRL[el])}（${el}剋${D.CTRL[el]}），自己也會耗損。`);
    if (el === D.SOVEREIGN) parts.push(`君主的氣決定每旬的令：現在是 ${E.tokensFor(v, game.mode, game.season)} 道。`);
    $('mi-state').textContent = parts.join('');
    openDlg('dlg-minister');
  }
  function showOver() {
    const o = game.over;
    $('over-kind').textContent = o.win ? '一季過去' : '王國動盪';
    $('over-title').textContent = o.win ? `評等：${o.rank}` : '這一季撐不下去了';
    $('over-words').textContent = o.win ? `${D.TEXT.win.replace('{season}', season(game).name)}${D.TEXT.rankWords[o.rank]}` : D.TEXT.over[o.reason];
    $('over-tip').hidden = o.win;
    $('over-tip').textContent = o.win ? '' : D.TEXT.tips[o.reason];
    const rows = [
      ['德', game.de],
      ['當天化解', game.stats.omen + game.stats.dispel],
      ['拖成禍患才化解', game.stats.woe],
      ['順時', game.shun],
      ['逆時', game.ni]
    ];
    $('over-score').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const rk = R.RANKS;
    $('over-ranks').hidden = !o.win;
    $('over-ranks').textContent = `評等：德 ${rk[0].min} 以上為${rk[0].name}，${rk[1].min} 以上為${rk[1].name}，其餘為${rk[2].name}。`;
    $('over-decree').hidden = !o.win;
    const se = season(game);
    $('over-decree').innerHTML = `<span>${se.decree}</span><cite>${se.decreeSource}</cite>`;
    $('over-reveal').hidden = !o.win;
    $('over-reveal').textContent = D.TEXT.reveal;
    const mode = game.mode || 'normal';
    const nextMode = D.MODE_ORDER[D.MODE_ORDER.indexOf(mode) + 1];
    const nextSeason = D.SEASONS[game.season + 1] ? game.season + 1 : null;
    const notes = [];
    if (o.win) {
      markCleared(game.season);
      if (nextMode && !unlocked()) flag(UNLOCK_KEY, true);
      if (nextSeason !== null) notes.push(`已解鎖${D.SEASONS[nextSeason].name}季。`);
      if (nextMode) notes.push(`可以挑戰「${D.MODES[nextMode].name}」難度。`);
      if (D.SEASONS.every(x => cleared().includes(x.id))) notes.push('四季都平安度過了！「一整年」連續模式製作中。');
    }
    $('over-unlock').hidden = !notes.length;
    $('over-unlock').textContent = notes.join('');
    let again = { text: '再來一次', mode, season: game.season };
    if (o.win && nextSeason !== null) again = { text: `前往${D.SEASONS[nextSeason].name}天`, mode, season: nextSeason };
    else if (o.win && nextMode) again = { text: `挑戰${D.MODES[nextMode].name}難度`, mode: nextMode, season: game.season };
    $('btn-again').textContent = again.text;
    $('btn-again').dataset.mode = again.mode;
    $('btn-again').dataset.season = again.season;
    openDlg('dlg-over');
  }

  // ---------- 綁定 ----------
  function bind() {
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', ev => {
      if (ev.target === d && !['dlg-over', 'dlg-sum'].includes(d.id)) d.close();
    }));
    $('dlg-sum').addEventListener('cancel', ev => { ev.preventDefault(); $('sum-next').click(); });
    $('btn-new').addEventListener('click', () => {
      const saved = load();
      if (saved && !saved.over && !confirm('重新即位會清除目前的進度，確定嗎？')) return;
      startNew();
    });
    $('btn-continue').addEventListener('click', () => { game = load(); if (game) { $('narration').textContent = ''; showGame(); } else showTitle(); });
    $('btn-export').addEventListener('click', exportSave);
    $('btn-import').addEventListener('click', () => $('file-import').click());
    $('file-import').addEventListener('change', ev => { const f = ev.target.files[0]; if (f) importSave(f); ev.target.value = ''; });
    $('btn-lamp').addEventListener('click', onLamp);
    $('btn-sleep').addEventListener('click', onSleep);
    $('btn-menu').addEventListener('click', () => openDlg('dlg-menu'));
    $('season-tag').addEventListener('click', () => toast(season(game).tagNote));
    document.querySelectorAll('.region').forEach(b => b.addEventListener('click', () => showMinister(b.dataset.el)));
    $('m-tour').addEventListener('click', startTour);
    $('m-help').addEventListener('click', () => {
      closeDlg('dlg-menu');
      document.querySelectorAll('[data-r]').forEach(el => { el.textContent = RR()[el.dataset.r]; });
      openDlg('dlg-help');
    });
    $('m-export').addEventListener('click', () => { closeDlg('dlg-menu'); exportSave(); });
    $('m-restart').addEventListener('click', () => { closeDlg('dlg-menu'); if (confirm('重新即位會清除目前的進度，確定嗎？')) startNew(game.mode, game.season); });
    $('m-home').addEventListener('click', showTitle);
    $('btn-home').addEventListener('click', () => { closeDlg('dlg-over'); clearSave(); game = null; showTitle(); });
    $('btn-again').addEventListener('click', () => {
      const m = $('btn-again').dataset.mode;
      const si = parseInt($('btn-again').dataset.season, 10) || 0;
      closeDlg('dlg-over');
      setMode(m);
      setSeason(si);
      startNew(m, si);
    });
    $('coach-next').addEventListener('click', () => { if (tourStep < TOUR.length - 1) { tourStep++; showTourStep(); } else endTour(); });
    $('coach-skip').addEventListener('click', endTour);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('coach').hidden) endTour(); });

    const rests = $('rests');
    D.REST_ORDER.forEach(id => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.rest = id;
      b.innerHTML = `<b>${D.RESTS[id].name}</b><span>${D.RESTS[id].desc}</span><em>合時</em>`;
      b.addEventListener('click', () => onRest(id));
      rests.appendChild(b);
    });

    document.querySelectorAll('[data-r]').forEach(el => { el.textContent = R[el.dataset.r]; });
  }

  // 使用人數（GoatCounter 公開計數，只取得總數）
  fetch('https://imqingstone.goatcounter.com/counter/linglan-play.json').then(r => (r.ok ? r.json() : null))
    .then(d => { const el = $('usage'); if (el && d && d.count) { el.textContent = '已有 ' + d.count + ' 位君主即位'; el.hidden = false; } })
    .catch(() => {});

  bind();
  showTitle();
})();
