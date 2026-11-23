/** 级别下拉：收藏按钮按菜单顺序展示并置灰不支持项，星标只切收藏不切档位。 */
import { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import {
  type KLineLevelFavoritesState,
  KLINE_LEVEL_FAVORITES_KEY,
} from '../../composables/chart/useKLineLevelFavorites.js'
import KLineLevelDropdown from './KLineLevelDropdown.vue'
import type { KLineLevel } from './kLineLevel.js'

enableAutoUnmount(afterEach)

/** 可控收藏状态替身：不触碰设备存储，只暴露组件需要的读写入口。 */
function createFavorites(initial: ReadonlyArray<KLineLevel>) {
  const levels = ref<ReadonlyArray<KLineLevel>>(Object.freeze([...initial]))
  const toggleFavorite = vi.fn((level: KLineLevel) => {
    levels.value = Object.freeze(
      levels.value.includes(level)
        ? levels.value.filter((entry) => entry !== level)
        : [...levels.value, level],
    )
  })
  const state: KLineLevelFavoritesState = {
    favoriteLevels: computed(() => levels.value),
    isFavorite: (level) => levels.value.includes(level),
    toggleFavorite,
  }
  return { state, toggleFavorite }
}

/** 挂载级别下拉；收藏状态走注入，档位与能力由用例传入。 */
function mountDropdown(
  favorites: KLineLevelFavoritesState,
  supportedLevels: ReadonlyArray<KLineLevel>,
  modelValue: KLineLevel = KLinePeriod.Min1,
) {
  return mount(KLineLevelDropdown, {
    attachTo: document.body,
    props: { modelValue, supportedLevels },
    global: { provide: { [KLINE_LEVEL_FAVORITES_KEY]: favorites } },
  })
}

describe('KLineLevelDropdown favorites', () => {
  it('shows supported favorites in menu order and disables unsupported ones', () => {
    const { state } = createFavorites(['timeshare', KLinePeriod.Weekly, KLinePeriod.Min1])
    const wrapper = mountDropdown(state, [KLinePeriod.Min1, KLinePeriod.Daily, KLinePeriod.Weekly])

    const chips = wrapper.findAll('.base-button')
    expect(chips.map((chip) => chip.text())).toEqual(['分时', '1分', '1周'])
    expect(chips.map((chip) => (chip.element as HTMLButtonElement).disabled)).toEqual([
      true,
      false,
      false,
    ])
    expect(chips[1]!.attributes('aria-pressed')).toBe('true')
  })

  it('toggles a favorite from the menu without changing the level, and the chip selects it', async () => {
    const { state, toggleFavorite } = createFavorites([])
    const wrapper = mountDropdown(state, [KLinePeriod.Min1, KLinePeriod.Daily], KLinePeriod.Daily)

    await wrapper.get('.drop-menu__trigger').trigger('click')
    await nextTick()
    const star = document.querySelector<HTMLButtonElement>(
      '.drop-menu__item[data-item-id="1min"] .drop-menu__item-action button',
    )
    if (!star) throw new Error('star button missing')
    star.click()
    await nextTick()

    expect(toggleFavorite).toHaveBeenCalledWith(KLinePeriod.Min1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    const chip = wrapper.findAll('.base-button')[0]!
    await chip.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[KLinePeriod.Min1]])
  })
})
