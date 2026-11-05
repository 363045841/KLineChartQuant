<!-- 时间轴上方的导航浮层；仅声明按钮顺序，业务行为由命令层持有。 -->
<template>
  <div class="chart-navigation" @pointerdown.stop @dblclick.stop>
    <div class="chart-navigation__buttons">
      <div v-for="group in commandGroups" :key="group.id" class="chart-navigation__group">
        <ChartCommandButton v-for="command in group.commands" :key="command" :command="command" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import ChartCommandButton from '../commands/ChartCommandButton.vue'

  const commandGroups = [
    { id: 'zoom', commands: ['view.zoomOut', 'view.zoomIn'] },
    { id: 'pan', commands: ['view.moveLeft', 'view.moveRight'] },
    { id: 'reset', commands: ['view.reset'] },
  ]
</script>

<style scoped>
  .chart-navigation {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    padding: 12px 16px 8px;
  }

  .chart-navigation__buttons {
    display: flex;
    gap: var(--klc-space-16);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--klc-motion-dur-fast) ease;
  }

  .chart-navigation__group {
    display: flex;
    gap: var(--klc-space-8);
  }

  .chart-navigation:hover .chart-navigation__buttons,
  .chart-navigation:focus-within .chart-navigation__buttons {
    opacity: 1;
    pointer-events: auto;
  }

  @media (hover: none) {
    .chart-navigation__buttons {
      opacity: 1;
      pointer-events: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chart-navigation__buttons {
      transition: none;
    }
  }
</style>
