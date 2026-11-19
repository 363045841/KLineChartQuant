/** Formats the current shortcut, including remaps, for a command hint. */
import { primaryShortcut } from '@363045841yyt/klinechart-core'
import { injectCommands, useCommandList } from '@vue-src/composables/commands/useCommands.js'
import { computed } from 'vue'

export function useCommandShortcut(commandId: () => string | undefined) {
  const registry = injectCommands()
  const commands = useCommandList(registry)
  return computed(() => {
    if (!registry) return null
    const command = commands.value.find(({ id }) => id === commandId())
    const shortcut = command && primaryShortcut(command)
    return shortcut ? registry.formatShortcut(shortcut) : null
  })
}
