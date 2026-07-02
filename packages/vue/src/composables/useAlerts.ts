import type {
  AlertController,
  AlertEvent,
  AlertRule,
  ChartController,
} from '@363045841yyt/klinechart-core'
import { ref, toRef, watch, onScopeDispose, type Ref, type MaybeRefOrGetter } from 'vue'

export function useAlerts(controllerSource: MaybeRefOrGetter<ChartController | null>) {
  const controller = toRef(controllerSource)

  const rules = ref<ReadonlyArray<AlertRule>>([]) as Ref<ReadonlyArray<AlertRule>>
  const events = ref<ReadonlyArray<AlertEvent>>([]) as Ref<ReadonlyArray<AlertEvent>>
  const unreadCount = ref(0)
  let prevEventCount = 0

  let unsubRules: (() => void) | null = null
  let unsubEvents: (() => void) | null = null

  function getCtrl(): AlertController | null {
    return controller.value?.alertController ?? null
  }

  function connect() {
    disconnect()
    const ctrl = getCtrl()
    if (!ctrl) return
    rules.value = ctrl.rules.peek()
    unsubRules = ctrl.rules.subscribe(() => {
      rules.value = ctrl.rules.peek()
    })
    events.value = ctrl.events.peek()
    prevEventCount = events.value.length
    unsubEvents = ctrl.events.subscribe(() => {
      events.value = ctrl.events.peek()
      const diff = events.value.length - prevEventCount
      if (diff > 0) unreadCount.value += diff
    })
  }

  function disconnect() {
    unsubRules?.()
    unsubEvents?.()
    unsubRules = null
    unsubEvents = null
  }

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

  watch(controller, connect, { immediate: true })

  onScopeDispose(disconnect)

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
