// 靈蘭：牌、事件、季節、文字與所有數值常數。規則在 engine.js。
const LL_DATA = {
  ELEMENTS: ['木', '火', '土', '金', '水'],
  // X 生 GEN[X]；X 剋 CTRL[X]
  GEN: { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' },
  CTRL: { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' },

  // 君主是玩家本人（火），其餘四位是大臣。organ：對應的臟腑；line：靈蘭秘典論原文。
  MINISTERS: {
    木: { title: '將軍', organ: '肝', place: '太衝', dir: '東', line: '肝者，將軍之官，謀慮出焉。' },
    火: { title: '君主', organ: '心', place: '神門', dir: '南', line: '心者，君主之官也，神明出焉。' },
    土: { title: '司倉', organ: '脾胃', place: '太白', dir: '中', line: '脾胃者，倉廩之官，五味出焉。' },
    金: { title: '宰相', organ: '肺', place: '中府', dir: '西', line: '肺者，相傅之官，治節出焉。' },
    水: { title: '大匠', organ: '腎', place: '湧泉', dir: '北', line: '腎者，作強之官，伎巧出焉。' }
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
      { min: 13, name: '賢' },
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
      decree: '春三月，此謂發陳，天地俱生，萬物以榮。夜臥早起，廣步於庭，被髮緩形，以使志生。生而勿殺，予而勿奪，賞而勿罰。',
      decreeSource: '《黃帝內經・素問・四氣調神大論》',
      restQuote: '春天要「夜臥早起，廣步於庭」：晚一點睡沒關係，但天亮就起來走走。',
      tagNote: '春天屬「生」。打「生」的牌是順時，將軍（肝・木）會跟著舒展；打「收」的牌是逆時，會傷到將軍。',
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

  // kind：weather（天候）或 emotion（情志）。omen：徵兆描述；why：天師的解說；quote：原文。
  EVENTS: {
    eastwind: {
      name: '東風驟起', kind: 'weather', el: '木',
      omen: '東邊吹來一陣強風，將軍駐守的園囿新枝搖得厲害。',
      why: '風與肝（木）相通。打木牌讓將軍強壯，或打水牌滋養他（水生木）。將軍的氣到 {DISPEL} 以上，風會自己平息。',
      quote: '東方生風，風生木，木生酸，酸生肝。'
    },
    chill: {
      name: '春寒料峭', kind: 'weather', el: '水',
      omen: '入夜忽然轉涼，大匠守著的井口結了一層薄霜。',
      why: '寒與腎（水）相通。打水牌讓大匠強壯，或打金牌支援他（金生水）。大匠的氣到 {DISPEL} 以上，寒氣會自己退去。',
      quote: '北方生寒，寒生水，水生鹹，鹹生腎。'
    },
    rage: {
      name: '將軍震怒', kind: 'emotion', el: '木',
      omen: '將軍近日眼眶泛紅，說話又急又快，營中沒人敢靠近。',
      why: '怒傷肝。金剋木，派宰相（金）出面，用節制平息將軍的怒氣。',
      quote: '怒傷肝，悲勝怒。'
    },
    revel: {
      name: '宴樂無度', kind: 'emotion', el: '火',
      omen: '宮中連日笙歌不斷，笑聲到深夜都沒停過，陛下心神有些飄浮。',
      why: '喜傷心。水剋火，請大匠（水）讓君主沉靜下來。',
      quote: '喜傷心，恐勝喜。'
    },
    brood: {
      name: '司倉多思', kind: 'emotion', el: '土',
      omen: '司倉整天對著帳簿發呆，飯也吃不太下。',
      why: '思傷脾。木剋土，請將軍（木）帶他出去走動，打散鬱結的心思。',
      quote: '思傷脾，怒勝思。'
    },
    sigh: {
      name: '宰相愁眉', kind: 'emotion', el: '金',
      omen: '宰相嘆氣的次數越來越多，說話的聲音也低了下去。',
      why: '憂傷肺。火剋金，由君主（火）親自給他一點溫暖。',
      quote: '憂傷肺，喜勝憂。'
    }
  },

  TEXT: {
    title: '靈蘭',
    book: '《黃帝內經》',
    subtitle: '陛下，該睡了',
    bedtime: '陛下，該睡了。',
    tags: { 生: '生', 長: '長', 收: '收', 藏: '藏' },
    over: {
      sovereign: '陛下積勞成疾，王國陷入混亂。',
      leaves: '兩位大臣同時告假，朝政停擺。'
    },
    win: '春天平安過去了。',
    reveal: '靈蘭，是黃帝珍藏醫書的書房。這個遊戲裡的每一條規則，都出自兩千多年前的《黃帝內經》。',
    tips: {
      sovereign: '君主的氣靠好好睡覺來養。作息要合時，少挑燈，宴樂也要節制。',
      leaves: '徵兆要當天化解。拖成禍患之後，每旬都會傷人，大臣很快就撐不住。'
    },
    rankWords: {
      聖: '順天應時，治於未亂。',
      賢: '雖有波折，終能化解。',
      常: '王國撐過來了，只是有些勉強。'
    }
  }
};

if (typeof module !== 'undefined') module.exports = LL_DATA;
