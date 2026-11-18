// 靈蘭規則引擎：純函式，不碰 DOM 與 localStorage。
// 每個操作都回傳 { state, log }，不修改傳入的狀態。
const LL_ENGINE = (function (D) {
  const R = D.RULES; // 不分難度的常數（範圍、狀態字樣、評等）
  const MODE_CACHE = {};
  // 依難度合併出這一局的規則
  // 合併順序：基本規則 ← 季節規則 ← 難度規則
  function rulesOf(s) {
    const mode = s && D.MODES[s.mode] ? s.mode : 'normal';
    const si = s && D.SEASONS[s.season] ? s.season : 0;
    const key = mode + ':' + si;
    if (!MODE_CACHE[key]) MODE_CACHE[key] = Object.assign({}, D.RULES, D.SEASONS[si].rules, D.MODES[mode].rules);
    return MODE_CACHE[key];
  }
  const MINISTER_ELS = D.ELEMENTS.filter(e => e !== D.SOVEREIGN);

  // ---- 亂數（mulberry32，狀態存在 state.rng）----
  function rand(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const clone = s => JSON.parse(JSON.stringify(s));
  const clamp = v => Math.max(R.QI_MIN, Math.min(R.QI_MAX, v));
  const season = s => D.SEASONS[s.season];
  const generator = el => D.ELEMENTS.find(x => D.GEN[x] === el);
  const controller = el => D.ELEMENTS.find(x => D.CTRL[x] === el);

  // 傳入狀態時，依該局的亢害門檻判斷「亢」
  function statusOf(v, s) {
    if (s && v >= rulesOf(s).OVER_AT) return R.STATUS[R.STATUS.length - 1].name;
    return R.STATUS.find(x => v <= x.max).name;
  }
  function tokensFor(fire, mode, seasonIndex) {
    return rulesOf({ mode, season: seasonIndex }).TOKENS.find(x => fire >= x.min).n;
  }
  function rankFor(de, year) {
    return (year ? R.RANKS_YEAR : R.RANKS).find(x => de >= x.min).name;
  }

  // 這張牌能不能化解這件事
  function matches(cardId, eventId) {
    const c = D.CARDS[cardId], e = D.EVENTS[eventId];
    if (e.kind === 'emotion') return c.el === controller(e.el);
    return c.el === e.el || c.el === generator(e.el); // 天候與季節牽連
  }

  // 增減氣。clampNow 為 true 時立刻限制在範圍內（出牌時），結算期間則留到第 6 步。
  function addQi(s, log, el, delta, reason, clampNow) {
    if (!delta) return;
    const from = s.qi[el];
    const to = clampNow ? clamp(from + delta) : from + delta;
    if (to === from) return;
    s.qi[el] = to;
    log.push({ type: 'qi', el, delta: to - from, to, reason });
  }

  function addDe(s, log, delta, reason) {
    if (!delta) return;
    s.de += delta;
    log.push({ type: 'de', delta, to: s.de, reason });
  }

  function drawOne(s, log) {
    if (!s.deck.length) {
      if (!s.discard.length) return false;
      s.deck = shuffle(s, s.discard);
      s.discard = [];
      log.push({ type: 'reshuffle' });
    }
    const id = s.deck.shift();
    s.hand.push(id);
    log.push({ type: 'draw', card: id });
    return true;
  }

  // 新手模式：有徵兆而手上沒有能化解的牌時，從牌庫（不夠再從棄牌堆）換一張進來。
  // 換出去的牌放回被取牌的位置，牌數守恆。
  function guaranteeFix(s, log) {
    const omens = s.events.filter(e => e.stage === 'omen');
    if (!omens.length) return;
    if (s.hand.some(id => omens.some(e => matches(id, e.id)))) return;
    const target = omens[omens.length - 1];
    for (const pile of ['deck', 'discard']) {
      const at = s[pile].findIndex(id => matches(id, target.id));
      if (at === -1) continue;
      const out = Math.floor(rand(s) * s.hand.length);
      const incoming = s[pile][at];
      s[pile][at] = s.hand[out];
      s.hand[out] = incoming;
      log.push({ type: 'aid', card: incoming, id: target.id });
      return;
    }
  }

  // 一旬開始：晨報、補牌、發令
  function startTurn(s, log) {
    const R = rulesOf(s);
    s.lamp = false;
    s.seasonGain = false;
    s.seasonTagPlayed = false;
    const se = season(s);
    log.push({ type: 'turn', season: s.season, turn: s.turn, term: se.terms[s.turn - 1] });
    if (s.turn <= R.EVENT_TURNS && s.eventDeck.length) {
      const id = s.eventDeck.shift();
      s.events.push({ id, stage: 'omen', since: s.turn });
      log.push({ type: 'omen', id });
    }
    while (s.hand.length < R.HAND && drawOne(s, log)) { /* 補牌 */ }
    if (R.GUARANTEE_FIX) guaranteeFix(s, log);
    s.tokens = tokensFor(s.qi[D.SOVEREIGN], s.mode, s.season);
    log.push({ type: 'tokens', n: s.tokens });
  }

  // year 為 true 時是一整年模式：從春天連續玩到冬天
  // 一整年模式換季：檢查這一季有沒有照顧好，換上新一季的牌組與事件
  function nextSeason(s, log) {
    const R = rulesOf(s);
    const se = season(s);
    const weak = s.qi[se.el] < R.CARRY_WEAK_AT;
    const ni = (s.seasonNi || 0) >= R.CARRY_NI;
    log.push({ type: 'season', from: s.season, to: s.season + 1, el: se.el, qi: s.qi[se.el], ni: s.seasonNi || 0, weak, tooNi: ni });
    // 換季時休養生息：氣低於開局值的人，各回復一些（不超過開局值）
    D.ELEMENTS.forEach(el => {
      const target = R.QI_START, gain = Math.min(R.SEASON_RECOVER, target - s.qi[el]);
      if (gain > 0) addQi(s, log, el, gain, 'recover', true);
    });
    MINISTER_ELS.forEach(el => {
      if (s.leave[el] && s.qi[el] >= R.RETURN_AT) { s.leave[el] = false; log.push({ type: 'leave', el, on: false }); }
    });
    s.season += 1;
    s.turn = 1;
    s.seasonNi = 0;
    const nse = season(s);
    s.deck = shuffle(s, nse.deck);
    s.hand = [];
    s.discard = [];
    s.eventDeck = shuffle(s, nse.events).slice(0, rulesOf(s).EVENT_TURNS);
    if ((weak || ni) && se.carry) {
      s.events.push({ id: se.carry, stage: 'woe', since: 1 });
      log.push({ type: 'carry', id: se.carry, from: s.season - 1, weak, tooNi: ni });
    }
    startTurn(s, log);
  }

  function newGame(seed, mode, seasonIndex, year) {
    const s = {
      v: 1,
      year: !!year,
      seasonNi: 0,
      mode: D.MODES[mode] ? mode : 'normal',
      seed: seed >>> 0,
      rng: seed >>> 0,
      season: !year && D.SEASONS[seasonIndex] ? seasonIndex : 0,
      turn: 1,
      qi: {},
      de: 0,
      shun: 0,
      ni: 0,
      deck: [],
      hand: [],
      discard: [],
      eventDeck: [],
      events: [],
      leave: {},
      tokens: 0,
      lamp: false,
      seasonGain: false,
      seasonTagPlayed: false,
      stats: { omen: 0, woe: 0, dispel: 0 },
      over: null
    };
    const R = rulesOf(s);
    D.ELEMENTS.forEach(el => { s.qi[el] = R.QI_START; });
    MINISTER_ELS.forEach(el => { s.leave[el] = false; });
    const se = season(s);
    s.deck = shuffle(s, se.deck);
    s.eventDeck = shuffle(s, se.events).slice(0, R.EVENT_TURNS);
    const log = [];
    startTurn(s, log);
    return { state: s, log };
  }

  function canPlay(state, handIndex) {
    if (state.over) return { ok: false, reason: '本季已結束' };
    const id = state.hand[handIndex];
    if (!id) return { ok: false, reason: '沒有這張牌' };
    const card = D.CARDS[id];
    if (state.leave[card.el]) return { ok: false, reason: D.MINISTERS[card.el].title + '告假中' };
    if (state.tokens < 1) return { ok: false, reason: '令已用完' };
    return { ok: true, reason: '' };
  }

  function playCard(state, handIndex) {
    const check = canPlay(state, handIndex);
    if (!check.ok) return { state, log: [{ type: 'denied', reason: check.reason }] };
    const s = clone(state);
    const R = rulesOf(s);
    const log = [];
    const id = s.hand.splice(handIndex, 1)[0];
    const card = D.CARDS[id];
    const se = season(s);
    s.tokens -= 1;
    log.push({ type: 'play', card: id });

    card.fx.forEach(([el, d]) => addQi(s, log, el, d, 'card', true));

    if (card.tag === se.tag) {
      s.shun += 1;
      s.seasonTagPlayed = true;
      log.push({ type: 'shun', card: id });
      if (!s.seasonGain) {
        s.seasonGain = true;
        addQi(s, log, se.el, R.SEASON_GAIN, 'shun', true);
      }
    } else if (card.tag === D.OPPOSITE[se.tag]) {
      s.ni += 1;
      s.seasonNi = (s.seasonNi || 0) + 1;
      log.push({ type: 'ni', card: id });
      addQi(s, log, se.el, -R.SEASON_LOSS, 'ni', true);
    }

    const ev = s.events.find(e => matches(id, e.id));
    if (ev) {
      s.events.splice(s.events.indexOf(ev), 1);
      const omen = ev.stage === 'omen';
      s.stats[omen ? 'omen' : 'woe'] += 1;
      log.push({ type: 'resolve', id: ev.id, stage: ev.stage, card: id });
      addDe(s, log, omen ? R.DE_OMEN : R.DE_WOE, omen ? 'omen' : 'woe');
    }

    for (let i = 0; i < (card.draw || 0); i++) drawOne(s, log);
    s.discard.push(id);
    return { state: s, log };
  }

  function burnLamp(state) {
    if (state.over) return { state, log: [{ type: 'denied', reason: '本季已結束' }] };
    if (state.lamp) return { state, log: [{ type: 'denied', reason: '今晚已經挑過燈了' }] };
    const s = clone(state);
    const R = rulesOf(s);
    s.lamp = true;
    s.tokens += R.LAMP_TOKENS;
    return { state: s, log: [{ type: 'lamp', tokens: s.tokens }] };
  }

  function endTurn(state, rest) {
    if (state.over) return { state, log: [{ type: 'denied', reason: '本季已結束' }] };
    if (!D.RESTS[rest]) return { state, log: [{ type: 'denied', reason: '請選擇作息' }] };
    const s = clone(state);
    const R = rulesOf(s);
    const log = [];
    const se = season(s);

    // 1. 作息
    const ok = !s.lamp && rest === se.rest;
    log.push({ type: 'rest', rest, ok, lamp: s.lamp });
    if (s.lamp) R.LAMP_COST.forEach(([el, d]) => addQi(s, log, el, d, 'lamp'));
    else if (ok) addQi(s, log, D.SOVEREIGN, R.REST_GAIN, 'rest');

    // 2. 禍患
    s.events.filter(e => e.stage === 'woe').forEach(e => {
      addQi(s, log, D.EVENTS[e.id].el, -R.WOE_DAMAGE, 'woe:' + e.id);
    });

    // 3. 徵兆轉禍患
    s.events.slice().forEach(e => {
      if (e.stage !== 'omen') return;
      const def = D.EVENTS[e.id];
      if (def.kind === 'weather' && s.qi[def.el] >= R.WEATHER_DISPEL) {
        s.events.splice(s.events.indexOf(e), 1);
        s.stats.dispel += 1;
        log.push({ type: 'dispel', id: e.id });
        addDe(s, log, R.DE_DISPEL, 'dispel');
      } else {
        e.stage = 'woe';
        log.push({ type: 'woe', id: e.id });
      }
    });

    // 4. 相生（同時計算）
    const snap = Object.assign({}, s.qi);
    D.ELEMENTS.forEach(el => {
      if (snap[el] >= R.GEN_AT) addQi(s, log, D.GEN[el], 1, 'gen:' + el);
    });

    // 5. 亢害（以第 4 步之後的數值為準，同時計算）
    const snap2 = Object.assign({}, s.qi);
    D.ELEMENTS.forEach(el => {
      if (snap2[el] >= R.OVER_AT) {
        addQi(s, log, D.CTRL[el], -1, 'over:' + el);
        addQi(s, log, el, -1, 'overself');
      }
    });

    // 6. 限制範圍
    D.ELEMENTS.forEach(el => {
      const v = clamp(s.qi[el]);
      if (v !== s.qi[el]) {
        log.push({ type: 'clamp', el, from: s.qi[el], to: v });
        s.qi[el] = v;
      }
    });

    // 7. 告假與國危
    MINISTER_ELS.forEach(el => {
      if (!s.leave[el] && s.qi[el] <= R.LEAVE_AT) {
        s.leave[el] = true;
        log.push({ type: 'leave', el, on: true });
      } else if (s.leave[el] && s.qi[el] >= R.RETURN_AT) {
        s.leave[el] = false;
        log.push({ type: 'leave', el, on: false });
      }
    });
    const leaves = MINISTER_ELS.filter(el => s.leave[el]).length;
    let lost = null;
    if (s.qi[D.SOVEREIGN] <= 0) lost = 'sovereign';
    else if (leaves >= R.DANGER_LEAVES) lost = 'leaves';

    // 8. 當季牌
    if (!lost && s.seasonTagPlayed) addDe(s, log, R.DE_TURN_TAG, 'tag');

    if (lost) {
      s.over = { win: false, reason: lost, rank: null, de: s.de };
      log.push({ type: 'over', win: false, reason: lost });
      return { state: s, log };
    }

    if (s.turn >= R.TURNS) {
      const [lo, hi] = R.BALANCE;
      const balanced = D.ELEMENTS.every(el => s.qi[el] >= lo && s.qi[el] <= hi);
      if (balanced) addDe(s, log, R.DE_BALANCE, 'balance');
      if (s.year && D.SEASONS[s.season + 1]) {
        nextSeason(s, log);
        return { state: s, log };
      }
      const rank = rankFor(s.de, s.year);
      s.over = { win: true, reason: null, rank, de: s.de, balanced };
      log.push({ type: 'over', win: true, rank, balanced });
      return { state: s, log };
    }

    s.turn += 1;
    startTurn(s, log);
    return { state: s, log };
  }

  // 存檔驗證：格式不符就回傳 false
  function isValidState(s) {
    try {
      if (!s || s.v !== 1 || typeof s.rng !== 'number' || !D.SEASONS[s.season]) return false;
      if (s.mode !== undefined && !D.MODES[s.mode]) return false;
      if (s.year !== undefined && typeof s.year !== 'boolean') return false;
      if (!(s.turn >= 1 && s.turn <= R.TURNS)) return false;
      if (!D.ELEMENTS.every(el => Number.isInteger(s.qi[el]) && s.qi[el] >= R.QI_MIN && s.qi[el] <= R.QI_MAX)) return false;
      const cards = [].concat(s.deck, s.hand, s.discard);
      if (!cards.every(id => D.CARDS[id])) return false;
      if (cards.length !== D.SEASONS[s.season].deck.length) return false;
      if (s.hand.length > R.HAND) return false;
      if (!Array.isArray(s.events) || !s.events.every(e => D.EVENTS[e.id] && (e.stage === 'omen' || e.stage === 'woe'))) return false;
      if (!Array.isArray(s.eventDeck) || !s.eventDeck.every(id => D.EVENTS[id])) return false;
      if (!Number.isInteger(s.tokens) || !Number.isInteger(s.de)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    newGame, playCard, burnLamp, endTurn, canPlay,
    matches, statusOf, tokensFor, rankFor, rulesOf, isValidState, generator, controller,
    MINISTER_ELS
  };
})(typeof LL_DATA !== 'undefined' ? LL_DATA : require('./data.js'));

if (typeof module !== 'undefined') module.exports = LL_ENGINE;
