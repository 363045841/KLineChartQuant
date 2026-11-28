<!--
  下拉菜单：触发器 + 受控面板。
  开关状态与焦点意图由自身持有，面板只按 open 渲染、把关闭意图回传。
-->
<template>
  <div class="drop-menu" :class="{ 'drop-menu--fill': fill }">
    <!-- 触发器提示固定向上：提示方向与菜单弹出方向无关，同一工具栏里不会出现一上一下。 -->
    <!-- field 触发器用 contents：按钮直接参与 DropMenu 根的布局，width:100% 才能吃到根节点宽度。 -->
    <BaseTooltip
      :content="tooltip ? label : ''"
      :placement="tooltipPlacement"
      :disabled="open || disabled"
      :fill="fill"
      :trigger-display="triggerVariant === 'field' ? 'contents' : 'inline-flex'"
    >
      <ControlTrigger
        v-bind="buttonProps"
        class="drop-menu__trigger"
        :class="{
          'control-button--sm': triggerSize === 'sm',
          'control-button--field': triggerVariant === 'field',
        }"
        :id="triggerId"
        :label="label"
        :disabled="disabled"
      >
        <slot name="trigger" :open="open">{{ label }}</slot>
      </ControlTrigger>
    </BaseTooltip>
    <MenuSurface
      ref="surface"
      v-bind="menuProps"
      :label="label"
      :groups="groups"
      :empty-text="emptyText"
      :density="density"
      :keep-open-on-select="keepOpenOnSelect"
      :placement="placement"
      :semantics="semantics"
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
      <template v-if="$slots['item-status']" #item-status="scope">
        <slot name="item-status" v-bind="scope" />
      </template>
      <template v-if="$slots['item-action']" #item-action="scope">
        <slot name="item-action" v-bind="scope" />
      </template>
    </MenuSurface>
  </div>
</template>

<script setup lang="ts">
  import { computed, useTemplateRef } from 'vue'
  import type { TooltipPlacement } from '@vue-src/composables/ui/useTooltip.js'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import ControlTrigger from './ControlTrigger.vue'
  import type { DropMenuGroup, MenuPopupSemantics } from './dropMenuTypes.js'
  import MenuSurface from './MenuSurface.vue'
  import { useMenuButton } from './useMenuButton.js'

  export type { DropMenuGroup, DropMenuItem } from './dropMenuTypes.js'

  const props = withDefaults(
    defineProps<{
      label: string
      groups: ReadonlyArray<DropMenuGroup>
      /** 面板语义：纯菜单项用 menu；行内带按钮或输入时用 dialog。 */
      semantics?: MenuPopupSemantics
      disabled?: boolean
      triggerSize?: 'sm'
      /** 触发器外观：field 用于表单里的字段，默认是工具栏文字触发器。 */
      triggerVariant?: 'default' | 'field'
      /** 触发按钮 id；表单可见标签用它建立关联。 */
      triggerId?: string
      /** 菜单相对触发按钮的弹出方向。 */
      placement?: 'auto' | 'top' | 'bottom'
      /** 触发器提示方向；默认向上，顶部工具栏这类触发器贴页面顶边时传 bottom。 */
      tooltipPlacement?: TooltipPlacement
      /** 触发器是否展示提示；文字已表达含义的入口可关闭。 */
      tooltip?: boolean
      /** 分组为空时展示的提示；未提供时不渲染空提示。 */
      emptyText?: string
      /** 下拉默认使用紧凑行高。 */
      density?: 'compact' | 'loose'
      /** 菜单项选中后是否保持打开。 */
      keepOpenOnSelect?: boolean
      /** 撑满父容器：设置行里的下拉与输入同宽，轴边入口占满整格。 */
      fill?: boolean
    }>(),
    { tooltipPlacement: 'top', tooltip: true, density: 'compact', semantics: 'menu', triggerVariant: 'default' },
  )

  const emit = defineEmits<{
    select: [groupId: string, itemId: string, parentId?: string]
    open: []
    close: []
  }>()

  const surface = useTemplateRef<InstanceType<typeof MenuSurface>>('surface')
  const { buttonProps, menuProps } = useMenuButton(
    () => surface.value?.focusFirst(),
    props.semantics,
  )
  const open = computed(() => menuProps.value.open)

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
