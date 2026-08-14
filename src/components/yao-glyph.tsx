import { cn } from '@/lib/utils'

interface YaoGlyphProps {
  isYang: boolean
  isChanging?: boolean
  /** sm 用于摇卦预览，md 用于排盘表 */
  size?: 'sm' | 'md'
  /** 让调用方控制爻线宽度，排盘表在窄屏上要能收窄 */
  className?: string
  /** 变卦那一列的爻永远不会是动爻，省掉标记位好把爻线画长些 */
  noMarker?: boolean
}

/**
 * 一根爻。阳爻一长划，阴爻两短划中留断口。
 * 动爻在右侧标记：老阳 ○，老阴 ×（传统写法）。
 *
 * 标记位固定占宽，不管动不动都留着 —— 否则同一列里动爻与静爻的爻线会左右错位，
 * 而且绝对定位的标记会压到相邻的「世/应」列上去。
 */
export function YaoGlyph({
  isYang,
  isChanging = false,
  size = 'md',
  className,
  noMarker = false,
}: YaoGlyphProps) {
  const bar = size === 'sm' ? 'h-[5px]' : 'h-[6px]'
  const gap = size === 'sm' ? 'gap-[5px]' : 'gap-[6px]'

  return (
    <span
      className={cn('inline-flex items-center gap-1', size === 'sm' ? 'w-16' : 'w-full', className)}
      aria-label={isYang ? '阳爻' : '阴爻'}
    >
      {isYang ? (
        <span className={cn(bar, 'flex-1 rounded-[1px] bg-yao')} />
      ) : (
        <span className={cn('inline-flex flex-1', gap)}>
          <span className={cn(bar, 'flex-1 rounded-[1px] bg-yao')} />
          <span className={cn(bar, 'flex-1 rounded-[1px] bg-yao')} />
        </span>
      )}
      {!noMarker && (
        <span
          className="text-primary w-2 shrink-0 text-center text-[0.6rem] leading-none font-bold"
          title={isChanging ? (isYang ? '老阳（动）' : '老阴（动）') : undefined}
        >
          {isChanging ? (isYang ? '○' : '×') : ''}
        </span>
      )}
    </span>
  )
}
