<!--
  K 线级别选择入口：按品种能力过滤周期档位，下拉项可收藏常用级别。
  收藏以紧凑按钮排在触发框右侧，当前品种不支持的收藏置灰保留。
-->
<template>
  <div class="level-picker">
    <DropMenu :label="TITLE" :groups="groups" tooltip-placement="bottom" @select="select">
      <template #trigger>
        <span class="selection-menu__value">{{ selectedLabel }}</span>
        <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
      </template>
      <template #item-action="{ item }">
        <button
          type="button"
          :aria-label="favoriteLabel(item)"
          :aria-pressed="isItemFavorite(item.id)"
          @click.stop="toggleItemFavorite(item.id)"
        >
          <IconStarFilled
            v-if="isItemFavorite(item.id)"
            class="level-picker__star"
            aria-hidden="true"
          />
          <IconStar v-else aria-hidden="true" />
        </button>
      </template>
    </DropMenu>

    <div
      v-if="favoriteOptions.length > 0"
      class="level-picker__favorites"
      role="group"
      :aria-label="FAVORITES_LABEL"
    >
      <BaseButton
        v-for="option in favoriteOptions"
        :key="option.value"
        variant="chip"
        :disabled="!isSupported(option.value)"
        :aria-pressed="option.value === selectedValue"
        @click="selectLevel(option.value)"
      >
        {{ option.label }}
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/selection-menu.css'

  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import DropMenu, {
    type DropMenuGroup,
    type DropMenuItem,
  } from '@vue-src/components/common/menu/DropMenu.vue'
  import { useKLineLevelFavorites } from '@vue-src/composables/chart/useKLineLevelFavorites.js'
  import { computed } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconStar from '~icons/tabler/star'
  import IconStarFilled from '~icons/tabler/star-filled'
  import { K_LINE_LEVEL_OPTIONS, type KLineLevel } from './kLineLevel'

  const TITLE = '级别'
  const FAVORITES_LABEL = '收藏级别'

  const props = defineProps<{
    modelValue?: string
    supportedLevels?: ReadonlyArray<KLineLevel>
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', level: KLineLevel): void
  }>()

  const { favoriteLevels, toggleFavorite } = useKLineLevelFavorites()

  /** 收藏档位集合：每一项渲染只做一次 O(1) 判定，不再逐项扫描选项表。 */
  const favoriteIds = computed(() => new Set<string>(favoriteLevels.value))

  /** 当前品种支持的档位集合；未提供能力时为 null，表示不过滤。 */
  const supportedSet = computed<ReadonlySet<KLineLevel> | null>(() =>
    props.supportedLevels ? new Set(props.supportedLevels) : null,
  )

  /** 下拉可见档位：保持菜单固定顺序，能力只做过滤。 */
  const visibleOptions = computed(() => {
    const supported = supportedSet.value
    if (supported === null) return [...K_LINE_LEVEL_OPTIONS]
    return K_LINE_LEVEL_OPTIONS.filter((option) => supported.has(option.value))
  })

  /** 右侧收藏按钮：只取真实存在的档位，顺序与下拉一致，不跟随收藏先后跳动。 */
  const favoriteOptions = computed(() => {
    const favorites = favoriteLevels.value
    return K_LINE_LEVEL_OPTIONS.filter((option) => favorites.includes(option.value))
  })

  /** 当前选中档位；非法或缺失值回退到首个可见选项。 */
  const selectedValue = computed(() => {
    const options = visibleOptions.value
    return options.find((option) => option.value === props.modelValue)?.value ?? options[0]?.value
  })

  const groups = computed<DropMenuGroup[]>(() => [
    {
      id: 'level',
      label: TITLE,
      items: visibleOptions.value.map((option) => ({
        id: option.value,
        label: option.label,
        checked: option.value === selectedValue.value,
        selection: 'radio',
      })),
    },
  ])

  const selectedLabel = computed(
    () => visibleOptions.value.find((option) => option.value === selectedValue.value)?.label ?? '',
  )

  /** 菜单项 id 来自本组选项，按值域查找即可还原档位，不做字符串断言。 */
  function findLevel(itemId: string): KLineLevel | null {
    return K_LINE_LEVEL_OPTIONS.find((option) => option.value === itemId)?.value ?? null
  }

  /** 当前品种是否支持该档位；能力未知时视为支持。 */
  function isSupported(level: KLineLevel): boolean {
    const supported = supportedSet.value
    return supported === null || supported.has(level)
  }

  function isItemFavorite(itemId: string): boolean {
    return favoriteIds.value.has(itemId)
  }

  /** 星标只切换收藏，不改变当前档位，菜单保持打开。 */
  function toggleItemFavorite(itemId: string): void {
    const level = findLevel(itemId)
    if (level !== null) toggleFavorite(level)
  }

  /** 星标的可访问名称：带上档位，读屏能区分菜单里的每一颗星。 */
  function favoriteLabel(item: DropMenuItem): string {
    return `${isItemFavorite(item.id) ? '取消收藏' : '收藏'} ${item.label}`
  }

  /** 菜单与右侧按钮共用切换入口；已选档位不重复上报。 */
  function selectLevel(level: KLineLevel): void {
    if (level !== props.modelValue) emit('update:modelValue', level)
  }

  function select(_groupId: string, itemId: string): void {
    const level = findLevel(itemId)
    if (level !== null) selectLevel(level)
  }
</script>

<style scoped>
  .level-picker,
  .level-picker__favorites {
    display: flex;
    align-items: center;
    gap: var(--klc-space-2, 2px);
  }

  /* 收藏按钮与级别触发器等高：高度跟着工具栏控件高度走，窄屏自动跟随。 */
  .level-picker__favorites {
    --base-button-height: var(--control-button-height, 30px);
  }

  /* 收藏态颜色直接落在图标上：按钮颜色由菜单共享样式的 hover/focus 状态管理。 */
  .level-picker__star {
    color: var(--klc-color-ui-warning);
  }
</style>
