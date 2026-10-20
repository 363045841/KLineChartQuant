/** 统一原语后端入口：不再导出可见 GPU surface 或独立 buffer/pipeline API。 */
export { createCanvas2DRenderer } from './backend/createCanvas2DRenderer.js'
export { createWebGLRenderer } from './backend/createWebGLRenderer.js'
export type { CreateWebGPURendererOptions } from './backend/createWebGPURenderer.js'
export { createWebGPURenderer } from './backend/createWebGPURenderer.js'
export {
  createDefaultRendererHost,
  createDefaultRendererHostSync,
} from './createDefaultRendererHost.js'
export type { Renderer, RendererCapabilities, RendererName } from './Renderer.js'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
  RendererHost,
  RendererHostDependencies,
  RendererHostListeners,
} from './rendererHost.js'
export { createRendererHost, createRendererHostFromRenderer } from './rendererHost.js'
