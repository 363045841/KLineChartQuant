<template>
  <div ref="rootRef" class="dropdown" :class="[`dropdown--${size}`, { 'is-open': isOpen }]">
    <button
      ref="triggerRef"
      type="button"
      class="dropdown__trigger"
      :title="title"
      :style="triggerStyle"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="toggleOpen"
      @keydown.escape.stop="close"
      @keydown.down.prevent="open"
      @keydown.enter.prevent="toggleOpen"
      @keydown.space.prevent="toggleOpen"
    >
      <span v-if="label" class="dropdown__label">{{ label }}</span>
      <span class="dropdown__value">{{ selectedOption.label }}</span>
      <span class="dropdown__chevron" aria-hidden="true"></span>
    </button>

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
import { useTeleportedPopup } from '../composables/useTeleportedPopup'
import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'

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
    label?: string
    title?: string
  }>(),
  {
    size: 'md',
    title: '',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', level: string): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const menuWidth = ref(0)
const dropdownId = ++dropdownIdSeed

const teleportTarget = useFullscreenTeleportTarget()

const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
  triggerRef,
  menuRef,
  4,
)

const triggerStyle = computed(() => {
  if (props.minWidth) return { minWidth: props.minWidth }
  return {}
})

const menuStyle = computed(() => {
  if (!isOpen.value) return undefined
  const w = menuWidth.value || (props.minWidth ? parseInt(props.minWidth) : 0)
  return {
    width: w ? `${w}px` : undefined,
    ...popupStyle.value,
  }
})

const selectedValue = computed(() => {
  const val = props.modelValue?.trim()
  const found = val && props.options.some((option) => option.value === val)
  return found ? val : (props.options[0]?.value ?? '')
})

const selectedOption = computed(() => {
  return props.options.find((option) => option.value === selectedValue.value) ?? props.options[0]
})

function open() {
  if (activeDropdownId !== dropdownId && activeDropdownClose) {
    activeDropdownClose()
  }

  if (isOpen.value) return

  activeDropdownId = dropdownId
  activeDropdownClose = close
  menuWidth.value = triggerRef.value?.offsetWidth ?? 0
  isOpen.value = true
  startPositionSync()
  document.addEventListener('pointerdown', handleDocumentPointerDown)
}

function close() {
  if (!isOpen.value) return
  isOpen.value = false
  if (activeDropdownId === dropdownId) {
    activeDropdownId = 0
    activeDropdownClose = null
  }
  stopPositionSync()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
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

function handleDocumentPointerDown(event: PointerEvent) {
  const root = rootRef.value
  const menu = menuRef.value
  if (root && !root.contains(event.target as Node | null) && !menu?.contains(event.target as Node | null)) {
    close()
  }
}

onBeforeUnmount(close)
</script>

<style scoped>
.dropdown {
  position: relative;
  flex: 0 0 auto;
}

.dropdown__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 4px;
  background: var(--klc-color-background);
  color: var(--klc-color-foreground);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.dropdown--md .dropdown__trigger {
  height: 28px;
}

.dropdown--sm .dropdown__trigger {
  height: 24px;
  padding: 0 6px;
  gap: 4px;
}

.dropdown__trigger:hover,
.dropdown__trigger:focus-visible,
.dropdown.is-open .dropdown__trigger {
  border-color: var(--klc-color-axis-text);
  background: var(--klc-color-grid-minor);
  outline: 0;
}

.dropdown__label {
  color: var(--klc-color-axis-text);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.dropdown__value {
  flex: 1 1 auto;
  color: var(--klc-color-foreground);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  text-align: left;
  white-space: nowrap;
}

.dropdown--sm .dropdown__value {
  font-size: 12px;
  min-width: 24px;
}

.dropdown__chevron {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--klc-color-axis-text);
  transition: transform 0.15s ease;
}

.dropdown.is-open .dropdown__chevron {
  transform: rotate(180deg);
}

.dropdown__menu {
  z-index: 1010;
  padding: 4px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 4px;
  background: var(--klc-color-background);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
}

.dropdown__option {
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--klc-color-foreground);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.dropdown--sm .dropdown__option {
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  white-space: nowrap;
}

.dropdown__option:hover,
.dropdown__option:focus-visible {
  background: var(--klc-color-grid-minor);
  outline: 0;
}

.dropdown__option.is-selected {
  color: var(--klc-color-up);
  font-weight: 700;
}

@media (max-width: 768px), (max-height: 640px) {
  .dropdown--md .dropdown__trigger {
    height: 26px;
    gap: 4px;
    padding: 0 6px;
  }

  .dropdown--md .dropdown__label {
    display: none;
  }

  .dropdown--md .dropdown__value {
    min-width: 42px;
    font-size: 12px;
  }

  .dropdown--md .dropdown__option {
    height: 26px;
    font-size: 12px;
  }
}
</style>