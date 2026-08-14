// ============================================================
// 六爻排盘 - 卦例记录层
// ============================================================
//
// 存储无关：本地 localStorage 和云端 Supabase 用的是同一套记录格式，
// 上层不需要知道一条记录来自哪里。
//
// 记录里只放「起卦时的原始事实」——六个爻值 + 当时的干支文本快照。
// 卦名、纳甲、六亲、世应、六神全部在读取时重算（见 buildReadingFromRecord）。
// 理由见 supabase/schema.sql 顶部注释：排盘逻辑会修，存派生结果等于冻结错误；
// 且按 timestamptz 重算干支会随查看设备的时区漂移。

import { EARTHLY_BRANCHES, type Branch, type Stem } from './data'
import { getLang, type Lang } from './i18n'
import {
  calculateFullReading,
  localizeTimeInfo,
  type Reading,
  type Throw,
  type TimeFacts,
  type TimeInfo,
  type YaoValue,
} from './paipan'

const LOCAL_HISTORY_KEY = 'liuyao_history'
const LOCAL_HISTORY_LIMIT = 50

export type CastMode = 'random' | 'manual'

export interface ReadingRecord {
  id: string
  /** 云端行的 id 由数据库生成，与本机副本不同；带上 client_id 才能两边一起删 */
  clientId?: string | null
  castAt: string
  /** 起卦地的墙上时间，避免跨时区查看时显示成别的时刻 */
  castAtLocal: string
  yaoValues: YaoValue[]
  dayGanzhi: string
  shichen: string
  xunKong: string
  question: string
  mode: CastMode
  lang: Lang | string
  synced?: boolean
}

// ============================================================
// 记录构造
// ============================================================

function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export function createReadingRecord(input: {
  throws: Throw[]
  timeInfo: TimeFacts
  question?: string
  mode?: CastMode
}): ReadingRecord {
  const { throws, timeInfo, question, mode } = input
  return {
    id: makeLocalId(),
    castAt: new Date().toISOString(),
    castAtLocal: timeInfo.dateStr,
    yaoValues: throws.map((th) => th.value),
    dayGanzhi: `${timeInfo.dayStem}${timeInfo.dayBranch}`,
    shichen: EARTHLY_BRANCHES[timeInfo.shichenIdx],
    xunKong: timeInfo.xunKongStr,
    question: question || '',
    mode: mode || 'random',
    lang: getLang(),
    synced: false,
  }
}

export function isValidRecord(rec: unknown): rec is ReadingRecord {
  const r = rec as ReadingRecord | null
  return Boolean(
    r &&
      Array.isArray(r.yaoValues) &&
      r.yaoValues.length === 6 &&
      r.yaoValues.every((v) => [6, 7, 8, 9].includes(v)) &&
      typeof r.dayGanzhi === 'string' &&
      r.dayGanzhi.length === 2 &&
      typeof r.xunKong === 'string' &&
      r.xunKong.length === 2 &&
      // 时辰必须是十二支之一，否则重建时会拿 -1 去查表
      typeof r.shichen === 'string' &&
      EARTHLY_BRANCHES.includes(r.shichen as Branch),
  )
}

// ============================================================
// 从记录重建排盘
// ============================================================

/**
 * 把记录里的干支文本还原成时间事实，全程不碰 Date 的时区换算 ——
 * 干支在起卦那一刻就已经定死。
 */
export function timeFactsFromRecord(rec: ReadingRecord): TimeFacts {
  return {
    dateStr: rec.castAtLocal || '',
    dayStem: rec.dayGanzhi[0] as Stem,
    dayBranch: rec.dayGanzhi[1] as Branch,
    shichenIdx: EARTHLY_BRANCHES.indexOf(rec.shichen as Branch),
    xunKong: [rec.xunKong[0] as Branch, rec.xunKong[1] as Branch],
    xunKongStr: rec.xunKong,
  }
}

export function timeInfoFromRecord(rec: ReadingRecord): TimeInfo {
  return localizeTimeInfo(timeFactsFromRecord(rec))
}

/** 返回的 reading 与直接起卦得到的结构完全一致 */
export function buildReadingFromRecord(rec: ReadingRecord): {
  reading: Reading | null
  timeInfo: TimeInfo
  throws: Throw[]
} {
  const timeInfo = timeInfoFromRecord(rec)
  const throws: Throw[] = rec.yaoValues.map((value) => ({ value, coins: [] }))
  return { reading: calculateFullReading(throws, timeInfo), timeInfo, throws }
}

export interface RecordSummary {
  id: string
  dateStr: string
  ganzhi: string
  gua: string
  changedGua: string | null
  question: string
  synced: boolean
}

/** 历史列表上的一行摘要 */
export function summarizeRecord(rec: ReadingRecord): RecordSummary | null {
  const { reading, timeInfo } = buildReadingFromRecord(rec)
  if (!reading) return null
  return {
    id: rec.id,
    dateStr: rec.castAtLocal || '',
    ganzhi: `${timeInfo.dayGanZhi} ${timeInfo.shichen}`,
    gua: reading.original.gua,
    changedGua: reading.changed ? reading.changed.gua : null,
    question: rec.question || '',
    synced: Boolean(rec.synced),
  }
}

// ============================================================
// 本地历史（未登录时的降级存储，登录后作为待同步队列）
// ============================================================

export function loadLocalHistory(): ReadingRecord[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(isValidRecord) : []
  } catch {
    return []
  }
}

function writeLocalHistory(records: ReadingRecord[]): boolean {
  try {
    localStorage.setItem(
      LOCAL_HISTORY_KEY,
      JSON.stringify(records.slice(0, LOCAL_HISTORY_LIMIT)),
    )
    return true
  } catch {
    // 配额满或隐私模式下写不进去，静默降级：起卦本身不受影响
    return false
  }
}

export function saveLocalRecord(rec: ReadingRecord): ReadingRecord {
  const records = loadLocalHistory()
  records.unshift(rec)
  writeLocalHistory(records)
  return rec
}

export function deleteLocalRecord(id: string): void {
  writeLocalHistory(loadLocalHistory().filter((r) => r.id !== id))
}

/** 上云成功后打标，避免下次登录重复上传 */
export function markLocalRecordsSynced(ids: string[]): void {
  const set = new Set(ids)
  writeLocalHistory(
    loadLocalHistory().map((r) => (set.has(r.id) ? { ...r, synced: true } : r)),
  )
}

export function getUnsyncedLocalRecords(): ReadingRecord[] {
  return loadLocalHistory().filter((r) => !r.synced)
}

export function clearLocalHistory(): void {
  try {
    localStorage.removeItem(LOCAL_HISTORY_KEY)
  } catch {
    /* 忽略 */
  }
}
