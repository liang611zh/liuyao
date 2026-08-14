import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings2, Sparkles, Square } from 'lucide-react'

import { SectionHeading } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { track } from '@/lib/analytics'
import {
  AI_PROVIDERS,
  buildDivinationPrompt,
  getConfiguredProviders,
  getEffectiveModel,
  getLastProvider,
  getProviderDisplayName,
  setLastProvider,
  streamAI,
} from '@/lib/ai'
import { t } from '@/lib/i18n'
import type { Reading } from '@/lib/paipan'

interface AiPanelProps {
  reading: Reading
  question: string
  dateInfo: string
  onOpenSettings: () => void
  /** 设置弹窗保存后自增，用来重新读取已配置的提供商 */
  configVersion: number
}

export function AiPanel({
  reading,
  question,
  dateInfo,
  onOpenSettings,
  configVersion,
}: AiPanelProps) {
  const configured = useMemo(() => getConfiguredProviders(), [configVersion])
  const [provider, setProvider] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // 配置变化后校正选中项：上次用过的优先，否则第一个
  useEffect(() => {
    if (configured.includes(provider)) return
    const last = getLastProvider()
    setProvider(configured.includes(last) ? last : (configured[0] ?? ''))
  }, [configured, provider])

  // 换一盘卦就把上一盘的解读清掉，免得张冠李戴
  useEffect(() => {
    abortRef.current?.abort()
    setOutput('')
    setRunning(false)
  }, [reading])

  useEffect(() => () => abortRef.current?.abort(), [])

  const start = async () => {
    if (!provider) {
      onOpenSettings()
      return
    }
    setLastProvider(provider)

    const controller = new AbortController()
    abortRef.current = controller
    setOutput('')
    setRunning(true)

    const model = getEffectiveModel(provider)
    const startedAt = Date.now()
    track('ai_interpret_started', { provider, model })

    let full = ''
    try {
      const prompt = buildDivinationPrompt(reading, question, dateInfo)
      for await (const chunk of streamAI(provider, prompt, controller.signal)) {
        if (controller.signal.aborted) break
        full += chunk
        setOutput(full)
        const el = outputRef.current
        if (el) el.scrollTop = el.scrollHeight
      }
      // 只上报长度，不上报解读正文
      track(controller.signal.aborted ? 'ai_interpret_stopped' : 'ai_interpret_completed', {
        provider,
        model,
        duration_ms: Date.now() - startedAt,
        output_chars: full.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!controller.signal.aborted) {
        setOutput((prev) => `${prev}\n\n❌ ${message}`)
      }
      // message 里可能带 API 返回的原文，只提取 HTTP 状态码上报
      const statusMatch = /\((\d{3})\)/.exec(message)
      track('ai_interpret_failed', {
        provider,
        model,
        duration_ms: Date.now() - startedAt,
        http_status: statusMatch ? Number(statusMatch[1]) : null,
      })
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  return (
    <div className="space-y-3">
      <SectionHeading seal="解">{t('ai_section_title')}</SectionHeading>

      <div className="flex items-center gap-2">
        {configured.length > 0 ? (
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configured.map((id) => (
                <SelectItem key={id} value={id}>
                  {getProviderDisplayName(id)}（{t(AI_PROVIDERS[id].hintKey)}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <button
            type="button"
            onClick={onOpenSettings}
            className="border-input text-muted-foreground hover:text-foreground h-8 flex-1 rounded-md border border-dashed px-3 text-left text-xs"
          >
            {t('ai_no_provider')}
          </button>
        )}

        {running ? (
          <Button size="sm" variant="secondary" onClick={() => abortRef.current?.abort()}>
            <Square className="size-3.5" />
            {t('btn_ai_stop')}
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            <Sparkles className="size-3.5" />
            {t('btn_ai_start')}
          </Button>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={() => {
            track('ai_settings_opened')
            onOpenSettings()
          }}
          aria-label={t('settings_title')}
        >
          <Settings2 className="size-4" />
        </Button>
      </div>

      {/*
        模型返回的正文一律当纯文本渲染（whitespace-pre-wrap），不解析 markdown、
        更不走 innerHTML —— 输出内容不可信，这是最省心的边界。
      */}
      {output ? (
        <div
          ref={outputRef}
          className="rice-card max-h-[26rem] overflow-y-auto px-4 py-3.5 text-sm leading-relaxed whitespace-pre-wrap"
        >
          {output}
          {running && <span className="bg-primary ml-0.5 inline-block h-4 w-1.5 align-middle" />}
        </div>
      ) : (
        <p className="text-muted-foreground/60 px-1 text-xs">{t('ai_empty_hint')}</p>
      )}
    </div>
  )
}
