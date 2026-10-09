/** 指标参数编辑草稿：统一处理数字参数与选项参数、重置和确认值。 */
import type { ParamConfig } from '@363045841yyt/klinechart-core/engine/renderers/Indicator/indicatorCatalog'
import { computed, ref, watch } from 'vue'
import type { DropMenuGroup } from '../components/DropMenu.vue'

/** 参数草稿值：数字参数为 number，选项参数为 string。 */
export type IndicatorParamValues = Record<string, number | string>

/** 参数弹窗的最小入参契约，保持与组件 props 一致。 */
interface IndicatorParamsDraftInput {
  readonly values: IndicatorParamValues
  readonly visible: boolean
  readonly params: readonly ParamConfig[]
}

/** 创建参数草稿；弹窗打开或外部值变化时重新载入。 */
export function useIndicatorParams(props: IndicatorParamsDraftInput) {
  const localValues = ref<IndicatorParamValues>({ ...props.values })
  const showDescription = ref(true)
  // 使用草稿值推导可见项，切换模式立即生效，并保留隐藏参数的编辑值。
  const visibleParams = computed(() =>
    props.params.filter((param) => {
      const condition = param.visibleWhen
      if (!condition) return true
      const value = localValues.value[condition.key]
      return value !== undefined && condition.values.includes(value)
    }),
  )

  watch(
    () => props.values,
    (values) => {
      localValues.value = { ...values }
    },
    { deep: true, immediate: true },
  )
  watch(
    () => props.visible,
    (visible) => {
      if (visible) localValues.value = { ...props.values }
    },
  )

  /** 数字参数当前值；非数字或缺失时返回 0。 */
  function numberValue(key: string): number {
    const value = localValues.value[key]
    return typeof value === 'number' ? value : 0
  }

  /** 从原生数字输入更新草稿，忽略非法输入。 */
  function onInput(key: string, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return
    const value = Number.parseFloat(event.target.value)
    if (!Number.isNaN(value)) localValues.value[key] = value
  }

  /** 在 min/max 范围内按 step 增减数字参数。 */
  function step(param: ParamConfig, direction: 1 | -1): void {
    let next = numberValue(param.key) + direction * (param.step || 1)
    if (param.min !== undefined) next = Math.max(param.min, next)
    if (param.max !== undefined) next = Math.min(param.max, next)
    localValues.value[param.key] = Number.parseFloat(next.toFixed(10))
  }

  /** 将选项参数映射为 DropMenu 分组。 */
  function optionGroups(param: ParamConfig): DropMenuGroup[] {
    return [
      {
        id: param.key,
        label: param.label,
        items: (param.options ?? []).map((option) => ({ id: option.value, label: option.label })),
      },
    ]
  }

  /** 选项参数是否处于选中态。 */
  function isOptionSelected(key: string, value: string): boolean {
    return localValues.value[key] === value
  }

  /** 当前选项的显示名称。 */
  function optionLabel(param: ParamConfig): string {
    return (
      param.options?.find((option) => option.value === localValues.value[param.key])?.label ?? ''
    )
  }

  /** 写入菜单选择的合法选项值。 */
  function selectOption(key: string, value: string): void {
    const param = props.params.find((entry) => entry.key === key)
    if (param?.options?.some((option) => option.value === value)) localValues.value[key] = value
  }

  /** 将全部参数恢复为定义默认值。 */
  function onReset(): void {
    const defaults: IndicatorParamValues = {}
    for (const param of props.params) {
      defaults[param.key] = param.default ?? props.values[param.key] ?? 0
    }
    localValues.value = defaults
  }

  return {
    localValues,
    visibleParams,
    showDescription,
    numberValue,
    onInput,
    step,
    optionGroups,
    isOptionSelected,
    optionLabel,
    selectOption,
    onReset,
  }
}
