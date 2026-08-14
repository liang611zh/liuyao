import { useEffect, useState } from 'react'

import { Coin, CoinSlot } from '@/components/coin'
import { SectionHeading } from '@/components/chrome'
import { YaoGlyph } from '@/components/yao-glyph'
import { t, tList } from '@/lib/i18n'
import { getYaoInfo, getYaoValue, tossCoins, type Throw } from '@/lib/paipan'
import { cn } from '@/lib/utils'

interface ThrowingScreenProps {
  question: string
  onComplete: (throws: Throw[]) => void
}

const SPIN_ROUNDS = 6
const SPIN_STEP_MS = 150
const SETTLE_MS = 400
const BETWEEN_MS = 500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Phase = 'idle' | 'spinning' | 'settled'

export function ThrowingScreen({ question, onComplete }: ThrowingScreenProps) {
  const [current, setCurrent] = useState(0)
  const [throws, setThrows] = useState<Throw[]>([])
  const [faces, setFaces] = useState<(0 | 1)[]>([1, 1, 1])
  const [phase, setPhase] = useState<Phase>('idle')
  // 每轮换一个 key，强制铜钱重新挂载，翻转动画才会重新播
  const [spinKey, setSpinKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const stop = () => cancelled

    const run = async () => {
      const results: Throw[] = []
      for (let i = 0; i < 6; i++) {
        if (stop()) return
        setCurrent(i)
        setPhase('idle')
        await sleep(200)
        if (stop()) return

        setPhase('spinning')
        for (let r = 0; r < SPIN_ROUNDS; r++) {
          if (stop()) return
          setFaces(tossCoins() as (0 | 1)[])
          setSpinKey((k) => k + 1)
          await sleep(SPIN_STEP_MS)
        }
        if (stop()) return

        const final = tossCoins() as (0 | 1)[]
        setFaces(final)
        setPhase('settled')
        await sleep(SETTLE_MS)
        if (stop()) return

        results.push({ value: getYaoValue(final), coins: [...final] })
        setThrows([...results])
        await sleep(BETWEEN_MS)
      }
      if (!stop()) onComplete(results)
    }

    run()
    return () => {
      cancelled = true
    }
    // 起卦流程只跑一次；onComplete 由父组件用 useCallback 固定
  }, [onComplete])

  const posNames = tList('pos_names')
  const settledInfo = phase === 'settled' ? getYaoInfo(getYaoValue(faces)) : null

  return (
    <div className="rise-in flex flex-col items-center gap-7 pt-6">
      {/* ---- 进度 ---- */}
      <div className="space-y-1.5 text-center">
        <div className="text-primary text-base font-semibold tracking-wide">
          {t('throw_progress', { n: current + 1, pos: posNames[current] })}
        </div>
        <p className="text-muted-foreground mx-auto max-w-xs text-xs leading-relaxed">
          {current === 0 && `${t('throw_hint_first')} · `}
          {question
            ? t('throw_hint_meditate_q', { q: question })
            : t('throw_hint_meditate')}
        </p>
      </div>

      {/* ---- 铜钱 ---- */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex min-h-[92px] items-center justify-center gap-6">
          {phase === 'idle'
            ? [0, 1, 2].map((i) => <CoinSlot key={i} />)
            : faces.map((face, i) => (
                <Coin
                  key={`${spinKey}-${i}`}
                  face={face}
                  flipping={phase === 'spinning'}
                  bouncing={phase === 'settled'}
                  showLabel={phase === 'settled'}
                />
              ))}
        </div>

        <div
          className={cn(
            'min-h-7 text-base font-bold',
            settledInfo?.isChanging ? 'text-gold-bright' : 'text-foreground',
          )}
        >
          {settledInfo && `${settledInfo.label}（${getYaoValue(faces)}）`}
        </div>
      </div>

      {/* ---- 卦象构建 ---- */}
      <div className="w-full space-y-3">
        <SectionHeading seal="象">{t('preview_title')}</SectionHeading>
        <div className="rice-card space-y-2 px-6 py-4">
          {[5, 4, 3, 2, 1, 0].map((i) => {
            const th = throws[i]
            const info = th ? getYaoInfo(th.value) : null
            return (
              <div key={i} className="flex h-6 items-center gap-3">
                <span className="text-muted-foreground/60 w-8 shrink-0 text-[0.7rem]">
                  {posNames[i]}
                </span>
                {info ? (
                  <YaoGlyph isYang={info.isYang} isChanging={info.isChanging} size="sm" />
                ) : (
                  <span
                    className={cn(
                      'text-xs',
                      i === current ? 'text-primary' : 'text-muted-foreground/40',
                    )}
                  >
                    {i === current ? t('preview_current') : '—'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
