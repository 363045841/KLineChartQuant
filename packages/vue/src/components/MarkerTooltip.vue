<template>
  <div
    v-if="marker"
    :ref="onRef"
    class="marker-tooltip"
    :class="[{ 'use-anchor': useAnchor }, anchorPlacementClass]"
    :style="useAnchor ? undefined : { left: `${pos.x + 12}px`, top: `${pos.y + 12}px` }"
  >
    <div class="marker-tooltip__title">{{ title }}</div>
    <div v-if="hasMetadata" class="marker-tooltip__content">
      <div v-for="(value, key) in metadata" :key="key" class="row">
        <span>{{ key }}</span>
        <span>{{ formatValue(value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { MarkerEntity, CustomMarkerEntity } from '@363045841yyt/klinechart-core/engine/marker/registry'

const MARKER_TYPE_LABELS: Record<string, string> = {
  support: '支撑位',
  resistance: '阻力位',
  top: '顶部',
  bottom: '底部',
}

const props = defineProps<{
  marker: MarkerEntity | CustomMarkerEntity | null
  pos: { x: number; y: number }
  useAnchor?: boolean
  anchorPlacement?: 'right-bottom' | 'left-bottom'
  setEl?: (el: HTMLDivElement | null) => void
}>()

const useAnchor = computed(() => props.useAnchor === true)
const anchorPlacementClass = computed(() =>
  props.anchorPlacement === 'left-bottom' ? 'anchor-left-bottom' : 'anchor-right-bottom',
)

function onRef(el: Element | ComponentPublicInstance | null) {
  props.setEl?.(el as HTMLDivElement | null)
}

const isCustomMarker = computed(() => {
  return props.marker && 'date' in props.marker
})

const title = computed(() => {
  if (!props.marker) return ''
  if (isCustomMarker.value) {
    const custom = props.marker as CustomMarkerEntity
    return custom.label?.text || custom.shape
  }
  const standard = props.marker as MarkerEntity
  return MARKER_TYPE_LABELS[standard.markerType] || standard.markerType
})

const metadata = computed(() => {
  if (!props.marker) return {}
  if (isCustomMarker.value) {
    const custom = props.marker as CustomMarkerEntity
    return {
      日期: custom.date,
      ...custom.metadata,
    }
  }
  return (props.marker as MarkerEntity).metadata
})

const hasMetadata = computed(() => {
  return Object.keys(metadata.value).length > 0
})

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toFixed(2)
  }
  return String(value)
}
</script>

<style scoped>
.marker-tooltip {
  position: absolute;
  z-index: 10;
  min-width: 180px;
  max-width: 260px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--klc-color-tooltip-bg);
  border: 1px solid var(--klc-color-tooltip-border);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: var(--klc-color-tooltip-text);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

.marker-tooltip__title {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 600;
  margin-bottom: 6px;
}

.marker-tooltip__content {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
}

.marker-tooltip__content .row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.marker-tooltip__content .row span:first-child {
  color: color-mix(in srgb, var(--klc-color-tooltip-text) 70%, transparent);
}

@supports (anchor-name: --kmap-anchor) and (position-anchor: --kmap-anchor) {
  .marker-tooltip.use-anchor {
    position: absolute;
    position-anchor: --marker-tooltip-anchor;
    left: anchor(left);
    top: anchor(top);
  }

  .marker-tooltip.use-anchor.anchor-right-bottom {
    transform: translate(12px, 12px);
  }

  .marker-tooltip.use-anchor.anchor-left-bottom {
    transform: translate(calc(-100% - 12px), 12px);
  }
}
</style>
