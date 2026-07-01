<template>
  <div class="debug-controls" :data-theme="theme">
    <div class="debug-left">
      <button @click="$emit('open-modal')" title="打开 Modal">
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
      <button @click="$emit('toggle-embed-size')" title="切换嵌入容器尺寸">
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
      <button
        :class="{ 'is-active': customDataActive }"
        @click="$emit('toggle-custom-data')"
        :title="customDataActive ? '切换到 Fetcher 数据源' : '切换到自定义数据源'"
      >
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
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      </button>
      <button
        :class="{ 'is-active': depthDemoActive }"
        @click="$emit('toggle-depth-demo')"
        title="Toggle Depth Pipeline (Binance SSE → HeatmapController)"
      >
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
          <rect x="2" y="10" width="4" height="10" rx="1" />
          <rect x="10" y="4" width="4" height="16" rx="1" />
          <rect x="18" y="7" width="4" height="13" rx="1" />
        </svg>
      </button>
    </div>
    <div class="debug-right">
      <span v-if="depthDemoActive" class="depth-status-badge" :class="depthStatusClass">{{
        depthStatusText
      }}</span>
      <span class="version-badge">{{ version }}</span>
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
</template>

<script setup lang="ts">
  import { VERSION, CORE_VERSION } from '../src/version'

  defineProps<{
    customDataActive: boolean
    depthDemoActive: boolean
    depthStatusText: string
    depthStatusClass: string
    theme: 'light' | 'dark'
  }>()

  const version = `Vue@${VERSION}-Core@${CORE_VERSION}`

  defineEmits<{
    'open-modal': []
    'toggle-embed-size': []
    'toggle-custom-data': []
    'toggle-depth-demo': []
  }>()
</script>

<style scoped>
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

  .debug-controls button.is-active {
    background: #e6f7ff;
    border-color: #1890ff;
    color: #1890ff;
  }

  .depth-status-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-family: monospace;
    white-space: nowrap;
    border: 1px solid;
  }

  .depth-status-badge.depth-awaiting {
    background: #fffbe6;
    border-color: #ffe58f;
    color: #ad8b00;
  }

  .depth-status-badge.depth-connected {
    background: #f6ffed;
    border-color: #b7eb8f;
    color: #389e0d;
  }

  @media (max-width: 640px) {
    .debug-controls {
      padding: 8px 12px;
    }

    .debug-left {
      gap: 4px;
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

  .debug-controls[data-theme='dark'] {
    background: #1f2937;
    border-color: #374151;
  }

  .debug-controls[data-theme='dark'] .debug-link {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
  }

  .debug-controls[data-theme='dark'] .debug-link:hover {
    border-color: #60a5fa;
    color: #60a5fa;
  }

  .debug-controls[data-theme='dark'] button {
    background: #374151;
    border-color: #4b5563;
    color: #d1d5db;
  }

  .debug-controls[data-theme='dark'] button:hover {
    border-color: #60a5fa;
    color: #60a5fa;
  }

  .debug-controls[data-theme='dark'] button.is-active {
    background: #1e3a5f;
    border-color: #60a5fa;
    color: #60a5fa;
  }

  .debug-controls[data-theme='dark'] .depth-status-badge.depth-awaiting {
    background: #2b1d0b;
    border-color: #5c3a0e;
    color: #e8b839;
  }

  .debug-controls[data-theme='dark'] .depth-status-badge.depth-connected {
    background: #0b2b1a;
    border-color: #0e5c2e;
    color: #52c41a;
  }

  .debug-controls[data-theme='dark'] .version-badge {
    color: #9ca3af;
    background: #374151;
    border-color: #4b5563;
  }
</style>
