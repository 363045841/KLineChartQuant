<!--
  下拉菜单：触发器 + 受控面板。
  开关状态与焦点意图由自身持有，面板只按 open 渲染、把关闭意图回传。
-->
<template>
  <div class="drop-menu" :class="{ 'drop-menu--fill': fill }">
    <!-- 触发器提示固定向上：提示方向与菜单弹出方向无关，同一工具栏里不会出现一上一下。 -->
    <BaseTooltip
      :content="tooltip ? label : ''"
      :placement="tooltipPlacement"
      :disabled="open || disabled"
      :command="command"
      :fill="fill"
    >
      <ControlTrigger
        ref="triggerControl"
        :class="triggerClass"
        :label="label"
        aria-haspopup="menu"
        :aria-expanded="open"
        :disabled="disabled"
        @pointerdown="onTriggerPointerDown"
        @click="onTriggerClick"
        @keydown="onTriggerKeydown"
      >
        <slot name="trigger" :open="open">{{ label }}</slot>
      </ControlTrigger>
    </BaseTooltip>
    <MenuSurface
      ref="surface"
      :open="open"
      :anchor="anchor"
      :label="label"
      :groups="groups"
      :message="message"
      :empty-text="emptyText"
      :density="density"
      :keep-open-on-select="keepOpenOnSelect"
      :placement="placement"
      :focus-on-open="focusOnOpen"
      @update:open="open = $event"
      @open="emit('open')"
      @close="emit('close')"
      @select="onSelect"
    >
      <template v-if="$slots.header" #header>
        <slot name="header" />
      </template>
      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
      <template v-if="$slots.item" #item="scope">
        <slot name="item" v-bind="scope" />
      </template>
      <template v-if="$slots['item-action']" #item-action="scope">
        <slot name="item-action" v-bind="scope" />
      </template>
    </MenuSurface>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, useTemplateRef } from 'vue'
  import type { TooltipPlacement } from '@vue-src/composables/ui/useTooltip.js'
  import BaseTooltip from './BaseTooltip.vue'
  import ControlTrigger from './ControlTrigger.vue'
  import type { DropMenuGroup, MenuAnchor } from './dropMenuTypes.js'
  import MenuSurface from './MenuSurface.vue'

  export type { DropMenuGroup, DropMenuItem } from './dropMenuTypes.js'

  const props = withDefaults(
    defineProps<{
      label: string
      /** 分组列表；body 模式不需要分组内容，可省略。 */
      groups?: ReadonlyArray<DropMenuGroup>
      disabled?: boolean
      triggerClass?: string
      /** 菜单相对触发按钮的弹出方向。 */
      placement?: 'auto' | 'top' | 'bottom'
      /** 关联命令 id；存在时按钮提示追加该命令的快捷键。 */
      command?: string
      /** 触发器提示方向；默认向上，顶部工具栏这类触发器贴页面顶边时传 bottom。 */
      tooltipPlacement?: TooltipPlacement
      /** 触发器是否展示提示；文字已表达含义的入口可关闭。 */
      tooltip?: boolean
      message?: string
      /** 分组为空时展示的提示；未提供时不渲染空提示。 */
      emptyText?: string
      /** 菜单项行高；默认松散，短选项列表可使用紧凑模式。 */
      density?: 'compact' | 'loose'
      /** 菜单项选中后是否保持打开。 */
      keepOpenOnSelect?: boolean
      /** 撑满父容器：设置行里的下拉与输入同宽，轴边入口占满整格。 */
      fill?: boolean
    }>(),
    { tooltipPlacement: 'top', tooltip: true },
  )

  const emit = defineEmits<{
    select: [groupId: string, itemId: string, parentId?: string]
    open: []
    close: []
  }>()

  /** 非受控开关：触发器负责开合，面板只读它。 */
  const open = ref(false)
  /** 本次打开是否把焦点移入菜单项；指针打开保持 false。 */
  const focusOnOpen = ref(false)
  const triggerControl = useTemplateRef<InstanceType<typeof ControlTrigger>>('triggerControl')
  const triggerElement = computed(() => triggerControl.value?.element ?? null)
  const anchor = computed<MenuAnchor | null>(() =>
    triggerElement.value ? { kind: 'element', element: triggerElement.value } : null,
  )
  const surface = useTemplateRef<InstanceType<typeof MenuSurface>>('surface')

  // 面板在 pointerdown 阶段可能已被原生 popover 或退化层关闭，据此区分"点开"与"点关"。
  let openBeforePointerDown = false
  // 最近一次打开是否由指针发起：指针打开只预置 tabindex，键盘/程序触发才移入焦点。
  let pointerOpened = false

  function onTriggerPointerDown(): void {
    openBeforePointerDown = open.value
    pointerOpened = true
  }

  function onTriggerClick(): void {
    if (openBeforePointerDown) {
      open.value = false
      return
    }
    focusOnOpen.value = !pointerOpened
    open.value = true
  }

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      // 已展开时把焦点从触发器移进面板；否则以键盘意图打开，由面板聚焦首项。
      if (open.value) surface.value?.focusFirst()
      else {
        pointerOpened = false
        focusOnOpen.value = true
        open.value = true
      }
    } else if (event.key === 'Escape' && open.value) {
      event.preventDefault()
      event.stopPropagation()
      open.value = false
    }
  }

  /** 选择事件按原有参数个数转发：顶层两项，二级菜单带父项 id。 */
  function onSelect(groupId: string, itemId: string, parentId?: string): void {
    if (parentId === undefined) emit('select', groupId, itemId)
    else emit('select', groupId, itemId, parentId)
  }
</script>

<style scoped>
  /* 撑满父容器：触发按钮随之铺满，轴边/设置行不再需要穿透改尺寸。 */
  .drop-menu--fill {
    display: block;
    width: 100%;
    height: 100%;
  }

  .drop-menu--fill .drop-menu__trigger {
    width: 100%;
  }

  .drop-menu {
    flex: 0 0 auto;
  }
</style>
