import { FretRule } from '@/components/chrome'
import { YaoGlyph } from '@/components/yao-glyph'
import { t } from '@/lib/i18n'
import type { Line, Reading } from '@/lib/paipan'
import { cn } from '@/lib/utils'

/*
  列宽是这张表最难办的地方：带变卦时要在一屏里塞下八项内容。
  取舍是 —— 六神/六亲/干支/世应 用固定窄列，两根爻线吃剩下的弹性空间，
  变卦的地支与六亲合并成一列（「兄弟辰」连写，传统卦盘本来就这么写）。
  这样 360px 的窄屏也放得下，不用横向滚动去找变爻。
*/
const COLS_PLAIN = '1.9rem 1.9rem 3.4rem 1fr 1rem'
const COLS_CHANGING = '1.8rem 1.8rem 3.2rem 1fr 0.9rem 2.6rem 3.4rem'

/** 空亡标记 */
function KongMark() {
  return (
    <span className="text-gold-dim ml-px align-super text-[0.55rem] not-italic">
      {t('marker_kong')}
    </span>
  )
}

function LineRow({ line, hasChanging }: { line: Line; hasChanging: boolean }) {
  const marker = line.isShi ? t('marker_shi') : line.isYing ? t('marker_ying') : ''

  return (
    <div
      className={cn(
        'grid items-center gap-x-1.5 py-1.5 text-[0.72rem]',
        line.isChanging && 'bg-primary/[0.05]',
      )}
      style={{ gridTemplateColumns: hasChanging ? COLS_CHANGING : COLS_PLAIN }}
    >
      <span className="text-muted-foreground">{line.spirit}</span>
      <span className="text-foreground/85 font-medium">{line.relation}</span>
      <span className="tabular whitespace-nowrap">
        {line.stem}
        {line.branch}
        {line.branchElement}
        {line.isXunKong && <KongMark />}
      </span>
      <YaoGlyph isYang={line.isYang} isChanging={line.isChanging} />
      <span
        className={cn(
          'text-center font-semibold',
          line.isShi ? 'text-primary' : 'text-gold',
        )}
      >
        {marker}
      </span>

      {hasChanging && (
        <>
          <span className="flex items-center">
            {line.isChanging && <YaoGlyph isYang={!line.isYang} noMarker />}
          </span>
          <span className="text-muted-foreground whitespace-nowrap">
            {line.isChanging && line.changedBranch && (
              <>
                {line.changedRelation}
                {line.changedBranch}
                {line.changedIsXunKong && <KongMark />}
              </>
            )}
          </span>
        </>
      )}
    </div>
  )
}

export function PaipanTable({ reading }: { reading: Reading }) {
  const { lines, hasChanging } = reading
  const cols = hasChanging ? COLS_CHANGING : COLS_PLAIN

  return (
    <div>
      {/* 表头 */}
      <div
        className="text-muted-foreground/70 grid gap-x-1.5 pb-1.5 text-[0.62rem] tracking-wider"
        style={{ gridTemplateColumns: cols }}
      >
        <div>{t('col_spirit')}</div>
        <div className="col-span-2">{t('col_original')}</div>
        <div>{t('col_line')}</div>
        <div />
        {hasChanging && (
          <>
            <div>{t('col_changed_line')}</div>
            <div>{t('col_changed_hex')}</div>
          </>
        )}
      </div>

      <FretRule className="mb-1" />

      {/* 上爻 → 初爻 */}
      <div className="divide-border/40 divide-y">
        {[5, 4, 3].map((i) => (
          <LineRow key={i} line={lines[i]} hasChanging={hasChanging} />
        ))}
      </div>

      {/* 内外卦分界 */}
      <div className="my-1 flex items-center gap-2">
        <FretRule className="flex-1" />
        <span className="text-muted-foreground/50 text-[0.58rem] tracking-widest whitespace-nowrap">
          {t('upper_trigram')} ／ {t('lower_trigram')}
        </span>
        <FretRule className="flex-1" />
      </div>

      <div className="divide-border/40 divide-y">
        {[2, 1, 0].map((i) => (
          <LineRow key={i} line={lines[i]} hasChanging={hasChanging} />
        ))}
      </div>
    </div>
  )
}
