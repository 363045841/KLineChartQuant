/** 公共弹窗尺寸过渡：测量自然布局，动画结束后恢复由内容决定尺寸。 */
import { onScopeDispose, type Ref, watch } from 'vue'
import { prefersReducedMotion, readMotionDuration, readMotionToken } from './motion.js'

interface ModalSize {
  width: number
  height: number
}

/** 跟踪内容、属性和视口造成的尺寸变化；不使用 transform，避免影响内部固定定位浮层。 */
export function useModalResize(
  dialog: Readonly<Ref<HTMLDialogElement | null>>,
  enabled: () => boolean,
) {
  let cleanup: (() => void) | undefined
  watch(
    dialog,
    (element) => {
      cleanup?.()
      if (!element) return
      let size: ModalSize | null = null
      let animation: Animation | null = null
      let frame = 0

      /** 跳过入场缩放，用布局尺寸记录自然宽高。 */
      function measure(): ModalSize {
        return { width: element!.offsetWidth, height: element!.offsetHeight }
      }

      /** 从当前可见尺寸过渡到最新自然尺寸，连续操作会接续当前动画。 */
      function resize(): void {
        if (!element?.open) {
          animation?.cancel()
          animation = null
          size = null
          return
        }
        const previous = animation ? measure() : size
        animation?.cancel()
        animation = null
        const next = measure()
        size = next
        if (
          !previous ||
          !enabled() ||
          typeof element.animate !== 'function' ||
          prefersReducedMotion() ||
          (previous.width === next.width && previous.height === next.height)
        )
          return
        const current = element.animate(
          [
            { width: `${previous.width}px`, height: `${previous.height}px` },
            { width: `${next.width}px`, height: `${next.height}px` },
          ],
          {
            duration: readMotionDuration(element, 'dur-base'),
            easing: readMotionToken(element, 'ease-out'),
          },
        )
        animation = current
        current.onfinish = () => {
          if (animation !== current) return
          animation = null
          size = measure()
        }
      }

      /** 合并同一帧内的 DOM 更新，避免内容逐项挂载时重复测量。 */
      function schedule(): void {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(resize)
      }
      const mutations = new MutationObserver(schedule)
      mutations.observe(element, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      const observer = new ResizeObserver(() => {
        // 动画自身的中间尺寸不作为新的目标，内容变化由 MutationObserver 处理。
        if (!animation) schedule()
      })
      observer.observe(element)
      window.addEventListener('resize', schedule)
      cleanup = () => {
        mutations.disconnect()
        observer.disconnect()
        cancelAnimationFrame(frame)
        animation?.cancel()
        window.removeEventListener('resize', schedule)
      }
    },
    { flush: 'post' },
  )
  onScopeDispose(() => cleanup?.())
}
