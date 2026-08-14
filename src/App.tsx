import { useCallback, useMemo, useState } from 'react'

import { AccountDialog, trackAccountOpened } from '@/components/account-dialog'
import { AiSettingsDialog } from '@/components/ai-settings-dialog'
import { SanctumBg } from '@/components/chrome'
import { TopBar } from '@/components/top-bar'
import { HistoryScreen } from '@/components/screens/history-screen'
import { ManualScreen } from '@/components/screens/manual-screen'
import { ResultScreen } from '@/components/screens/result-screen'
import { StartScreen } from '@/components/screens/start-screen'
import { ThrowingScreen } from '@/components/screens/throwing-screen'
import { useAccount } from '@/hooks/use-account'
import { useLang } from '@/hooks/use-lang'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import {
  createReadingRecord,
  timeFactsFromRecord,
  type CastMode,
  type ReadingRecord,
} from '@/lib/history'
import {
  calculateFullReading,
  computeTimeFacts,
  localizeTimeInfo,
  type Throw,
  type TimeFacts,
} from '@/lib/paipan'
import { persistReading } from '@/lib/supabase'

type Screen = 'start' | 'throwing' | 'manual' | 'history' | 'result'

export default function App() {
  // t() 读的是模块级变量，这里订阅一下才会随语言切换重渲染
  const { lang } = useLang()
  const { user } = useAccount()

  const [screen, setScreen] = useState<Screen>('start')
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState<CastMode>('random')
  const [shichenOverride, setShichenOverride] = useState<number | null>(null)

  // 起卦那一刻的时间事实快照，排盘全程以此为准，绝不在渲染时重新取 new Date()
  const [timeFacts, setTimeFacts] = useState<TimeFacts | null>(null)
  const [throws, setThrows] = useState<Throw[]>([])

  const [accountOpen, setAccountOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [aiConfigVersion, setAiConfigVersion] = useState(0)

  // 译文随语言变，所以 lang 必须进依赖 —— 干支、六神这些都要跟着重排
  const reading = useMemo(() => {
    if (!timeFacts || throws.length !== 6) return null
    void lang
    return calculateFullReading(throws, localizeTimeInfo(timeFacts))
  }, [throws, timeFacts, lang])

  const finish = useCallback(
    (result: Throw[], facts: TimeFacts, castMode: CastMode, q: string) => {
      setThrows(result)
      setScreen('result')

      const built = calculateFullReading(result, localizeTimeInfo(facts))
      if (built) {
        track('divination_completed', {
          hexagram: built.original.gua,
          palace: built.original.palace,
          has_changing: built.hasChanging,
          changing_count: built.lines.filter((l) => l.isChanging).length,
          changed_hexagram: built.changed ? built.changed.gua : null,
          has_question: Boolean(q),
        })
      }

      // 自动存档。先落本地保证不丢，已登录则同时上云
      const record = createReadingRecord({ throws: result, timeInfo: facts, question: q, mode: castMode })
      persistReading(record).catch((err) => console.error('save reading failed:', err))
    },
    [],
  )

  const startRandom = () => {
    setMode('random')
    setTimeFacts(computeTimeFacts(new Date(), shichenOverride))
    setThrows([])
    setScreen('throwing')
    track('divination_started', { mode: 'random' })
  }

  const startManual = () => {
    setMode('manual')
    setThrows([])
    setScreen('manual')
    track('divination_started', { mode: 'manual' })
  }

  const onThrowingComplete = useCallback(
    (result: Throw[]) => {
      const facts = timeFacts ?? computeTimeFacts(new Date(), shichenOverride)
      finish(result, facts, 'random', question)
    },
    [finish, question, shichenOverride, timeFacts],
  )

  const onManualSubmit = (result: Throw[]) => {
    const facts = computeTimeFacts(new Date(), shichenOverride)
    setTimeFacts(facts)
    finish(result, facts, 'manual', question)
  }

  const restart = () => {
    setThrows([])
    setTimeFacts(null)
    setScreen('start')
  }

  // 从历史里翻出一盘重看。不重新存档
  const openRecord = (rec: ReadingRecord) => {
    setThrows(rec.yaoValues.map((value) => ({ value, coins: [] })))
    setTimeFacts(timeFactsFromRecord(rec))
    setQuestion(rec.question || '')
    setMode((rec.mode as CastMode) || 'random')
    setScreen('result')
    window.scrollTo(0, 0)
    track('history_reading_opened')
  }

  return (
    <>
      <SanctumBg />

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-12">
        <TopBar
          signedIn={Boolean(user)}
          onOpenHistory={() => setScreen('history')}
          onOpenAccount={() => {
            trackAccountOpened()
            setAccountOpen(true)
          }}
        />

        <main className="flex-1">
          {screen === 'start' && (
            <StartScreen
              question={question}
              onQuestionChange={setQuestion}
              shichenOverride={shichenOverride}
              onShichenChange={setShichenOverride}
              onCast={startRandom}
              onManual={startManual}
            />
          )}

          {screen === 'throwing' && (
            <ThrowingScreen question={question} onComplete={onThrowingComplete} />
          )}

          {screen === 'manual' && (
            <ManualScreen onSubmit={onManualSubmit} onBack={restart} />
          )}

          {screen === 'history' && (
            <HistoryScreen onOpen={openRecord} onBack={restart} />
          )}

          {screen === 'result' &&
            (reading ? (
              <ResultScreen
                key={mode + throws.map((th) => th.value).join('')}
                reading={reading}
                question={question}
                onRestart={restart}
                onOpenAiSettings={() => setAiSettingsOpen(true)}
                aiConfigVersion={aiConfigVersion}
              />
            ) : (
              <p className="text-destructive py-20 text-center text-sm">{t('error_calc')}</p>
            ))}
        </main>
      </div>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
      <AiSettingsDialog
        open={aiSettingsOpen}
        onOpenChange={setAiSettingsOpen}
        onSaved={() => setAiConfigVersion((v) => v + 1)}
      />
    </>
  )
}
