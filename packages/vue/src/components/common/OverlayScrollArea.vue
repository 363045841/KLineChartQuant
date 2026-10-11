<!-- 原生滚动区域与覆盖式滑块：隐藏原生滚动条，避免挤占内容宽度。 -->
<template>
  <div class="overlay-scroll-area">
    <div ref="viewport" class="overlay-scroll-area__viewport" @scroll.passive="onScroll">
      <slot />
    </div>
    <div class="overlay-scroll-area__rail" aria-hidden="true">
      <div
        class="overlay-scroll-area__thumb"
        :class="{ visible }"
        :style="thumbStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @lostpointercapture="onPointerEnd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTemplateRef } from 'vue'
  import { useOverlayScrollbar } from '../../composables/useOverlayScrollbar.js'

  const viewport = useTemplateRef<HTMLElement>('viewport')
  const { visible, thumbStyle, onScroll, onPointerDown, onPointerMove, onPointerEnd } =
    useOverlayScrollbar(viewport)
</script>

<style scoped>
  .overlay-scroll-area {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .overlay-scroll-area__viewport {
    height: 100%;
    overflow-y: auto;
    scrollbar-width: none;
    scrollbar-gutter: auto;
  }

  .overlay-scroll-area__viewport::-webkit-scrollbar {
    display: none;
    width: 0;
  }

  .overlay-scroll-area__rail {
    position: absolute;
    inset: 0 0 0 auto;
    width: var(--klc-space-8, 8px);
    pointer-events: none;
  }

  .overlay-scroll-area__thumb {
    width: var(--klc-space-4, 4px);
    margin: 0 auto;
    border-radius: var(--klc-radius-xs, 4px);
    background: var(--klc-color-ui-muted);
    opacity: 0;
    transition: opacity var(--klc-motion-dur-fast, 160ms) ease;
    pointer-events: none;
    touch-action: none;
    user-select: none;
  }

  .overlay-scroll-area__thumb.visible {
    opacity: 0.65;
    pointer-events: auto;
  }
</style>
