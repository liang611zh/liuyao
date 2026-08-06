// ============================================================
// 六爻排盘 - 卦例记录层
// ============================================================
//
// 存储无关：本地 localStorage 和云端 Supabase 用的是同一套记录格式，
// 上层不需要知道一条记录来自哪里。
//
// 记录里只放「起卦时的原始事实」——六个爻值 + 当时的干支文本快照。
// 卦名、纳甲、六亲、世应、六神全部在读取时重算（见 buildReadingFromRecord）。
// 理由见 supabase/schema.sql 顶部注释：排盘逻辑会修，存派生结果等于冻结错误。

const LOCAL_HISTORY_KEY = 'liuyao_history';
const LOCAL_HISTORY_LIMIT = 50;

// ============================================================
// 记录构造
// ============================================================

function makeLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// timeInfo 来自 getTimeInfo()，throws 是 [{value, coins}] x6
function createReadingRecord({ throws, timeInfo, question, mode }) {
  return {
    id: makeLocalId(),
    castAt: new Date().toISOString(),
    // 起卦地的墙上时间，避免跨时区查看时显示成别的时刻
    castAtLocal: timeInfo.dateStr,
    yaoValues: throws.map(th => th.value),
    dayGanzhi: `${timeInfo.dayStem}${timeInfo.dayBranch}`,
    shichen: EARTHLY_BRANCHES_12[timeInfo.shichenIdx],
    xunKong: timeInfo.xunKongStr,
    question: question || '',
    mode: mode || 'random',
    lang: currentLang,
    synced: false,
  };
}

function isValidRecord(rec) {
  return Boolean(
    rec &&
    Array.isArray(rec.yaoValues) &&
    rec.yaoValues.length === 6 &&
    rec.yaoValues.every(v => [6, 7, 8, 9].includes(v)) &&
    typeof rec.dayGanzhi === 'string' && rec.dayGanzhi.length === 2 &&
    typeof rec.xunKong === 'string' && rec.xunKong.length === 2
  );
}

// ============================================================
// 从记录重建排盘
// ============================================================

// 把记录里的干支文本还原成 getTimeInfo() 那套结构，
// 全程不碰 Date 的时区换算 —— 干支在起卦那一刻就已经定死。
function timeInfoFromRecord(rec) {
  const dayStem = rec.dayGanzhi[0];
  const dayBranch = rec.dayGanzhi[1];
  const shichenIdx = EARTHLY_BRANCHES_12.indexOf(rec.shichen);
  const xunKong = [rec.xunKong[0], rec.xunKong[1]];
  const shichenNames = t('shichen_names');

  return {
    dateStr: rec.castAtLocal || '',
    dayGanZhi: t('day_ganzhi', { gz: rec.dayGanzhi }),
    shichen: t('shichen_short', { branch: rec.shichen }),
    shichenFull: shichenIdx >= 0 ? shichenNames[shichenIdx] : rec.shichen,
    dayStem,
    dayBranch,
    shichenIdx,
    xunKong,
    xunKongStr: rec.xunKong,
  };
}

// 返回 { reading, timeInfo }，reading 与直接起卦得到的结构完全一致
function buildReadingFromRecord(rec) {
  const timeInfo = timeInfoFromRecord(rec);
  const throws = rec.yaoValues.map(value => ({ value, coins: [] }));
  const reading = calculateFullReading(throws, timeInfo);
  return { reading, timeInfo, throws };
}

// 历史列表上的一行摘要
function summarizeRecord(rec) {
  const { reading } = buildReadingFromRecord(rec);
  if (!reading) return null;
  return {
    id: rec.id,
    dateStr: rec.castAtLocal || '',
    ganzhi: `${t('day_ganzhi', { gz: rec.dayGanzhi })} ${t('shichen_short', { branch: rec.shichen })}`,
    gua: reading.original.gua,
    changedGua: reading.changed ? reading.changed.gua : null,
    question: rec.question || '',
    synced: Boolean(rec.synced),
  };
}

// ============================================================
// 本地历史（未登录时的降级存储，登录后作为待同步队列）
// ============================================================

function loadLocalHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(isValidRecord) : [];
  } catch { return []; }
}

function writeLocalHistory(records) {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(records.slice(0, LOCAL_HISTORY_LIMIT)));
    return true;
  } catch {
    // 配额满或隐私模式下写不进去，静默降级：起卦本身不受影响
    return false;
  }
}

function saveLocalRecord(rec) {
  const records = loadLocalHistory();
  records.unshift(rec);
  writeLocalHistory(records);
  return rec;
}

function deleteLocalRecord(id) {
  writeLocalHistory(loadLocalHistory().filter(r => r.id !== id));
}

// 上云成功后打标，避免下次登录重复上传
function markLocalRecordsSynced(ids) {
  const set = new Set(ids);
  writeLocalHistory(loadLocalHistory().map(r => (set.has(r.id) ? { ...r, synced: true } : r)));
}

function getUnsyncedLocalRecords() {
  return loadLocalHistory().filter(r => !r.synced);
}

function clearLocalHistory() {
  try { localStorage.removeItem(LOCAL_HISTORY_KEY); } catch { /* 忽略 */ }
}
