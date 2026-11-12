/** 公共弹窗尺寸过渡：测量自然布局，动画结束后恢复由内容决定尺寸。 */
import { onScopeDispose, type Ref, ref, watch } from 'vue'
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
  /** 高度过渡进行中：调用方在此时收起滚动条，由动画结束后的最终尺寸决定是否出现。 */
  const resizing = ref(false)
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

      /** 结束尺寸动画并退出过渡态，让最终尺寸重新决定滚动条。 */
      function stopAnimation(): void {
        animation?.cancel()
        animation = null
        resizing.value = false
      }

      /** 从当前可见尺寸过渡到最新自然尺寸，连续操作会接续当前动画。 */
      function resize(): void {
        if (!element?.open) {
          stopAnimation()
          size = null
          return
        }
        const previous = animation ? measure() : size
        stopAnimation()
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
        // 只有高度变化会把内容挤出可视区，过渡期间的滚动条是中间态伪影。
        resizing.value = previous.height !== next.height
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
          resizing.value = false
          size = measure()
        }
      }

      /** 合并同一帧内的 DOM 更新，避免内容逐项挂载时重复测量。 */
      function schedule(): void {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(resize)
      }
      const mutations = new MutationObserver((records) => {
        // dialog 自身的 class 只影响外观与过渡（过渡态也是它），不改变内容尺寸；
        // 忽略这类记录，避免过渡态切换触发一次多余测量并把动画重新起跑。
        if (records.every((record) => record.target === element && record.attributeName === 'class'))
          return
        schedule()
      })
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
        stopAnimation()
        window.removeEventListener('resize', schedule)
      }
    },
    { flush: 'post' },
  )
  onScopeDispose(() => cleanup?.())
  return { resizing }
}
