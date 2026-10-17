import { computed, type InjectionKey, inject, provide, type Ref } from 'vue'

const FULLSCREEN_TARGET_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol(
  'fullscreen-teleport-target',
)

export function provideFullscreenTeleportTarget(targetRef: Ref<HTMLElement | null>): void {
  provide(FULLSCREEN_TARGET_KEY, targetRef)
}

export function useFullscreenTeleportTarget() {
  const targetRef = inject(FULLSCREEN_TARGET_KEY, null)

  return computed<HTMLElement | string>(() => targetRef?.value ?? 'body')
}
