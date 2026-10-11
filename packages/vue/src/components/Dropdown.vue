<template>
  <div class="dropdown" :class="[`dropdown--${size}`, { 'is-open': isOpen }]">
    <BaseTooltip
      :content="title"
      placement="top"
      :disabled="!title || isOpen"
      trigger-display="contents"
    >
      <button
        ref="trigger"
        type="button"
        class="control-button dropdown__trigger"
        :class="{ 'control-button--sm': size === 'sm' }"
        :style="triggerStyle"
        v-bind="popover.triggerBindings.value"
        :aria-label="ariaLabel"
        aria-haspopup="listbox"
        :disabled="disabled"
        @click="popover.onTriggerClick"
        @keydown="onTriggerKeydown"
      >
        <span v-if="label" class="dropdown__label">{{ label }}</span>
        <span class="dropdown__value">{{ selectedOption?.label ?? placeholder }}</span>
        <IconChevronDown class="dropdown__chevron" aria-hidden="true" />
      </button>
    </BaseTooltip>

    <Teleport :to="teleportTarget">
      <div
        ref="menu"
        class="dropdown__menu"
        v-bind="popover.panelBindings.value"
        role="listbox"
        :aria-label="ariaLabel || label || title || undefined"
        @keydown="onMenuKeydown"
      >
        <template v-if="isOpen">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="dropdown__option"
            :class="{ 'is-selected': option.value === selectedValue }"
            role="option"
            tabindex="-1"
            :aria-selected="option.value === selectedValue"
            @click="selectOption(option.value)"
          >
            {{ option.label }}
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, useTemplateRef } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'

  import { useAnchoredPopover } from '../composables/overlay/useAnchoredPopover.js'
  import { useRovingFocus } from '../composables/overlay/useRovingFocus.js'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import BaseTooltip from './common/BaseTooltip.vue'

  export interface DropdownOption<T extends string = string> {
    label: string
    value: T
  }

  const props = withDefaults(
    defineProps<{
      modelValue?: string
      options: DropdownOption[]
      size?: 'sm' | 'md'
      minWidth?: string
      maxHeight?: string
      placement?: 'auto' | 'top' | 'bottom'
      label?: string
      title?: string
      /** 触发器按钮的无障碍名称 */
      ariaLabel?: string
      placeholder?: string
      allowEmpty?: boolean
      disabled?: boolean
    }>(),
    {
      size: 'md',
      maxHeight: 'min(320px, calc(100vh - 24px))',
      placement: 'auto',
      title: '',
      placeholder: '',
      allowEmpty: false,
      disabled: false,
    },
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', level: string): void
    (e: 'open'): void
  }>()

  const triggerRef = useTemplateRef<HTMLElement>('trigger')
  const menuRef = useTemplateRef<HTMLElement>('menu')
  const teleportTarget = useFullscreenTeleportTarget()

  const popover = useAnchoredPopover({
    trigger: triggerRef,
    panel: menuRef,
    placement: () => props.placement,
    offset: 4,
    matchTriggerWidth: () => !props.minWidth,
    maxHeight: () => props.maxHeight,
    disabled: () => props.disabled,
    onOpen: () => {
      emit('open')
      // 打开后焦点进入列表并落在已选项（APG listbox）。
      roving.focusFirst('[aria-selected="true"]')
    },
  })
  const isOpen = popover.open
  const roving = useRovingFocus(menuRef)

  const triggerStyle = computed(() => (props.minWidth ? { minWidth: props.minWidth } : {}))

  const selectedValue = computed(() => {
    const val = props.modelValue?.trim()
    const found = val && props.options.some((option) => option.value === val)
    return found || props.allowEmpty ? (val ?? '') : (props.options[0]?.value ?? '')
  })

  const selectedOption = computed(() => {
    return (
      props.options.find((option) => option.value === selectedValue.value) ??
      (props.allowEmpty ? undefined : props.options[0])
    )
  })

  function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      popover.show()
    } else if (event.key === 'Escape' && isOpen.value) {
      event.preventDefault()
      event.stopPropagation()
      popover.hide({ restoreFocus: true })
    }
  }

  function onMenuKeydown(event: KeyboardEvent): void {
    if (roving.onKeydown(event)) return
    if (event.key === 'Tab') {
      // Tab 离开列表：关闭并把焦点交还触发器，再由默认行为移到下一个可聚焦元素。
      popover.hide({ restoreFocus: true })
    }
  }

  function selectOption(value: string) {
    emit('update:modelValue', value)
    popover.hide({ restoreFocus: true })
  }
</script>

<style scoped src="./common/control-button.css"></style>

<style scoped>
  .dropdown {
    position: relative;
    flex: 0 0 auto;
  }

  .dropdown__trigger {
    /* Dropdown 的主题接口映射到共享按钮变量，供 Agent 等场景定制外观。 */
    --control-button-border: var(--dropdown-trigger-border);
    --control-button-background: var(--dropdown-trigger-background);
    --control-button-color: var(--dropdown-trigger-color);
    --control-button-active-border: var(--dropdown-trigger-active-border);
    --control-button-active-background: var(--dropdown-trigger-active-background);
    --control-button-focus-border: var(--dropdown-trigger-focus-border);
    --control-button-focus-background: var(--dropdown-trigger-focus-background);
    --control-button-focus-shadow: var(--dropdown-trigger-focus-shadow);
  }

  .dropdown__label {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-md);
    line-height: 1;
    white-space: nowrap;
  }

  .dropdown__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--dropdown-trigger-color, var(--klc-color-ui-text));
    font-size: var(--klc-text-13-font-size, 13px);
    font-weight: 500;
    /* 为字体下沿留出空间，避免省略号裁切区域截断文字。 */
    line-height: 1.4;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown--sm .dropdown__value {
    font-size: var(--klc-typography-font-size-md);
    min-width: 24px;
  }

  .dropdown__chevron {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--dropdown-trigger-chevron, var(--klc-color-ui-muted));
    transition: transform var(--klc-motion-duration-fast) ease;
  }

  .dropdown.is-open .dropdown__chevron {
    transform: rotate(180deg);
  }

  .dropdown__menu {
    padding: var(--klc-space-4, 4px);
    border: 0;
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-text);
    box-shadow: var(--klc-elevation-2, 0 2px 4px rgb(0 0 0 / 0.08), 0 6px 12px rgb(0 0 0 / 0.06));
    box-sizing: border-box;
    overflow-y: auto;
  }

  /* 空的关闭态面板不占位（退化模式下由 display: none 隐藏）。 */
  .dropdown__menu:empty {
    padding: 0;
  }

  .dropdown__option {
    width: 100%;
    height: calc(12px + 2 * var(--klc-spacing-sm));
    display: flex;
    align-items: center;
    padding: 0 var(--klc-spacing-sm);
    border: 0;
    border-radius: var(--klc-radius-xs, 4px);
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: var(--klc-text-13-font-size, 13px);
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--klc-motion-duration-fast) ease;
  }

  .dropdown--sm .dropdown__option {
    height: calc(8px + 2 * var(--klc-spacing-sm));
    padding: 0 var(--klc-space-8, 8px);
    font-size: var(--klc-typography-font-size-md);
    white-space: nowrap;
  }

  .dropdown__option:hover,
  .dropdown__option:focus-visible {
    background: var(--klc-color-ui-hover);
    outline: 0;
  }

  .dropdown__option.is-selected {
    color: var(--klc-color-ui-accent);
    font-weight: 700;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .dropdown--md .dropdown__label {
      display: none;
    }

    .dropdown--md .dropdown__value {
      min-width: 42px;
      font-size: var(--klc-typography-font-size-md);
    }

    .dropdown--md .dropdown__option {
      height: 26px;
      font-size: var(--klc-typography-font-size-md);
    }
  }
</style>
