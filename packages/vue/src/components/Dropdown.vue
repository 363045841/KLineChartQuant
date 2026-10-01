<template>
  <div ref="rootRef" class="dropdown" :class="[`dropdown--${size}`, { 'is-open': isOpen }]">
    <BaseTooltip
      :content="title"
      placement="top"
      :disabled="!title || isOpen"
      trigger-display="contents"
    >
      <button
        ref="triggerRef"
        type="button"
        class="control-button dropdown__trigger"
        :class="{ 'control-button--sm': size === 'sm' }"
        :style="triggerStyle"
        :aria-label="ariaLabel"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        :disabled="disabled"
        @click="toggleOpen"
        @keydown.escape.stop="close"
        @keydown.down.prevent="open"
        @keydown.enter.prevent="toggleOpen"
        @keydown.space.prevent="toggleOpen"
      >
        <span v-if="label" class="dropdown__label">{{ label }}</span>
        <span class="dropdown__value">{{ selectedOption?.label ?? placeholder }}</span>
        <span class="dropdown__chevron" aria-hidden="true"></span>
      </button>
    </BaseTooltip>

    <Teleport :to="teleportTarget">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="dropdown__menu"
        :style="menuStyle"
        role="listbox"
        tabindex="-1"
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="dropdown__option"
          :class="{ 'is-selected': option.value === selectedValue }"
          role="option"
          :aria-selected="option.value === selectedValue"
          @click="selectOption(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
  let activeDropdownId = 0
  let activeDropdownClose: (() => void) | null = null
  let dropdownIdSeed = 0
</script>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref } from 'vue'

  import { useClickOutside } from '../composables/useClickOutside.js'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'
  import { useTeleportedPopup } from '../composables/useTeleportedPopup.js'
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

  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLElement | null>(null)
  const menuRef = ref<HTMLElement | null>(null)
  const isOpen = ref(false)
  const dropdownId = ++dropdownIdSeed

  const teleportTarget = useFullscreenTeleportTarget()

  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    triggerRef,
    menuRef,
    4,
    false,
    props.placement,
  )

  // 点击触发器与菜单之外时关闭
  useClickOutside(
    () => [rootRef.value, menuRef.value],
    () => close(),
    { enabled: () => isOpen.value },
  )

  const triggerStyle = computed(() => {
    if (props.minWidth) return { minWidth: props.minWidth }
    return {}
  })

  const menuStyle = computed(() => {
    if (!isOpen.value) return undefined
    const trigger = triggerRef.value
    const { maxHeight: availableHeight, ...positionStyle } = popupStyle.value
    return {
      ...positionStyle,
      minWidth: props.minWidth || (trigger ? `${trigger.offsetWidth}px` : undefined),
      maxHeight: availableHeight ? `min(${props.maxHeight}, ${availableHeight})` : props.maxHeight,
      zIndex: 1010,
    }
  })

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

  function open() {
    if (activeDropdownId !== dropdownId && activeDropdownClose) {
      activeDropdownClose()
    }

    if (isOpen.value) return

    activeDropdownId = dropdownId
    activeDropdownClose = close
    isOpen.value = true
    emit('open')
    startPositionSync()
  }

  function close() {
    if (!isOpen.value) return
    isOpen.value = false
    if (activeDropdownId === dropdownId) {
      activeDropdownId = 0
      activeDropdownClose = null
    }
    stopPositionSync()
  }

  function toggleOpen() {
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  function selectOption(value: string) {
    emit('update:modelValue', value)
    close()
  }

  onBeforeUnmount(close)
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
    font-size: calc(var(--klc-typography-font-size-md) + 1px);
    font-weight: 500;
    line-height: 1;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown--sm .dropdown__value {
    font-size: var(--klc-typography-font-size-md);
    min-width: 24px;
  }

  .dropdown__chevron {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid var(--dropdown-trigger-chevron, var(--klc-color-ui-muted));
    transition: transform var(--klc-motion-duration-fast) ease;
  }

  .dropdown.is-open .dropdown__chevron {
    transform: rotate(180deg);
  }

  .dropdown__menu {
    padding: 4px;
    border: 0;
    border-radius: 8px;
    background: var(--klc-color-ui-input);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.08),
      0 6px 12px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    overflow-y: auto;
  }

  .dropdown__option {
    width: 100%;
    height: calc(12px + 2 * var(--klc-spacing-sm));
    display: flex;
    align-items: center;
    padding: 0 var(--klc-spacing-sm);
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: calc(var(--klc-typography-font-size-md) + 1px);
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--klc-motion-duration-fast) ease;
  }

  .dropdown--sm .dropdown__option {
    height: calc(8px + 2 * var(--klc-spacing-sm));
    padding: 0 6px;
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
