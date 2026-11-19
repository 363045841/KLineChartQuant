<!-- 行列表：列表容器、行间滑动高亮与指针/焦点委托只在这里实现一次，调用方只放行。 -->
<template>
  <ul
    class="agent-row-list"
    @pointerover="onPointerOver"
    @focusin="onFocusIn"
    @pointerleave="hide"
    @scroll.passive="hide"
  >
    <SlidingHighlight ref="highlight" />
    <slot />
  </ul>
</template>

<script setup lang="ts">
  import './agent-row/impl/agent-row-list.css'

  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import { useTemplateRef } from 'vue'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'

  const highlight = useTemplateRef<InstanceType<typeof SlidingHighlight>>('highlight')
  const { onPointerOver, onFocusIn, hide } = useSlidingHighlight(highlight, (target) =>
    target.closest<HTMLElement>('.agent-list-row'),
  )
</script>
