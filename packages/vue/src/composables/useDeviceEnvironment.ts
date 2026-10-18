/** 将 Core 的共享设备信号桥接为 Vue 只读状态，订阅由组件作用域释放。 */
import { getDeviceEnvironment } from '@363045841yyt/klinechart-core/config'
import { coreSignalToVueRef } from '../utils/signalBridge.js'

/** 返回设备类型与输入能力的唯一快照，不在 Vue 中重复检测或缓存。 */
export function useDeviceEnvironment() {
  return coreSignalToVueRef(getDeviceEnvironment())
}
