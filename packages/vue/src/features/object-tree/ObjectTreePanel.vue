<!-- 对象树面板：按 pane 分组展示渲染对象，支持显隐、锁定、删除与拖动排序/跨 pane 迁移。 -->
<template>
  <section class="object-tree" aria-label="对象">
    <header class="object-tree__head">
      <div class="object-tree__title-row">
        <h2 class="object-tree__title">对象</h2>
        <span v-if="totalCount > 0" class="object-tree__count">{{ totalCount }}</span>
      </div>
      <p v-if="!isEmpty" class="object-tree__hint">从上到下为图层顺序，拖动左侧手柄调整。</p>
    </header>

    <BaseEmptyState v-if="isEmpty" size="compact">
      <template #icon><IconTablerStack2 /></template>
      当前没有可管理的对象
      <template #hint>添加指标后会出现在这里</template>
    </BaseEmptyState>

    <div v-else class="object-tree__groups">
      <section v-for="group in groups" :key="group.paneId" class="object-group">
        <button
          type="button"
          class="object-group__header"
          :aria-expanded="!isCollapsed(group.paneId)"
          @click="toggleCollapsed(group.paneId)"
          @dragover="onGroupDragOver($event, group, 0)"
          @drop="onDrop($event, group, 0)"
        >
          <IconTablerChevronDown
            class="object-group__chevron"
            :class="{ 'is-collapsed': isCollapsed(group.paneId) }"
            aria-hidden="true"
          />
          <span class="object-group__label">{{ group.label }}</span>
          <span v-if="group.rows.length > 0" class="object-group__count">
            {{ group.rows.length }}
          </span>
        </button>

        <ul
          v-show="!isCollapsed(group.paneId)"
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
            @keydown="onRowKeydown($event, group, row)"
            @dragover.stop="onRowDragOver($event, group, index)"
            @drop.stop="onRowDrop($event, group, index)"
          >
            <span
              class="object-row__handle"
              :class="{ 'is-disabled': !canDrag(row) }"
              :draggable="canDrag(row)"
              :title="canDrag(row) ? '拖动调整顺序' : '已锁定，无法拖动'"
              @dragstart="onDragStart($event, row)"
              @dragend="onDragEnd"
            >
              <IconTablerGripVertical aria-hidden="true" />
            </span>
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
              <BaseTooltip :content="lockHint(row)" placement="left" trigger-display="contents">
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
              <BaseTooltip :content="removeHint(row)" placement="left" trigger-display="contents">
                <BaseIconButton
                  :label="removeHint(row)"
                  size="sm"
                  tone="danger"
                  :disabled="!row.capabilities.removable || row.locked"
                  @click.stop="removeRow(row)"
                >
                  <IconTablerTrash />
                </BaseIconButton>
              </BaseTooltip>
            </span>
          </li>
          <li v-if="group.rows.length === 0" class="object-group__empty">暂无对象</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
  import type { PaneObjectRow, RenderObjectKind } from '@363045841yyt/klinechart-core'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import BaseEmptyState from '@vue-src/components/common/BaseEmptyState.vue'
  import BaseIconButton from '@vue-src/components/common/BaseIconButton.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import { type Component, toRef } from 'vue'
  import IconTablerChartLine from '~icons/tabler/chart-line'
  import IconTablerChevronDown from '~icons/tabler/chevron-down'
  import IconTablerEye from '~icons/tabler/eye'
  import IconTablerEyeOff from '~icons/tabler/eye-off'
  import IconTablerGripVertical from '~icons/tabler/grip-vertical'
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
    isCollapsed,
    toggleCollapsed,
    toggleVisible,
    toggleLocked,
    removeRow,
    canDrag,
    visibilityHint,
    lockHint,
    removeHint,
    draggingId,
    onDragStart,
    onDragEnd,
    onRowDragOver,
    onGroupDragOver,
    onDrop,
    onRowDrop,
    onRowKeydown,
    isDropBefore,
    isDropAfter,
  } = useObjectTreePanel(controller)

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

  .object-tree__hint {
    margin: var(--klc-space-4, 4px) 0 0;
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-label-12-font-size, 11px);
    line-height: var(--klc-space-16, 16px);
  }

  .object-tree__groups {
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--klc-space-4, 4px) 0 var(--klc-space-8, 8px);
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .object-group + .object-group {
    margin-top: var(--klc-space-4, 4px);
  }

  .object-group__header {
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    width: 100%;
    padding: var(--klc-space-4, 4px) var(--klc-space-12, 12px);
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-muted);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .object-group__header:hover {
    color: var(--klc-color-ui-text);
  }

  .object-group__chevron {
    flex: 0 0 auto;
    width: var(--klc-space-14, 14px);
    height: var(--klc-space-14, 14px);
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .object-group__chevron.is-collapsed {
    transform: rotate(-90deg);
  }

  .object-group__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-group__count {
    margin-left: auto;
    color: var(--klc-color-ui-muted);
  }

  .object-group__list {
    margin: 0;
    padding: 0 var(--klc-space-4, 4px);
    list-style: none;
  }

  .object-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    min-height: var(--klc-space-28, 28px);
    padding: var(--klc-space-2, 2px) var(--klc-space-4, 4px)
      var(--klc-space-2, 2px) var(--klc-space-8, 8px);
    border-radius: var(--klc-radius-xs, 4px);
    outline: none;
    user-select: none;
  }

  .object-row:hover {
    background: var(--klc-color-ui-hover);
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
    right: var(--klc-space-4, 4px);
    left: var(--klc-space-8, 8px);
    border-top: 2px solid var(--klc-color-ui-accent);
    content: '';
  }

  .object-row.is-drop-before::before {
    top: -1px;
  }

  .object-row.is-drop-after::after {
    bottom: -1px;
  }

  .object-row__handle {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    width: var(--klc-space-14, 14px);
    height: var(--klc-space-16, 16px);
    color: var(--klc-color-ui-muted);
    cursor: grab;
  }

  .object-row__handle:active {
    cursor: grabbing;
  }

  .object-row__handle.is-disabled {
    opacity: 0.4;
    cursor: default;
  }

  .object-row__handle svg {
    width: var(--klc-space-14, 14px);
    height: var(--klc-space-14, 14px);
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
  }

  .object-row__lock.is-active {
    --base-icon-button-color: var(--klc-color-ui-accent);
  }

  .object-group__empty {
    padding: var(--klc-space-4, 4px) var(--klc-space-8, 8px)
      var(--klc-space-4, 4px) var(--klc-space-24, 24px);
    color: var(--klc-color-ui-muted);
  }
</style>
