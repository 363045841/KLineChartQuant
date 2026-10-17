import { ref } from 'vue'

/** 会话级共享的聚合源 Tab 记忆：主品种与对比品种选择器共用，弹层反复开关不再重置。 */
const activeSourceTab = ref<string>('all')

/** 返回共享的聚合源 Tab 状态 ref，组件卸载/重挂后仍保留上次选择。 */
export function useAggregationSourceTab() {
  return activeSourceTab
}
