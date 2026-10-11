import type {
  AlertController,
  AlertEvent,
  AlertRule,
  ChartController,
} from '@363045841yyt/klinechart-core'
import { type MaybeRefOrGetter, ref, toRef, watch } from 'vue'
import { useControllerSignal } from './chart/useControllerSignal.js'

export function useAlerts(controllerSource: MaybeRefOrGetter<ChartController | null>) {
  const controller = toRef(controllerSource)

  const rules = useControllerSignal<ReadonlyArray<AlertRule>>(
    controller,
    (chart) => chart.alertController?.rules,
    () => [],
  )
  const events = useControllerSignal<ReadonlyArray<AlertEvent>>(
    controller,
    (chart) => chart.alertController?.events,
    () => [],
  )
  const unreadCount = ref(0)
  let prevEventCount = 0

  function getCtrl(): AlertController | null {
    return controller.value?.alertController ?? null
  }

  // Unread is UI-owned history, not a mirror of Core's event list.
  watch(
    [controller, events],
    ([nextController, nextEvents], [previousController]) => {
      if (nextController !== previousController) unreadCount.value = 0
      else {
        const diff = nextEvents.length - prevEventCount
        if (diff > 0) unreadCount.value += diff
      }
      prevEventCount = nextEvents.length
    },
    { immediate: true, flush: 'sync' },
  )

  function resetUnread() {
    unreadCount.value = 0
    prevEventCount = events.value.length
  }

  const addRule = (rule: AlertRule) => getCtrl()?.addRule(rule) ?? false
  const removeRule = (id: string) => getCtrl()?.removeRule(id) ?? false
  const setRuleEnabled = (id: string, enabled: boolean) =>
    getCtrl()?.setRuleEnabled(id, enabled) ?? false
  const updateRule = (id: string, patch: Partial<Omit<AlertRule, 'id'>>) =>
    getCtrl()?.updateRule(id, patch) ?? false
  const clearEvents = () => getCtrl()?.clearEvents()

  return {
    rules,
    events,
    unreadCount,
    resetUnread,
    addRule,
    removeRule,
    setRuleEnabled,
    updateRule,
    clearEvents,
  }
}
