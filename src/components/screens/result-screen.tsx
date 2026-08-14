import { useRef, useState } from 'react'
import { Copy, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { AiPanel } from '@/components/ai-panel'
import { FretRule, Seal } from '@/components/chrome'
import { PaipanTable } from '@/components/paipan-table'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { buildDivinationPrompt } from '@/lib/ai'
import { TRIGRAMS, TRIGRAM_BY_NAME, TRIGRAM_SYMBOL } from '@/lib/data'
import { t } from '@/lib/i18n'
import type { Reading } from '@/lib/paipan'

interface ResultScreenProps {
  reading: Reading
  question: string
  onRestart: () => void
  onOpenAiSettings: () => void
  aiConfigVersion: number
}

function TrigramBadge({ name, label }: { name: keyof typeof TRIGRAM_SYMBOL; label: string }) {
  const tri = TRIGRAMS[TRIGRAM_BY_NAME[name]]
  return (
    <div className="flex items-center gap-2">
      <span className="text-gold text-2xl leading-none">{TRIGRAM_SYMBOL[name]}</span>
      <span className="text-muted-foreground text-[0.7rem] leading-tight">
        <span className="text-foreground/80 block font-medium">{name}</span>
        {label}
        {tri.nature}
      </span>
    </div>
  )
}

export function ResultScreen({
  reading,
  question,
  onRestart,
  onOpenAiSettings,
  aiConfigVersion,
}: ResultScreenProps) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const { original, changed, hasChanging, timeInfo } = reading

  // 旬空由 prompt 里的「日建/旬空」独立一行给出，此处不重复
  const dateInfo = `${timeInfo.dateStr} ${timeInfo.dayGanZhi} ${timeInfo.shichen}`

  const copyPrompt = async () => {
    const prompt = buildDivinationPrompt(reading, question, dateInfo)
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      // http 或旧浏览器下 clipboard API 不可用，退回临时 textarea
      const ta = document.createElement('textarea')
      ta.value = prompt
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) {
        toast.error(t('copy_failed'))
        return
      }
    }
    track('result_copied', { hexagram: original.gua })
    toast.success(t('copied'), { description: t('copy_hint') })
  }

  const saveImage = async () => {
    const el = captureRef.current
    if (!el) return
    setSaving(true)
    try {
      // html2canvas-pro 才认 oklch()，原版 html2canvas 会把整张图渲染成黑块
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(el, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `liuyao_${original.gua}_${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      track('result_image_saved', { hexagram: original.gua })
      toast.success(t('saved'))
    } catch (err) {
      console.error('Save failed:', err)
      track('result_image_failed', { reason: err instanceof Error ? err.message : 'unknown' })
      toast.error(t('save_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rise-in space-y-6 pt-4">
      {/* ==== 可截图区域 ==== */}
      <div ref={captureRef} className="bg-background space-y-4 rounded-lg py-2">
        <div className="rice-card space-y-3 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <TrigramBadge name={original.upperTrigram} label={t('upper_trigram')} />
              <TrigramBadge name={original.lowerTrigram} label={t('lower_trigram')} />
            </div>

            <div className="space-y-1 text-right">
              <h2 className="font-brush text-3xl tracking-[0.1em]">{original.gua}</h2>
              <p className="text-muted-foreground text-[0.7rem]">
                {t('result_palace_rank', {
                  palace: original.palace,
                  n: original.palaceIndex + 1,
                })}
              </p>
              {hasChanging && changed && (
                <p className="text-gold text-sm font-medium">
                  → {changed.gua}
                  <span className="text-muted-foreground text-[0.7rem]">
                    （{changed.palace}
                    {t('palace_suffix')}）
                  </span>
                </p>
              )}
            </div>
          </div>

          <FretRule />

          <div className="text-muted-foreground tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]">
            <span>{timeInfo.dateStr}</span>
            <span className="text-primary font-medium">{timeInfo.dayGanZhi}</span>
            <span>{timeInfo.shichen}</span>
            <span>
              {t('label_rijian')}
              {timeInfo.dayBranch}
            </span>
            <span>
              {t('label_xunkong')}
              <span className="text-gold">{timeInfo.xunKongStr}</span>
            </span>
          </div>
        </div>

        <div className="rice-card px-4 py-4">
          <PaipanTable reading={reading} />
        </div>

        <div className="text-muted-foreground/50 flex items-center justify-center gap-2 text-[0.65rem] tracking-widest">
          <Seal className="size-4 text-[0.55rem]">卜</Seal>
          {t('watermark')}
        </div>
      </div>

      {/* ==== 操作 ==== */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" onClick={copyPrompt}>
          <Copy className="size-3.5" />
          <span className="truncate text-xs">{t('btn_copy')}</span>
        </Button>
        <Button variant="secondary" size="sm" onClick={saveImage} disabled={saving}>
          <ImageIcon className="size-3.5" />
          <span className="truncate text-xs">{saving ? t('saving') : t('btn_save')}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onRestart}>
          <RotateCcw className="size-3.5" />
          <span className="truncate text-xs">{t('btn_restart')}</span>
        </Button>
      </div>

      <AiPanel
        reading={reading}
        question={question}
        dateInfo={dateInfo}
        onOpenSettings={onOpenAiSettings}
        configVersion={aiConfigVersion}
      />
    </div>
  )
}
