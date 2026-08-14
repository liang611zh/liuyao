// ============================================================
// 六爻排盘 - 排盘正确性测试
// ============================================================
//
//   npm test
//
// 拿传统纳甲筮法的标准答案逐项核对排盘结果。
// 这些断言不是形式主义 —— 历史上这三处曾同时出错：
//   · 八卦二进制位序颠倒       → 64 卦里 48 个显示成别的卦
//   · 纳甲外卦复用了内卦地支   → 四五上爻的地支/五行/六亲全错
//   · 六神起例天干映射错位     → 六神整体偏移
// 改动 src/lib/data.ts 或 src/lib/paipan.ts 前请先确认这里仍然全绿。

import { afterAll, describe, expect, it, vi } from 'vitest'

import {
  HEXAGRAMS,
  PALACES,
  SIX_SPIRITS,
  SPIRIT_START,
  TRIGRAM_BY_NAME,
  type Stem,
  type TrigramName,
} from '@/lib/data'
import {
  calculateFullReading,
  calculateNajia,
  computeTimeFacts,
  getTimeInfo,
  type Reading,
  type Throw,
  type YaoValue,
} from '@/lib/paipan'
import {
  buildReadingFromRecord,
  clearLocalHistory,
  createReadingRecord,
  deleteLocalRecord,
  getUnsyncedLocalRecords,
  isValidRecord,
  loadLocalHistory,
  markLocalRecordsSynced,
  saveLocalRecord,
  summarizeRecord,
} from '@/lib/history'
import { I18N, SUPPORTED_LANGS, getLang, setLanguage, t } from '@/lib/i18n'
import { track } from '@/lib/analytics'
import {
  buildDivinationPrompt,
  getConfiguredProviders,
  getProviderConfig,
  saveProviderConfig,
} from '@/lib/ai'
import {
  getCurrentUser,
  getOAuthProviderName,
  getOAuthProviders,
  isCloudConfigured,
} from '@/lib/supabase'

// ------------------------------------------------------------
// 1. 八卦二进制位序（从下到上，1=阳）
// ------------------------------------------------------------

const TRUE_TRIGRAM_BIN: Record<TrigramName, string> = {
  乾: '111', 兑: '110', 离: '101', 震: '100',
  巽: '011', 坎: '010', 艮: '001', 坤: '000',
}

describe('八卦二进制位序（从下到上）', () => {
  // 写反了不会报错 —— 反转在八卦上是双射，查表照样查得到，只是查成了另一个卦
  it.each(Object.entries(TRUE_TRIGRAM_BIN))('%s = %s', (name, bin) => {
    expect(TRIGRAM_BY_NAME[name as TrigramName]).toBe(bin)
  })
})

// ------------------------------------------------------------
// 2. 六十四卦查表往返
// ------------------------------------------------------------

describe('六十四卦查表往返（摇出什么卦就该显示什么卦）', () => {
  it('64 卦全部查表正确', () => {
    const names = Object.keys(TRUE_TRIGRAM_BIN) as TrigramName[]
    for (const lower of names) {
      for (const upper of names) {
        const binary = TRUE_TRIGRAM_BIN[lower] + TRUE_TRIGRAM_BIN[upper]
        const got = HEXAGRAMS[binary]
        const want = Object.values(HEXAGRAMS).find(
          (h) => h.upperTrigram === upper && h.lowerTrigram === lower,
        )
        expect(got, `${lower}下${upper}上 查不到`).toBeTruthy()
        expect(got.gua, `${lower}下${upper}上`).toBe(want!.gua)
      }
    }
  })

  it('卦表共 64 卦', () => {
    expect(Object.keys(HEXAGRAMS)).toHaveLength(64)
  })

  it('八宫齐全', () => {
    expect(Object.keys(PALACES)).toHaveLength(8)
  })
})

// ------------------------------------------------------------
// 3. 纳甲：八纯卦六爻地支
// ------------------------------------------------------------

describe('纳甲 · 八纯卦六爻地支（内外卦地支不同）', () => {
  const NAJIA_EXPECT: Record<string, string> = {
    乾: '子寅辰午申戌', 坎: '寅辰午申戌子',
    艮: '辰午申戌子寅', 震: '子寅辰午申戌',
    巽: '丑亥酉未巳卯', 离: '卯丑亥酉未巳',
    坤: '未巳卯丑亥酉', 兑: '巳卯丑亥酉未',
  }

  it.each(Object.entries(NAJIA_EXPECT))('%s卦 = %s', (name, want) => {
    expect(calculateNajia(name as TrigramName, name as TrigramName).join('')).toBe(want)
  })
})

// ------------------------------------------------------------
// 4. 六神起例
// ------------------------------------------------------------

describe('六神起例（甲乙青龙 丙丁朱雀 戊勾陈 己螣蛇 庚辛白虎 壬癸玄武）', () => {
  const SPIRIT_EXPECT: Record<string, string> = {
    甲: '青龙', 乙: '青龙', 丙: '朱雀', 丁: '朱雀', 戊: '勾陈',
    己: '螣蛇', 庚: '白虎', 辛: '白虎', 壬: '玄武', 癸: '玄武',
  }

  it.each(Object.entries(SPIRIT_EXPECT))('%s日起%s', (stem, want) => {
    expect(SIX_SPIRITS[SPIRIT_START[stem as Stem]]).toBe(want)
  })
})

// ------------------------------------------------------------
// 5. 干支历与旬空
// ------------------------------------------------------------

// 基准 2000-01-07 为甲子日，+29 天 = 癸巳日（甲申旬，空午未）
const D_JIAZI = new Date(2000, 0, 7, 12)
const D_GUIS = new Date(2000, 1, 5, 14, 0) // 2000-02-05 14:00 → 未时

describe('干支历与旬空', () => {
  it('2000-01-07 为甲子日', () => {
    expect(getTimeInfo(D_JIAZI, null).dayGanZhi).toBe('甲子日')
  })
  it('2000-02-05 为癸巳日', () => {
    expect(getTimeInfo(D_GUIS, null).dayGanZhi).toBe('癸巳日')
  })
  it('14:00 为未时', () => {
    expect(getTimeInfo(D_GUIS, null).shichen).toBe('未时')
  })
  it('癸巳属甲申旬，空午未', () => {
    expect(getTimeInfo(D_GUIS, null).xunKongStr).toBe('午未')
  })
  it('甲子旬空戌亥', () => {
    expect(getTimeInfo(D_JIAZI, null).xunKongStr).toBe('戌亥')
  })
  it('晚子时前 22:00 不进日', () => {
    expect(getTimeInfo(new Date(2000, 1, 5, 22), null).dayGanZhi).toBe('癸巳日')
  })
  it('晚子时 23:30 进为甲午日', () => {
    expect(getTimeInfo(new Date(2000, 1, 5, 23, 30), null).dayGanZhi).toBe('甲午日')
  })
  it('甲午旬空辰巳', () => {
    expect(getTimeInfo(new Date(2000, 1, 5, 23, 30), null).xunKongStr).toBe('辰巳')
  })
  it('时辰可覆盖', () => {
    expect(getTimeInfo(D_GUIS, 0).shichen).toBe('子时')
  })
  it('覆盖时辰不动日干支', () => {
    expect(getTimeInfo(D_GUIS, 0).dayGanZhi).toBe('癸巳日')
  })
})

// ------------------------------------------------------------
// 6. 完整排盘：癸巳日摇出「风地观」变「风水涣」
// ------------------------------------------------------------

// 爻值从初爻到上爻：8少阴 6老阴(动) 8少阴 8少阴 7少阳 7少阳
const THROWS: Throw[] = ([8, 6, 8, 8, 7, 7] as YaoValue[]).map((value) => ({
  value,
  coins: [],
}))
const TIME_INFO = getTimeInfo(D_GUIS, null)
const READING = calculateFullReading(THROWS, TIME_INFO) as Reading

const fingerprint = (r: Reading) =>
  r.lines
    .map(
      (l) =>
        `${l.stem}${l.branch}${l.branchElement}/${l.relation}/${l.spirit}/` +
        `${l.isShi ? 'S' : ''}${l.isYing ? 'Y' : ''}/${l.isXunKong ? 'K' : ''}`,
    )
    .join('|')

describe('完整排盘 · 癸巳日 风地观（乾宫四世）变 风水涣', () => {
  it('排得出来', () => {
    expect(READING).not.toBeNull()
  })
  it('本卦', () => {
    expect(READING.original.gua).toBe('风地观')
  })
  it('本卦卦宫', () => {
    expect(READING.original.palace).toBe('乾')
  })
  it('宫内序号（四世卦）', () => {
    expect(READING.original.palaceIndex).toBe(4)
  })
  it('变卦', () => {
    expect(READING.changed!.gua).toBe('风水涣')
  })

  // 上爻 → 初爻
  const LINES_EXPECT: [number, string, string, string, string][] = [
    [6, '辛卯木', '妻财', '白虎', ''],
    [5, '辛巳火', '官鬼', '螣蛇', ''],
    [4, '辛未土', '父母', '勾陈', '世'],
    [3, '乙卯木', '妻财', '朱雀', ''],
    [2, '乙巳火', '官鬼', '青龙', ''],
    [1, '乙未土', '父母', '玄武', '应'],
  ]

  it.each(LINES_EXPECT)('%i爻 = %s %s %s %s', (pos, ganzhi, relation, spirit, shiying) => {
    const l = READING.lines[pos - 1]
    expect(`${l.stem}${l.branch}${l.branchElement}`).toBe(ganzhi)
    expect(l.relation).toBe(relation)
    expect(l.spirit).toBe(spirit)
    expect(l.isShi ? '世' : l.isYing ? '应' : '').toBe(shiying)
  })
})

describe('旬空落爻与动爻', () => {
  it('旬空午未 → 四爻未土逢空', () => {
    expect(READING.lines[3].isXunKong).toBe(true)
  })
  it('旬空午未 → 初爻未土逢空', () => {
    expect(READING.lines[0].isXunKong).toBe(true)
  })
  it('三爻卯木不逢空', () => {
    expect(READING.lines[2].isXunKong).toBe(false)
  })
  it('二爻为动爻', () => {
    expect(READING.lines[1].isChanging).toBe(true)
  })
  it('二爻变出辰土', () => {
    expect(READING.lines[1].changedBranch).toBe('辰')
  })
})

// ------------------------------------------------------------
// 7. 安全与隐私
// ------------------------------------------------------------

describe('安全与隐私', () => {
  // 旧版用 innerHTML 拼 AI 设置表单，因此需要 escapeHtml 兜底并为它写断言。
  // 改成 React 后所有用户输入都走文本节点，这类注入面整体消失，故不再有对应测试。
  it('未配置 key 时统计为空操作', () => {
    expect(track('test_event', {})).toBeUndefined()
  })

  const promptText = buildDivinationPrompt(READING, '测试问题', '测试时间')
  it('AI prompt 含旬空', () => {
    expect(promptText).toContain('旬空：午未')
  })
  it('AI prompt 含日建', () => {
    expect(promptText).toContain('日建：巳')
  })
  it('AI prompt 逐爻标注纳甲天干', () => {
    expect(promptText).toContain('辛未土')
  })
  it('AI prompt 带上占问原文', () => {
    expect(promptText).toContain('测试问题')
  })
})

// ------------------------------------------------------------
// 8. 卦例记录：存原始输入，读时重算
// ------------------------------------------------------------

const RECORD = createReadingRecord({
  throws: THROWS,
  timeInfo: TIME_INFO,
  question: '本月财运如何',
  mode: 'manual',
})

describe('卦例记录 · 序列化与重建', () => {
  it('记录存的是六个原始爻值', () => {
    expect(RECORD.yaoValues.join(',')).toBe('8,6,8,8,7,7')
  })
  it('记录存干支文本快照', () => {
    expect(RECORD.dayGanzhi).toBe('癸巳')
  })
  it('记录存旬空文本', () => {
    expect(RECORD.xunKong).toBe('午未')
  })
  it('记录存起卦地墙上时间', () => {
    expect(RECORD.castAtLocal).toBe(TIME_INFO.dateStr)
  })
  it('记录不含卦名等派生结果', () => {
    expect('gua' in RECORD || 'lines' in RECORD).toBe(false)
  })
  it('记录通过校验', () => {
    expect(isValidRecord(RECORD)).toBe(true)
  })

  // 走一遍 JSON 往返，模拟存进 localStorage / Postgres 再读回来
  const revived = JSON.parse(JSON.stringify(RECORD))
  const rebuilt = buildReadingFromRecord(revived)

  it('重建后卦名一致', () => {
    expect(rebuilt.reading!.original.gua).toBe(READING.original.gua)
  })
  it('重建后变卦一致', () => {
    expect(rebuilt.reading!.changed!.gua).toBe(READING.changed!.gua)
  })
  it('重建后卦宫一致', () => {
    expect(rebuilt.reading!.original.palace).toBe(READING.original.palace)
  })
  it('重建后六爻明细逐项一致', () => {
    expect(fingerprint(rebuilt.reading!)).toBe(fingerprint(READING))
  })
})

describe('卦例记录 · 时区无关', () => {
  // 干支在起卦那一刻定死存文本，换到任何时区重建都不该变。
  // 若改成按 cast_at 重算，北京起的卦在纽约打开就会串到前一天。
  const origTZ = process.env.TZ
  const TZS = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']
  const revived = JSON.parse(JSON.stringify(RECORD))

  afterAll(() => {
    process.env.TZ = origTZ
  })

  it('四个时区下重建结果完全一致', () => {
    for (const tz of TZS) {
      process.env.TZ = tz
      const r = buildReadingFromRecord(revived)
      expect(r.reading!.original.gua, tz).toBe(READING.original.gua)
      expect(fingerprint(r.reading!), tz).toBe(fingerprint(READING))
    }
  })

  // 上面那条断言若因为「TZ 根本没生效」而通过，就成了摆设。
  // 这里反过来证明：同一个绝对时刻，换时区算出来的日干支确实会变。
  it('对照组：按绝对时刻推算的干支确实随时区漂移', () => {
    const instant = new Date('2000-02-05T15:30:00Z')
    process.env.TZ = 'Pacific/Kiritimati' // UTC+14
    const east = computeTimeFacts(instant, null)
    process.env.TZ = 'America/New_York' // UTC-5
    const west = computeTimeFacts(instant, null)
    expect(`${east.dayStem}${east.dayBranch}`).not.toBe(`${west.dayStem}${west.dayBranch}`)
  })
})

describe('卦例记录 · 本地历史', () => {
  it('走完一轮增删改查', () => {
    clearLocalHistory()
    expect(loadLocalHistory()).toHaveLength(0)

    saveLocalRecord(RECORD)
    expect(loadLocalHistory()).toHaveLength(1)
    expect(getUnsyncedLocalRecords()).toHaveLength(1)

    markLocalRecordsSynced([RECORD.id])
    expect(getUnsyncedLocalRecords()).toHaveLength(0)

    deleteLocalRecord(RECORD.id)
    expect(loadLocalHistory()).toHaveLength(0)
  })

  it('摘要卦名正确', () => {
    expect(summarizeRecord(RECORD)!.gua).toBe('风地观')
  })
  it('摘要变卦正确', () => {
    expect(summarizeRecord(RECORD)!.changedGua).toBe('风水涣')
  })
  it('摘要带回占问原文', () => {
    expect(summarizeRecord(RECORD)!.question).toBe('本月财运如何')
  })
  it('校验拦下损坏的爻值', () => {
    expect(isValidRecord({ ...RECORD, yaoValues: [1, 2, 3] })).toBe(false)
  })
  it('校验拦下非法时辰（否则重建时会拿 -1 去查表）', () => {
    expect(isValidRecord({ ...RECORD, shichen: 'X' })).toBe(false)
  })
})

// ------------------------------------------------------------
// 9. 账户
// ------------------------------------------------------------

describe('账户功能默认关闭', () => {
  it('未配置时 isCloudConfigured 为假', () => {
    expect(isCloudConfigured()).toBe(false)
  })
  it('未配置时无当前用户', () => {
    expect(getCurrentUser()).toBeNull()
  })
  it('未配置时不露出第三方登录', () => {
    expect(getOAuthProviders()).toHaveLength(0)
  })
  it('provider 展示名不翻译', () => {
    expect(getOAuthProviderName('google')).toBe('Google')
  })
  it('未知 provider 原样返回', () => {
    expect(getOAuthProviderName('unknown')).toBe('unknown')
  })
})

// ------------------------------------------------------------
// 10. 多语言
// ------------------------------------------------------------

describe('多语言', () => {
  // 中国大陆访问不了 Google，简中是本应用默认语言，
  // 因此邮箱登录必须始终保留，不能被 SSO 取代
  it('五种语言都有邮箱登录文案', () => {
    for (const lang of Object.keys(SUPPORTED_LANGS) as (keyof typeof SUPPORTED_LANGS)[]) {
      const dict = I18N[lang]
      expect(dict.btn_send_magic_link, lang).toBeTruthy()
      expect(dict.account_email_hint, lang).toBeTruthy()
      expect(dict.account_continue_with, lang).toBeTruthy()
    }
  })

  it('五种语言的词条集合完全一致（漏翻会静默回落简中）', () => {
    const base = Object.keys(I18N['zh-CN']).sort()
    for (const lang of Object.keys(SUPPORTED_LANGS) as (keyof typeof SUPPORTED_LANGS)[]) {
      expect(Object.keys(I18N[lang]).sort(), lang).toEqual(base)
    }
  })

  // t() 必须用 in 判断而不是 ||：zh-CN 的 ai_prompt_lang 合法取值就是空字符串，
  // 用 || 会把它当成缺失，最后把 key 名本身当译文吐出来，塞进 AI prompt 里
  it('合法的空字符串词条不会被当成缺失', () => {
    setLanguage('zh-CN')
    expect(t('ai_prompt_lang')).toBe('')
  })

  it('切换语言后 t() 立即跟着变', () => {
    setLanguage('en')
    expect(getLang()).toBe('en')
    expect(t('day_ganzhi', { gz: '甲子' })).toBe('甲子 Day')
    setLanguage('ja')
    expect(t('btn_send_magic_link')).toBe(I18N.ja.btn_send_magic_link)
    setLanguage('zh-CN')
  })

  // 产品决策：主力用户在墙内，但常装英文系统 / 英文 Chrome。
  // 按 navigator.language 自动选会让他们一进来就是英文，而卦名、纳甲、六亲
  // 本来就是中文术语。node 的 navigator.language 是 en-US，所以这条断言
  // 一旦有人把嗅探加回去就会红。
  it('没存过选择时默认简中，不跟随浏览器语言', async () => {
    localStorage.removeItem('liuyao_lang')
    vi.resetModules()
    const fresh = await import('@/lib/i18n')
    expect(fresh.getLang()).toBe('zh-CN')
    localStorage.setItem('liuyao_lang', 'zh-CN')
  })

  it('缺失的 key 回落到简中而不是抛错', () => {
    setLanguage('ko')
    expect(t('app_title')).toBe(I18N.ko.app_title)
    expect(t('__does_not_exist__')).toBe('__does_not_exist__')
    setLanguage('zh-CN')
  })
})

// ------------------------------------------------------------
// 11. AI 配置
// ------------------------------------------------------------

describe('AI 提供商配置', () => {
  it('没填 key 的提供商不出现在可选列表里', () => {
    expect(getConfiguredProviders()).toHaveLength(0)
  })

  it('配置能存进 localStorage 并读回', () => {
    saveProviderConfig('deepseek', { apiKey: 'test-key', model: 'deepseek-chat' })
    expect(getProviderConfig('deepseek').apiKey).toBe('test-key')
    expect(getConfiguredProviders()).toContain('deepseek')
  })

  it('custom 只填 key 不填端点不算配好', () => {
    saveProviderConfig('custom', { apiKey: 'k' })
    expect(getConfiguredProviders()).not.toContain('custom')
    saveProviderConfig('custom', { endpoint: 'https://example.com/v1/chat/completions' })
    expect(getConfiguredProviders()).toContain('custom')
  })
})
