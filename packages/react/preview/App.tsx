import { useState, useCallback, useEffect, useRef } from 'react'
import { KLineChartWC, type KLineChartWCProps } from '../src/KLineChartWC'
import type { SemanticChartConfig, DataFetcher } from '@363045841yyt/klinechart-core/semantic'
import '@363045841yyt/klinechart/web-component'

const defaultConfig: SemanticChartConfig = {
  version: '1.0.0',
  data: {
    source: 'mock',
    symbol: '601360',
    startDate: '2025-01-01',
    endDate: '2026-05-17',
    period: 'daily',
  },
  indicators: {
    main: [{ type: 'BOLL', enabled: true }],
    sub: [
      { type: 'MACD', enabled: true },
      { type: 'RSI', enabled: true },
    ],
  },
}

const dataFetcher: DataFetcher = async (_source, config) => {
  const start = new Date(config.startDate).getTime()
  const end = new Date(config.endDate).getTime()
  const dayMs = 86400000
  const totalDays = Math.floor((end - start) / dayMs) + 1
  const data: Array<{
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume: number
    turnover: number
  }> = []
  let price = 10 + Math.random() * 5
  for (let i = 0; i < totalDays; i++) {
    const ts = start + i * dayMs
    const change = (Math.random() - 0.48) * price * 0.06
    const open = price
    const close = Math.round((open + change) * 100) / 100
    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.03) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.03) * 100) / 100
    const volume = Math.round(Math.random() * 10000000 + 1000000)
    data.push({
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume,
      turnover: Math.round((volume * (open + close)) / 2),
    })
    price = close
  }
  return data
}

const SIZES = [
  { w: '95%', h: '95%' },
  { w: '800px', h: '500px' },
  { w: '600px', h: '400px' },
  { w: '100%', h: '300px' },
]

export default function App() {
  const [embedWidth, setEmbedWidth] = useState('95%')
  const [embedHeight, setEmbedHeight] = useState('95%')
  const [showModal, setShowModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const sizeIdxRef = useRef(0)

  const toggleEmbedSize = useCallback(() => {
    sizeIdxRef.current = (sizeIdxRef.current + 1) % SIZES.length
    const next = SIZES[sizeIdxRef.current]
    setEmbedWidth(next.w)
    setEmbedHeight(next.h)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen().catch(console.error)
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return (
    <div style={styles.app}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button style={styles.btn} onClick={() => setShowModal(true)} title="Open Modal">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
          <button style={styles.btn} onClick={toggleEmbedSize} title="Toggle embed size">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
        <div style={styles.toolbarCenter}>
          <span style={styles.sizeInfo}>Embed: {embedWidth} × {embedHeight}</span>
        </div>
        <div style={styles.toolbarRight}>
          <span style={styles.versionBadge}>React Preview</span>
          <a style={styles.link} href="https://github.com/363045841/KLineChartQuant" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12a12 12 0 0 0 8.2 11.4c.6.1.82-.26.82-.58 0-.28-.01-1.03-.02-2.02-3.34.73-4.04-1.61-4.04-1.61-.55-1.38-1.33-1.75-1.33-1.75-1.1-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.08 1.84 2.83 1.3 3.52.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.53.12-3.18 0 0 1-.32 3.3 1.23A11.5 11.5 0 0 1 12 5.8c1.02 0 2.04.14 3 .42 2.3-1.56 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.62-2.8 5.64-5.48 5.95.43.37.82 1.1.82 2.22 0 1.6-.01 2.9-.01 3.3 0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <a style={styles.link} href="https://www.npmjs.com/package/@363045841yyt/klinechart" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 1024 1024" width="20" height="20">
              <path d="M0 312.928v341.344h284.416v56.832H512v-56.832h512V312.928z m284.416 284.32H227.584v-170.656h-56.96v170.656H56.96v-227.456h227.456z m170.656 0v56.992h-113.696v-284.448h227.584v227.488h-113.888z m512.064 0H910.4v-170.656h-56.992v170.656h-56.96v-170.656h-56.736v170.656h-113.952v-227.456h341.408zM455.04 426.656H512v113.792h-56.96z" fill="#CB3837" />
            </svg>
          </a>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          ...styles.embed,
          width: isFullscreen ? '100vw' : embedWidth,
          height: isFullscreen ? '100vh' : embedHeight,
          border: isFullscreen ? 'none' : '2px dashed #d9d9d9',
          margin: isFullscreen ? 0 : '16px',
          borderRadius: isFullscreen ? 0 : '8px',
        }}
      >
        <KLineChartWC
          semanticConfig={defaultConfig}
          dataFetcher={dataFetcher}
          style={{ width: '100%', height: '100%' }}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>

      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <header style={styles.modalHeader}>
              <span>K-Line Chart in Modal</span>
              <button style={styles.closeBtn} onClick={() => setShowModal(false)}>×</button>
            </header>
            <div style={styles.modalBody}>
              <KLineChartWC
                semanticConfig={defaultConfig}
                dataFetcher={dataFetcher}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  toolbar: {
    position: 'relative',
    padding: '8px 16px',
    background: '#f5f5f5',
    borderBottom: '1px solid #e8e8e8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  toolbarCenter: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  btn: {
    width: 32,
    height: 32,
    padding: 0,
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#333',
  },
  link: {
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    background: '#fff',
    color: '#333',
    textDecoration: 'none',
  },
  versionBadge: {
    padding: '2px 8px',
    borderRadius: 12,
    border: '1px solid #d9d9d9',
    background: '#fff',
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  sizeInfo: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  embed: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    maxWidth: 1200,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: '#fafafa',
    borderBottom: '1px solid #e8e8e8',
    fontWeight: 600,
  },
  closeBtn: {
    width: 32,
    height: 32,
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    cursor: 'pointer',
    borderRadius: 4,
    color: '#666',
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
}
