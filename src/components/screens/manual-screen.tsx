import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { SectionHeading, brushClass } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { t, tList } from '@/lib/i18n'
import { getYaoInfo, getYaoValue, type Throw } from '@/lib/paipan'
import { cn } from '@/lib/utils'

interface ManualScreenProps {
  onSubmit: (throws: Throw[]) => void
  onBack: () => void
}

/** -1 未定 / 1 字（阳）/ 0 背（阴） */
type CoinState = -1 | 0 | 1

const EMPTY: CoinState[][] = Array.from({ length: 6 }, () => [-1, -1, -1])

export function ManualScreen({ onSubmit, onBack }: ManualScreenProps) {
  const [coins, setCoins] = useState<CoinState[][]>(EMPTY)
  const posNames = tList('pos_names')

  // 未定 → 字 → 背 → 字 → …
  const cycle = (row: number, col: number) =>
    setCoins((prev) =>
      prev.map((r, i) =>
        i === row ? r.map((c, j) => (j === col ? (c === 1 ? 0 : 1) : c)) : r,
      ),
    )

  const complete = coins.every((row) => row.every((c) => c !== -1))

  const submit = () => {
    if (!complete) return
    onSubmit(
      coins.map((row) => {
        const nums = row as number[]
        return { value: getYaoValue(nums), coins: [...nums] }
      }),
    )
  }

  return (
    <div className="rise-in space-y-6 pt-4">
      <div className="space-y-1.5 text-center">
        <h2 className={cn("text-2xl tracking-[0.12em]", brushClass())}>{t("manual_title")}</h2>
        <p className="text-muted-foreground text-xs">{t('manual_hint')}</p>
      </div>

      <div className="space-y-3">
        <SectionHeading seal="录">{t('manual_coin_hint')}</SectionHeading>

        <div className="rice-card divide-border/60 divide-y">
          {coins.map((row, i) => {
            const filled = row.every((c) => c !== -1)
            const info = filled ? getYaoInfo(getYaoValue(row as number[])) : null
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-muted-foreground w-8 shrink-0 text-xs">
                  {posNames[i]}
                </span>

                <div className="flex flex-1 justify-center gap-2">
                  {row.map((c, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={() => cycle(i, j)}
                      aria-label={`${posNames[i]} ${j + 1}`}
                      className={cn(
                        'size-11 rounded-full border text-xs font-medium transition-colors',
                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                        c === 1 &&
                          'border-gold/60 bg-[radial-gradient(circle_at_30%_25%,#e8c050,#9a7520_60%,#5a4410)] text-[#3a2800] shadow-sm',
                        c === 0 &&
                          'border-foreground/25 bg-[radial-gradient(circle_at_30%_25%,#6a5a4a,#2a2018_65%,#161009)] text-white/70',
                        c === -1 &&
                          'border-border text-muted-foreground border-dashed hover:border-solid',
                      )}
                    >
                      {c === 1 ? t('coin_heads') : c === 0 ? t('coin_tails') : '?'}
                    </button>
                  ))}
                </div>

                <span
                  className={cn(
                    'w-10 shrink-0 text-right text-xs font-semibold',
                    !info && 'text-muted-foreground/40',
                    info?.isChanging && 'text-gold-bright',
                  )}
                >
                  {info ? info.label : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <Button
          size="lg"
          className="h-12 w-full tracking-widest"
          disabled={!complete}
          onClick={submit}
        >
          {t('btn_generate')}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('btn_back')}
        </Button>
      </div>
    </div>
  )
}
