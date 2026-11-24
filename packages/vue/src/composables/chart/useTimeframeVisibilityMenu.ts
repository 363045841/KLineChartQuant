import type { TimeframeVisibility } from '@363045841yyt/klinechart-plot-contracts'
import type { DropMenuItem } from '@vue-src/components/common/menu/dropMenuTypes.js'
import { computed, shallowRef } from 'vue'
import IconTablerClock from '~icons/tabler/clock'

export const TIMEFRAME_VISIBILITY_ITEM = 'period-visibility'
export const TIMEFRAME_VISIBILITY_LABEL = '时间周期可见性'

const OPTIONS = [
  { id: 'above', label: '当前及以上时间周期' },
  { id: 'below', label: '当前及以下时间周期' },
  { id: 'current', label: '仅当前时间周期' },
  { id: 'all', label: '所有时间周期' },
] as const

type Rules = ReadonlyArray<TimeframeVisibility | undefined>
type Commit = (rule: TimeframeVisibility) => Rules | undefined

export function timeframeVisibilityItems(rules: Rules): ReadonlyArray<DropMenuItem> {
  return OPTIONS.map((option) => ({
    ...option,
    checked: rules.length > 0 && rules.every((rule) => (rule?.mode ?? 'all') === option.id),
    selection: 'checkbox',
  }))
}

export function resolveTimeframeVisibility(
  itemId: string,
  period: string,
): TimeframeVisibility | undefined {
  const option = OPTIONS.find(({ id }) => id === itemId)
  if (!option) return
  return option.id === 'all' ? { mode: 'all' } : { mode: option.id, period }
}

/** 记录打开时的参考周期与目标规则；写入成功后用返回的规则立即更新勾选。 */
export function useTimeframeVisibilityMenu() {
  const target = shallowRef<{ period: string; rules: Rules; commit: Commit } | null>(null)

  const submenu = computed<DropMenuItem | null>(() =>
    target.value
      ? {
          id: TIMEFRAME_VISIBILITY_ITEM,
          label: TIMEFRAME_VISIBILITY_LABEL,
          icon: IconTablerClock,
          children: timeframeVisibilityItems(target.value.rules),
        }
      : null,
  )

  function capture(period: string | null, rules: Rules, commit: Commit): void {
    target.value = period === null ? null : { period, rules, commit }
  }

  function select(itemId: string): void {
    const current = target.value
    if (!current) return
    const rule = resolveTimeframeVisibility(itemId, current.period)
    if (!rule) return
    const rules = current.commit(rule)
    if (rules && target.value === current) target.value = { ...current, rules }
  }

  return { capture, submenu, select }
}
