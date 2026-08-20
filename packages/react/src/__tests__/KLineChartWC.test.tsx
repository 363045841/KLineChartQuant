/** 验证 React Web Component 适配器的属性、事件与卸载行为。 */

import { render, waitFor } from '@testing-library/react'
import { createElement, createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { KLineChartWC } from '../index'

describe('KLineChartWC', () => {
  /** 等待客户端 Web Component 注册完成后的 effect 更新。 */
  async function waitForElement(container: HTMLElement): Promise<HTMLElement> {
    const element = container.querySelector('kline-chart')
    expect(element).not.toBeNull()
    await waitFor(() => expect(element?.getAttribute('zoom-levels')).not.toBeNull())
    return element!
  }

  it('maps props to the custom element and removes stale attributes', async () => {
    const semanticConfig = { data: { type: 'kline' } } as never
    const { container, rerender } = render(
      createElement(KLineChartWC, {
        semanticConfig,
        zoomLevels: 12,
        isFullscreen: true,
      }),
    )
    const element = await waitForElement(container)

    expect(element.semanticConfig).toBe(semanticConfig)
    expect(element.getAttribute('zoom-levels')).toBe('12')
    expect(element.getAttribute('is-fullscreen')).toBe('true')

    rerender(createElement(KLineChartWC, {}))
    await waitFor(() => expect(element.hasAttribute('zoom-levels')).toBe(false))
    expect(element.hasAttribute('is-fullscreen')).toBe(false)
  })

  it('forwards custom events and exposes the element ref', async () => {
    const onZoomLevelChange = vi.fn()
    const onToggleFullscreen = vi.fn()
    const ref = createRef<HTMLElement>()
    const { container, unmount } = render(
      createElement(KLineChartWC, {
        onZoomLevelChange,
        onToggleFullscreen,
        ref,
        zoomLevels: 10,
      }),
    )
    const element = await waitForElement(container)

    expect(ref.current).toBe(element)
    element.dispatchEvent(new CustomEvent('zoom-level-change', { detail: { level: 4, kWidth: 8 } }))
    element.dispatchEvent(new CustomEvent('toggle-fullscreen'))
    expect(onZoomLevelChange).toHaveBeenCalledWith({ level: 4, kWidth: 8 })
    expect(onToggleFullscreen).toHaveBeenCalledOnce()

    unmount()
    element.dispatchEvent(new CustomEvent('toggle-fullscreen'))
    expect(onToggleFullscreen).toHaveBeenCalledOnce()
  })
})
