import { useCallback, useSyncExternalStore } from 'react'
import { getLang, setLanguage, subscribeLang, type Lang } from '@/lib/i18n'
import { track } from '@/lib/analytics'

/**
 * 订阅当前语言。任何用到 t() 的组件都要调一次 ——
 * t() 读的是模块级变量，不订阅就不会因为切语言而重渲染。
 */
export function useLang() {
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang)

  const change = useCallback(
    (next: Lang) => {
      const from = getLang()
      if (from === next) return
      setLanguage(next)
      track('lang_changed', { from, to: next })
    },
    [],
  )

  return { lang, setLang: change }
}
