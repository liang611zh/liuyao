// ============================================================
// 六爻排盘 - AI 解卦模块
// ============================================================
//
// 只管「配置 + 拼 prompt + 流式取字」，一行 DOM 都不碰 —— 弹窗与输出交给 React。
// 旧版在这里用 innerHTML 拼设置表单，因此需要 escapeHtml 兜底；
// 改成 React 后这类注入面整体消失，那个函数也就一并去掉了。
//
// 用户的 API Key 只存在各自浏览器的 localStorage，不经过任何服务器。

import { t } from './i18n'
import type { Reading } from './paipan'

export type ProviderType = 'openai' | 'anthropic' | 'gemini'

export interface AIProvider {
  name: string
  /** 价格提示的 i18n key */
  hintKey: string
  models: string[]
  defaultModel: string
  type: ProviderType
  endpoint?: string
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  gemini: {
    name: 'Gemini',
    hintKey: 'ai_hint_free',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    type: 'gemini',
  },
  groq: {
    name: 'Groq',
    hintKey: 'ai_hint_free',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    type: 'openai',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  },
  deepseek: {
    name: 'DeepSeek',
    hintKey: 'ai_hint_cheap',
    models: ['deepseek-chat'],
    defaultModel: 'deepseek-chat',
    type: 'openai',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
  },
  openai: {
    name: 'OpenAI',
    hintKey: 'ai_hint_paid',
    models: ['gpt-4o-mini', 'gpt-4o'],
    defaultModel: 'gpt-4o-mini',
    type: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  claude: {
    name: 'Claude',
    hintKey: 'ai_hint_paid',
    models: ['claude-sonnet-4-20250514'],
    defaultModel: 'claude-sonnet-4-20250514',
    type: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  custom: {
    name: '自定义',
    hintKey: 'ai_hint_custom',
    models: [],
    defaultModel: '',
    type: 'openai',
    endpoint: '',
  },
}

export function getProviderDisplayName(id: string): string {
  return id === 'custom' ? t('ai_provider_custom') : (AI_PROVIDERS[id]?.name ?? id)
}

// ============================================================
// localStorage 配置管理
// ============================================================

export interface ProviderConfig {
  apiKey?: string
  model?: string
  endpoint?: string
  customModelName?: string
  customModels?: string[]
}

const AI_CONFIG_KEY = 'liuyao_ai_config'
const LAST_PROVIDER_KEY = 'liuyao_last_provider'

export function getAIConfig(): Record<string, ProviderConfig> {
  try {
    return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveAIConfig(cfg: Record<string, ProviderConfig>): void {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(cfg))
  } catch {
    /* 隐私模式或配额满，静默失败：解读功能不可用但排盘不受影响 */
  }
}

export function getProviderConfig(providerId: string): ProviderConfig {
  return getAIConfig()[providerId] || {}
}

export function saveProviderConfig(providerId: string, data: ProviderConfig): void {
  const cfg = getAIConfig()
  cfg[providerId] = { ...cfg[providerId], ...data }
  saveAIConfig(cfg)
}

export function getLastProvider(): string {
  try {
    return localStorage.getItem(LAST_PROVIDER_KEY) || ''
  } catch {
    return ''
  }
}

export function setLastProvider(id: string): void {
  try {
    localStorage.setItem(LAST_PROVIDER_KEY, id)
  } catch {
    /* 忽略 */
  }
}

/** 已配置 key 的提供商列表 */
export function getConfiguredProviders(): string[] {
  const cfg = getAIConfig()
  return Object.keys(AI_PROVIDERS).filter((id) => {
    const pc = cfg[id]
    if (!pc || !pc.apiKey) return false
    if (id === 'custom' && !pc.endpoint) return false
    return true
  })
}

/** 某提供商当前会用的模型名 */
export function getEffectiveModel(providerId: string): string {
  return getProviderConfig(providerId).model || AI_PROVIDERS[providerId]?.defaultModel || ''
}

// ============================================================
// Prompt 构建
// ============================================================

export function buildDivinationPrompt(
  reading: Reading,
  question: string,
  dateInfo: string,
): string {
  const { original, changed, lines, hasChanging, timeInfo } = reading

  const posNames = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']
  let linesText = ''
  for (let i = 5; i >= 0; i--) {
    const l = lines[i]
    let line = `${posNames[i]}：${l.spirit} | ${l.relation} | ${l.stem}${l.branch}${l.branchElement}`
    if (l.isXunKong) line += '（空）'
    line += ` | ${l.isYang ? '阳' : '阴'}`
    if (l.isChanging) line += '（动）'
    if (l.isShi) line += ' [世]'
    if (l.isYing) line += ' [应]'
    if (l.isChanging && l.changedBranch) {
      line += ` → 变：${l.changedRelation} ${l.changedBranch}${l.changedIsXunKong ? '（空）' : ''}`
    }
    linesText += line + '\n'
  }

  let prompt = `你是一位精通六爻纳甲筮法的易学大师，请根据以下排盘结果进行详细解读。

`
  if (dateInfo) {
    prompt += `占卜时间：${dateInfo}\n`
  }
  if (timeInfo) {
    prompt += `日建：${timeInfo.dayBranch}　旬空：${timeInfo.xunKongStr}\n`
  }
  if (question) {
    prompt += `占问之事：${question}\n`
  }
  prompt += `
本卦：${original.gua}（${original.palace}宫）
上卦：${original.upperTrigram}  下卦：${original.lowerTrigram}
`
  if (hasChanging && changed) {
    prompt += `变卦：${changed.gua}（${changed.palace}宫）\n`
  }
  prompt += `
六爻排盘（从上爻到初爻）：
${linesText}
说明：本排盘未推月建（需节气历），如需论月令旺衰请据占卜时间自行推定。

请从以下方面进行解读：
1. 卦象总论：解释本卦含义${hasChanging ? '及变卦趋势' : ''}
2. 世应分析：世爻与应爻的状态
3. 用神分析：${question ? '根据所问之事确定用神并分析旺衰' : '分析各爻旺衰'}
4. 动爻分析：${hasChanging ? '分析动爻变化及其影响' : '本卦无动爻，分析静卦特点'}
5. 旬空判断：结合上方旬空，说明逢空之爻的影响及出空时机
6. 六神参考：结合六神辅助判断
7. 综合判断：给出明确的判断和建议

请用通俗易懂的语言解读，避免过于晦涩的术语。`

  // 添加语言指令
  const langInstruction = t('ai_prompt_lang')
  if (langInstruction) {
    prompt += `\n\n${langInstruction}`
  }

  return prompt
}

// ============================================================
// 流式 API 调用
// ============================================================

type ChunkExtractor = (chunk: string) => string | null

/** SSE 解析器：逐行取 data:，交给各家的 extractor 抽正文 */
async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  extractContent: ChunkExtractor,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          const content = extractContent(data)
          if (content === null) return // [DONE]
          if (content) yield content
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function assertOk(res: Response): Promise<void> {
  if (res.ok) return
  const err = await res.text()
  throw new Error(`${t('ai_error_api')} (${res.status}): ${err}`)
}

async function* streamOpenAI(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  await assertOk(res)
  yield* parseSSE(res.body!, (chunk) => {
    if (chunk === '[DONE]') return null
    try {
      const data = JSON.parse(chunk)
      return data.choices?.[0]?.delta?.content || ''
    } catch {
      return ''
    }
  })
}

async function* streamAnthropic(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  await assertOk(res)
  yield* parseSSE(res.body!, (chunk) => {
    try {
      const data = JSON.parse(chunk)
      if (data.type === 'content_block_delta') return data.delta?.text || ''
      return ''
    } catch {
      return ''
    }
  })
}

async function* streamGemini(
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })
  await assertOk(res)
  yield* parseSSE(res.body!, (chunk) => {
    try {
      const data = JSON.parse(chunk)
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } catch {
      return ''
    }
  })
}

/** 统一流式接口 */
export async function* streamAI(
  providerId: string,
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const provider = AI_PROVIDERS[providerId]
  if (!provider) throw new Error(`unknown provider: ${providerId}`)

  const config = getProviderConfig(providerId)
  const apiKey = config.apiKey
  const model = config.model || provider.defaultModel

  if (!apiKey) throw new Error(t('ai_error_no_key'))

  switch (provider.type) {
    case 'openai': {
      const endpoint = providerId === 'custom' ? config.endpoint : provider.endpoint
      if (!endpoint) throw new Error(t('ai_error_no_endpoint'))
      yield* streamOpenAI(endpoint, apiKey, model, prompt, signal)
      break
    }
    case 'anthropic':
      yield* streamAnthropic(provider.endpoint!, apiKey, model, prompt, signal)
      break
    case 'gemini':
      yield* streamGemini(apiKey, model, prompt, signal)
      break
  }
}
