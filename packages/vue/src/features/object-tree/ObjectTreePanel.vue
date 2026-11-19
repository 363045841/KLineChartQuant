<!-- 对象树面板：按 pane 分组展示渲染对象，支持显隐、锁定、删除与拖动排序/跨 pane 迁移。 -->
<template>
  <section ref="panelRef" class="object-tree" aria-label="对象树">
    <SidePanelHeader title="对象树" :count="totalCount" />

    <!-- 顶部落点固定在滚动区之上，长列表滚动后仍可直接拖到；无行可拖时不会出现。 -->
    <div
      v-if="canCreatePane"
      class="object-tree__new-pane object-tree__new-pane--top"
      :class="{ 'is-active': newPaneDropSide === 'above' }"
      @dragover="onNewPaneDragOver($event, 'above')"
      @drop="onNewPaneDrop($event, 'above')"
    >
      <div class="object-tree__new-pane-title">新窗口</div>
    </div>

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
              'is-dragging': draggingId === row.objectId,
              'is-drop-before': isDropBefore(group, index),
              'is-drop-after': isDropAfter(group, index),
            }"
            tabindex="0"
            :draggable="canDrag(row)"
            @pointerdown="onRowPointerDown"
            @contextmenu="openRowContextMenu($event, row)"
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
                placement="bottom"
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
                placement="bottom"
                trigger-display="contents"
              >
                <BaseIconButton
                  :label="lockHint(row)"
                  size="sm"
                  :disabled="!row.capabilities.lockable"
                  @click.stop="toggleLocked(row)"
                >
                  <IconTablerLock v-if="row.locked" />
                  <IconTablerLockOpen v-else />
                </BaseIconButton>
              </BaseTooltip>
              <BaseTooltip
                v-if="row.capabilities.removable"
                content="删除"
                placement="bottom"
                trigger-display="contents"
              >
                <BaseIconButton
                  label="删除"
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
        :class="{ 'is-active': newPaneDropSide === 'below' }"
        @dragover="onNewPaneDragOver($event, 'below')"
        @drop="onNewPaneDrop($event, 'below')"
      >
        <div class="object-tree__new-pane-title">新窗口</div>
      </div>
    </div>

    <MenuSurface
      v-bind="contextMenu.bindings.value"
      label="图元菜单"
      :groups="contextMenuGroups"
      :restore-focus-to="panelRef"
      @select="onContextMenuSelect"
    />
  </section>
</template>

<script setup lang="ts">
  import type { PaneObjectRow, RenderObjectKind } from '@363045841yyt/klinechart-core'
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import BaseEmptyState from '@vue-src/components/common/feedback/BaseEmptyState.vue'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import MenuSurface from '@vue-src/components/common/menu/MenuSurface.vue'
  import { useMenuAnchor } from '@vue-src/components/common/menu/useMenuAnchor.js'
  import SlidingHighlight from '@vue-src/components/common/SlidingHighlight.vue'
  import { useSlidingHighlight } from '@vue-src/composables/ui/useSlidingHighlight.js'
  import { type Component, computed, ref, toRef } from 'vue'
  import IconTablerChartLine from '~icons/tabler/chart-line'
  import IconTablerEye from '~icons/tabler/eye'
  import IconTablerEyeOff from '~icons/tabler/eye-off'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerLockOpen from '~icons/tabler/lock-open'
  import IconTablerPencil from '~icons/tabler/pencil'
  import IconTablerStack2 from '~icons/tabler/stack-2'
  import IconTablerTrash from '~icons/tabler/trash'
  import SidePanelHeader from '../side-panel/SidePanelHeader.vue'
  import { useObjectTreeContextMenu } from './impl/useObjectTreeContextMenu.js'
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
    draggingId,
    newPaneDropSide,
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

  // 图元行右键复用画布上的同一份图元菜单；非图元行不接管。
  const panelRef = ref<HTMLElement | null>(null)
  const contextMenu = useMenuAnchor()
  const { contextMenuGroups, openRowContextMenu, onContextMenuSelect } = useObjectTreeContextMenu(
    controller,
    contextMenu,
  )

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

  /* 两端分割线：线一侧整块区域都是“新建 Pane”的落点。 */
  .object-tree__new-pane {
    position: relative;
    flex: 1 1 auto;
    min-height: var(--klc-space-32, 32px);
    margin-top: var(--klc-space-4, 4px);
  }

  /* 顶部落点只占分割线本身，剩余高度留给分组列表。 */
  .object-tree__new-pane--top {
    flex: 0 0 auto;
    margin-top: 0;
    margin-bottom: var(--klc-space-4, 4px);
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

  /* 顶部分割线的标题靠近线的下方，与底部的留白方向相反。 */
  .object-tree__new-pane--top .object-tree__new-pane-title {
    padding: var(--klc-space-4, 4px) var(--klc-space-8, 8px)
      var(--klc-space-8, 8px);
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
    /* 行内操作只换颜色，悬停不铺底色。 */
    --base-icon-button-hover-bg: transparent;
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

  /* 锁定状态用图标区分，行内图标共用同一条描线色。 */
</style>
