import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AI_PROVIDERS,
  getAIConfig,
  getProviderDisplayName,
  saveAIConfig,
  type ProviderConfig,
} from '@/lib/ai'
import { t } from '@/lib/i18n'

interface AiSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const PROVIDER_IDS = Object.keys(AI_PROVIDERS)

export function AiSettingsDialog({ open, onOpenChange, onSaved }: AiSettingsDialogProps) {
  const [draft, setDraft] = useState<Record<string, ProviderConfig>>({})
  const [tab, setTab] = useState(PROVIDER_IDS[0])

  // 每次打开都从 localStorage 重新读，避免上次取消编辑的残留
  useEffect(() => {
    if (open) setDraft(getAIConfig())
  }, [open])

  const patch = (id: string, data: ProviderConfig) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...data } }))

  const save = () => {
    const next = { ...draft }
    // 自定义端点：模型名单独填，存的时候顺手同步成生效模型
    const custom = next.custom
    if (custom?.customModelName?.trim()) {
      const name = custom.customModelName.trim()
      next.custom = { ...custom, model: name, customModels: [name] }
    }
    saveAIConfig(next)
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {t('settings_title')}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {t('settings_key_notice')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          {/*
            六个提供商在窄屏上要换成两行。TabsList 的高度来自
            group-data-[orientation=horizontal]/tabs:h-9，得用同样的变体前缀覆盖，
            光写 h-auto 会被那条带前缀的规则盖掉（tailwind-merge 不认为它们同组）。
          */}
          <TabsList className="grid w-full grid-cols-3 gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-6">
            {PROVIDER_IDS.map((id) => (
              <TabsTrigger key={id} value={id} className="text-xs">
                {getProviderDisplayName(id)}
              </TabsTrigger>
            ))}
          </TabsList>

          {PROVIDER_IDS.map((id) => {
            const provider = AI_PROVIDERS[id]
            const cfg = draft[id] ?? {}
            const models = id === 'custom' ? (cfg.customModels ?? []) : provider.models
            return (
              <TabsContent key={id} value={id} className="mt-4 space-y-4">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="text-foreground font-medium">
                    {getProviderDisplayName(id)}
                  </span>
                  <span className="bg-accent text-accent-foreground rounded px-1.5 py-0.5">
                    {t(provider.hintKey)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`key-${id}`}>{t('ai_api_key')}</Label>
                  <Input
                    id={`key-${id}`}
                    type="password"
                    autoComplete="off"
                    value={cfg.apiKey ?? ''}
                    placeholder={t('ai_placeholder_key', { name: provider.name })}
                    onChange={(e) => patch(id, { apiKey: e.target.value })}
                  />
                </div>

                {id === 'custom' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-endpoint">{t('ai_endpoint')}</Label>
                      <Input
                        id="custom-endpoint"
                        type="url"
                        value={cfg.endpoint ?? ''}
                        placeholder={t('ai_placeholder_endpoint')}
                        onChange={(e) => patch(id, { endpoint: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-model">{t('ai_model_name')}</Label>
                      <Input
                        id="custom-model"
                        value={cfg.customModelName ?? ''}
                        placeholder={t('ai_placeholder_model')}
                        onChange={(e) => patch(id, { customModelName: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`model-${id}`}>{t('ai_model')}</Label>
                    <Select
                      value={cfg.model || provider.defaultModel}
                      onValueChange={(v) => patch(id, { model: v })}
                    >
                      <SelectTrigger id={`model-${id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </TabsContent>
            )
          })}
        </Tabs>

        <DialogFooter>
          <Button onClick={save} className="w-full sm:w-auto">
            {t('btn_settings_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
