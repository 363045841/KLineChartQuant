<!-- 指标参数弹窗：按草稿中的模式选择显示适用参数。 -->
<template>
  <BaseModal
    :open="visible"
    :title="dialogTitle"
    width="min(92vw, 360px)"
    footer-align="space-between"
    @update:open="!$event && emit('close')"
  >
    <template #header-extra>
      <BaseTooltip content="显示/隐藏说明" placement="bottom">
        <button
          type="button"
          class="toggle-desc-btn"
          :class="{ active: showDescription }"
          aria-label="显示或隐藏参数说明"
          :aria-pressed="showDescription"
          @click="showDescription = !showDescription"
        >
          <IconTablerHelpCircle aria-hidden="true" />
        </button>
      </BaseTooltip>
    </template>

    <Transition name="slide">
      <div v-if="showDescription && indicatorDescription" class="indicator-description">
        <p>{{ indicatorDescription }}</p>
      </div>
    </Transition>

    <div class="params-body">
      <IndicatorParamItem
        v-for="param in visibleParams"
        :key="param.key"
        :param="param"
        :value="localValues[param.key]"
        :show-description="showDescription"
        @update="setValue(param.key, $event)"
      />
    </div>

    <template #footer>
      <BaseButton @click="onReset">重置</BaseButton>
      <div class="footer-right">
        <BaseButton @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" @click="onConfirm">确定</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/BaseButton.vue'
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import { computed } from 'vue'
  import IconTablerHelpCircle from '~icons/tabler/help-circle'
  import type { IndicatorParamsDialogProps, IndicatorParamValues } from '../types.js'
  import IndicatorParamItem from './IndicatorParamItem.vue'
  import { useIndicatorParams } from './useIndicatorParams.js'

  const props = defineProps<IndicatorParamsDialogProps>()

  const emit = defineEmits<{
    close: []
    confirm: [values: IndicatorParamValues]
  }>()

  /** 弹窗标题统一为「参数设置 · 指标名」。 */
  const dialogTitle = computed(() => `参数设置 · ${props.indicatorName}`)

  const { localValues, visibleParams, showDescription, setValue, onReset } =
    useIndicatorParams(props)

  /** 提交参数草稿并关闭弹窗。 */
  function onConfirm() {
    emit('confirm', { ...localValues.value })
  }
</script>

<style scoped>
  /* ── 参数列表 ── */
  .params-body {
    display: flex;
    flex-direction: column;
  }

  /* ── 指标描述 ── */
  .indicator-description {
    margin-bottom: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--klc-color-ui-accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--klc-color-ui-accent) 20%, transparent);
  }

  .indicator-description p {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--klc-color-ui-muted);
  }

  /* ── 描述切换按钮 ── */
  .toggle-desc-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--base-modal-header-action-size);
    height: var(--base-modal-header-action-size);
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }

  .toggle-desc-btn.active {
    color: var(--klc-color-ui-accent);
    background: color-mix(in srgb, var(--klc-color-ui-accent) 14%, transparent);
  }

  .toggle-desc-btn:focus-visible {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: 1px;
  }

  .toggle-desc-btn svg {
    width: 16px;
    height: 16px;
  }

  /* ── 底部 ── */
  .footer-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── 指标描述的展开/收起动画 ── */
  .slide-enter-active,
  .slide-leave-active {
    transition:
      opacity 0.2s ease,
      max-height 0.2s ease,
      margin 0.2s ease;
    overflow: hidden;
    max-height: 200px;
  }

  .slide-enter-from,
  .slide-leave-to {
    opacity: 0;
    max-height: 0;
    margin-top: 0;
    margin-bottom: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .slide-enter-active,
    .slide-leave-active {
      transition: none;
    }
  }
</style>
