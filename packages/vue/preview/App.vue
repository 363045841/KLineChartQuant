<template>
  <div class="app-container" :data-theme="currentTheme">
    <div class="debug-controls">
      <div class="debug-left">
        <button @click="showModal = true" title="打开 Modal">
          <svg
            class="debug-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <button @click="toggleEmbedSize" title="切换嵌入容器尺寸">
          <svg
            class="debug-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>
      <div class="debug-right">
        <span class="version-badge">{{ displayVersion }}</span>
        <a
          class="debug-link"
          href="https://github.com/363045841/KLineChartQuant"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          aria-label="GitHub"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path
              d="M12 0C5.37 0 0 5.37 0 12a12 12 0 0 0 8.2 11.4c.6.1.82-.26.82-.58 0-.28-.01-1.03-.02-2.02-3.34.73-4.04-1.61-4.04-1.61-.55-1.38-1.33-1.75-1.33-1.75-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.08 1.84 2.83 1.3 3.52.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.12-3.18 0 0 1-.32 3.3 1.23A11.5 11.5 0 0 1 12 5.8c1.02 0 2.04.14 3 .42 2.3-1.56 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.62-2.8 5.64-5.48 5.95.43.37.82 1.1.82 2.22 0 1.6-.01 2.9-.01 3.3 0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
          </svg>
        </a>
        <a
          class="debug-link"
          href="https://www.npmjs.com/package/@363045841yyt/klinechart?activeTab=readme"
          target="_blank"
          rel="noopener noreferrer"
          title="NPM"
          aria-label="NPM"
        >
          <svg viewBox="0 0 1024 1024" width="20" height="20" aria-hidden="true">
            <path
              d="M0 312.928v341.344h284.416v56.832H512v-56.832h512V312.928z m284.416 284.32H227.584v-170.656h-56.96v170.656H56.96v-227.456h227.456z m170.656 0v56.992h-113.696v-284.448h227.584v227.488h-113.888z m512.064 0H910.4v-170.656h-56.992v170.656h-56.96v-170.656h-56.736v170.656h-113.952v-227.456h341.408zM455.04 426.656H512v113.792h-56.96z"
              fill="#CB3837"
            />
          </svg>
        </a>
      </div>
    </div>

    <!-- 嵌入场景：模拟组件库在父容器中的使用 -->
    <div
      ref="embedContainerRef"
      class="embed-container"
      :class="{ 'is-fullscreen': isFullscreen }"
      :style="{ width: embedWidth, height: embedHeight }"
    >
      <KLineChart
        ref="chartRef"
        :mcp="mcpConfig"
        :dataFetcher="dataFetcher"
        :is-fullscreen="isFullscreen"
        @toggle-fullscreen="toggleFullscreen"
        @theme-change="onThemeChange"
      />
    </div>

    <!-- Modal 场景 -->
    <Teleport :to="teleportTarget">
      <Transition name="modal">
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
          <div class="modal-container">
            <header class="modal-header">
              <span>K线图 Modal 测试</span>
              <button class="close-btn" @click="showModal = false">×</button>
            </header>
            <div class="modal-body">
              <KLineChart
                :dataFetcher="dataFetcher"
                @theme-change="onThemeChange"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, inject, type Ref, type InjectionKey } from 'vue'
import KLineChart from '../src/components/KLineChart.vue'
import { VERSION, CORE_VERSION } from '../src/version'
import { routerDataFetcher } from '@363045841yyt/klinechart-core/controllers'
import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

const FULLSCREEN_TARGET_KEY: InjectionKey<Ref<HTMLElement | null>> = Symbol(
  'fullscreen-teleport-target',
)

function provideFullscreenTeleportTarget(targetRef: Ref<HTMLElement | null>): void {
  provide(FULLSCREEN_TARGET_KEY, targetRef)
}

function useFullscreenTeleportTarget() {
  const targetRef = inject(FULLSCREEN_TARGET_KEY, null)
  return computed<HTMLElement | string>(() => {
    return targetRef?.value ?? 'body'
  })
}

const dataFetcher = routerDataFetcher

const chartRef = ref<InstanceType<typeof KLineChart> | null>(null)
const mcpConfig = {
  wsUrl: 'ws://localhost:8080',
  autoReconnect: true,
  onToolCall: (call: { name: string; input: Record<string, unknown> }) => {
    const ctrl = chartRef.value?.getController?.()
    if (!ctrl) return { success: false, error: 'Controller not ready yet' }
    return executeTool(ctrl, call)
  },
}

const displayVersion = `Vue@${VERSION}-Core@${CORE_VERSION}`

const showModal = ref(false)

const sizeIndex = ref(0)
const sizes = [
  { w: '95%', h: '95%' },
  { w: '800px', h: '500px' },
  { w: '600px', h: '400px' },
  { w: '100%', h: '300px' },
]

const embedWidth = computed(() => sizes[sizeIndex.value]?.w ?? '100%')
const embedHeight = computed(() => sizes[sizeIndex.value]?.h ?? '100%')

function toggleEmbedSize() {
  sizeIndex.value = (sizeIndex.value + 1) % sizes.length
}

const isFullscreen = ref(false)
const embedContainerRef = ref<HTMLElement | null>(null)
const currentTheme = ref<'light' | 'dark'>('light')

function onThemeChange(theme: 'light' | 'dark') {
  currentTheme.value = theme
}

provideFullscreenTeleportTarget(embedContainerRef)

const teleportTarget = computed<HTMLElement | string>(() => embedContainerRef.value ?? 'body')

async function toggleFullscreen() {
  if (!embedContainerRef.value) return
  try {
    if (!document.fullscreenElement) {
      await embedContainerRef.value.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  } catch (err) {
    console.error('Fullscreen error:', err)
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
}
</script>

<style>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.debug-controls {
  position: relative;
  padding: 8px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  align-self: stretch;
}

.debug-left,
.debug-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.debug-link {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  color: #333;
  text-decoration: none;
}

.debug-link:hover {
  color: #1890ff;
  border-color: #1890ff;
}

.version-badge {
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #666;
  font-size: 12px;
  font-family: monospace;
}

.debug-controls button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.debug-controls button:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.debug-icon {
  width: 20px;
  height: 20px;
}

@media (max-width: 640px) {
  .debug-controls {
    padding: 8px 12px;
  }

  .debug-left {
    gap: 4px;
  }

  .debug-center {
    display: none;
  }

  .debug-right {
    gap: 4px;
    margin-left: auto;
    order: 0;
    flex-shrink: 1;
    min-width: 0;
  }

  .version-badge {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
  }
}

.embed-container {
  flex: 1;
  min-height: 0;
  margin: 0 16px;
  border-radius: 8px;
  overflow: hidden;
}

.embed-container:fullscreen,
.embed-container.is-fullscreen {
  border: none;
  margin: 0;
  border-radius: 0;
  width: 100vw !important;
  height: 100vh !important;
  background: #fff;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 90%;
  height: 80%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: #666;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}

/* ── 深色模式 ── */
.app-container[data-theme='dark'] {
  background: #000000;
  color: #e5e7eb;
}

.app-container[data-theme='dark'] .debug-controls {
  background: #1f2937;
  border-color: #374151;
}

.app-container[data-theme='dark'] .debug-link {
  background: #374151;
  border-color: #4b5563;
  color: #d1d5db;
}

.app-container[data-theme='dark'] .debug-link:hover {
  border-color: #60a5fa;
  color: #60a5fa;
}

.app-container[data-theme='dark'] .debug-controls button {
  background: #374151;
  border-color: #4b5563;
  color: #d1d5db;
}

.app-container[data-theme='dark'] .debug-controls button:hover {
  border-color: #60a5fa;
  color: #60a5fa;
}

.app-container[data-theme='dark'] .version-badge {
  color: #9ca3af;
}

.app-container[data-theme='dark'] .version-badge {
  background: #374151;
  border-color: #4b5563;
}

.app-container[data-theme='dark'] .embed-container {
  border-color: #374151;
}

.app-container[data-theme='dark'] .embed-container:fullscreen,
.app-container[data-theme='dark'] .embed-container.is-fullscreen {
  background: #000000;
}

.app-container[data-theme='dark'] .modal-container {
  background: #1f2937;
}

.app-container[data-theme='dark'] .modal-header {
  background: #374151;
  border-color: #4b5563;
  color: #e5e7eb;
}

.app-container[data-theme='dark'] .close-btn {
  color: #9ca3af;
}

.app-container[data-theme='dark'] .close-btn:hover {
  background: #4b5563;
  color: #f3f4f6;
}
</style>
