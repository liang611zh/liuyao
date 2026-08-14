// ============================================================
// 六爻排盘 - 排盘算法
// ============================================================
//
// 干支历、摇卦、纳甲、六亲、六神、世应、旬空。
// 除了取译文以外不碰任何浏览器 API，可以直接在 node 里跑测试。
//
// 时间处理有一条铁律：起卦时刻在点「起卦」那一刻快照下来，
// 排盘全程以此为准，不要在渲染时重新取 new Date()。

import {
  BRANCH_ELEMENT,
  EARTHLY_BRANCHES,
  HEAVENLY_STEMS,
  HEXAGRAMS,
  KE_CYCLE,
  NAJIA_INNER,
  NAJIA_OUTER,
  NAJIA_STEM_INNER,
  NAJIA_STEM_OUTER,
  SHENG_CYCLE,
  SHI_YING_MAP,
  SIX_SPIRITS,
  SPIRIT_START,
  TRIGRAMS,
  TRIGRAM_BY_NAME,
  type Branch,
  type Element,
  type Hexagram,
  type Relation,
  type Spirit,
  type Stem,
  type TrigramName,
} from './data'
import { t, tList, tMap } from './i18n'

// ============================================================
// 类型
// ============================================================

/** 三枚铜钱的结果：6 老阴、7 少阳、8 少阴、9 老阳 */
export type YaoValue = 6 | 7 | 8 | 9

export interface Throw {
  value: YaoValue
  /** 三枚铜钱，1 = 字（阳），0 = 背（阴）。从历史记录重建时为空数组 */
  coins: number[]
}

/** 与语言无关的时间事实。存进卦例记录、跨时区重建都只靠这些 */
export interface TimeFacts {
  dateStr: string
  dayStem: Stem
  dayBranch: Branch
  shichenIdx: number
  xunKong: Branch[]
  xunKongStr: string
  jiaziIdx?: number
}

/** 加上当前语言译文之后的时间信息 */
export interface TimeInfo extends TimeFacts {
  dayGanZhi: string
  shichen: string
  shichenFull: string
}

export interface Line {
  position: number
  value: YaoValue
  isYang: boolean
  isChanging: boolean
  label: string
  stem: Stem
  branch: Branch
  branchElement: Element
  relation: Relation
  spirit: Spirit
  isShi: boolean
  isYing: boolean
  isXunKong: boolean
  changedBranch: Branch | null
  changedRelation: Relation | null
  changedIsXunKong: boolean
}

export interface Reading {
  original: Hexagram
  changed: Hexagram | null
  lines: Line[]
  hasChanging: boolean
  palaceElement: Element
  timeInfo: TimeInfo
}

// ============================================================
// 干支历
// ============================================================

// 晚子时（23:00 起）是否进为次日干支。
// 六爻纳甲通行「晚子时」派：23:00 一到即换日。改为 false 则按日历日算。
export const LATE_ZI_ADVANCES_DAY = true

/** 根据小时取时辰索引（子时从 23 点开始） */
export function getShichenIndex(hour: number): number {
  return Math.floor(((hour + 1) % 24) / 2)
}

/**
 * 六十甲子日序 0-59（0 = 甲子）
 * 参考基准：2000-01-07 为甲子日
 */
export function getDayJiaziIndex(date: Date): number {
  const ref = new Date(2000, 0, 7)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  let diff = Math.round((d.getTime() - ref.getTime()) / 86400000)
  if (LATE_ZI_ADVANCES_DAY && date.getHours() >= 23) diff += 1
  return ((diff % 60) + 60) % 60
}

/**
 * 旬空（空亡）：本旬十天配十干，余下两支无干可配即为空
 * 甲子旬空戌亥、甲戌旬空申酉、甲申旬空午未、甲午旬空辰巳、甲辰旬空寅卯、甲寅旬空子丑
 */
export function getXunKong(jiaziIdx: number): Branch[] {
  const xunHeadBranchIdx = (jiaziIdx - (jiaziIdx % 10)) % 12
  return [
    EARTHLY_BRANCHES[(xunHeadBranchIdx + 10) % 12],
    EARTHLY_BRANCHES[(xunHeadBranchIdx + 11) % 12],
  ]
}

/**
 * 某一时刻的时间事实，不含任何译文。
 * shichenOverride 为 0-11 时覆盖时辰（只影响所记时辰，不影响日干支）
 */
export function computeTimeFacts(date: Date, shichenOverride?: number | null): TimeFacts {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = date.getHours()
  const min = String(date.getMinutes()).padStart(2, '0')

  const jiaziIdx = getDayJiaziIndex(date)
  const xunKong = getXunKong(jiaziIdx)
  const shichenIdx =
    shichenOverride === null || shichenOverride === undefined
      ? getShichenIndex(h)
      : shichenOverride

  return {
    dateStr: `${y}-${m}-${d} ${String(h).padStart(2, '0')}:${min}`,
    dayStem: HEAVENLY_STEMS[jiaziIdx % 10],
    dayBranch: EARTHLY_BRANCHES[jiaziIdx % 12],
    shichenIdx,
    jiaziIdx,
    xunKong,
    xunKongStr: xunKong.join(''),
  }
}

/**
 * 给时间事实套上当前语言的译文。
 * 必须在 render 期间调用 —— 切语言后要跟着变，不能缓存进 state。
 */
export function localizeTimeInfo(facts: TimeFacts): TimeInfo {
  const shichenNames = tList('shichen_names')
  // 记录损坏时 shichenIdx 可能越界，兜底成空串而不是把 "undefined" 印到页面上
  const branch = EARTHLY_BRANCHES[facts.shichenIdx] ?? ''
  return {
    ...facts,
    dayGanZhi: t('day_ganzhi', { gz: `${facts.dayStem}${facts.dayBranch}` }),
    shichen: t('shichen_short', { branch }),
    shichenFull: shichenNames[facts.shichenIdx] ?? branch,
  }
}

/** 取某一时刻的完整（含译文）干支信息 */
export function getTimeInfo(date: Date, shichenOverride?: number | null): TimeInfo {
  return localizeTimeInfo(computeTimeFacts(date, shichenOverride))
}

// ============================================================
// 摇卦
// ============================================================

/** 三枚铜钱 → 爻值。1 = 字（阳面），0 = 背（阴面） */
export function getYaoValue(coins: number[]): YaoValue {
  const tails = coins.filter((c) => c === 0).length
  return ([9, 8, 7, 6] as const)[tails]
}

export function isYangValue(value: YaoValue): boolean {
  return value === 7 || value === 9
}

export function isChangingValue(value: YaoValue): boolean {
  return value === 6 || value === 9
}

export function getYaoLabel(value: YaoValue): string {
  return tMap('yao_labels')[String(value)] ?? String(value)
}

export function getYaoInfo(value: YaoValue) {
  return {
    isYang: isYangValue(value),
    isChanging: isChangingValue(value),
    label: getYaoLabel(value),
  }
}

/** 六个爻值 → 本卦与变卦的二进制串（index 0 = 初爻） */
export function buildHexagrams(throws: Throw[]) {
  let originalBin = ''
  let changedBin = ''
  let hasChanging = false

  for (let i = 0; i < 6; i++) {
    const value = throws[i].value
    const yang = isYangValue(value)
    const origBit = yang ? '1' : '0'
    originalBin += origBit
    if (isChangingValue(value)) {
      hasChanging = true
      changedBin += yang ? '0' : '1'
    } else {
      changedBin += origBit
    }
  }
  return { originalBin, changedBin, hasChanging }
}

export function lookupHexagram(binary: string): Hexagram | null {
  const hex = HEXAGRAMS[binary]
  return hex ? { ...hex } : null
}

// ============================================================
// 纳甲 / 六亲 / 六神
// ============================================================

/** 初/二/三爻取内卦纳甲，四/五/上爻取外卦纳甲（两者地支不同，不可共用一张表） */
export function calculateNajia(upperTrigram: TrigramName, lowerTrigram: TrigramName): Branch[] {
  return [...NAJIA_INNER[lowerTrigram], ...NAJIA_OUTER[upperTrigram]]
}

export function calculateNajiaStems(
  upperTrigram: TrigramName,
  lowerTrigram: TrigramName,
): Stem[] {
  const inner = NAJIA_STEM_INNER[lowerTrigram]
  const outer = NAJIA_STEM_OUTER[upperTrigram]
  return [inner, inner, inner, outer, outer, outer]
}

/** 六亲：以卦宫五行为「我」，与各爻五行的生克关系 */
export function getSixRelation(palaceElement: Element, lineElement: Element): Relation {
  if (palaceElement === lineElement) return '兄弟'
  if (SHENG_CYCLE[palaceElement] === lineElement) return '子孙'
  if (SHENG_CYCLE[lineElement] === palaceElement) return '父母'
  if (KE_CYCLE[palaceElement] === lineElement) return '妻财'
  if (KE_CYCLE[lineElement] === palaceElement) return '官鬼'
  return '?'
}

/** 六神由日天干起例，自初爻向上排 */
export function calculateSixSpirits(dayStem: Stem): Spirit[] {
  const startIdx = SPIRIT_START[dayStem] ?? 0
  return Array.from({ length: 6 }, (_, i) => SIX_SPIRITS[(startIdx + i) % 6])
}

// ============================================================
// 完整排盘
// ============================================================

export function calculateFullReading(throws: Throw[], timeInfo: TimeInfo): Reading | null {
  const { originalBin, changedBin, hasChanging } = buildHexagrams(throws)
  const original = lookupHexagram(originalBin)
  if (!original) return null
  const changed = hasChanging ? lookupHexagram(changedBin) : null

  const shiYing = SHI_YING_MAP[original.palaceIndex]
  const najia = calculateNajia(original.upperTrigram, original.lowerTrigram)
  const stems = calculateNajiaStems(original.upperTrigram, original.lowerTrigram)
  const palaceElement = TRIGRAMS[TRIGRAM_BY_NAME[original.palace]].element
  const relations = najia.map((b) => getSixRelation(palaceElement, BRANCH_ELEMENT[b]))
  const spirits = calculateSixSpirits(timeInfo.dayStem)
  const xunKong = timeInfo.xunKong

  // 变爻六亲目前按变卦卦宫推定；传统主流做法是按本卦卦宫推定，尚未改动
  let changedNajia: Branch[] | null = null
  let changedRelations: Relation[] | null = null
  if (changed) {
    changedNajia = calculateNajia(changed.upperTrigram, changed.lowerTrigram)
    const cpe = TRIGRAMS[TRIGRAM_BY_NAME[changed.palace]].element
    changedRelations = changedNajia.map((b) => getSixRelation(cpe, BRANCH_ELEMENT[b]))
  }

  const lines: Line[] = []
  for (let i = 0; i < 6; i++) {
    const value = throws[i].value
    lines.push({
      position: i + 1,
      value,
      isYang: isYangValue(value),
      isChanging: isChangingValue(value),
      label: getYaoLabel(value),
      stem: stems[i],
      branch: najia[i],
      branchElement: BRANCH_ELEMENT[najia[i]],
      relation: relations[i],
      spirit: spirits[i],
      isShi: shiYing.shi === i + 1,
      isYing: shiYing.ying === i + 1,
      isXunKong: xunKong.includes(najia[i]),
      changedBranch: changedNajia ? changedNajia[i] : null,
      changedRelation: changedRelations ? changedRelations[i] : null,
      changedIsXunKong: changedNajia ? xunKong.includes(changedNajia[i]) : false,
    })
  }

  return { original, changed, lines, hasChanging, palaceElement, timeInfo }
}

/** 摇一次卦：三枚铜钱各自正反 */
export function tossCoins(): number[] {
  return [0, 0, 0].map(() => (Math.random() > 0.5 ? 1 : 0))
}
