/** 将命令注册表接入按钮：展示与执行都以注册表为唯一来源。 */
import { computed } from 'vue'
import { injectCommands, useCommandList } from './useCommands.js'

/** 按响应式命令 id 获取定义、可用性与执行入口。 */
export function useChartCommand(id: () => string) {
  const registry = injectCommands()
  const commands = useCommandList(registry)
  const definition = computed(() => commands.value.find((command) => command.id === id()))
  const available = computed(() => {
    return definition.value !== undefined && registry !== null && registry.isAvailable(id())
  })

  /** 点击与快捷键均由注册表检查可用性并执行同一动作。 */
  function execute(): void {
    void registry?.execute(id())
  }

  return { definition, available, execute }
}
