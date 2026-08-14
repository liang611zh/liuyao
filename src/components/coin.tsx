import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

interface CoinProps {
  /** 1 = 字（阳面），0 = 背（阴面） */
  face: 0 | 1
  flipping?: boolean
  bouncing?: boolean
  showLabel?: boolean
  className?: string
}

// 顺治通宝为四字直读：顺(上) 治(下) 通(右) 宝(左)
const FACE_CHARS = ['顺', '治', '通', '宝'] as const
const FACE_POS = ['top-[9px]', 'bottom-[9px]', 'right-[10px]', 'left-[10px]'] as const

/** 五帝钱：外圆内方，正面四字，背面素面 */
export function Coin({ face, flipping, bouncing, showLabel, className }: CoinProps) {
  const heads = face === 1
  return (
    <span className="relative inline-flex flex-col items-center">
      <span
        className={cn(
          'coin',
          !heads && 'coin-tails',
          flipping && 'coin-flipping',
          bouncing && 'coin-bouncing',
          className,
        )}
        role="img"
        aria-label={heads ? t('coin_heads') : t('coin_tails')}
      >
        {heads &&
          FACE_CHARS.map((ch, i) => (
            <span key={ch} className={cn('coin-face-text', FACE_POS[i])}>
              {ch}
            </span>
          ))}
      </span>
      {showLabel && (
        <span className="text-muted-foreground mt-1.5 text-xs">
          {heads ? t('coin_heads') : t('coin_tails')}
        </span>
      )}
    </span>
  )
}

/** 还没落定的占位 */
export function CoinSlot() {
  return <span className="coin-slot">?</span>
}
