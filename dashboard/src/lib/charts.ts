import type { ActiveElement, Chart, ChartEvent } from 'chart.js'
import { withAlpha } from './format'

// Returns an onHover handler that keeps the hovered slice/bar at full color and
// dims (lowers hue/alpha of) all the others. Pass the SOLID hex base colors.
export function makeHoverDim(baseColors: string[]) {
  return (_event: ChartEvent, active: ActiveElement[], chart: Chart) => {
    const idx = active.length ? active[0].index : -1
    const next = baseColors.map((c, i) =>
      idx === -1 || i === idx ? c : withAlpha(c, 0.18),
    )
    const ds = chart.data.datasets[0] as { backgroundColor?: unknown }
    ds.backgroundColor = next
    chart.update('none')
    // Cursor affordance when a slice is clickable.
    const canvas = chart.canvas
    if (canvas) canvas.style.cursor = idx === -1 ? 'default' : 'pointer'
  }
}
