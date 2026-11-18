<!-- 时间轴上方的导航浮层；仅声明按钮顺序，业务行为由命令层持有。 -->
<template>
  <div class="chart-navigation" @pointerdown.stop @dblclick.stop>
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
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { useResetChartVisibility } from '@vue-src/composables/chart/useResetChartVisibility.js'
  import { useDeviceEnvironment } from '@vue-src/composables/useDeviceEnvironment.js'
  import { computed, toRef } from 'vue'
  import ChartCommandButton from '../commands/ChartCommandButton.vue'

  /** 一组命令按钮；分组只决定间隔，`dismissed` 控制该组当前的显隐。 */
  interface CommandGroup {
    readonly id: string
    readonly commands: ReadonlyArray<string>
    readonly dismissed?: boolean
  }

  const props = defineProps<{ controller: ChartController | null }>()

  const device = useDeviceEnvironment()

  /** 重置按钮的收起与恢复由 Core 的拖拽/缩放状态驱动，鼠标移动不再触发。 */
  const { dismissed, onCommandExecuted } = useResetChartVisibility(toRef(props, 'controller'))

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
    return [...groups, { id: 'reset', commands: ['view.reset'], dismissed: dismissed.value }]
  })

  /** 命令执行后交给显隐规则：重置自己收起，其他视图命令恢复。 */
  function onExecute(command: string): void {
    onCommandExecuted(command)
  }
</script>

<style scoped>
  .chart-navigation {
    position: absolute;
    /* 锚定可见绘图区中心：宿主按左右轴宽度差传入偏移，避免相对含轴外框中点对齐。 */
    left: calc(50% + var(--chart-nav-offset-x));
    transform: translateX(-50%);
    z-index: 30;
    /* 左右留白同时是命中区；比按钮自身宽，指针靠近即显示浮层。 */
    padding: 12px var(--klc-space-48) 8px;
    /* 留白同样是命中区：指针进入按钮附近即显示浮层，不必精确停在按钮上。 */
    pointer-events: auto;
  }

  .chart-navigation__buttons {
    display: flex;
    gap: var(--klc-space-16);
    opacity: 0;
    /* 收起时按钮不可点，避免点到看不见的按钮。 */
    pointer-events: none;
    transition: opacity var(--klc-motion-dur-base) var(--klc-motion-ease-standard);
  }

  .chart-navigation__group {
    display: flex;
    gap: var(--klc-space-8);
    opacity: 1;
    transition: opacity var(--klc-motion-dur-base) var(--klc-motion-ease-standard);
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
