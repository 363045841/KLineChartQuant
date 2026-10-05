<!-- 公共取色器：可拖动色板、常用 Token 色块和屏幕取色。 -->
<template>
  <button
    ref="triggerRef"
    type="button"
    class="color-picker__trigger"
    :aria-label="label"
    aria-haspopup="dialog"
    :aria-expanded="isOpen"
    :disabled="disabled"
    @click="toggle"
    @keydown.escape.stop="close(true)"
  >
    <span class="color-picker__preview" :style="{ backgroundColor: modelValue }"></span>
  </button>
  <Teleport :to="teleportTarget">
    <section
      v-if="isOpen"
      ref="panelRef"
      class="color-picker__panel"
      :style="panelStyle"
      role="dialog"
      :aria-label="`${label}选择器`"
      @keydown.escape.stop.prevent="close(true)"
      @keydown.delete.stop
    >
      <div class="color-picker__heading">常用颜色</div>
      <div class="color-picker__grid" role="group" aria-label="常用颜色">
        <button
          v-for="color in commonColors"
          :key="color.token"
          type="button"
          class="color-picker__swatch"
          :style="{ backgroundColor: `var(--klc-color-${color.token})` }"
          :aria-label="color.label"
          :title="color.label"
          @click="selectCommon"
        ></button>
      </div>
      <template v-if="customColors.length">
        <div class="color-picker__heading">自定义颜色</div>
        <div class="color-picker__grid" role="group" aria-label="自定义颜色">
          <button
            v-for="color in customColors"
            :key="color"
            type="button"
            class="color-picker__swatch"
            :style="{ backgroundColor: color }"
            :aria-label="color"
            :title="color"
            :aria-pressed="modelValue === color"
            @click="select(color)"
          ></button>
        </div>
      </template>
      <div
        class="color-picker__plane"
        :style="{ backgroundColor: hueColor }"
        tabindex="0"
        role="group"
        :aria-label="`饱和度 ${Math.round(color.saturation * 100)}%，明度 ${Math.round(color.brightness * 100)}%，使用方向键调整`"
        @pointerdown="moveOnPlane"
        @pointermove="moveOnPlane"
        @pointerup="endPlaneDrag"
        @pointercancel="endPlaneDrag"
        @keydown="onPlaneKey"
      >
        <span class="color-picker__cursor" :style="cursorStyle" aria-hidden="true"></span>
      </div>
      <label class="color-picker__slider-row">
        <span>色相</span>
        <input class="color-picker__hue" type="range" min="0" max="360" step="1" :value="color.hue" aria-label="色相" @input="onSliderInput($event, 'hue')" />
      </label>
      <label class="color-picker__slider-row">
        <span>透明度</span>
        <input class="color-picker__alpha" type="range" min="0" max="1" step="0.01" :value="color.alpha" :style="{ '--picker-opaque': opaqueColor }" aria-label="透明度" @input="onSliderInput($event, 'alpha')" />
      </label>
      <form class="color-picker__entry" @submit.prevent="addColor(draft)">
        <input v-model="draft" type="text" aria-label="颜色值" :aria-invalid="invalid" spellcheck="false" @input="invalid = false" @change="onDraftChange" />
        <button type="submit" class="color-picker__action">确认</button>
      </form>
      <p v-if="invalid" class="color-picker__message" role="alert">请输入有效的颜色值</p>
      <div class="color-picker__actions">
        <button v-if="eyeDropper" type="button" class="color-picker__action" :disabled="picking" @click="pickScreen">屏幕取色</button>
      </div>
      <p v-if="screenError" class="color-picker__message" role="status">{{ screenError }}</p>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
  import { useColorPicker } from './color-picker/impl/useColorPicker.js'
  import type { ColorPickerProps } from './color-picker/types.js'

  const props = defineProps<ColorPickerProps>()
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
  const {
    triggerRef,
    panelRef,
    isOpen,
    draft,
    invalid,
    picking,
    color,
    hueColor,
    opaqueColor,
    cursorStyle,
    teleportTarget,
    panelStyle,
    commonColors,
    customColors,
    eyeDropper,
    screenError,
    toggle,
    close,
    select,
    selectCommon,
    addColor,
    moveOnPlane,
    endPlaneDrag,
    onPlaneKey,
    onSliderInput,
    onDraftChange,
    pickScreen,
  } = useColorPicker(props, (color) => emit('update:modelValue', color))
</script>

<style scoped>
  .color-picker__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 4px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-control-background);
    cursor: pointer;
  }
  .color-picker__preview {
    width: 100%;
    height: 100%;
    border-radius: 3px;
  }
  .color-picker__panel {
    box-sizing: border-box;
    width: 248px;
    max-width: calc(100vw - 16px);
    overflow: auto;
    padding: 14px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 10px;
    background: var(--klc-color-floating-surface);
    color: var(--klc-color-ui-text);
    box-shadow: 0 4px 16px var(--klc-color-ui-panel-shadow);
    font-family: var(--klc-typography-font-family);
    font-size: 12px;
  }
  .color-picker__heading {
    margin-bottom: 8px;
    color: var(--klc-color-ui-muted);
  }
  .color-picker__plane {
    position: relative;
    height: 150px;
    margin-bottom: 12px;
    border-radius: 6px;
    background-image:
      linear-gradient(to top, var(--klc-color-picker-black), transparent),
      linear-gradient(to right, var(--klc-color-picker-white), transparent);
    cursor: crosshair;
    touch-action: none;
  }
  .color-picker__cursor {
    position: absolute;
    box-sizing: border-box;
    width: 12px;
    height: 12px;
    border: 2px solid var(--klc-color-picker-white);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--klc-color-picker-black);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .color-picker__slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    color: var(--klc-color-ui-muted);
  }
  .color-picker__slider-row span { width: 36px; flex-shrink: 0; }
  .color-picker__slider-row input {
    appearance: none;
    width: 100%;
    min-width: 0;
    height: 10px;
    margin: 0;
    border-radius: 5px;
    cursor: pointer;
    touch-action: none;
  }
  .color-picker__hue { background: var(--klc-color-picker-spectrum); }
  .color-picker__alpha {
    background: linear-gradient(to right, transparent, var(--picker-opaque)), var(--klc-color-ui-border);
  }
  .color-picker__slider-row input::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 2px solid var(--klc-color-picker-white);
    border-radius: 50%;
    background: transparent;
    box-shadow: 0 0 0 1px var(--klc-color-picker-black);
  }
  .color-picker__slider-row input::-moz-range-thumb {
    width: 10px;
    height: 10px;
    border: 2px solid var(--klc-color-picker-white);
    border-radius: 50%;
    background: transparent;
    box-shadow: 0 0 0 1px var(--klc-color-picker-black);
  }
  .color-picker__grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }
  .color-picker__swatch {
    height: 28px;
    padding: 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 5px;
    cursor: pointer;
  }
  .color-picker__entry, .color-picker__actions {
    display: flex;
    gap: 8px;
  }
  .color-picker__entry input {
    box-sizing: border-box;
    min-width: 0;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 5px;
    background: var(--klc-color-ui-input);
    color: var(--klc-color-ui-text);
    font: inherit;
  }
  .color-picker__actions { margin-top: 10px; }
  .color-picker__action {
    flex-shrink: 0;
    padding: 6px 8px;
    border: none;
    border-radius: 5px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
    font: inherit;
    cursor: pointer;
  }
  .color-picker__trigger:hover, .color-picker__action:hover {
    background: var(--klc-color-ui-hover);
  }
  button:focus-visible, input:focus-visible, .color-picker__plane:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }
  button:disabled { cursor: default; opacity: 0.5; }
  .color-picker__message { margin: 8px 0 0; color: var(--klc-color-ui-muted); }
</style>
