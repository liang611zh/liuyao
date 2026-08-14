import { useEffect, useState } from 'react'
import { LogOut, Mail, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAccount } from '@/hooks/use-account'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import {
  fetchProfile,
  getOAuthProviderName,
  getOAuthProviders,
  signInWithEmail,
  signInWithOAuth,
  signOut,
  updateNickname,
} from '@/lib/supabase'

interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AccountDialog({ open, onOpenChange }: AccountDialogProps) {
  const { user, profile, configured } = useAccount()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-4" />
            {t('account_title')}
          </DialogTitle>
          {!configured && (
            <DialogDescription className="text-xs leading-relaxed">
              {t('account_not_configured')}
            </DialogDescription>
          )}
        </DialogHeader>

        {configured &&
          (user ? (
            <SignedIn
              email={user.email ?? user.id}
              nickname={profile?.nickname ?? ''}
              hasProfile={Boolean(profile)}
            />
          ) : (
            <SignInForm />
          ))}
      </DialogContent>
    </Dialog>
  )
}

function SignedIn({
  email,
  nickname,
  hasProfile,
}: {
  email: string
  nickname: string
  hasProfile: boolean
}) {
  const [value, setValue] = useState(nickname)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  // 资料可能还没拉取（刚恢复会话时），拉到再回填
  useEffect(() => {
    if (hasProfile) {
      setValue(nickname)
      return
    }
    fetchProfile()
      .then((p) => {
        if (p?.nickname) setValue((v) => v || p.nickname!)
      })
      .catch((err) => console.error('fetch profile failed:', err))
  }, [hasProfile, nickname])

  const save = async () => {
    setSaving(true)
    setStatus('')
    try {
      await updateNickname(value)
      setStatus(t('account_nickname_saved'))
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">{t('account_signed_in_as')}</p>
        <p className="text-primary text-sm font-medium break-all">{email}</p>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor="nickname">{t('account_nickname_label')}</Label>
        <div className="flex gap-2">
          <Input
            id="nickname"
            maxLength={40}
            value={value}
            placeholder={t('account_nickname_placeholder')}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <Button variant="secondary" onClick={save} disabled={saving}>
            {t('btn_save_nickname')}
          </Button>
        </div>
        {status && <p className="text-muted-foreground text-xs">{status}</p>}
      </div>

      <Separator />

      <Button variant="ghost" className="w-full" onClick={() => signOut()}>
        <LogOut className="size-4" />
        {t('btn_sign_out')}
      </Button>
    </div>
  )
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const providers = getOAuthProviders()

  const submit = async () => {
    // 只做基本形状校验，真正的有效性由收不收得到邮件决定
    if (!EMAIL_SHAPE.test(email.trim())) {
      setStatus(t('account_error_invalid_email'))
      return
    }
    setSending(true)
    setStatus('')
    try {
      await signInWithEmail(email.trim())
      setSent(true)
      setStatus(t('account_link_sent'))
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t('account_signin_intro')}
      </p>

      {/* 第三方登录放在邮箱之前 —— 一次点击 vs 跳去邮箱翻链接，转化差很远 */}
      {providers.length > 0 && (
        <>
          <div className="space-y-2">
            {providers.map((p) => (
              <Button
                key={p}
                variant="outline"
                className="w-full"
                onClick={() =>
                  signInWithOAuth(p).catch((err: unknown) =>
                    setStatus(err instanceof Error ? err.message : String(err)),
                  )
                }
              >
                {t('account_continue_with', { provider: getOAuthProviderName(p) })}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-[0.7rem]">{t('account_or')}</span>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      {/*
        Google 在中国大陆访问不了，而简中是本应用默认语言 ——
        邮箱这条路必须始终保留，不能只留 SSO。测试里有断言守着五种语言的文案。
      */}
      <div className="space-y-1.5">
        <Label htmlFor="account-email">{t('account_email_label')}</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          placeholder={t('account_email_placeholder')}
          onChange={(e) => {
            setEmail(e.target.value)
            setSent(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
          {t('account_email_hint')}
        </p>
      </div>

      <Button className="w-full" onClick={submit} disabled={sending || sent}>
        <Mail className="size-4" />
        {sending ? t('account_sending') : t('btn_send_magic_link')}
      </Button>

      {status && (
        <p
          className="text-xs leading-relaxed"
          // 发送成功用朱砂强调，失败用中性色，避免把报错渲染得像成功
          style={{ color: sent ? 'var(--primary)' : 'var(--muted-foreground)' }}
        >
          {status}
        </p>
      )}
    </div>
  )
}

/** 打开账户弹窗时补一次埋点 */
export function trackAccountOpened() {
  track('account_modal_opened')
}
