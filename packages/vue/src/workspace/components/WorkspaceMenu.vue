<!-- 标签栏应用图标菜单：普通按钮作为锚点，菜单与外观切换共用同一面板。 -->
<template>
  <BaseTooltip content="应用菜单" placement="bottom" trigger-display="contents">
    <button
      v-bind="dropdown.buttonProps.value"
      type="button"
      class="control-button workspace-menu__button"
      aria-label="应用菜单"
    >
      <ColorAvatar :color="accent" variant="contrast">
        <KcqLogo />
      </ColorAvatar>
    </button>
  </BaseTooltip>
  <MenuSurface
    v-bind="dropdown.menuProps.value"
    label="应用菜单"
    placement="bottom"
    density="loose"
    :groups="menu.groups"
    @select="menu.select"
  >
    <template #footer>
      <div class="workspace-menu__appearance">
        <span>外观</span>
        <ThemeModeControl
          :model-value="themeMode"
          label="明暗模式"
          @update:model-value="emit('theme-change', $event)"
        />
      </div>
    </template>
  </MenuSurface>
  <AboutDialog v-model:open="menu.aboutOpen.value" />
</template>

<script setup lang="ts">
  import '../../components/common/control-button.css'

  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import ColorAvatar from '@vue-src/components/common/ColorAvatar.vue'
  import MenuSurface from '@vue-src/components/common/MenuSurface.vue'
  import { useMenuButton } from '@vue-src/components/common/useMenuButton.js'
  import ThemeModeControl from '@vue-src/components/common/ThemeModeControl.vue'
  import { useWorkspaceMenu } from '../impl/useWorkspaceMenu.js'
  import AboutDialog from './AboutDialog.vue'
  import KcqLogo from './KcqLogo.vue'

  defineProps<{ accent: string; themeMode?: ChartSettings['theme'] }>()
  const emit = defineEmits<{ 'theme-change': [mode: ChartSettings['theme']] }>()
  const menu = useWorkspaceMenu()
  const dropdown = useMenuButton()
</script>

<style scoped>
  /* 应用图标按钮：沿用共享 button 尺寸与底色，只压掉行内留白与 hover 底色。 */
  .workspace-menu__button {
    --control-button-width: 30px;
    --control-button-height: var(--tab-pill-height, 26px);
    --control-button-inline-padding: 0;
    --control-button-active-background: transparent;
    --control-button-focus-background: transparent;
    --control-button-focus-outline: 2px solid var(--klc-color-ui-focus);
    --control-button-focus-outline-offset: -2px;
    --control-button-focus-shadow: none;

    flex: none;
    /* 消掉行盒的基线留白，图标才与标签胶囊同心。 */
    line-height: 0;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .workspace-menu__appearance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-lg);
    /* 菜单 header 自带 8px，补齐选项行的 12px，左右内容保持同一基线。 */
    padding-inline: var(--klc-space-4, 4px);
    padding-block: var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-normal);
  }
</style>
