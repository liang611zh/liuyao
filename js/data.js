// ============================================================
// 六爻排盘 - 数据层
// ============================================================

// 八卦 (Eight Trigrams)
// binary key: 从下到上，1=阳，0=阴
// 例：震 ☳ 下阳中阴上阴 → '100'；巽 ☴ 下阴中阳上阳 → '011'
const TRIGRAMS = {
  '111': { name: '乾', element: '金', nature: '天' },
  '000': { name: '坤', element: '土', nature: '地' },
  '100': { name: '震', element: '木', nature: '雷' },
  '010': { name: '坎', element: '水', nature: '水' },
  '001': { name: '艮', element: '土', nature: '山' },
  '011': { name: '巽', element: '木', nature: '风' },
  '101': { name: '离', element: '火', nature: '火' },
  '110': { name: '兑', element: '金', nature: '泽' },
};

// 根据卦名查 trigram binary
const TRIGRAM_BY_NAME = {};
for (const [bin, tri] of Object.entries(TRIGRAMS)) {
  TRIGRAM_BY_NAME[tri.name] = bin;
}

// 八宫卦序 (Eight Palaces, each with 8 hexagrams in order)
// 宫内序号 0-7 对应：本宫、一世、二世、三世、四世、五世、游魂、归魂
const PALACES = {
  '乾': ['乾为天','天风姤','天山遁','天地否','风地观','山地剥','火地晋','火天大有'],
  '兑': ['兑为泽','泽水困','泽地萃','泽山咸','水山蹇','地山谦','雷山小过','雷泽归妹'],
  '离': ['离为火','火山旅','火风鼎','火水未济','山水蒙','风水涣','天水讼','天火同人'],
  '震': ['震为雷','雷地豫','雷水解','雷风恒','地风升','水风井','泽风大过','泽雷随'],
  '巽': ['巽为风','风天小畜','风火家人','风雷益','天雷无妄','火雷噬嗑','山雷颐','山风蛊'],
  '坎': ['坎为水','水泽节','水雷屯','水火既济','泽火革','雷火丰','地火明夷','地水师'],
  '艮': ['艮为山','山火贲','山天大畜','山泽损','火泽睽','天泽履','风泽中孚','风山渐'],
  '坤': ['坤为地','地雷复','地泽临','地天泰','雷天大壮','泽天夬','水天需','水地比'],
};

// 世应位置表 (宫内序号 -> 世爻位, 应爻位, 1-based from bottom)
const SHI_YING_MAP = [
  { shi: 6, ying: 3 }, // 本宫卦
  { shi: 1, ying: 4 }, // 一世卦
  { shi: 2, ying: 5 }, // 二世卦
  { shi: 3, ying: 6 }, // 三世卦
  { shi: 4, ying: 1 }, // 四世卦
  { shi: 5, ying: 2 }, // 五世卦
  { shi: 4, ying: 1 }, // 游魂卦
  { shi: 3, ying: 6 }, // 归魂卦
];

// 卦名与上下卦对应关系
// key = 卦全名, value = { upper: trigram name, lower: trigram name }
const GUA_TRIGRAM_MAP = {
  '乾为天':   { upper: '乾', lower: '乾' },
  '天风姤':   { upper: '乾', lower: '巽' },
  '天山遁':   { upper: '乾', lower: '艮' },
  '天地否':   { upper: '乾', lower: '坤' },
  '风地观':   { upper: '巽', lower: '坤' },
  '山地剥':   { upper: '艮', lower: '坤' },
  '火地晋':   { upper: '离', lower: '坤' },
  '火天大有': { upper: '离', lower: '乾' },

  '兑为泽':   { upper: '兑', lower: '兑' },
  '泽水困':   { upper: '兑', lower: '坎' },
  '泽地萃':   { upper: '兑', lower: '坤' },
  '泽山咸':   { upper: '兑', lower: '艮' },
  '水山蹇':   { upper: '坎', lower: '艮' },
  '地山谦':   { upper: '坤', lower: '艮' },
  '雷山小过': { upper: '震', lower: '艮' },
  '雷泽归妹': { upper: '震', lower: '兑' },

  '离为火':   { upper: '离', lower: '离' },
  '火山旅':   { upper: '离', lower: '艮' },
  '火风鼎':   { upper: '离', lower: '巽' },
  '火水未济': { upper: '离', lower: '坎' },
  '山水蒙':   { upper: '艮', lower: '坎' },
  '风水涣':   { upper: '巽', lower: '坎' },
  '天水讼':   { upper: '乾', lower: '坎' },
  '天火同人': { upper: '乾', lower: '离' },

  '震为雷':   { upper: '震', lower: '震' },
  '雷地豫':   { upper: '震', lower: '坤' },
  '雷水解':   { upper: '震', lower: '坎' },
  '雷风恒':   { upper: '震', lower: '巽' },
  '地风升':   { upper: '坤', lower: '巽' },
  '水风井':   { upper: '坎', lower: '巽' },
  '泽风大过': { upper: '兑', lower: '巽' },
  '泽雷随':   { upper: '兑', lower: '震' },

  '巽为风':   { upper: '巽', lower: '巽' },
  '风天小畜': { upper: '巽', lower: '乾' },
  '风火家人': { upper: '巽', lower: '离' },
  '风雷益':   { upper: '巽', lower: '震' },
  '天雷无妄': { upper: '乾', lower: '震' },
  '火雷噬嗑': { upper: '离', lower: '震' },
  '山雷颐':   { upper: '艮', lower: '震' },
  '山风蛊':   { upper: '艮', lower: '巽' },

  '坎为水':   { upper: '坎', lower: '坎' },
  '水泽节':   { upper: '坎', lower: '兑' },
  '水雷屯':   { upper: '坎', lower: '震' },
  '水火既济': { upper: '坎', lower: '离' },
  '泽火革':   { upper: '兑', lower: '离' },
  '雷火丰':   { upper: '震', lower: '离' },
  '地火明夷': { upper: '坤', lower: '离' },
  '地水师':   { upper: '坤', lower: '坎' },

  '艮为山':   { upper: '艮', lower: '艮' },
  '山火贲':   { upper: '艮', lower: '离' },
  '山天大畜': { upper: '艮', lower: '乾' },
  '山泽损':   { upper: '艮', lower: '兑' },
  '火泽睽':   { upper: '离', lower: '兑' },
  '天泽履':   { upper: '乾', lower: '兑' },
  '风泽中孚': { upper: '巽', lower: '兑' },
  '风山渐':   { upper: '巽', lower: '艮' },

  '坤为地':   { upper: '坤', lower: '坤' },
  '地雷复':   { upper: '坤', lower: '震' },
  '地泽临':   { upper: '坤', lower: '兑' },
  '地天泰':   { upper: '坤', lower: '乾' },
  '雷天大壮': { upper: '震', lower: '乾' },
  '泽天夬':   { upper: '兑', lower: '乾' },
  '水天需':   { upper: '坎', lower: '乾' },
  '水地比':   { upper: '坎', lower: '坤' },
};

// 构建 binary -> hexagram 查找表
// binary: 6位字符串，从下到上（index 0=初爻, index 5=上爻）
const HEXAGRAMS = {};
for (const [palace, guaList] of Object.entries(PALACES)) {
  for (let i = 0; i < guaList.length; i++) {
    const guaName = guaList[i];
    const trigrams = GUA_TRIGRAM_MAP[guaName];
    const lowerBin = TRIGRAM_BY_NAME[trigrams.lower];
    const upperBin = TRIGRAM_BY_NAME[trigrams.upper];
    const binary = lowerBin + upperBin; // 6位: 初爻...上爻
    HEXAGRAMS[binary] = {
      name: guaName.replace(/为/, '为').length > 3 ? guaName : guaName,
      gua: guaName,
      palace: palace,
      palaceIndex: i,
      upperTrigram: trigrams.upper,
      lowerTrigram: trigrams.lower,
    };
  }
}

// 纳甲 (Na Jia) - 地支
// 同一个八卦作内卦(初/二/三爻)与作外卦(四/五/上爻)所纳地支不同，必须分开两张表。
// 阳卦(乾震坎艮)地支顺行、阴卦(坤巽离兑)逆行，内外卦相隔六位。
// 校验基准：乾为天 = 子寅辰午申戌；巽为风 = 丑亥酉未巳卯。
const NAJIA_INNER = {
  '乾': ['子', '寅', '辰'],
  '坎': ['寅', '辰', '午'],
  '艮': ['辰', '午', '申'],
  '震': ['子', '寅', '辰'],
  '巽': ['丑', '亥', '酉'],
  '离': ['卯', '丑', '亥'],
  '坤': ['未', '巳', '卯'],
  '兑': ['巳', '卯', '丑'],
};

const NAJIA_OUTER = {
  '乾': ['午', '申', '戌'],
  '坎': ['申', '戌', '子'],
  '艮': ['戌', '子', '寅'],
  '震': ['午', '申', '戌'],
  '巽': ['未', '巳', '卯'],
  '离': ['酉', '未', '巳'],
  '坤': ['丑', '亥', '酉'],
  '兑': ['亥', '酉', '未'],
};

// 纳甲 - 天干（乾坤内外卦异干，其余六卦内外同干）
const NAJIA_STEM_INNER = {
  '乾': '甲', '坎': '戊', '艮': '丙', '震': '庚',
  '巽': '辛', '离': '己', '坤': '乙', '兑': '丁',
};

const NAJIA_STEM_OUTER = {
  '乾': '壬', '坎': '戊', '艮': '丙', '震': '庚',
  '巽': '辛', '离': '己', '坤': '癸', '兑': '丁',
};

// 地支五行
const BRANCH_ELEMENT = {
  '子': '水', '丑': '土', '寅': '木', '卯': '木',
  '辰': '土', '巳': '火', '午': '火', '未': '土',
  '申': '金', '酉': '金', '戌': '土', '亥': '水',
};

// 天干
const HEAVENLY_STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];

// 六神 (Six Spirits)
const SIX_SPIRITS = ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];

// 天干 -> 六神起始索引 (从初爻开始)
// 口诀：甲乙起青龙，丙丁起朱雀，戊日起勾陈，己日起螣蛇，庚辛起白虎，壬癸起玄武
const SPIRIT_START = {
  '甲': 0, '乙': 0, '丙': 1, '丁': 1, '戊': 2,
  '己': 3, '庚': 4, '辛': 4, '壬': 5, '癸': 5,
};

// 五行相生: A生B
const SHENG_CYCLE = { '金': '水', '水': '木', '木': '火', '火': '土', '土': '金' };
// 五行相克: A克B
const KE_CYCLE = { '金': '木', '木': '土', '土': '水', '水': '火', '火': '金' };
