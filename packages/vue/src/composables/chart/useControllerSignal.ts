/** Read Core signals through Vue; Core remains the only owner of business state. */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { ComputedRef, Ref } from 'vue'
import { useSignalSource, type VueSignalSource } from '../../utils/signalBridge.js'

export function useControllerSignal<T>(
  controllerRef: Readonly<Ref<ChartController | null>>,
  select: (controller: ChartController) => VueSignalSource<T> | undefined,
  fallback: () => T,
): ComputedRef<T> {
  return useSignalSource(
    () => (controllerRef.value ? select(controllerRef.value) : undefined),
    (value) => value,
    fallback,
  )
}

/** Notify Vue only when the selected field changes, preserving high-frequency filtering. */
export function useControllerSignalValue<T, TValue>(
  controllerRef: Readonly<Ref<ChartController | null>>,
  select: (controller: ChartController) => VueSignalSource<T> | undefined,
  project: (value: T) => TValue,
  fallback: () => TValue,
): ComputedRef<TValue> {
  return useSignalSource(
    () => (controllerRef.value ? select(controllerRef.value) : undefined),
    project,
    fallback,
    true,
  )
}
