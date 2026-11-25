<!-- 定义参数弹窗：按草稿中的模式选择显示适用参数；指标与警报共用。 -->
<template>
  <BaseModal
    :open="visible"
    :title="dialogTitle"
    size="xs"
    footer-align="space-between"
    @update:open="!$event && emit('close')"
  >
    <template #header-extra>
      <BaseTooltip content="显示/隐藏说明" placement="bottom">
        <BaseIconButton
          class="toggle-desc-btn"
          :class="{ active: showDescription }"
          label="显示或隐藏参数说明"
          :aria-pressed="showDescription"
          @click="showDescription = !showDescription"
        >
          <IconTablerHelpCircle aria-hidden="true" />
        </BaseIconButton>
      </BaseTooltip>
    </template>

    <Transition name="slide">
      <div v-if="showDescription && description" class="definition-description">
        <p>{{ description }}</p>
      </div>
    </Transition>

    <div class="params-body">
      <ParamItem
        v-for="param in visibleParams"
        :key="param.key"
        :param="param"
        :value="localValues[param.key]"
        @update="setValue(param.key, $event)"
      />
    </div>
    <slot name="after-params" />

    <template #footer>
      <BaseButton @click="reset">重置</BaseButton>
      <div class="footer-right">
        <BaseButton @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" @click="onConfirm">确定</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseIconButton from '@vue-src/components/common/button/BaseIconButton.vue'
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import BaseTooltip from '@vue-src/components/common/overlay/BaseTooltip.vue'
  import { computed } from 'vue'
  import IconTablerHelpCircle from '~icons/tabler/help-circle'
  import type { ParamsDialogProps, ParamValues } from '../types.js'
  import ParamItem from './ParamItem.vue'
  import { useParams } from './useParams.js'

  const props = defineProps<ParamsDialogProps>()

  const emit = defineEmits<{
    close: []
    reset: []
    confirm: [values: ParamValues]
  }>()

  /** 弹窗标题统一为「参数设置 · 定义名」。 */
  const dialogTitle = computed(() => `参数设置 · ${props.definitionName}`)

  const { localValues, visibleParams, showDescription, setValue, onReset } = useParams(props)

  function reset() {
    onReset()
    emit('reset')
  }

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

  /* ── 定义说明 ── */
  .definition-description {
    margin-bottom: 8px;
    margin-inline: var(--base-modal-content-inset);
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--klc-color-ui-notice-background);
    border: 1px solid var(--klc-color-ui-border);
  }

  .definition-description p {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--klc-color-ui-muted);
  }

  /* ── 描述切换按钮 ── */
  .toggle-desc-btn {
    --base-icon-button-size: var(--base-modal-header-action-size);
    --base-icon-button-radius: var(--klc-radius-md, 8px);
  }

  .toggle-desc-btn.active {
    --base-icon-button-color: var(--klc-color-ui-accent);
    --base-icon-button-hover-color: var(--klc-color-ui-accent);
    --base-icon-button-hover-bg: var(--klc-color-ui-hover);
  }

  /* ── 底部 ── */
  .footer-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── 定义的展开/收起动画 ── */
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

</style>
