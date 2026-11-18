// 靈蘭測試：node tests/verify.js（不依賴任何套件）
const assert = require('assert');
const D = require('../docs/data.js');
const E = require('../docs/engine.js');
const R = D.RULES;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failed++; console.error('✗ ' + name + '\n  ' + (err && err.stack || err)); }
}

const SPRING = D.SEASONS[0];
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
const clone = o => JSON.parse(JSON.stringify(o));

// 依需要組出指定狀態，方便逐條驗證規則
function make(over) {
  const s = clone(E.newGame(1).state);
  s.events = [];
  s.eventDeck = [];
  s.tokens = 3;
  D.ELEMENTS.forEach(el => { s.qi[el] = 5; }); // 規則測試一律從 5 起算，不受開局常數影響
  // 把手牌換成指定的牌，其餘放回牌庫，保持牌數守恆
  if (over && over.hand) {
    const all = SPRING.deck.slice();
    s.hand = over.hand.slice();
    s.deck = all.filter(id => !s.hand.includes(id));
    s.discard = [];
    delete over.hand;
  }
  if (over && over.qi) { Object.assign(s.qi, over.qi); delete over.qi; }
  return Object.assign(s, over || {});
}
const typesOf = log => log.map(e => e.type);
const totalCards = s => s.deck.length + s.hand.length + s.discard.length;

// ---------- 資料 ----------
test('資料：牌組與事件都存在', () => {
  SPRING.deck.forEach(id => assert.ok(D.CARDS[id], id));
  SPRING.events.forEach(id => assert.ok(D.EVENTS[id], id));
  assert.strictEqual(SPRING.deck.length, 15);
  assert.strictEqual(SPRING.events.length, 6);
  assert.strictEqual(SPRING.terms.length, R.TURNS);
});

test('資料：五行生剋各成一圈', () => {
  ['GEN', 'CTRL'].forEach(k => {
    let el = '木'; const seen = new Set();
    for (let i = 0; i < 5; i++) { seen.add(el); el = D[k][el]; }
    assert.strictEqual(el, '木'); assert.strictEqual(seen.size, 5);
  });
});

test('資料：對外的地方（首頁、頁首、README）不提題材', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const titleView = html.slice(html.indexOf('<section id="title-view"'), html.indexOf('</section>'));
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  const banned = ['黃帝', '內經', '臟腑', '穴位', '中醫', '岐伯', '經絡', '經脈', '肝', '脾', '肺', '腎'];
  [['頁首', head], ['首頁', titleView], ['README', readme]].forEach(([name, text]) => {
    assert.ok(text.length > 50, name + ' 沒有讀到內容');
    banned.forEach(w => assert.ok(!text.includes(w), name + ' 出現「' + w + '」'));
  });
});

test('資料：全站不出現五辛', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '../docs');
  const files = fs.readdirSync(dir).filter(f => /\.(html|js|css)$/.test(f)).map(f => path.join(dir, f));
  files.push(path.join(__dirname, '../README.md'));
  files.forEach(f => {
    const text = fs.readFileSync(f, 'utf8');
    ['蔥', '蒜', '韭', '薤', '興渠'].forEach(w => assert.ok(!text.includes(w), path.basename(f) + ' 出現「' + w + '」'));
  });
});

test('資料：每位要角與事件都有公開的說明與原文', () => {
  D.ELEMENTS.forEach(el => { const m = D.MINISTERS[el]; assert.ok(m.organ && m.line, el); });
  Object.values(D.EVENTS).forEach(e => assert.ok(e.omen && e.why && e.quote, e.name));
  assert.ok(SPRING.decreeSource && SPRING.restQuote && SPRING.tagNote);
});

// ---------- 開局 ----------
test('開局：五行皆為初始值、手牌 4、第 1 旬有一則徵兆、令依火氣', () => {
  const { state: s, log } = E.newGame(42);
  D.ELEMENTS.forEach(el => assert.strictEqual(s.qi[el], R.QI_START));
  assert.strictEqual(s.hand.length, 4);
  assert.strictEqual(s.events.length, 1);
  assert.strictEqual(s.events[0].stage, 'omen');
  assert.strictEqual(s.tokens, E.tokensFor(R.QI_START));
  assert.strictEqual(s.eventDeck.length, R.EVENT_TURNS - 1);
  assert.strictEqual(totalCards(s), 15);
  assert.deepStrictEqual(typesOf(log).slice(0, 2), ['turn', 'omen']);
});

test('令：依火氣決定', () => {
  let prev = Infinity;
  for (let v = 10; v >= 0; v--) {
    const n = E.tokensFor(v);
    assert.ok(n >= 1 && n <= prev, '火越高，令不應越少');
    prev = n;
  }
  assert.strictEqual(E.tokensFor(10), 3); assert.strictEqual(E.tokensFor(0), 1);
});

test('狀態字樣', () => {
  assert.deepStrictEqual([0, 2, 3, 6, 7, 9, 10].map(E.statusOf), ['虛', '虛', '平', '平', '盛', '盛', '亢']);
});

// ---------- 出牌 ----------
test('出牌：效果、花令、進棄牌堆', () => {
  const s = make({ hand: ['decree', 'well', 'still', 'court'] });
  const { state: t } = E.playCard(s, 0); // 頒布節令：金 +2，收＝逆時，木 −1
  assert.strictEqual(t.qi.金, 7);
  assert.strictEqual(t.tokens, 2);
  assert.ok(t.discard.includes('decree'));
  assert.strictEqual(t.hand.length, 3);
});

test('順時：當季五行 +1 每旬只一次，順每次都加', () => {
  let s = make({ hand: ['garden', 'sow', 'reward', 'well'] });
  s = E.playCard(s, 1).state; // 春耕播種：土 +2，生
  assert.strictEqual(s.qi.土, 7); assert.strictEqual(s.qi.木, 6); assert.strictEqual(s.shun, 1);
  s = E.playCard(s, 0).state; // 巡行園囿：木 +2，生
  assert.strictEqual(s.qi.木, 8); assert.strictEqual(s.shun, 2);
  assert.ok(s.seasonTagPlayed);
});

test('逆時：當季五行每次都 −1', () => {
  let s = make({ hand: ['decree', 'justice', 'granary', 'well'] });
  s = E.playCard(s, 0).state; // 金 +2，木 −1
  assert.strictEqual(s.qi.木, 4);
  s = E.playCard(s, 0).state; // 肅清刑獄：金 +3、木 −1，再逆時木 −1
  assert.strictEqual(s.qi.木, 2); assert.strictEqual(s.ni, 2);
});

test('長、藏在春天無額外影響', () => {
  const s = make({ hand: ['feast', 'well', 'decree', 'sow'] });
  const t = E.playCard(s, 0).state;
  assert.strictEqual(t.qi.木, 5); assert.strictEqual(t.shun, 0); assert.strictEqual(t.ni, 0);
});

test('出牌時氣立即限制在 0–10', () => {
  const s = make({ hand: ['drill', 'well', 'decree', 'sow'], qi: { 木: 9, 水: 0 } });
  const t = E.playCard(s, 0).state;
  assert.strictEqual(t.qi.木, 10); assert.strictEqual(t.qi.水, 0);
});

test('抽牌：論功行賞補一張，牌庫空時洗回棄牌堆', () => {
  const s = make({ hand: ['reward', 'well', 'decree', 'sow'] });
  s.discard = s.deck.slice(); s.deck = [];
  const { state: t, log } = E.playCard(s, 0);
  assert.strictEqual(t.hand.length, 4);
  assert.ok(typesOf(log).includes('reshuffle'));
  assert.strictEqual(totalCards(t), 15);
});

test('不能出牌：令用完、大臣告假、遊戲結束', () => {
  const s = make({ hand: ['decree', 'well', 'still', 'court'] });
  s.tokens = 0;
  assert.strictEqual(E.canPlay(s, 0).ok, false);
  s.tokens = 2; s.leave.金 = true;
  assert.strictEqual(E.canPlay(s, 0).ok, false);
  assert.strictEqual(E.canPlay(s, 1).ok, true);
  const r = E.playCard(s, 0);
  assert.strictEqual(r.state, s); assert.strictEqual(r.log[0].type, 'denied');
  s.over = { win: false };
  assert.strictEqual(E.canPlay(s, 1).ok, false);
});

// ---------- 化解 ----------
test('情志：要用剋它的五行化解', () => {
  assert.ok(E.matches('decree', 'rage'));      // 金剋木
  assert.ok(!E.matches('garden', 'rage'));
  assert.ok(E.matches('well', 'revel'));       // 水剋火
  assert.ok(E.matches('garden', 'brood'));     // 木剋土
  assert.ok(E.matches('feast', 'sigh'));       // 火剋金
  assert.ok(!E.matches('sow', 'sigh'));
});

test('天候：同五行或生它的五行可化解', () => {
  assert.ok(E.matches('garden', 'eastwind')); assert.ok(E.matches('well', 'eastwind'));
  assert.ok(!E.matches('decree', 'eastwind'));
  assert.ok(E.matches('well', 'chill')); assert.ok(E.matches('decree', 'chill'));
  assert.ok(!E.matches('sow', 'chill'));
});

test('化解：徵兆 +3 德、禍患 +1 德，先化解最早的', () => {
  const s = make({ hand: ['decree', 'justice', 'well', 'sow'] });
  s.events = [{ id: 'rage', stage: 'woe', since: 1 }, { id: 'chill', stage: 'omen', since: 2 }];
  let t = E.playCard(s, 0).state; // 頒布節令：金，兩件都符合，化解最早的將軍震怒（禍患）
  assert.deepStrictEqual(t.events.map(e => e.id), ['chill']);
  assert.strictEqual(t.de, 1);
  t = E.playCard(t, 0).state;
  assert.strictEqual(t.events.length, 0);
  assert.strictEqual(t.de, 4);
});

// ---------- 結算 ----------
test('作息合時火 +1；不合時不變', () => {
  const s = make({});
  assert.strictEqual(E.endTurn(s, 'late-early').state.qi.火, 6);
  assert.strictEqual(E.endTurn(s, 'early-late').state.qi.火, 5);
});

test('挑燈：令 +1，每旬一次，結算火 −1 水 −1 且作息不算合時', () => {
  const s = make({});
  const a = E.burnLamp(s).state;
  assert.strictEqual(a.tokens, 4);
  assert.strictEqual(E.burnLamp(a).log[0].type, 'denied');
  const t = E.endTurn(a, 'late-early').state;
  assert.strictEqual(t.qi.火, 4); assert.strictEqual(t.qi.水, 4);
  assert.strictEqual(t.lamp, false);
});

test('作息必須是三者之一', () => {
  assert.strictEqual(E.endTurn(make({}), 'nap').log[0].type, 'denied');
});

test('禍患每旬扣 1；新轉的禍患當旬不扣', () => {
  const s = make({});
  s.events = [{ id: 'rage', stage: 'woe', since: 1 }, { id: 'sigh', stage: 'omen', since: 2 }];
  const t = E.endTurn(s, 'early-late').state;
  assert.strictEqual(t.qi.木, 5 - R.WOE_DAMAGE); assert.strictEqual(t.qi.金, 5);
  assert.ok(t.events.every(e => e.stage === 'woe'));
});

test('天候徵兆：該五行 7 以上自動消散，視同徵兆化解', () => {
  const s = make({ qi: { 木: 7 } });
  s.events = [{ id: 'eastwind', stage: 'omen', since: 1 }];
  const { state: t, log } = E.endTurn(s, 'early-late');
  assert.strictEqual(t.events.length, 0);
  assert.ok(typesOf(log).includes('dispel'));
  assert.strictEqual(t.de, 3);
  const s2 = make({ qi: { 木: 6 } });
  s2.events = [{ id: 'eastwind', stage: 'omen', since: 1 }];
  assert.strictEqual(E.endTurn(s2, 'early-late').state.events[0].stage, 'woe');
});

test('情志徵兆不會自動消散', () => {
  const s = make({ qi: { 木: 9 } });
  s.events = [{ id: 'rage', stage: 'omen', since: 1 }];
  assert.strictEqual(E.endTurn(s, 'early-late').state.events[0].stage, 'woe');
});

test('相生：8 以上生下一個，同時計算', () => {
  const s = make({ qi: { 木: 8, 火: 7 } });
  const t = E.endTurn(s, 'early-late').state;
  assert.strictEqual(t.qi.火, 8); // 木生火
  assert.strictEqual(t.qi.土, 5); // 火在快照時是 7，不生土
});

test('亢害：10 剋所剋者 −1，自己也 −1', () => {
  const s = make({ qi: { 金: 10 } });
  const t = E.endTurn(s, 'early-late').state;
  // 金 10 先生水（水 6），再亢害：金剋木 −1、金自己 −1
  assert.strictEqual(t.qi.水, 6); assert.strictEqual(t.qi.木, 4); assert.strictEqual(t.qi.金, 9);
});

test('結算順序：相生後到 11，亢害後回 10（第 6 步才限制範圍）', () => {
  const s = make({ qi: { 水: 8, 木: 10 } });
  const t = E.endTurn(s, 'early-late').state;
  // 水生木 → 11；木 ≥ 10 → 剋土 −1、自己 −1 → 10；木也生火
  assert.strictEqual(t.qi.木, 10); assert.strictEqual(t.qi.土, 4); assert.strictEqual(t.qi.火, 6);
});

test('結算紀錄依規格順序', () => {
  const s = make({ qi: { 木: 10 } });
  s.events = [{ id: 'sigh', stage: 'woe', since: 1 }, { id: 'brood', stage: 'omen', since: 2 }];
  const log = E.endTurn(s, 'late-early').log;
  const idx = t => log.findIndex(e => e.type === 'qi' && String(e.reason).startsWith(t));
  assert.ok(idx('rest') < idx('woe:'));
  assert.ok(idx('woe:') < log.findIndex(e => e.type === 'woe'));
  assert.ok(log.findIndex(e => e.type === 'woe') < idx('gen:'));
  assert.ok(idx('gen:') < idx('over:'));
  assert.ok(log.findIndex(e => e.type === 'turn') > idx('over:'));
});

test('結算後氣都在 0–10，並記錄限制', () => {
  const s = make({ qi: { 火: 10, 木: 10, 土: 0 } });
  const { state: t } = E.endTurn(s, 'late-early');
  D.ELEMENTS.forEach(el => assert.ok(t.qi[el] >= 0 && t.qi[el] <= 10));
});

test('告假：降到門檻以下告假，回到門檻以上回朝', () => {
  const edge = make({ qi: { 金: R.LEAVE_AT } });
  assert.strictEqual(E.endTurn(edge, 'early-late').state.leave.金, true);
  const safe = make({ qi: { 金: R.LEAVE_AT + 1 } });
  assert.strictEqual(E.endTurn(safe, 'early-late').state.leave.金, false);
  const s = make({ qi: { 金: 1 } });
  s.events = [{ id: 'sigh', stage: 'woe', since: 1 }];
  let t = E.endTurn(s, 'early-late').state;
  assert.strictEqual(t.leave.金, true);
  assert.strictEqual(t.over, null);
  t = clone(t); t.events = []; t.qi.金 = 3;
  t = E.endTurn(t, 'early-late').state;
  assert.strictEqual(t.leave.金, false);
});

test('國危：火降到 0', () => {
  const s = make({ qi: { 火: 1 } });
  s.events = [{ id: 'revel', stage: 'woe', since: 1 }];
  const { state: t, log } = E.endTurn(s, 'early-late');
  assert.strictEqual(t.over.win, false); assert.strictEqual(t.over.reason, 'sovereign');
  assert.strictEqual(log[log.length - 1].type, 'over');
});

test('國危：兩位大臣同時告假', () => {
  const s = make({ qi: { 金: 1, 土: 1 } });
  s.events = [{ id: 'sigh', stage: 'woe', since: 1 }, { id: 'brood', stage: 'woe', since: 1 }];
  const t = E.endTurn(s, 'early-late').state;
  assert.strictEqual(t.over.reason, 'leaves');
});

test('本旬打過當季牌則德 +1', () => {
  let s = make({ hand: ['garden', 'well', 'decree', 'feast'] });
  s = E.playCard(s, 0).state;
  assert.strictEqual(E.endTurn(s, 'early-late').state.de, 1);
  assert.strictEqual(E.endTurn(make({}), 'early-late').state.de, 0);
});

test('新的一旬：補牌到 4、令重算、第 6 旬不出新事件', () => {
  let s = make({ hand: ['garden', 'well', 'decree', 'feast'] });
  s.eventDeck = ['rage', 'sigh'];
  s = E.playCard(s, 0).state;
  s = E.endTurn(s, 'late-early').state;
  assert.strictEqual(s.turn, 2); assert.strictEqual(s.hand.length, 4);
  // 火 5 → 作息 6 → 木 8 生火 7
  assert.strictEqual(s.events.length, 1); assert.strictEqual(s.tokens, E.tokensFor(7));
  s = clone(s); s.turn = 5; s.events = [];
  s = E.endTurn(s, 'late-early').state;
  assert.strictEqual(s.turn, 6); assert.strictEqual(s.events.length, 0);
});

test('過關：撐過第 6 旬，平衡加 5 德，評等', () => {
  const s = make({ turn: 6, de: 12 });
  const t = E.endTurn(s, 'early-late').state;
  assert.strictEqual(t.over.win, true);
  assert.strictEqual(t.de, 17); assert.strictEqual(t.over.rank, '賢');
  const u = E.endTurn(make({ turn: 6, de: 12, qi: { 水: 9 } }), 'early-late').state;
  assert.strictEqual(u.de, 12); assert.strictEqual(u.over.balanced, false);
  assert.strictEqual(E.rankFor(18), '聖'); assert.strictEqual(E.rankFor(9), '常');
});

test('結束後所有操作都被拒絕', () => {
  const s = make({ over: { win: true } });
  ['burnLamp'].forEach(f => assert.strictEqual(E[f](s).log[0].type, 'denied'));
  assert.strictEqual(E.endTurn(s, 'late-early').log[0].type, 'denied');
});

// ---------- 難度 ----------
test('難度：新手開局氣較多、禍患較輕，正常不受影響', () => {
  const easy = E.newGame(3, 'easy').state, normal = E.newGame(3).state;
  assert.strictEqual(easy.mode, 'easy'); assert.strictEqual(normal.mode, 'normal');
  D.ELEMENTS.forEach(el => assert.strictEqual(easy.qi[el], E.rulesOf(easy).QI_START));
  assert.ok(E.rulesOf(easy).QI_START > E.rulesOf(normal).QI_START);
  assert.ok(E.rulesOf(easy).WOE_DAMAGE < E.rulesOf(normal).WOE_DAMAGE);
  assert.strictEqual(E.rulesOf(normal).WOE_DAMAGE, R.WOE_DAMAGE);
  const s = clone(easy); s.events = [{ id: 'rage', stage: 'woe', since: 1 }]; s.qi.木 = 5;
  assert.strictEqual(E.endTurn(s, 'early-late').state.qi.木, 5 - E.rulesOf(easy).WOE_DAMAGE);
});

test('難度：不認得的難度視為正常；舊存檔沒有難度欄位也能讀', () => {
  assert.strictEqual(E.newGame(3, 'bogus').state.mode, 'normal');
  const old = clone(E.newGame(3).state); delete old.mode;
  assert.ok(E.isValidState(old));
  assert.strictEqual(E.rulesOf(old).WOE_DAMAGE, R.WOE_DAMAGE);
  assert.ok(!E.isValidState(Object.assign(clone(old), { mode: 'bogus' })));
});

test('新手：每旬開始，有徵兆就一定有能化解的牌；正常不保證', () => {
  let easyMiss = 0, normalMiss = 0, aids = 0;
  const check = (s, mode) => {
    const omens = s.events.filter(e => e.stage === 'omen');
    if (omens.length && !s.hand.some(id => omens.some(e => E.matches(id, e.id)))) { if (mode === 'easy') easyMiss++; else normalMiss++; }
  };
  for (let seed = 1; seed <= 300; seed++) {
    for (const mode of ['easy', 'normal']) {
      let r = E.newGame(seed, mode); check(r.state, mode);
      let s = r.state;
      while (!s.over) {
        r = E.endTurn(s, D.SEASONS[0].rest);
        aids += r.log.filter(e => e.type === 'aid').length;
        s = r.state;
        if (!s.over) check(s, mode);
      }
    }
  }
  assert.strictEqual(easyMiss, 0);
  assert.ok(normalMiss > 0, '正常難度應該維持隨機');
  assert.ok(aids > 0);
});

// ---------- 存檔 ----------
test('存檔驗證', () => {
  const s = E.newGame(5).state;
  assert.ok(E.isValidState(s));
  assert.ok(E.isValidState(JSON.parse(JSON.stringify(s))));
  assert.ok(!E.isValidState(null));
  assert.ok(!E.isValidState(Object.assign(clone(s), { v: 2 })));
  assert.ok(!E.isValidState(Object.assign(clone(s), { hand: ['bogus'] })));
  const bad = clone(s); bad.qi.木 = 11; assert.ok(!E.isValidState(bad));
  const lost = clone(s); lost.deck.pop(); assert.ok(!E.isValidState(lost));
});

// ---------- 模擬 ----------
// 回傳一個依種子決定的亂數，給策略用（與遊戲內亂數無關）
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function playable(s) { return s.hand.map((_, i) => i).filter(i => E.canPlay(s, i).ok); }

function step(s, res, checks) {
  const before = JSON.stringify(s);
  const frozen = deepFreeze(clone(s));
  const out = res(frozen);
  if (checks) {
    assert.strictEqual(JSON.stringify(frozen), before, '輸入狀態被修改');
    const t = out.state;
    D.ELEMENTS.forEach(el => assert.ok(Number.isInteger(t.qi[el]) && t.qi[el] >= 0 && t.qi[el] <= 10, '氣超出範圍'));
    assert.ok(t.hand.length <= R.HAND, '手牌超過上限');
    assert.strictEqual(totalCards(t), 15, '牌數不守恆');
    assert.ok(E.isValidState(t) || t.over, '狀態格式不符');
  }
  return out.state;
}

const stats = {};

const STRATEGIES = {
  // 隨機亂打
  random(s, r, checks) {
    if (!s.lamp && r() < 0.3) s = step(s, x => E.burnLamp(x), checks);
    while (true) {
      const p = playable(s);
      if (!p.length || r() < 0.2) break;
      s = step(s, x => E.playCard(x, p[Math.floor(r() * p.length)]), checks);
    }
    const rest = D.REST_ORDER[Math.floor(r() * 3)];
    return step(s, x => E.endTurn(x, rest), checks);
  },
  // 優先化解徵兆、其次打當季牌、作息合時
  simple(s, r, checks) {
    const se = D.SEASONS[s.season];
    while (true) {
      const p = playable(s);
      if (!p.length) break;
      const order = s.events.filter(e => e.stage === 'omen').concat(s.events.filter(e => e.stage === 'woe'));
      let pick = -1;
      for (const ev of order) { pick = p.find(i => E.matches(s.hand[i], ev.id)); if (pick !== undefined) break; pick = -1; }
      if (pick === -1 || pick === undefined) pick = p.find(i => D.CARDS[s.hand[i]].tag === se.tag);
      if (pick === undefined) break;
      s = step(s, x => E.playCard(x, pick), checks);
    }
    return step(s, x => E.endTurn(x, se.rest), checks);
  }
};

function run(seed, strat, checks, mode) {
  let s = E.newGame(seed, mode).state;
  const r = prng(seed * 7 + 3);
  let guard = 0;
  while (!s.over) {
    s = STRATEGIES[strat](s, r, checks);
    if (++guard > 50) throw new Error('沒有結束');
  }
  return s;
}

test('重現性：同種子、同操作，結果相同', () => {
  [1, 99, 12345].forEach(seed => {
    assert.deepStrictEqual(run(seed, 'random', false), run(seed, 'random', false));
    assert.deepStrictEqual(run(seed, 'simple', false), run(seed, 'simple', false));
  });
  assert.notDeepStrictEqual(E.newGame(1).state.hand, E.newGame(2).state.hand);
});

test('模擬：1000 個種子跑到結束不出錯，不變量都成立（兩種難度）', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    run(seed, 'random', true); run(seed, 'simple', true);
    run(seed, 'random', true, 'easy'); run(seed, 'simple', true, 'easy');
  }
});

test('平衡護欄（新手）：照提示玩 ≥ 95% 過關，且比正常容易', () => {
  const rate = (k, mode) => { let w = 0; for (let seed = 1; seed <= 1000; seed++) if (run(seed, k, false, mode).over.win) w++; return w / 10; };
  const easySimple = rate('simple', 'easy'), easyRandom = rate('random', 'easy');
  stats.easy = { 照提示: easySimple + '%', 亂打: easyRandom + '%' };
  assert.ok(easySimple >= 95, '新手照提示過關率 ' + easySimple);
  assert.ok(easyRandom > rate('random'), '新手應比正常容易');
});

test('平衡護欄：亂打過關率 < 40%，簡單策略 70%–95%', () => {
  ['random', 'simple'].forEach(k => {
    let win = 0; const ranks = { 聖: 0, 賢: 0, 常: 0 }; let de = 0;
    const N = 2000;
    for (let seed = 1; seed <= N; seed++) {
      const s = run(seed, k, false);
      if (s.over.win) { win++; ranks[s.over.rank]++; de += s.de; }
    }
    stats[k] = { 過關率: (win / N * 100).toFixed(1) + '%', 平均德: win ? (de / win).toFixed(1) : '-', 評等: ranks };
  });
  const rate = k => parseFloat(stats[k].過關率);
  assert.ok(rate('random') < 40, '亂打過關率 ' + stats.random.過關率);
  assert.ok(rate('simple') >= 70 && rate('simple') <= 95, '簡單策略過關率 ' + stats.simple.過關率);
});

console.log('平衡：', JSON.stringify(stats));
console.log(failed ? `✗ ${failed} 項失敗，${passed} 項通過` : `✓ 全部 ${passed} 項通過`);
process.exit(failed ? 1 : 0);
