<!-- 对象树面板：按 pane 分组展示渲染对象，支持显隐、锁定、删除与拖动排序/跨 pane 迁移。 -->
<template>
  <section class="object-tree" aria-label="对象树">
    <header class="object-tree__head">
      <div class="object-tree__title-row">
        <h2 class="object-tree__title">对象树</h2>
        <span v-if="totalCount > 0" class="object-tree__count">{{ totalCount }}</span>
      </div>
    </header>

    <BaseEmptyState v-if="isEmpty" size="compact">
      <template #icon><IconTablerStack2 /></template>
      当前没有可管理的对象
      <template #hint>添加指标后会出现在这里</template>
    </BaseEmptyState>

    <div
      v-else
      class="object-tree__groups"
      @pointerover="onRowPointerOver"
      @pointerleave="hideRowHighlight"
      @focusin="onRowFocusIn"
      @focusout="hideRowHighlight"
    >
      <SlidingHighlight ref="highlight" class="object-tree__highlight" />
      <section v-for="group in visibleGroups" :key="group.paneId" class="object-group">
        <div v-if="group.title" class="object-group__divider" aria-hidden="true">
          <span class="object-group__title">{{ group.title }}</span>
        </div>
        <ul
          class="object-group__list"
          @dragover="onGroupDragOver($event, group, group.rows.length)"
          @drop="onDrop($event, group, group.rows.length)"
        >
          <li
            v-for="(row, index) in group.rows"
            :key="row.objectId"
            class="object-row"
            :class="{
              'is-hidden': !row.visible,
              'is-locked': row.locked,
              'is-dragging': draggingId === row.objectId,
              'is-drop-before': isDropBefore(group, index),
              'is-drop-after': isDropAfter(group, index),
            }"
            tabindex="0"
            :draggable="canDrag(row)"
            @pointerdown="onRowPointerDown"
            @dragstart="onDragStart($event, row)"
            @dragend="onDragEnd"
            @keydown="onRowKeydown($event, group, row)"
            @dragover.stop="onRowDragOver($event, group, index)"
            @drop.stop="onRowDrop($event, group, index)"
          >
            <component :is="iconOf(row)" class="object-row__icon" aria-hidden="true" />
            <span class="object-row__label" :title="row.label">{{ row.label }}</span>
            <span class="object-row__actions">
              <BaseTooltip
                :content="visibilityHint(row)"
                placement="left"
                trigger-display="contents"
              >
                <BaseIconButton
                  :label="visibilityHint(row)"
                  size="sm"
                  :disabled="!row.capabilities.hideable"
                  @click.stop="toggleVisible(row)"
                >
                  <IconTablerEye v-if="row.visible" />
                  <IconTablerEyeOff v-else />
                </BaseIconButton>
              </BaseTooltip>
              <BaseTooltip
                v-if="row.capabilities.lockable"
                :content="lockHint(row)"
                placement="left"
                trigger-display="contents"
              >
                <BaseIconButton
                  class="object-row__lock"
                  :class="{ 'is-active': row.locked }"
                  :label="lockHint(row)"
                  size="sm"
                  :disabled="!row.capabilities.lockable"
                  @click.stop="toggleLocked(row)"
                >
                  <IconTablerLock />
                </BaseIconButton>
              </BaseTooltip>
              <BaseTooltip
                v-if="row.capabilities.removable"
                :content="removeHint(row)"
                placement="left"
                trigger-display="contents"
              >
                <BaseIconButton
                  :label="removeHint(row)"
                  size="sm"
                  tone="danger"
                  :disabled="row.locked"
                  @click.stop="removeRow(row)"
                >
                  <IconTablerTrash />
                </BaseIconButton>
              </BaseTooltip>
            </span>
          </li>
        </ul>
      </section>
      <div
        v-if="canCreatePane"
        class="object-tree__new-pane"
        :class="{ 'is-active': newPaneDropActive }"
        @dragover="onNewPaneDragOver"
        @drop="onNewPaneDrop"
      >
        <div class="object-tree__new-pane-title">新窗口</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import type { PaneObjectRow, RenderObjectKind } from '@363045841yyt/klinechart-core'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import BaseEmptyState from '@vue-src/components/common/BaseEmptyState.vue'
  import BaseIconButton from '@vue-src/components/common/BaseIconButton.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import { type Component, computed, ref, toRef } from 'vue'
  import IconTablerChartLine from '~icons/tabler/chart-line'
  import IconTablerEye from '~icons/tabler/eye'
  import IconTablerEyeOff from '~icons/tabler/eye-off'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerPencil from '~icons/tabler/pencil'
  import IconTablerStack2 from '~icons/tabler/stack-2'
  import IconTablerTrash from '~icons/tabler/trash'
  import { useObjectTreePanel } from './impl/useObjectTreePanel.js'

  const props = withDefaults(
    defineProps<{
      /** 图表控制器；未就绪时面板显示空状态。 */
      controller?: ChartController | null
    }>(),
    { controller: null },
  )
  const controller = toRef(props, 'controller')
  const {
    groups,
    totalCount,
    isEmpty,
    canCreatePane,
    toggleVisible,
    toggleLocked,
    removeRow,
    canDrag,
    visibilityHint,
    lockHint,
    removeHint,
    draggingId,
    newPaneDropActive,
    onDragStart,
    onRowPointerDown,
    onDragEnd,
    onRowDragOver,
    onGroupDragOver,
    onDrop,
    onRowDrop,
    onNewPaneDragOver,
    onNewPaneDrop,
    onRowKeydown,
    isDropBefore,
    isDropAfter,
  } = useObjectTreePanel(controller)

  // 空 Pane 不渲染区块；Pane 之间只用分割线区分。
  const visibleGroups = computed(() => groups.value.filter((group) => group.rows.length > 0))

  const highlight = ref<InstanceType<typeof SlidingHighlight> | null>(null)
  // 拖动时收起高亮，避免落点指示与滑动块互相干扰。
  const {
    onPointerOver: onRowPointerOver,
    onFocusIn: onRowFocusIn,
    hide: hideRowHighlight,
  } = useSlidingHighlight(highlight, (target) =>
    draggingId.value ? null : target.closest<HTMLElement>('.object-row'),
  )

  /** 对象类型只决定行图标，操作能力由行自身声明。 */
  const KIND_ICONS: Readonly<Record<RenderObjectKind, Component>> = {
    system: IconTablerStack2,
    indicator: IconTablerChartLine,
    drawing: IconTablerPencil,
  }

  function iconOf(row: PaneObjectRow): Component {
    return KIND_ICONS[row.kind]
  }
</script>

<style scoped>
  .object-tree {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .object-tree__head {
    flex: 0 0 auto;
    padding: var(--klc-space-8, 8px) var(--klc-space-12, 12px);
    border-bottom: 1px solid var(--klc-color-border-light);
    background: var(--klc-color-ui-background);
  }

  .object-tree__title-row {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
  }

  .object-tree__title {
    margin: 0;
    font-size: var(--klc-text-14-font-size, 14px);
    font-weight: 600;
    line-height: var(--klc-space-20, 20px);
  }

  .object-tree__count {
    min-width: var(--klc-space-18, 18px);
    padding: 0 var(--klc-space-4, 4px);
    border-radius: var(--klc-radius-full, 9999px);
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size, 11px);
    line-height: var(--klc-space-16, 16px);
    text-align: center;
  }

  .object-tree__groups {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    padding: var(--klc-space-4, 4px) 0 var(--klc-space-8, 8px);
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  /* 行背景由滑动高亮统一提供：直角、通栏。 */
  .object-tree__highlight {
    --sliding-highlight-radius: 0;
  }

  /* Pane 之间的分割线与右键菜单同款：线不画到头，标题居中放在线中间。 */
  .object-group {
    flex: 0 0 auto;
  }

  .object-group + .object-group {
    margin-top: var(--klc-space-2, 2px);
  }

  .object-group__divider {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-8, 8px) var(--klc-space-8, 8px)
      var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size, 11px);
    line-height: var(--klc-space-16, 16px);
  }

  .object-group__divider::before,
  .object-group__divider::after {
    flex: 1 1 auto;
    border-top: 1px solid var(--klc-color-border-light);
    content: '';
  }

  /* 最底端分割线：线以下整块区域都是“新建 Pane”的落点。 */
  .object-tree__new-pane {
    position: relative;
    flex: 1 1 auto;
    min-height: var(--klc-space-32, 32px);
    margin-top: var(--klc-space-4, 4px);
  }

  .object-tree__new-pane-title {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-8, 8px) var(--klc-space-8, 8px)
      var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size, 11px);
    line-height: var(--klc-space-16, 16px);
    transition: color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .object-tree__new-pane-title::before,
  .object-tree__new-pane-title::after {
    flex: 1 1 auto;
    border-top: 1px solid var(--klc-color-border-light);
    content: '';
    transition: border-color var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .object-tree__new-pane.is-active .object-tree__new-pane-title {
    color: var(--klc-color-ui-accent);
  }

  .object-tree__new-pane.is-active .object-tree__new-pane-title::before,
  .object-tree__new-pane.is-active .object-tree__new-pane-title::after {
    border-top-color: var(--klc-color-ui-accent);
  }

  .object-group__list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .object-row {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    min-height: var(--klc-space-32, 32px);
    padding: var(--klc-space-2, 2px) var(--klc-space-4, 4px)
      var(--klc-space-2, 2px) var(--klc-space-8, 8px);
    border-radius: 0;
    outline: none;
    user-select: none;
  }

  .object-row:focus-visible {
    box-shadow: inset 0 0 0 1px var(--klc-color-ui-accent);
  }

  .object-row.is-hidden .object-row__label {
    color: var(--klc-color-ui-muted);
  }

  .object-row.is-dragging {
    opacity: 0.5;
  }

  .object-row.is-drop-before::before,
  .object-row.is-drop-after::after {
    position: absolute;
    right: 0;
    left: 0;
    border-top: 2px solid var(--klc-color-ui-accent);
    content: '';
  }

  .object-row.is-drop-before::before {
    top: -1px;
  }

  .object-row.is-drop-after::after {
    bottom: -1px;
  }

  .object-row[draggable='true'] {
    cursor: grab;
  }

  .object-row[draggable='true']:active {
    cursor: grabbing;
  }

  .object-row__icon {
    flex: 0 0 auto;
    width: var(--klc-space-14, 14px);
    height: var(--klc-space-14, 14px);
    color: var(--klc-color-ui-muted);
  }

  .object-row__label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-row__actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--klc-space-2, 2px);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  /* 操作按钮只在悬浮或键盘焦点进入行时出现。 */
  .object-row:hover .object-row__actions,
  .object-row:focus-within .object-row__actions {
    opacity: 1;
    pointer-events: auto;
  }

  /* 触屏没有 hover，保持常驻可点。 */
  @media (hover: none) {
    .object-row__actions {
      opacity: 1;
      pointer-events: auto;
    }
  }

  .object-row__lock.is-active {
    --base-icon-button-color: var(--klc-color-ui-accent);
  }
</style>
