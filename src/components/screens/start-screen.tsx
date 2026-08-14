import { useEffect, useState } from 'react'
import { Dices, PencilLine } from 'lucide-react'

import { FretBand, FretRule, Seal, SectionHeading, brushClass } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { isAnalyticsEnabled, setAnalyticsOptOut } from '@/lib/analytics'
import { EARTHLY_BRANCHES } from '@/lib/data'
import { t, tList } from '@/lib/i18n'
import { getShichenIndex, getTimeInfo } from '@/lib/paipan'
import { cn } from '@/lib/utils'

interface StartScreenProps {
  question: string
  onQuestionChange: (q: string) => void
  shichenOverride: number | null
  onShichenChange: (idx: number | null) => void
  onCast: () => void
  onManual: () => void
}

/** 起始页时钟：10 秒一跳，够用且不费电 */
function useTick(ms: number) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}

// i18n 里这两条自带 <b> 标签。它们是我们自己写的常量，不是用户输入，
// 但也没必要为此开 innerHTML —— 拆成两个文本节点渲染即可。
function splitBoldLabel(raw: string): [string, string] {
  const m = /^<b>(.*?)<\/b>\s*[:：]?\s*(.*)$/.exec(raw)
  return m ? [m[1], m[2]] : ['', raw]
}

function CoinGuideRow({ raw, yang }: { raw: string; yang: boolean }) {
  const [label, rest] = splitBoldLabel(raw)
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span
        className={
          yang
            ? 'mt-1.5 size-2.5 shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#e8c050,#8a6a18)]'
            : 'mt-1.5 size-2.5 shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#6a5a4a,#241c14)]'
        }
      />
      <span className="text-muted-foreground">
        <b className="text-foreground font-semibold">{label}</b>
        {label && '：'}
        {rest}
      </span>
    </div>
  )
}

export function StartScreen({
  question,
  onQuestionChange,
  shichenOverride,
  onShichenChange,
  onCast,
  onManual,
}: StartScreenProps) {
  useTick(10_000)
  const [optedOut, setOptedOut] = useState(false)

  const now = new Date()
  const info = getTimeInfo(now, shichenOverride)
  const shichenNames = tList('shichen_names')
  // 未手选时辰时，下拉框跟随系统时钟
  const selectedIdx = shichenOverride ?? getShichenIndex(now.getHours())

  return (
    <div className="rise-in space-y-6">
      {/* ---- 标题 ---- */}
      <div className="flex flex-col items-center gap-2 pt-4 pb-1">
        <div className="flex items-center gap-3">
          <Seal className="size-8 text-lg">卜</Seal>
          <h1 className={cn('text-foreground text-4xl tracking-[0.15em]', brushClass())}>
            {t('app_title')}
          </h1>
        </div>
        <p className="text-muted-foreground text-xs tracking-[0.2em]">{t('app_subtitle')}</p>
        <FretBand className="mt-1.5 w-44" />
      </div>

      {/* ---- 时间与干支 ---- */}
      <Card className="rice-card gap-0 py-0">
        <CardContent className="space-y-3 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground tabular text-xs">{info.dateStr}</span>
            <span className="text-primary text-lg font-semibold tracking-wide">
              {info.dayGanZhi}
            </span>
          </div>

          <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
            <span>{info.shichenFull}</span>
            <span>
              {t('label_xunkong')}
              <span className="text-gold font-medium">{info.xunKongStr}</span>
            </span>
          </div>

          <FretRule />

          <div className="flex items-center gap-3">
            <Label htmlFor="shichen" className="text-muted-foreground shrink-0 text-xs">
              {t('label_shichen')}
            </Label>
            <Select
              value={String(selectedIdx)}
              onValueChange={(v) => {
                const picked = Number(v)
                // 选回当前时辰即恢复跟随系统时钟
                onShichenChange(picked === getShichenIndex(new Date().getHours()) ? null : picked)
              }}
            >
              <SelectTrigger id="shichen" size="sm" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shichenNames.map((name, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {t('shichen_option', { branch: EARTHLY_BRANCHES[i], name })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ---- 占问之事 ---- */}
      <div className="space-y-2.5">
        <SectionHeading seal="问">{t('label_question')}</SectionHeading>
        <Textarea
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={t('placeholder_question')}
          rows={2}
          className="bg-card/60 resize-none"
        />
      </div>

      {/* ---- 铜钱说明 ---- */}
      <div className="space-y-2.5">
        <SectionHeading seal="钱">{t('coin_guide_title')}</SectionHeading>
        <div className="space-y-2 px-1">
          <CoinGuideRow raw={t('coin_yang_html')} yang />
          <CoinGuideRow raw={t('coin_yin_html')} yang={false} />
        </div>
      </div>

      {/* ---- 起卦 ---- */}
      <div className="space-y-2.5 pt-1">
        <Button size="lg" className="h-12 w-full text-base tracking-widest" onClick={onCast}>
          <Dices className="size-4.5" />
          {t('btn_random')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-full tracking-widest"
          onClick={onManual}
        >
          <PencilLine className="size-4" />
          {t('btn_manual')}
        </Button>
      </div>

      {/* 统计 opt-out：只在统计确实启用时才露出，本地开发不显示 */}
      {isAnalyticsEnabled() && (
        <div className="pt-1 text-center">
          <button
            type="button"
            disabled={optedOut}
            className="text-muted-foreground/70 hover:text-muted-foreground text-[0.7rem] underline underline-offset-4 disabled:no-underline"
            onClick={() => {
              setAnalyticsOptOut(true)
              setOptedOut(true)
            }}
          >
            {optedOut ? t('analytics_optout_done') : t('analytics_optout')}
          </button>
        </div>
      )}
    </div>
  )
}
