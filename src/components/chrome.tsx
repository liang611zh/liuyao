import { getLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Ma Shan Zheng 是中文毛笔体，它自带的拉丁字形套在英文标题上会变成花体，
// 跟整体版式打架。只有汉字为主的语言才用毛笔体，其余回落宋体。
const BRUSH_LANGS = new Set(['zh-CN', 'zh-TW', 'ja'])

export function isBrushLang() {
  return BRUSH_LANGS.has(getLang())
}

/** 标题字体：中日文用毛笔体，其余用宋体 + 宽字距 */
export function brushClass() {
  return isBrushLang() ? 'font-brush' : 'font-serif font-semibold tracking-[0.06em]'
}

/** 背景：亮色是宣纸纤维，暗色是夜空星点。纯 CSS，无图片资源 */
export function SanctumBg() {
  return <div className="sanctum-bg" aria-hidden="true" />
}

/** 分隔线：两端淡出的金色发丝线 */
export function FretRule({ className }: { className?: string }) {
  return <div className={cn('fret-rule', className)} aria-hidden="true" />
}

/** 回纹带：方折纹样，只用在标题底下当压脚 */
export function FretBand({ className }: { className?: string }) {
  return <div className={cn('fret-band', className)} aria-hidden="true" />
}

/** 朱砂方印 */
export function Seal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('seal', className)} aria-hidden="true">
      {children}
    </span>
  )
}

/**
 * 小节标题：左边一枚小印，右边一条回纹拉到底。
 * 用来替代 shadcn 默认那种「一行加粗文字」，让层级感更像中式版式。
 */
export function SectionHeading({
  children,
  seal,
  className,
}: {
  children: React.ReactNode
  seal?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {seal && <Seal className="size-5 shrink-0 text-[0.7rem]">{seal}</Seal>}
      <span className="text-foreground/90 shrink-0 text-sm font-semibold tracking-wide">
        {children}
      </span>
      <FretRule className="min-w-4 flex-1" />
    </div>
  )
}
