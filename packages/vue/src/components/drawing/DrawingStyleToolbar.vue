<template>
  <CanvasToolbar>
    <BaseTooltip v-if="style && canEdit('stroke')" content="颜色" placement="top" trigger-display="contents">
      <ColorPicker
        label="颜色"
        :model-value="style.stroke"
        @update:model-value="onColorChange"
      />
    </BaseTooltip>

    <BaseTooltip v-if="canEdit('strokeWidth')" content="线宽" placement="top" trigger-display="contents">
      <DropMenu label="线宽" :groups="widthGroups" density="compact"
        trigger-class="control-button--sm"
        @select="(_groupId, value) => onWidthChange(Number(value))">
        <template #trigger>
          <span class="selection-menu__value">{{ style?.strokeWidth ?? 1 }}px</span>
          <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
        </template>
      </DropMenu>
    </BaseTooltip>

    <BaseTooltip v-if="canEdit('strokeStyle')" content="线型" placement="top" trigger-display="contents">
      <DropMenu label="线型" :groups="styleGroups" density="compact"
        trigger-class="control-button--sm" @select="selectLineStyle">
        <template #trigger>
          <span class="selection-menu__value">{{ selectedStyleLabel }}</span>
          <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
        </template>
      </DropMenu>
    </BaseTooltip>

    <span v-if="drawings.length > 1" class="selection-count">已选 {{ drawings.length }}</span>

    <div
      v-if="lineLabelPosition"
      class="label-position"
      :class="{ 'toolbar-separated': drawings.length > 0 }"
      role="group"
      aria-label="文本位置"
    >
      <BaseTooltip
        v-for="option in positionOptions"
        :key="option.value"
        :content="option.label"
        placement="top"
        trigger-display="contents"
      >
        <button
          type="button"
          class="toolbar-btn label-position__button"
          :class="{ 'is-active': lineLabelPosition === option.value }"
          :aria-label="option.label"
          :aria-pressed="lineLabelPosition === option.value"
          @mousedown.prevent
          @click="emit('updateLineLabelPosition', option.value)"
        >
          <component :is="option.icon" aria-hidden="true" />
        </button>
      </BaseTooltip>
    </div>

    <DrawingTemplateMenu
      v-if="drawings.length > 0"
      label="模板"
      :names="templateNames ?? []"
      :message="templateError"
      :can-save="drawings.length === 1 && canUseTemplates"
      :can-apply="canUseTemplates"
      :saved-name="templateSaved"
      :disabled="false"
      :show-save="drawings.length === 1"
      trigger-class="toolbar-btn toolbar-btn--template"
      @open="emit('openTemplates')"
      @save-new="emit('saveTemplate')"
      @apply="emit('applyTemplate', $event)"
      @save-existing="emit('saveExistingTemplate', $event)"
      @remove="emit('deleteTemplate', $event)"
    >
      <template #trigger><IconTablerBookmarks class="toolbar-icon" aria-hidden="true" /></template>
    </DrawingTemplateMenu>

    <BaseTooltip v-if="drawings.length === 1" content="图元设置" placement="top" trigger-display="contents">
      <button
        type="button"
        class="toolbar-btn toolbar-btn--settings"
        aria-label="图元设置"
        @click="emit('openSettings', drawings[0]!.id)"
      >
        <IconTablerSettings class="settings-icon" aria-hidden="true" />
      </button>
    </BaseTooltip>

    <BaseTooltip v-if="drawings.length > 0" content="复制所选图元" placement="top" trigger-display="contents">
      <button
        type="button"
        class="toolbar-btn toolbar-btn--copy"
        aria-label="复制所选图元"
        @click="emit('copy')"
      >
        <IconTablerCopy class="lock-icon" aria-hidden="true" />
      </button>
    </BaseTooltip>

    <BaseTooltip v-if="drawings.length > 0" content="隐藏所选图元" placement="top" trigger-display="contents">
      <button
        type="button"
        class="toolbar-btn toolbar-btn--visibility"
        aria-label="隐藏所选图元"
        @click="emit('hide')"
      >
        <IconTablerEyeOff class="lock-icon" aria-hidden="true" />
      </button>
    </BaseTooltip>

    <BaseTooltip v-if="drawings.length > 0" :content="allLocked ? '解锁' : '锁定'" placement="top" trigger-display="contents">
      <button
        type="button"
        class="toolbar-btn toolbar-btn--lock"
        :class="{ 'is-locked': allLocked }"
        :aria-label="allLocked ? '解锁' : '锁定'"
        @click="onToggleLock"
      >
        <IconTablerLock v-if="allLocked" class="lock-icon" aria-hidden="true" />
        <IconTablerLockOpen v-else class="lock-icon" aria-hidden="true" />
      </button>
    </BaseTooltip>

    <!-- 锁定只冻结几何拖动与删除；样式等编辑照常可用。 -->
    <BaseTooltip v-if="drawings.length > 0" content="删除" placement="top" trigger-display="contents">
      <button
        type="button"
        class="toolbar-btn toolbar-btn--delete"
        aria-label="删除"
        :disabled="allLocked"
        @click="emit('delete')"
      >
        <svg
          class="delete-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      </button>
    </BaseTooltip>
  </CanvasToolbar>
</template>

<script setup lang="ts">
  import type {
    DrawingLabelPosition,
    DrawingObject,
    DrawingStyle,
  } from '@363045841yyt/klinechart-core/controllers'
  import ColorPicker from '@vue-src/components/color/impl/ColorPicker.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import CanvasToolbar from '@vue-src/components/common/CanvasToolbar.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import { computed, onMounted, onUnmounted } from 'vue'
  import IconTablerAlignCenter from '~icons/tabler/align-center'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerAlignRight from '~icons/tabler/align-right'
  import IconTablerBookmarks from '~icons/tabler/bookmarks'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconTablerCopy from '~icons/tabler/copy'
  import IconTablerEyeOff from '~icons/tabler/eye-off'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerLockOpen from '~icons/tabler/lock-open'
  import IconTablerSettings from '~icons/tabler/settings'
  import DrawingTemplateMenu from './DrawingTemplateMenu.vue'

  const widthOptions = [
    { label: '1px', value: '1' },
    { label: '2px', value: '2' },
    { label: '3px', value: '3' },
    { label: '4px', value: '4' },
  ]

  const styleOptions = [
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点线', value: 'dotted' },
  ] as const

  const positionOptions = [
    { value: 'start', label: '起点', icon: IconTablerAlignLeft },
    { value: 'center', label: '居中', icon: IconTablerAlignCenter },
    { value: 'end', label: '终点', icon: IconTablerAlignRight },
  ] as const

  const props = withDefaults(
    defineProps<{
      drawings: ReadonlyArray<DrawingObject>
      editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
      lineLabelPosition?: DrawingLabelPosition
      templateNames?: ReadonlyArray<string>
      templateError?: string
      templateSaved?: string | null
      canUseTemplates?: boolean
    }>(),
    { canUseTemplates: true },
  )

  const emit = defineEmits<{
    (e: 'updateStyle', style: Partial<DrawingStyle>): void
    (e: 'delete'): void
    (e: 'toggleLock', locked: boolean): void
    (e: 'hide'): void
    (e: 'copy'): void
    (e: 'updateLineLabelPosition', position: DrawingLabelPosition): void
    (e: 'openSettings', drawingId: string): void
    (e: 'openTemplates'): void
    (e: 'saveTemplate'): void
    (e: 'applyTemplate', name: string): void
    (e: 'deleteTemplate', name: string): void
    (e: 'saveExistingTemplate', name: string): void
  }>()

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'Delete') {
      e.preventDefault()
      emit('delete')
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeyDown))
  onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

  /** 批量编辑展示首个图元的当前值；写入仅限 Core 确认的字段交集。 */
  const style = computed(() => props.drawings[0]?.style ?? null)
  const widthGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'width',
      label: '',
      items: widthOptions.map((option) => ({
        id: option.value,
        label: option.label,
        active: Number(option.value) === (style.value?.strokeWidth ?? 1),
      })),
    },
  ])
  const styleGroups = computed<DropMenuGroup[]>(() => [
    {
      id: 'style',
      label: '',
      items: styleOptions.map((option) => ({
        id: option.value,
        label: option.label,
        active: option.value === (style.value?.strokeStyle ?? 'solid'),
      })),
    },
  ])
  const selectedStyleLabel = computed(
    () =>
      styleOptions.find((option) => option.value === (style.value?.strokeStyle ?? 'solid'))?.label,
  )

  /** 从菜单选项中解析线型，再提交类型明确的样式变更。 */
  function selectLineStyle(_groupId: string, value: string): void {
    const option = styleOptions.find((option) => option.value === value)
    if (option) onLineStyleChange(option.value)
  }
  function canEdit(key: keyof DrawingStyle): boolean {
    return props.editableStyleKeys.includes(key)
  }

  /** 全部选中图元均已锁定；混合选中视为未完全锁定。 */
  const allLocked = computed(
    () => props.drawings.length > 0 && props.drawings.every((drawing) => drawing.locked === true),
  )

  function onToggleLock() {
    emit('toggleLock', !allLocked.value)
  }

  function onColorChange(color: string) {
    emit('updateStyle', { stroke: color })
  }

  function onWidthChange(width: number) {
    emit('updateStyle', { strokeWidth: width })
  }

  function onLineStyleChange(style: 'solid' | 'dashed' | 'dotted') {
    emit('updateStyle', { strokeStyle: style })
  }
</script>

<style scoped src="../common/selection-menu.css"></style>
<style scoped>
  .selection-count {
    padding: 0 4px;
    color: var(--klc-color-ui-text-soft);
    font-size: 12px;
    white-space: nowrap;
  }

  .label-position {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .label-position .toolbar-btn.label-position__button {
    flex: 0 0 26px;
    width: 26px;
    padding: 0;
    box-sizing: border-box;
  }

  .label-position__button :deep(svg) {
    flex: none;
    width: 18px;
    height: 18px;
  }

  .label-position__button.is-active {
    color: var(--klc-color-ui-accent);
    background: color-mix(in srgb, var(--klc-color-ui-accent) 16%, transparent);
  }
</style>
