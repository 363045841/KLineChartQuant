<!-- 时间轴上方的导航浮层；仅声明按钮顺序，业务行为由命令层持有。 -->
<template>
  <div ref="root" class="chart-navigation" @pointerdown.stop @dblclick.stop>
    <div class="chart-navigation__buttons">
      <div
        v-for="group in commandGroups"
        :key="group.id"
        class="chart-navigation__group"
        :class="{ 'is-dismissed': group.dismissed }"
      >
        <ChartCommandButton
          v-for="command in group.commands"
          :key="command"
          :command="command"
          @execute="onExecute"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useDeviceEnvironment } from '@vue-src/composables/useDeviceEnvironment.js'
  import { computed, ref, watch } from 'vue'
  import ChartCommandButton from '../commands/ChartCommandButton.vue'

  /** 执行后单独淡出的命令：重置是一次性收尾动作，缩放与平移需要连续点击。 */
  const DISMISS_COMMAND = 'view.reset'

  /** 一组命令按钮；分组只决定间隔，`dismissed` 控制该组当前的显隐。 */
  interface CommandGroup {
    readonly id: string
    readonly commands: ReadonlyArray<string>
    readonly dismissed?: boolean
  }

  const root = ref<HTMLElement | null>(null)
  const dismissed = ref(false)
  const device = useDeviceEnvironment()

  /** 移动端与平板只保留重置：缩放和平移已由手势承担，按钮会挤占本就狭窄的绘图区。 */
  const compact = computed(() => device.value.deviceType !== 'desktop')

  /** 重置按钮执行后淡出，占位保留，避免其他按钮随之为之一跳。 */
  const commandGroups = computed<ReadonlyArray<CommandGroup>>(() => {
    const groups: CommandGroup[] = compact.value
      ? []
      : [
          { id: 'zoom', commands: ['view.zoomOut', 'view.zoomIn'] },
          { id: 'pan', commands: ['view.moveLeft', 'view.moveRight'] },
        ]
    return [...groups, { id: 'reset', commands: [DISMISS_COMMAND], dismissed: dismissed.value }]
  })

  /** 重置执行后收起自己，避免停留遮挡刚复位后的图表。 */
  function onExecute(command: string): void {
    if (command === DISMISS_COMMAND) dismissed.value = true
  }

  /** 浮层之外的指针或键盘操作即视为“用户再次交互”，恢复重置按钮。 */
  function resume(event: Event): void {
    const target = event.target instanceof Node ? event.target : null
    if (event instanceof KeyboardEvent || !root.value?.contains(target)) dismissed.value = false
  }

  // 只在收起期间监听文档级事件，恢复时立即摘除，不留常驻监听。
  watch(dismissed, (active, _previous, onCleanup) => {
    if (!active) return
    const options = { capture: true, passive: true } as const
    document.addEventListener('pointerdown', resume, options)
    document.addEventListener('pointermove', resume, options)
    document.addEventListener('keydown', resume, options)
    onCleanup(() => {
      document.removeEventListener('pointerdown', resume, options)
      document.removeEventListener('pointermove', resume, options)
      document.removeEventListener('keydown', resume, options)
    })
  })
</script>

<style scoped>
  .chart-navigation {
    position: absolute;
    /* 锚定可见绘图区中心：宿主按左右轴宽度差传入偏移，避免相对含轴外框中点对齐。 */
    left: calc(50% + var(--chart-nav-offset-x));
    transform: translateX(-50%);
    z-index: 30;
    padding: 12px 16px 8px;
    /* 留白同样是命中区：指针进入按钮附近即显示浮层，不必精确停在按钮上。 */
    pointer-events: auto;
  }

  .chart-navigation__buttons {
    display: flex;
    gap: var(--klc-space-16);
    opacity: 0;
    /* 收起时按钮不可点，避免点到看不见的按钮。 */
    pointer-events: none;
    transition: opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .chart-navigation__group {
    display: flex;
    gap: var(--klc-space-8);
    opacity: 1;
    transition: opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  /* 重置按钮淡出但保留占位：整排按钮不因单个按钮显隐而位移。 */
  .chart-navigation__group.is-dismissed {
    opacity: 0;
    pointer-events: none;
  }

  .chart-navigation:hover .chart-navigation__buttons,
  .chart-navigation:focus-within .chart-navigation__buttons {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    /* 触摸没有悬停：按钮常驻，但只有按钮本身参与命中，绘图区手势照常穿透。 */
    .chart-navigation {
      pointer-events: none;
    }

    .chart-navigation__buttons {
      opacity: 1;
      pointer-events: auto;
    }
  }

</style>
