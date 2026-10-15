/** 指标参数编辑草稿：维护草稿值、可见参数与重置。 */
import { computed, ref, watch } from 'vue'
import type { IndicatorParamsDraftInput, IndicatorParamValues } from '../types.js'

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

  /** 写入单个参数的草稿值。 */
  function setValue(key: string, value: number | string | boolean): void {
    localValues.value[key] = value
  }

  /** 将全部参数恢复为定义默认值。 */
  function onReset(): void {
    const defaults: IndicatorParamValues = {}
    for (const param of props.params) {
      defaults[param.key] = param.default ?? props.values[param.key] ?? 0
    }
    localValues.value = defaults
  }

  return { localValues, visibleParams, showDescription, setValue, onReset }
}
