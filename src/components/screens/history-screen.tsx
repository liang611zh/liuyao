import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CloudCheck, HardDrive, Trash2 } from 'lucide-react'

import { brushClass } from '@/components/chrome'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { loadLocalHistory, summarizeRecord, type ReadingRecord } from '@/lib/history'
import { isCloudConfigured, listReadings, removeReading } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface HistoryScreenProps {
  onOpen: (rec: ReadingRecord) => void
  onBack: () => void
}

export function HistoryScreen({ onOpen, onBack }: HistoryScreenProps) {
  const [records, setRecords] = useState<ReadingRecord[] | null>(null)
  const [source, setSource] = useState<'cloud' | 'local'>('local')
  const [pendingDelete, setPendingDelete] = useState<ReadingRecord | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await listReadings()
      setRecords(result.records)
      setSource(result.source)
      track('history_opened', { source: result.source, count: result.records.length })
    } catch (err) {
      console.error('list readings failed:', err)
      setRecords(loadLocalHistory())
      setSource('local')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const confirmDelete = async () => {
    const rec = pendingDelete
    setPendingDelete(null)
    if (!rec) return
    await removeReading(rec)
    setRecords((prev) => prev?.filter((r) => r.id !== rec.id) ?? null)
    track('history_reading_deleted')
  }

  const hint =
    source === 'cloud'
      ? t('history_hint_cloud')
      : isCloudConfigured()
        ? t('history_hint_local_signin')
        : t('history_hint_local_only')

  return (
    <div className="rise-in space-y-5 pt-4">
      <div className="space-y-1.5 text-center">
        <h2 className={cn("text-2xl tracking-[0.12em]", brushClass())}>{t("history_title")}</h2>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          {source === 'cloud' ? (
            <CloudCheck className="size-3.5" />
          ) : (
            <HardDrive className="size-3.5" />
          )}
          {hint}
        </p>
      </div>

      {records === null ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <p className="text-muted-foreground/70 py-16 text-center text-sm">
          {t('history_empty')}
        </p>
      ) : (
        <div className="space-y-2.5">
          {records.map((rec) => {
            const item = summarizeRecord(rec)
            if (!item) return null
            return (
              <div key={rec.id} className="rice-card group flex items-stretch overflow-hidden">
                <button
                  type="button"
                  onClick={() => onOpen(rec)}
                  className="hover:bg-accent/40 min-w-0 flex-1 space-y-1 px-4 py-3 text-left transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-foreground font-semibold">{item.gua}</span>
                    {item.changedGua && (
                      <>
                        <span className="text-muted-foreground/60 text-xs">→</span>
                        <span className="text-gold font-medium">{item.changedGua}</span>
                      </>
                    )}
                    <span
                      className={cn(
                        'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[0.6rem]',
                        item.synced
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground/70 bg-muted',
                      )}
                    >
                      {item.synced ? t('history_badge_synced') : t('history_badge_local')}
                    </span>
                  </div>

                  <div className="text-muted-foreground tabular text-xs">
                    {item.dateStr}　{item.ganzhi}
                  </div>

                  {/* 占问之事是用户输入，这里走 React 文本节点，天然不会被当成标记解析 */}
                  {item.question && (
                    <div className="text-muted-foreground/80 truncate text-xs">
                      {item.question}
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPendingDelete(rec)}
                  aria-label={t('history_delete')}
                  title={t('history_delete')}
                  className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 border-border/60 flex w-11 shrink-0 items-center justify-center border-l transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Button variant="ghost" className="w-full" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {t('btn_back')}
      </Button>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('history_confirm_delete')}</AlertDialogTitle>
            {pendingDelete && (
              <AlertDialogDescription className="text-xs">
                {summarizeRecord(pendingDelete)?.gua}　{pendingDelete.castAtLocal}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('btn_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('history_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
