import { Check, Languages, Moon, ScrollText, Sun, UserRound } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLang } from '@/hooks/use-lang'
import { SUPPORTED_LANGS, t, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface TopBarProps {
  signedIn: boolean
  onOpenHistory: () => void
  onOpenAccount: () => void
}

export function TopBar({ signedIn, onOpenHistory, onOpenAccount }: TopBarProps) {
  const { lang, setLang } = useLang()
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  return (
    <div className="flex items-center gap-1.5 py-3">
      <Button variant="ghost" size="sm" onClick={onOpenHistory} className="gap-1.5 px-2.5">
        <ScrollText className="size-4" />
        <span className="text-xs">{t('btn_history')}</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenAccount}
        className={cn('gap-1.5 px-2.5', signedIn && 'text-primary')}
      >
        <UserRound className="size-4" />
        <span className="text-xs">
          {signedIn ? t('btn_account_signed_in') : t('btn_account')}
        </span>
      </Button>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('theme_toggle')}
        title={dark ? t('theme_light') : t('theme_dark')}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2.5"
            aria-label={t('lang_label')}
          >
            <Languages className="size-4" />
            <span className="text-xs">{SUPPORTED_LANGS[lang]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          {(Object.entries(SUPPORTED_LANGS) as [Lang, string][]).map(([code, name]) => (
            <DropdownMenuItem key={code} onSelect={() => setLang(code)} className="gap-2">
              <Check className={cn('size-3.5', code !== lang && 'invisible')} />
              {name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
