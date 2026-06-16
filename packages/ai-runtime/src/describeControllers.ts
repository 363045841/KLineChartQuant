import type { ControllerDescription } from './types'

export interface VolumeProfileSnapshot {
  poc: number
  vah: number
  val: number
  totalVolume: number
  vaVolume: number
}

export function describeVolumeProfileState(
  state: VolumeProfileSnapshot | null,
): ControllerDescription {
  if (state === null) {
    return {
      controllerId: 'volumeProfile',
      summary:
        'Volume Profile has not been computed yet — no bars have been ingested.',
      facts: { ready: false },
    }
  }

  const vaPercent =
    state.totalVolume > 0 ? (state.vaVolume / state.totalVolume) * 100 : 0
  const vaSpan = state.vah - state.val

  return {
    controllerId: 'volumeProfile',
    summary:
      `Volume Profile shows the Point of Control at ${state.poc.toFixed(2)} — ` +
      `the price level with the highest traded volume. The Value Area runs from ` +
      `${state.val.toFixed(2)} (VAL) to ${state.vah.toFixed(2)} (VAH), spanning ` +
      `${vaSpan.toFixed(2)} and containing ${vaPercent.toFixed(1)}% of total volume.`,
    facts: {
      poc: state.poc,
      vah: state.vah,
      val: state.val,
      vaSpan: Number(vaSpan.toFixed(8)),
      vaPercent: Number(vaPercent.toFixed(2)),
      totalVolume: state.totalVolume,
    },
  }
}

export interface AnchoredVwapSeriesSnapshot {
  label: string
  barIndex: number
  vwap: number
  upper1: number
  lower1: number
  upper2: number
  lower2: number
}

export function describeAnchoredVwap(
  activeAnchors: ReadonlyArray<AnchoredVwapSeriesSnapshot>,
  latestPrice: number | null,
): ControllerDescription {
  if (activeAnchors.length === 0) {
    return {
      controllerId: 'anchoredVwap',
      summary: 'No Anchored VWAP series are active.',
      facts: { count: 0 },
    }
  }

  const lines: string[] = []
  for (const a of activeAnchors) {
    const rel =
      latestPrice === null
        ? ''
        : latestPrice > a.upper1
          ? ' (price above 1\u03c3 upper band \u2014 overextended)'
          : latestPrice < a.lower1
            ? ' (price below 1\u03c3 lower band \u2014 overextended)'
            : ''
    lines.push(
      `"${a.label}" at ${a.vwap.toFixed(2)}, \u00b11\u03c3 [${a.lower1.toFixed(2)}, ${a.upper1.toFixed(2)}]${rel}`,
    )
  }

  return {
    controllerId: 'anchoredVwap',
    summary:
      `${activeAnchors.length} Anchored VWAP series active. ` +
      lines.join('; ') +
      '.',
    facts: {
      count: activeAnchors.length,
      anchors: lines.join(' | '),
    },
  }
}

export interface FootprintLatestBarSnapshot {
  barIndex: number
  delta: number
  totalVolume: number
  imbalanceCount: number
  maxImbalanceRatio: number
}

export function describeFootprintLatestBar(
  bar: FootprintLatestBarSnapshot | null,
  cumulativeDelta: number,
): ControllerDescription {
  if (bar === null) {
    return {
      controllerId: 'footprint',
      summary: 'Footprint controller has no bars yet.',
      facts: { ready: false },
    }
  }

  const tone =
    bar.delta > 0
      ? 'buy-dominated'
      : bar.delta < 0
        ? 'sell-dominated'
        : 'balanced'

  const imbalance =
    bar.imbalanceCount > 0
      ? `${bar.imbalanceCount} diagonal imbalance${bar.imbalanceCount === 1 ? '' : 's'} ` +
        `(max ratio ${bar.maxImbalanceRatio.toFixed(1)}\u00d7)`
      : 'no imbalances flagged'

  return {
    controllerId: 'footprint',
    summary:
      `Latest footprint bar #${bar.barIndex} is ${tone} with delta ${bar.delta.toFixed(0)} ` +
      `against ${bar.totalVolume.toFixed(0)} total volume. ${imbalance}. ` +
      `Cumulative delta across visible bars: ${cumulativeDelta.toFixed(0)}.`,
    facts: {
      barIndex: bar.barIndex,
      delta: bar.delta,
      tone,
      totalVolume: bar.totalVolume,
      imbalanceCount: bar.imbalanceCount,
      maxImbalanceRatio: Number(bar.maxImbalanceRatio.toFixed(2)),
      cumulativeDelta,
    },
  }
}

export interface AlertSnapshot {
  rulesEnabled: number
  rulesTotal: number
  recentEventsCount: number
}

export function describeAlerts(state: AlertSnapshot): ControllerDescription {
  return {
    controllerId: 'alerts',
    summary:
      state.rulesTotal === 0
        ? 'No alert rules configured.'
        : `${state.rulesEnabled} of ${state.rulesTotal} alert rules are enabled. ` +
          `${state.recentEventsCount} recent events buffered.`,
    facts: {
      rulesEnabled: state.rulesEnabled,
      rulesTotal: state.rulesTotal,
      recentEventsCount: state.recentEventsCount,
    },
  }
}
