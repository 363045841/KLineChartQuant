<template>
  <BaseModal
    :show="providerSettings.toolsOpen"
    :title="text.tools"
    width="min(92vw, 480px)"
    @close="providerSettings.closeTools()"
  >
    <div v-if="providerSettings.tools.length" class="agent-tools">
      <section v-for="tool in providerSettings.tools" :key="tool.name" class="agent-tool">
        <label class="agent-tool__toggle">
          <input type="checkbox" :checked="tool.enabled" @change="setToolEnabled(tool.name, $event)" />
          <span>
            <strong>{{ tool.label }}</strong>
            <small>{{ tool.description }}</small>
          </span>
        </label>
        <label class="agent-tool__parameters">
          <span>{{ text.toolParameters }}</span>
          <textarea
            :value="providerSettings.toolInputs[tool.name] ?? '{}'"
            spellcheck="false"
            @input="setToolInput(tool.name, $event)"
          />
        </label>
        <button
          type="button"
          class="agent-tool__run"
          :disabled="!tool.enabled || providerSettings.runningToolName !== null"
          @click="providerSettings.debugTool(tool.name)"
        >
          {{ providerSettings.runningToolName === tool.name ? text.toolRunning : text.toolRun }}
        </button>
        <p v-if="providerSettings.toolErrors[tool.name]" class="agent-tool__error" role="alert">
          {{ providerSettings.toolErrors[tool.name] }}
        </p>
        <pre v-if="providerSettings.toolResults[tool.name]" class="agent-tool__result">{{
          providerSettings.toolResults[tool.name].content
        }}</pre>
      </section>
    </div>
    <p v-else class="agent-tools__empty">{{ text.noTools }}</p>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  import BaseModal from '../../../components/BaseModal.vue'
  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { AgentProviderSettingsStore } from '../agent-provider-settings-store'

  const props = defineProps<{
    providerSettings: AgentProviderSettingsStore
    locale: AgentLocale
  }>()

  const text = computed(() => getAgentCopy(props.locale))

  /** 将复选框事件转换为持久化的工具启用设置。 */
  function setToolEnabled(name: string, event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    void props.providerSettings.setToolEnabled(name, target.checked)
  }

  /** 保存当前工具的 JSON 参数草稿。 */
  function setToolInput(name: string, event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement)) return
    props.providerSettings.setToolInput(name, target.value)
  }
</script>

<style scoped>
  .agent-tools {
    display: grid;
    gap: 8px;
  }

  .agent-tool {
    display: grid;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--klc-color-grid-major);
    border-radius: 6px;
  }

  .agent-tool__toggle {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    cursor: pointer;
  }

  .agent-tool__toggle input {
    margin: 3px 0 0;
  }

  .agent-tool__toggle span {
    display: grid;
    gap: 2px;
  }

  .agent-tool__toggle strong {
    color: var(--klc-color-foreground);
    font-size: 12px;
    font-weight: 500;
  }

  .agent-tool__toggle small,
  .agent-tools__empty {
    color: var(--klc-color-axis-text);
    font-size: 11px;
    line-height: 1.35;
  }

  .agent-tool__parameters {
    display: grid;
    gap: 4px;
    color: var(--klc-color-axis-text);
    font-size: 11px;
  }

  .agent-tool__parameters textarea,
  .agent-tool__result {
    box-sizing: border-box;
    width: 100%;
    min-height: 74px;
    margin: 0;
    padding: 8px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 4px;
    color: var(--klc-color-foreground);
    background: var(--klc-color-background);
    font: 11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .agent-tool__run {
    justify-self: start;
    padding: 5px 10px;
    border: 1px solid var(--klc-color-border-button);
    border-radius: 4px;
    color: var(--klc-color-foreground);
    background: var(--klc-color-background);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }

  .agent-tool__run:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .agent-tool__error {
    margin: 0;
    color: var(--klc-color-agent-error);
    font-size: 11px;
  }

  .agent-tools__empty {
    margin: 0;
  }
</style>
