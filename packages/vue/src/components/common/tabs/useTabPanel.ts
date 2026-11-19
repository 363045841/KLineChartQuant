/** Relates a shared panel region to its currently selected tab. */
import { computed, useId } from 'vue'

export function tabId(panelId: string, tab: string): string {
  return `${panelId}-tab-${encodeURIComponent(tab)}`
}

export function useTabPanel(selected: () => string, id = useId()) {
  const panelId = `${id}-panel`
  const panelAttrs = computed(() => ({
    id: panelId,
    role: 'tabpanel',
    'aria-labelledby': tabId(panelId, selected()),
  }))

  return { panelId, panelAttrs }
}
