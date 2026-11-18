// 靈蘭：牌、事件、季節、文字與所有數值常數。規則在 engine.js。
const LL_DATA = {
  ELEMENTS: ['木', '火', '土', '金', '水'],
  // X 生 GEN[X]；X 剋 CTRL[X]
  GEN: { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' },
  CTRL: { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' },

  // 君主是玩家本人（火），其餘四位是大臣。
  MINISTERS: {
    木: { title: '將軍', place: '太衝', dir: '東' },
    火: { title: '君主', place: '神門', dir: '南' },
    土: { title: '司倉', place: '太白', dir: '中' },
    金: { title: '宰相', place: '中府', dir: '西' },
    水: { title: '大匠', place: '湧泉', dir: '北' }
  },
  SOVEREIGN: '火',

  RULES: {
    QI_MIN: 0,
    QI_MAX: 10,
    QI_START: 4,
    HAND: 4,
    TURNS: 6,
    EVENT_TURNS: 5,          // 第 1–5 旬各來一件事
    TOKENS: [                // 依火氣決定每旬的令
      { min: 8, n: 3 },
      { min: 5, n: 2 },
      { min: 0, n: 1 }
    ],
    LAMP_TOKENS: 1,
    LAMP_COST: [['火', -1], ['水', -1]],
    REST_GAIN: 1,            // 作息合時，火 +1
    SEASON_GAIN: 1,          // 打出當季牌，當季五行 +1（每旬一次）
    SEASON_LOSS: 1,          // 打出逆時牌，當季五行 −1（每次）
    WOE_DAMAGE: 3,
    WEATHER_DISPEL: 7,       // 天候徵兆轉禍患時，該五行在此以上就自動消散
    GEN_AT: 8,               // 相生門檻
    OVER_AT: 10,             // 亢害門檻
    LEAVE_AT: 2,             // 大臣的氣降到此以下（虛）就告假
    RETURN_AT: 3,            // 告假後回朝
    DANGER_LEAVES: 2,        // 同時告假人數達此即國危
    DE_OMEN: 3,
    DE_WOE: 1,
    DE_DISPEL: 3,
    DE_TURN_TAG: 1,
    DE_BALANCE: 5,
    BALANCE: [4, 8],
    RANKS: [
      { min: 18, name: '聖' },
      { min: 10, name: '賢' },
      { min: -999, name: '常' }
    ],
    STATUS: [
      { max: 2, name: '虛' },
      { max: 6, name: '平' },
      { max: 9, name: '盛' },
      { max: 10, name: '亢' }
    ]
  },

  OPPOSITE: { 生: '收', 收: '生', 長: '藏', 藏: '長' },

  RESTS: {
    'late-early': { name: '夜臥早起', desc: '夜深一些再睡，天一亮就起身' },
    'early-early': { name: '早臥早起', desc: '天黑不久就睡，天一亮就起身' },
    'early-late': { name: '早臥晚起', desc: '天黑不久就睡，等太陽出來再起身' }
  },
  REST_ORDER: ['late-early', 'early-early', 'early-late'],

  SEASONS: [
    {
      id: 'spring',
      name: '春',
      tag: '生',
      el: '木',
      rest: 'late-early',
      terms: ['立春', '雨水', '驚蟄', '春分', '清明', '穀雨'],
      deck: ['garden', 'reward', 'drill', 'feast', 'court', 'still', 'sow', 'yam', 'granary',
        'decree', 'justice', 'voices', 'well', 'seal', 'crafts'],
      events: ['eastwind', 'chill', 'rage', 'revel', 'brood', 'sigh'],
      decree: '春三月，天地俱生，萬物以榮。生而勿殺，予而勿奪，賞而勿罰。',
      intro: '春天到了，萬物正要冒芽。讓王國跟著季節一起舒展吧。'
    }
  ],

  // fx：依序套用的 [五行, 增減]；draw：額外抽牌數
  CARDS: {
    garden: { name: '巡行園囿', el: '木', tag: '生', fx: [['木', 2]] },
    reward: { name: '論功行賞', el: '木', tag: '生', fx: [['木', 1]], draw: 1 },
    drill: { name: '整軍操練', el: '木', tag: '長', fx: [['木', 3], ['水', -1]] },
    feast: { name: '張燈夜宴', el: '火', tag: '長', fx: [['火', 2]] },
    court: { name: '開朝聽政', el: '火', tag: '長', fx: [['火', 1], ['金', 1]] },
    still: { name: '靜坐澄心', el: '火', tag: '藏', fx: [['火', 2]] },
    sow: { name: '春耕播種', el: '土', tag: '生', fx: [['土', 2]] },
    yam: { name: '山藥紅棗入庫', el: '土', tag: '藏', fx: [['土', 2]] },
    granary: { name: '修築糧倉', el: '土', tag: '收', fx: [['土', 3], ['木', -1]] },
    decree: { name: '頒布節令', el: '金', tag: '收', fx: [['金', 2]] },
    justice: { name: '肅清刑獄', el: '金', tag: '收', fx: [['金', 3], ['木', -1]] },
    voices: { name: '廣開言路', el: '金', tag: '生', fx: [['金', 1]], draw: 1 },
    well: { name: '浚井蓄水', el: '水', tag: '藏', fx: [['水', 2]] },
    seal: { name: '封庫儲藏', el: '水', tag: '藏', fx: [['水', 3], ['火', -1]] },
    crafts: { name: '百工獻藝', el: '水', tag: '長', fx: [['水', 1], ['木', 1]] }
  },

  // kind：weather（天候）或 emotion（情志）。omen 是徵兆描述，不寫出效果。
  EVENTS: {
    eastwind: {
      name: '東風驟起', kind: 'weather', el: '木',
      omen: '東邊吹來一陣強風，園囿裡的新枝搖得厲害。',
      hint: '風大的時候，就讓園子長得更壯；或者多澆點水，讓根扎得穩。'
    },
    chill: {
      name: '春寒料峭', kind: 'weather', el: '水',
      omen: '入夜忽然轉涼，北方的井口結了一層薄霜。',
      hint: '寒氣來了，就把井守好；法度清明的地方，水源也會充沛。'
    },
    rage: {
      name: '將軍震怒', kind: 'emotion', el: '木',
      omen: '將軍近日眼眶泛紅，說話又急又快，營中沒人敢靠近。',
      hint: '火氣太旺的人，要靠法度來收一收。'
    },
    revel: {
      name: '宴樂無度', kind: 'emotion', el: '火',
      omen: '宮中連日笙歌不斷，笑聲到深夜都沒停過。',
      hint: '歡喜過了頭，就讓它靜一靜、沉一沉。'
    },
    brood: {
      name: '司倉多思', kind: 'emotion', el: '土',
      omen: '司倉整天對著帳簿發呆，飯也吃不太下。',
      hint: '想太多的時候，就出去走走、動一動。'
    },
    sigh: {
      name: '宰相愁眉', kind: 'emotion', el: '金',
      omen: '宰相嘆氣的次數越來越多，說話的聲音也低了下去。',
      hint: '愁雲要靠一點暖意，才化得開。'
    }
  },

  TEXT: {
    title: '靈蘭',
    subtitle: '陛下，該睡了',
    bedtime: '陛下，該睡了。',
    tags: { 生: '生', 長: '長', 收: '收', 藏: '藏' },
    over: {
      sovereign: '陛下積勞成疾，王國陷入混亂。',
      leaves: '兩位大臣同時告假，朝政停擺。'
    },
    win: '春天平安過去了。',
    rankWords: {
      聖: '順天應時，治於未亂。',
      賢: '雖有波折，終能化解。',
      常: '王國撐過來了，只是有些勉強。'
    }
  }
};

if (typeof module !== 'undefined') module.exports = LL_DATA;
