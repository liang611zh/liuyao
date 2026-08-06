// ============================================================
// 六爻排盘 - 排盘正确性测试
// ============================================================
//
// 零依赖，直接跑：node test/paipan.test.js
//
// 用最小的浏览器全局 stub 在 vm 沙箱里加载真实的 js/*.js，
// 再拿传统纳甲筮法的标准答案逐项核对。
//
// 这些断言不是形式主义 —— 历史上这三处曾同时出错：
//   · 八卦二进制位序颠倒       → 64 卦里 48 个显示成别的卦
//   · 纳甲外卦复用了内卦地支   → 四五上爻的地支/五行/六亲全错
//   · 六神起例天干映射错位     → 六神整体偏移
// 改动 data.js 前请先确认这里仍然全绿。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// ------------------------------------------------------------
// 沙箱
// ------------------------------------------------------------

function createSandbox() {
  const store = {};
  const noop = () => {};
  const stubEl = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop },
    appendChild: noop, addEventListener: noop, replaceWith: noop,
  });

  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: { doNotTrack: null },
    location: { hostname: 'localhost', search: '' },
    document: {
      documentElement: {},
      head: { appendChild: noop },
      title: '',
      addEventListener: noop,
      createElement: stubEl,
      getElementById: () => null,
      querySelectorAll: () => [],
    },
    URLSearchParams,
    crypto: { randomUUID: () => `test-${Math.random().toString(16).slice(2)}` },
    history: { replaceState: noop },
    setInterval: noop,
    setTimeout: noop,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  // 顺序必须与 index.html 一致
  const FILES = [
    'js/config.js', 'js/analytics.js', 'js/i18n.js', 'js/data.js',
    'js/history.js', 'js/supabase.js', 'js/ai.js', 'js/app.js',
  ];
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const sandbox = createSandbox();
// 顶层 const 进的是 global lexical scope，不会挂到沙箱对象上，只能求值取
const ev = expr => vm.runInContext(expr, sandbox);

// ------------------------------------------------------------
// 断言
// ------------------------------------------------------------

let pass = 0;
const failures = [];

function section(title) {
  console.log(`\n${title}`);
}

function eq(label, got, want) {
  if (String(got) === String(want)) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}: 得到 ${got}，应为 ${want}`);
    console.log(`  ❌ ${label}: 得到 ${got}，应为 ${want}`);
  }
}

// ------------------------------------------------------------
// 1. 八卦二进制位序（从下到上，1=阳）
// ------------------------------------------------------------

section('八卦二进制位序（从下到上）');
const TRUE_TRIGRAM_BIN = {
  '乾': '111', '兑': '110', '离': '101', '震': '100',
  '巽': '011', '坎': '010', '艮': '001', '坤': '000',
};
for (const [name, bin] of Object.entries(TRUE_TRIGRAM_BIN)) {
  eq(`${name} = ${bin}`, ev(`TRIGRAM_BY_NAME['${name}']`), bin);
}

// ------------------------------------------------------------
// 2. 六十四卦查表往返
// ------------------------------------------------------------

section('六十四卦查表往返（摇出什么卦就该显示什么卦）');
const hexagrams = ev('HEXAGRAMS');
let hexBad = 0;
for (const lower of Object.keys(TRUE_TRIGRAM_BIN)) {
  for (const upper of Object.keys(TRUE_TRIGRAM_BIN)) {
    const binary = TRUE_TRIGRAM_BIN[lower] + TRUE_TRIGRAM_BIN[upper];
    const got = hexagrams[binary];
    const want = Object.values(hexagrams)
      .find(h => h.upperTrigram === upper && h.lowerTrigram === lower);
    if (!got || !want || got.gua !== want.gua) hexBad++;
  }
}
eq('64 卦全部查表正确', hexBad, 0);
eq('卦表共 64 卦', Object.keys(hexagrams).length, 64);
eq('八宫齐全', Object.keys(ev('PALACES')).length, 8);

// ------------------------------------------------------------
// 3. 纳甲：八纯卦六爻地支
// ------------------------------------------------------------

section('纳甲 · 八纯卦六爻地支（内外卦地支不同）');
const NAJIA_EXPECT = {
  '乾': '子寅辰午申戌', '坎': '寅辰午申戌子',
  '艮': '辰午申戌子寅', '震': '子寅辰午申戌',
  '巽': '丑亥酉未巳卯', '离': '卯丑亥酉未巳',
  '坤': '未巳卯丑亥酉', '兑': '巳卯丑亥酉未',
};
for (const [name, want] of Object.entries(NAJIA_EXPECT)) {
  eq(`${name}卦`, sandbox.calculateNajia(name, name).join(''), want);
}

// ------------------------------------------------------------
// 4. 六神起例
// ------------------------------------------------------------

section('六神起例（甲乙青龙 丙丁朱雀 戊勾陈 己螣蛇 庚辛白虎 壬癸玄武）');
const SPIRIT_EXPECT = {
  '甲': '青龙', '乙': '青龙', '丙': '朱雀', '丁': '朱雀', '戊': '勾陈',
  '己': '螣蛇', '庚': '白虎', '辛': '白虎', '壬': '玄武', '癸': '玄武',
};
for (const [stem, want] of Object.entries(SPIRIT_EXPECT)) {
  eq(`${stem}日起${want}`, ev(`SIX_SPIRITS[SPIRIT_START['${stem}']]`), want);
}

// ------------------------------------------------------------
// 5. 干支历与旬空
// ------------------------------------------------------------

section('干支历与旬空');
// 基准 2000-01-07 为甲子日，+29 天 = 癸巳日（甲申旬，空午未）
const D_GUIS = new Date(2000, 1, 5, 14, 0); // 2000-02-05 14:00 → 未时
eq('2000-01-07 为甲子日', sandbox.getTimeInfo(new Date(2000, 0, 7, 12), null).dayGanZhi, '甲子日');
eq('2000-02-05 为癸巳日', sandbox.getTimeInfo(D_GUIS, null).dayGanZhi, '癸巳日');
eq('14:00 为未时', sandbox.getTimeInfo(D_GUIS, null).shichen, '未时');
eq('癸巳属甲申旬，空午未', sandbox.getTimeInfo(D_GUIS, null).xunKongStr, '午未');
eq('甲子旬空戌亥', sandbox.getTimeInfo(new Date(2000, 0, 7, 12), null).xunKongStr, '戌亥');
eq('晚子时前 22:00 不进日', sandbox.getTimeInfo(new Date(2000, 1, 5, 22), null).dayGanZhi, '癸巳日');
eq('晚子时 23:30 进为甲午日', sandbox.getTimeInfo(new Date(2000, 1, 5, 23, 30), null).dayGanZhi, '甲午日');
eq('甲午旬空辰巳', sandbox.getTimeInfo(new Date(2000, 1, 5, 23, 30), null).xunKongStr, '辰巳');
eq('时辰可覆盖', sandbox.getTimeInfo(D_GUIS, 0).shichen, '子时');
eq('覆盖时辰不动日干支', sandbox.getTimeInfo(D_GUIS, 0).dayGanZhi, '癸巳日');

// ------------------------------------------------------------
// 6. 完整排盘：癸巳日摇出「风地观」变「风水涣」
// ------------------------------------------------------------

section('完整排盘 · 癸巳日 风地观（乾宫四世）变 风水涣');
// 爻值从初爻到上爻：8少阴 6老阴(动) 8少阴 8少阴 7少阳 7少阳
const throws = [8, 6, 8, 8, 7, 7].map(value => ({ value, coins: [] }));
const timeInfo = sandbox.getTimeInfo(D_GUIS, null);
const reading = sandbox.calculateFullReading(throws, timeInfo);

eq('本卦', reading.original.gua, '风地观');
eq('本卦卦宫', reading.original.palace, '乾');
eq('宫内序号（四世卦）', reading.original.palaceIndex, 4);
eq('变卦', reading.changed.gua, '风水涣');

// 上爻 → 初爻
const LINES_EXPECT = [
  [6, '辛卯木', '妻财', '白虎', ''],
  [5, '辛巳火', '官鬼', '螣蛇', ''],
  [4, '辛未土', '父母', '勾陈', '世'],
  [3, '乙卯木', '妻财', '朱雀', ''],
  [2, '乙巳火', '官鬼', '青龙', ''],
  [1, '乙未土', '父母', '玄武', '应'],
];
for (const [pos, ganzhi, relation, spirit, shiying] of LINES_EXPECT) {
  const l = reading.lines[pos - 1];
  const got = [
    `${l.stem}${l.branch}${l.branchElement}`,
    l.relation, l.spirit, l.isShi ? '世' : l.isYing ? '应' : '',
  ].join(' ');
  eq(`${pos}爻`, got, `${ganzhi} ${relation} ${spirit} ${shiying}`);
}

section('旬空落爻与动爻');
eq('旬空午未 → 四爻未土逢空', reading.lines[3].isXunKong, true);
eq('旬空午未 → 初爻未土逢空', reading.lines[0].isXunKong, true);
eq('三爻卯木不逢空', reading.lines[2].isXunKong, false);
eq('二爻为动爻', reading.lines[1].isChanging, true);
eq('二爻变出辰土', reading.lines[1].changedBranch, '辰');

// ------------------------------------------------------------
// 7. 安全与隐私
// ------------------------------------------------------------

section('安全与隐私');
eq('设置弹窗转义引号与尖括号',
  sandbox.escapeHtml('a"><script>x'), 'a&quot;&gt;&lt;script&gt;x');
eq('未配置 key 时统计为空操作', sandbox.track('test_event', {}), undefined);

const promptText = sandbox.buildDivinationPrompt(reading, '测试问题', '测试时间');
eq('AI prompt 含旬空', promptText.includes('旬空：午未'), true);
eq('AI prompt 含日建', promptText.includes('日建：巳'), true);
eq('AI prompt 逐爻标注纳甲天干', promptText.includes('辛未土'), true);

// ------------------------------------------------------------
// 8. 卦例记录：存原始输入，读时重算
// ------------------------------------------------------------

section('卦例记录 · 序列化与重建');
const record = sandbox.createReadingRecord({
  throws, timeInfo, question: '本月财运如何', mode: 'manual',
});

eq('记录存的是六个原始爻值', record.yaoValues.join(','), '8,6,8,8,7,7');
eq('记录存干支文本快照', record.dayGanzhi, '癸巳');
eq('记录存旬空文本', record.xunKong, '午未');
eq('记录存起卦地墙上时间', record.castAtLocal, timeInfo.dateStr);
eq('记录不含卦名等派生结果', 'gua' in record || 'lines' in record, false);
eq('记录通过校验', sandbox.isValidRecord(record), true);

// 走一遍 JSON 往返，模拟存进 localStorage / Postgres 再读回来
const revived = JSON.parse(JSON.stringify(record));
const rebuilt = sandbox.buildReadingFromRecord(revived);

eq('重建后卦名一致', rebuilt.reading.original.gua, reading.original.gua);
eq('重建后变卦一致', rebuilt.reading.changed.gua, reading.changed.gua);
eq('重建后卦宫一致', rebuilt.reading.original.palace, reading.original.palace);
const fingerprint = r => r.lines.map(l =>
  `${l.stem}${l.branch}${l.branchElement}/${l.relation}/${l.spirit}/${l.isShi ? 'S' : ''}${l.isYing ? 'Y' : ''}/${l.isXunKong ? 'K' : ''}`
).join('|');
eq('重建后六爻明细逐项一致', fingerprint(rebuilt.reading), fingerprint(reading));

section('卦例记录 · 时区无关');
// 干支在起卦那一刻定死存文本，换到任何时区重建都不该变。
// 若改成按 cast_at 重算，北京起的卦在纽约打开就会串到前一天。
const origTZ = process.env.TZ;
let tzStable = true;
for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
  process.env.TZ = tz;
  const other = createSandbox();
  const r = other.buildReadingFromRecord(revived);
  if (r.reading.original.gua !== reading.original.gua ||
      fingerprint(r.reading) !== fingerprint(reading)) {
    tzStable = false;
  }
}
process.env.TZ = origTZ;
eq('四个时区下重建结果完全一致', tzStable, true);

section('卦例记录 · 本地历史');
sandbox.clearLocalHistory();
eq('初始为空', sandbox.loadLocalHistory().length, 0);
sandbox.saveLocalRecord(record);
eq('写入一条', sandbox.loadLocalHistory().length, 1);
eq('新记录默认未同步', sandbox.getUnsyncedLocalRecords().length, 1);
sandbox.markLocalRecordsSynced([record.id]);
eq('打标后不再待同步', sandbox.getUnsyncedLocalRecords().length, 0);
const summary = sandbox.summarizeRecord(record);
eq('摘要卦名正确', summary.gua, '风地观');
eq('摘要变卦正确', summary.changedGua, '风水涣');
eq('摘要带回占问原文', summary.question, '本月财运如何');
sandbox.deleteLocalRecord(record.id);
eq('删除后为空', sandbox.loadLocalHistory().length, 0);
eq('校验拦下损坏记录', sandbox.isValidRecord({ ...record, yaoValues: [1, 2, 3] }), false);

section('账户功能默认关闭');
eq('未配置时 isCloudConfigured 为假', sandbox.isCloudConfigured(), false);
eq('未配置时无当前用户', sandbox.getCurrentUser(), null);
eq('未配置时不露出第三方登录', sandbox.getOAuthProviders().length, 0);
eq('provider 展示名不翻译', sandbox.getOAuthProviderName('google'), 'Google');
eq('未知 provider 原样返回', sandbox.getOAuthProviderName('unknown'), 'unknown');

// 中国大陆访问不了 Google，简中是本应用默认语言，
// 因此邮箱登录必须始终保留，不能被 SSO 取代
eq('五种语言都有邮箱登录文案', ['zh-CN', 'zh-TW', 'en', 'ja', 'ko'].every(lang => {
  const dict = ev(`I18N[${JSON.stringify(lang)}]`);
  return dict.btn_send_magic_link && dict.account_email_hint && dict.account_continue_with;
}), true);

// ------------------------------------------------------------

console.log(`\n${'='.repeat(50)}`);
if (failures.length) {
  console.log(`❌ 通过 ${pass} 项，失败 ${failures.length} 项：`);
  failures.forEach(f => console.log(`   · ${f}`));
  process.exit(1);
}
console.log(`✅ 全部 ${pass} 项通过`);
