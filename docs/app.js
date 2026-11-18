// 靈蘭：畫面與存檔。規則都在 engine.js，這裡只依引擎回傳的 log 播放。
(function () {
  const D = LL_DATA, E = LL_ENGINE, R = D.RULES;
  const SAVE_KEY = 'linglan.save.v1';
  const STEP_MS = 400;
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let game = null;        // 真正的狀態
  let view = null;        // 播放中畫面顯示的數值 { qi, de, leave }
  let playing = null;     // 播放中的計時器與剩餘紀錄

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
    toastTimer = setTimeout(() => { el.textContent = ''; }, 2400);
  }
  const title = el => D.MINISTERS[el].title;
  const sign = n => (n > 0 ? '+' : '−') + Math.abs(n);
  function newSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return (Date.now() ^ (Math.random() * 4294967296)) >>> 0; }
  }
  function openDlg(id) { const d = $(id); if (!d.open) d.showModal(); }
  function closeDlg(id) { const d = $(id); if (d.open) d.close(); }

  // ---------- 繪製 ----------
  function renderRegion(el, qi, away) {
    const box = document.querySelector(`.region[data-el="${el}"]`);
    const m = D.MINISTERS[el];
    const v = qi[el];
    const st = E.statusOf(v);
    let bar = '';
    for (let i = 1; i <= R.QI_MAX; i++) bar += `<i class="${i <= v ? 'on' : ''}"></i>`;
    box.classList.toggle('away', !!away);
    box.setAttribute('aria-label', `${m.title}，${m.place}，${el}，氣 ${v}，${st}${away ? '，告假中' : ''}`);
    box.innerHTML = `<div class="head"><span class="title">${m.title}</span><span class="el">${el}</span></div>`
      + `<span class="place">${m.place}</span>`
      + `<div class="bar" aria-hidden="true">${bar}</div>`
      + `<div class="val"><b>${v}</b><span class="st ${st}">${st}</span></div>`
      + (away ? '<span class="away-tag">告假</span>' : '');
  }
  function renderMap(qi, leave) {
    D.ELEMENTS.forEach(el => renderRegion(el, qi, leave[el]));
  }
  function renderTop(s, de) {
    const se = D.SEASONS[s.season];
    $('term').textContent = se.terms[s.turn - 1];
    $('turn-no').textContent = `第 ${s.turn} 旬・共 ${R.TURNS} 旬`;
    $('season-tag').textContent = `${se.name}・${se.tag}`;
    $('de').textContent = de;
  }
  function renderEvents(s) {
    const box = $('events');
    if (!s.events.length) { box.innerHTML = '<span class="none">朝中無事</span>'; return; }
    box.innerHTML = '';
    s.events.forEach((e, i) => {
      const def = D.EVENTS[e.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ev' + (e.stage === 'woe' ? ' woe' : '');
      b.innerHTML = `<small>${e.stage === 'woe' ? '禍患' : '徵兆'}</small>${def.name}`;
      b.addEventListener('click', () => showEvent(i));
      box.appendChild(b);
    });
  }
  function renderTokens(s) {
    const box = $('tokens');
    const total = Math.max(s.tokens, 0);
    let html = '<span>令</span>';
    for (let i = 0; i < total; i++) html += '<i>令</i>';
    if (!total) html += '<span>已用完</span>';
    box.innerHTML = html;
    box.setAttribute('aria-label', `還可以下 ${total} 道令`);
    $('btn-lamp').disabled = s.lamp || !!s.over;
    $('btn-lamp').textContent = s.lamp ? '已挑燈' : '挑燈';
    $('btn-sleep').disabled = !!s.over;
  }
  function fxLines(card) {
    const lines = card.fx.map(([el, d]) => `<span>${title(el)} ${sign(d)}</span>`);
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
      b.className = 'card';
      b.dataset.el = c.el;
      b.disabled = !can.ok;
      b.setAttribute('aria-label', `${c.name}，${c.el}，${c.tag}。${c.fx.map(([el, d]) => title(el) + sign(d)).join('，')}${c.draw ? '，再抽一張' : ''}${can.ok ? '' : '。' + can.reason}`);
      b.innerHTML = `<div class="top"><span class="cel">${c.el}</span><span class="tag">${c.tag}</span></div>`
        + `<div class="name">${c.name}</div><div class="fx">${fxLines(c)}</div>`
        + (can.ok ? '' : `<div class="why">${can.reason}</div>`);
      b.addEventListener('click', () => onPlay(i));
      box.appendChild(b);
    }
  }
  function render() {
    const s = game;
    renderTop(s, s.de);
    renderMap(s.qi, s.leave);
    renderEvents(s);
    renderTokens(s);
    renderHand(s);
  }

  // ---------- 紀錄文字 ----------
  function describe(e) {
    switch (e.type) {
      case 'turn': return `${D.SEASONS[e.season].terms[e.turn - 1]}，第 ${e.turn} 旬。`;
      case 'omen': return `傳來消息：「${D.EVENTS[e.id].name}」。`;
      case 'play': return `下令：${D.CARDS[e.card].name}。`;
      case 'shun': return '順應時令。';
      case 'ni': return '違逆時令。';
      case 'lamp': return '挑燈夜讀，多下一道令。';
      case 'rest':
        if (e.lamp) return '昨夜挑燈，睡得太晚。';
        return e.ok ? `${D.RESTS[e.rest].name}，作息合時。` : `${D.RESTS[e.rest].name}，與時令不合。`;
      case 'resolve': return `化解了「${D.EVENTS[e.id].name}」${e.stage === 'omen' ? '，防患於未然' : ''}。`;
      case 'dispel': return `「${D.EVENTS[e.id].name}」自行消散了。`;
      case 'woe': return `「${D.EVENTS[e.id].name}」沒有及時處理，成了禍患。`;
      case 'leave': return e.on ? `${title(e.el)}告假了，他的牌暫時不能用。` : `${title(e.el)}回朝了。`;
      case 'reshuffle': return '用過的牌洗回牌庫。';
      case 'qi': {
        const r = String(e.reason);
        const who = title(e.el);
        if (r === 'rest') return `睡得好，${who}精神 ${sign(e.delta)}。`;
        if (r === 'lamp') return `熬夜傷神，${who} ${sign(e.delta)}。`;
        if (r === 'shun') return `順時而為，${who} ${sign(e.delta)}。`;
        if (r === 'ni') return `逆時而為，${who} ${sign(e.delta)}。`;
        if (r.startsWith('woe:')) return `禍患「${D.EVENTS[r.slice(4)].name}」，${who} ${sign(e.delta)}。`;
        if (r.startsWith('gen:')) return `${title(r.slice(4))}氣盛，帶動${who} ${sign(e.delta)}。`;
        if (r.startsWith('over:')) return `${title(r.slice(5))}過亢，壓得${who} ${sign(e.delta)}。`;
        if (r === 'overself') return `${who}過亢，自己也耗了 ${Math.abs(e.delta)}。`;
        return '';
      }
      case 'de':
        if (e.reason === 'tag') return `本旬順時而治，德 ${sign(e.delta)}。`;
        if (e.reason === 'balance') return `五方安和，德 ${sign(e.delta)}。`;
        return `德 ${sign(e.delta)}。`;
      default: return '';
    }
  }

  // ---------- 播放 ----------
  function floatAt(el, delta) {
    const box = document.querySelector(`.region[data-el="${el}"]`);
    if (!box) return;
    const f = document.createElement('span');
    f.className = 'float ' + (delta > 0 ? 'up' : 'down');
    f.textContent = sign(delta);
    box.appendChild(f);
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    setTimeout(() => f.remove(), 1000);
  }
  // 套用一筆紀錄到畫面上的數值
  function applyEntry(e) {
    if (e.type === 'qi' || e.type === 'clamp') {
      const v = Math.max(R.QI_MIN, Math.min(R.QI_MAX, e.to));
      const before = view.qi[e.el];
      view.qi[e.el] = v;
      renderRegion(e.el, view.qi, view.leave[e.el]);
      if (e.type === 'qi' && v !== before) floatAt(e.el, v - before);
    } else if (e.type === 'leave') {
      view.leave[e.el] = e.on;
      renderRegion(e.el, view.qi, e.on);
    } else if (e.type === 'de') {
      view.de = e.to;
      $('de').textContent = e.to;
    }
  }
  function setBusy(on) {
    document.querySelectorAll('#game-view button').forEach(b => { if (b.id !== 'btn-menu') b.disabled = on || b.disabled; });
    $('narration').classList.toggle('playing', on);
  }
  // 依序播放紀錄；step 為 true 時一筆一筆來，否則一次全部套用
  function play(log, stepwise, done) {
    const entries = log.filter(e => e.type !== 'draw' && e.type !== 'tokens');
    view = { qi: Object.assign({}, view ? view.qi : game.qi), leave: Object.assign({}, view ? view.leave : game.leave), de: view ? view.de : game.de };
    const finish = () => {
      if (playing) { clearTimeout(playing.timer); playing = null; }
      $('narration').classList.remove('playing');
      view = null;
      render();
      if (done) done();
    };
    if (!stepwise || reduceMotion) {
      entries.forEach(applyEntry);
      const lines = entries.map(describe).filter(Boolean);
      $('narration').textContent = lines.slice(-3).join('');
      finish();
      return;
    }
    setBusy(true);
    let i = 0;
    const next = () => {
      if (i >= entries.length) { finish(); return; }
      const e = entries[i++];
      applyEntry(e);
      const text = describe(e);
      if (text) $('narration').textContent = text;
      if (e.type === 'turn') { renderTop(game, view.de); }
      playing.timer = setTimeout(next, text ? STEP_MS : 0);
    };
    playing = { timer: 0, skip: () => { clearTimeout(playing.timer); while (i < entries.length) applyEntry(entries[i++]); $('narration').textContent = entries.map(describe).filter(Boolean).slice(-2).join(''); finish(); } };
    next();
  }

  // ---------- 操作 ----------
  function onPlay(i) {
    if (playing || !game) return;
    const check = E.canPlay(game, i);
    if (!check.ok) { toast(check.reason); return; }
    const before = game;
    const r = E.playCard(game, i);
    game = r.state;
    save();
    view = { qi: Object.assign({}, before.qi), leave: Object.assign({}, before.leave), de: before.de };
    const entries = r.log.filter(e => e.type !== 'draw');
    entries.forEach(applyEntry);
    $('narration').textContent = entries.map(describe).filter(Boolean).join('');
    view = null;
    render();
  }
  function onLamp() {
    if (playing || !game) return;
    const r = E.burnLamp(game);
    if (r.log[0].type === 'denied') { toast(r.log[0].reason); return; }
    game = r.state;
    save();
    $('narration').textContent = describe(r.log[0]);
    render();
  }
  function onSleep() {
    if (playing || !game || game.over) return;
    $('sleep-note').textContent = game.lamp ? '今晚挑過燈了，怎麼睡都算熬夜。' : (game.tokens > 0 ? `還有 ${game.tokens} 道令沒下，確定要休息了嗎？` : '');
    openDlg('dlg-sleep');
  }
  function onRest(rest) {
    closeDlg('dlg-sleep');
    const before = game;
    const r = E.endTurn(game, rest);
    if (r.log[0].type === 'denied') { toast(r.log[0].reason); return; }
    game = r.state;
    save();
    view = { qi: Object.assign({}, before.qi), leave: Object.assign({}, before.leave), de: before.de };
    renderTop(before, before.de);
    play(r.log, true, () => { if (game.over) showOver(); });
  }
  function startNew() {
    const r = E.newGame(newSeed());
    game = r.state;
    save();
    try { const gc = window.goatcounter; if (gc && gc.count) gc.count({ path: 'linglan-play', title: '靈蘭即位', event: true, no_session: true }); } catch (e) { /* 略過 */ }
    showGame();
    $('narration').textContent = D.SEASONS[game.season].intro + ' ' + r.log.map(describe).filter(Boolean).join('');
    if (!seenHelp()) openDlg('dlg-help');
  }
  function seenHelp() {
    try { if (localStorage.getItem('linglan.help')) return true; localStorage.setItem('linglan.help', '1'); } catch (e) { /* 略過 */ }
    return false;
  }

  // ---------- 畫面切換 ----------
  function showTitle() {
    if (playing) playing.skip();
    ['dlg-over', 'dlg-menu', 'dlg-sleep', 'dlg-event'].forEach(closeDlg);
    const saved = load();
    $('btn-continue').hidden = !(saved && !saved.over);
    $('btn-new').textContent = saved && !saved.over ? '重新即位' : '即位';
    $('title-view').hidden = false;
    $('game-view').hidden = true;
    window.scrollTo(0, 0);
  }
  function showGame() {
    $('title-view').hidden = true;
    $('game-view').hidden = false;
    render();
    if (!$('narration').textContent) $('narration').textContent = '點一張牌來下令；處理完了，就寢進入下一旬。';
    if (game.over) showOver();
  }
  function showEvent(i) {
    const e = game.events[i];
    if (!e) return;
    const def = D.EVENTS[e.id];
    $('ev-kind').textContent = e.stage === 'woe' ? '禍患' : '徵兆';
    $('ev-name').textContent = def.name;
    $('ev-omen').textContent = def.omen;
    $('ev-woe').hidden = e.stage !== 'woe';
    $('ev-woe').textContent = `每旬結算時，${title(def.el)}的氣 −${R.WOE_DAMAGE}，直到化解為止。`;
    $('ev-hint').hidden = true;
    $('ev-hint').textContent = def.hint;
    $('btn-ask').hidden = false;
    openDlg('dlg-event');
  }
  function showOver() {
    const o = game.over;
    $('over-kind').textContent = o.win ? '一季過去' : '王國動盪';
    $('over-title').textContent = o.win ? `評等：${o.rank}` : '這一季撐不下去了';
    $('over-words').textContent = o.win ? `${D.TEXT.win}${D.TEXT.rankWords[o.rank]}` : D.TEXT.over[o.reason];
    const rows = [
      ['德', game.de],
      ['防患於未然', game.stats.omen + game.stats.dispel],
      ['事後補救', game.stats.woe],
      ['順時', game.shun],
      ['逆時', game.ni]
    ];
    $('over-score').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('over-decree').hidden = !o.win;
    $('over-decree').textContent = D.SEASONS[game.season].decree;
    openDlg('dlg-over');
  }

  // ---------- 綁定 ----------
  function bind() {
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', ev => { if (ev.target === d && d.id !== 'dlg-over') d.close(); }));
    $('btn-new').addEventListener('click', () => {
      const saved = load();
      if (saved && !saved.over && !confirm('重新即位會清除目前的進度，確定嗎？')) return;
      startNew();
    });
    $('btn-continue').addEventListener('click', () => { game = load(); if (game) { $('narration').textContent = ''; showGame(); } else showTitle(); });
    $('btn-help').addEventListener('click', () => openDlg('dlg-help'));
    $('btn-export').addEventListener('click', exportSave);
    $('btn-import').addEventListener('click', () => $('file-import').click());
    $('file-import').addEventListener('change', ev => { const f = ev.target.files[0]; if (f) importSave(f); ev.target.value = ''; });
    $('btn-lamp').addEventListener('click', onLamp);
    $('btn-sleep').addEventListener('click', onSleep);
    $('btn-menu').addEventListener('click', () => openDlg('dlg-menu'));
    $('narration').addEventListener('click', () => { if (playing) playing.skip(); });
    $('btn-ask').addEventListener('click', () => { $('ev-hint').hidden = false; $('btn-ask').hidden = true; });
    $('m-help').addEventListener('click', () => { closeDlg('dlg-menu'); openDlg('dlg-help'); });
    $('m-export').addEventListener('click', () => { closeDlg('dlg-menu'); exportSave(); });
    $('m-restart').addEventListener('click', () => { closeDlg('dlg-menu'); if (confirm('重新即位會清除目前的進度，確定嗎？')) startNew(); });
    $('m-home').addEventListener('click', showTitle);
    $('btn-home').addEventListener('click', () => { closeDlg('dlg-over'); clearSave(); game = null; showTitle(); });
    $('btn-again').addEventListener('click', () => { closeDlg('dlg-over'); startNew(); });

    const rests = $('rests');
    D.REST_ORDER.forEach(id => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<b>${D.RESTS[id].name}</b><span>${D.RESTS[id].desc}</span>`;
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
