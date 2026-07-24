// ============================================================================
// STEP 3 — INTERACTIVE CHART RENDERING (Chart.js)
// ============================================================================
// A thin, reusable React wrapper around Chart.js that:
//   • creates the chart once and *updates* it in place when data changes
//     (no destroy/recreate => no layout shift, no leaked canvases),
//   • is responsive (maintainAspectRatio: false + a sized container), and
//   • cleans up on unmount to prevent memory leaks.
import { useEffect, useRef } from 'react'
import {
  Chart,
  type ChartConfiguration,
  type ChartType,
  registerables,
} from 'chart.js'

// Register controllers/elements/scales once for the whole app.
Chart.register(...registerables)

interface ChartCanvasProps<T extends ChartType> {
  config: ChartConfiguration<T>
  /** Accessible description of what the chart shows. */
  ariaLabel: string
}

export function ChartCanvas<T extends ChartType>({
  config,
  ariaLabel,
}: ChartCanvasProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart<T> | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    // Create the chart on first render.
    chartRef.current = new Chart(canvasRef.current, config)
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
    // Intentionally create once; data updates handled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update data/options in place when the config changes (no re-instantiation).
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.data = config.data
    if (config.options) chart.options = config.options
    chart.update()
  }, [config])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  )
}
