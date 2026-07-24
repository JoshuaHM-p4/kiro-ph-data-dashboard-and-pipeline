import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChartConfiguration } from 'chart.js'
import { query, getConnection, DATASET_VIEW } from '../lib/duckdb'
import { ChartCanvas } from '../components/dashboard/ChartCanvas'
import { FilterBar, type FilterState } from '../components/dashboard/FilterBar'
import { RegionMap } from '../components/dashboard/RegionMap'
import { Card } from '../components/ui/card'
import { cn } from '../lib/utils'
import { formatInt, formatPeso, withAlpha } from '../lib/format'
import { makeHoverDim } from '../lib/charts'
import { readPalette } from '../lib/theme'

export const Route = createFileRoute('/dashboard')({ component: Dashboard })

// ---- Row shapes returned by our SQL --------------------------------------
interface Kpi { projects: number; budget: number; progress: number }
interface CatRow { category: string; total_budget: number; n: number }
interface YearRow { year: number; total_budget: number }
interface StatusRow { status: string; n: number }
interface ContractorRow { contractor: string; total_budget: number }

// Escape single quotes so filter values are safe inside SQL string literals.
const esc = (v: string) => v.replace(/'/g, "''")

function Dashboard() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter options (discovered from the data — schema-adaptive).
  const [regions, setRegions] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [budgetMax, setBudgetMax] = useState(1000) // in millions of PHP

  // Active drill-down filter state (single object patched by the FilterBar).
  const [filters, setFilters] = useState<FilterState>({
    scope: 'global',
    region: 'All',
    category: 'All',
    budget: [0, 1000],
    progress: [0, 100],
    dateFrom: undefined,
  })
  const patch = useCallback(
    (p: Partial<FilterState>) => setFilters((f) => ({ ...f, ...p })),
    [],
  )

  // Query results.
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [byCategory, setByCategory] = useState<CatRow[]>([])
  const [byYear, setByYear] = useState<YearRow[]>([])
  const [byStatus, setByStatus] = useState<StatusRow[]>([])
  const [topContractors, setTopContractors] = useState<ContractorRow[]>([])

  // STEP 4: latency instrumentation.
  const [lastMs, setLastMs] = useState(0)

  // Active chart palette (driven by the theme picker via CSS vars).
  const [palette, setPalette] = useState<string[]>(readPalette())
  useEffect(() => {
    const update = () => setPalette(readPalette())
    update()
    window.addEventListener('dashboard-theme-change', update)
    return () => window.removeEventListener('dashboard-theme-change', update)
  }, [])

  // --- Boot: introspect schema + load filter options (once) ----------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await getConnection()
        // Schema-adaptive: log the columns DuckDB sees in the Parquet.
        const schema = await query(`DESCRIBE SELECT * FROM ${DATASET_VIEW}`)
        // eslint-disable-next-line no-console
        console.info('[dashboard] dataset columns:', schema.rows)

        const r = await query<{ region: string }>(
          `SELECT DISTINCT region FROM ${DATASET_VIEW} ORDER BY region`,
        )
        const c = await query<{ category: string }>(
          `SELECT DISTINCT category FROM ${DATASET_VIEW} ORDER BY category`,
        )
        if (cancelled) return
        setRegions(r.rows.map((x) => x.region))
        setCategories(c.rows.map((x) => x.category))

        // Discover the budget ceiling (in ₱ millions) to scale the slider.
        const b = await query<{ m: number }>(
          `SELECT ceil(max(budget) / 1e6)::INT AS m FROM ${DATASET_VIEW}`,
        )
        const bmax = b.rows[0]?.m ?? 1000
        setBudgetMax(bmax)
        setFilters((f) => ({ ...f, budget: [0, bmax] }))
        setReady(true)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // --- STEP 2: run all aggregations whenever a filter changes --------------
  const runQueries = useCallback(async () => {
    const { scope, region, category, budget, progress, dateFrom } = filters
    // Global filters (always apply): region + category.
    const clauses: string[] = []
    if (region !== 'All') clauses.push(`region = '${esc(region)}'`)
    if (category !== 'All') clauses.push(`category = '${esc(category)}'`)
    // Local refinements only apply in "Local" scope.
    if (scope === 'local') {
      clauses.push(`budget BETWEEN ${budget[0] * 1e6} AND ${budget[1] * 1e6}`)
      clauses.push(`progress BETWEEN ${progress[0]} AND ${progress[1]}`)
      if (dateFrom) {
        clauses.push(`start_date >= DATE '${dateFrom.toISOString().slice(0, 10)}'`)
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    // Year chart needs an extra predicate; merge it into the same clause list.
    const whereYear = `WHERE ${[...clauses, 'infra_year IS NOT NULL'].join(' AND ')}`

    // Cast money to DOUBLE so results arrive as plain JS numbers.
    const [k, cat, yr, st, con] = await Promise.all([
      query<Kpi>(
        `SELECT count(*) AS projects,
                coalesce(sum(budget), 0)::DOUBLE AS budget,
                coalesce(avg(progress), 0)::DOUBLE AS progress
         FROM ${DATASET_VIEW} ${where}`,
      ),
      query<CatRow>(
        `SELECT category, sum(budget)::DOUBLE AS total_budget, count(*) AS n
         FROM ${DATASET_VIEW} ${where}
         GROUP BY category ORDER BY total_budget DESC LIMIT 10`,
      ),
      query<YearRow>(
        `SELECT infra_year AS year, sum(budget)::DOUBLE AS total_budget
         FROM ${DATASET_VIEW} ${whereYear}
         GROUP BY year ORDER BY year`,
      ),
      query<StatusRow>(
        `SELECT status, count(*) AS n
         FROM ${DATASET_VIEW} ${where}
         GROUP BY status ORDER BY n DESC`,
      ),
      query<ContractorRow>(
        `SELECT contractor, sum(budget)::DOUBLE AS total_budget
         FROM ${DATASET_VIEW} ${where}
         GROUP BY contractor ORDER BY total_budget DESC LIMIT 10`,
      ),
    ])

    setKpi(k.rows[0] ?? null)
    setByCategory(cat.rows)
    setByYear(yr.rows)
    setByStatus(st.rows)
    setTopContractors(con.rows)

    // STEP 4: prove sub-100ms. Slowest single query drives the badge.
    const slowest = Math.max(k.ms, cat.ms, yr.ms, st.ms, con.ms)
    setLastMs(slowest)
    // Automated assertion visible in the browser console during the workshop.
    // eslint-disable-next-line no-console
    console.assert(
      slowest < 100,
      `[perf] drill-down query took ${slowest.toFixed(1)}ms (expected < 100ms)`,
    )
  }, [filters])

  useEffect(() => {
    if (!ready) return
    runQueries().catch((e) => setError((e as Error).message))
  }, [ready, runQueries])

  // --- STEP 3: build chart configs from query results ----------------------
  const categoryConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const colors = byCategory.map((_, i) => palette[i % palette.length])
    return {
      type: 'bar',
      data: {
        labels: byCategory.map((r) => r.category),
        datasets: [{ label: 'Total budget', data: byCategory.map((r) => r.total_budget), backgroundColor: colors }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        // Hover dims the other bars; click filters by that category (toggles).
        onHover: makeHoverDim(colors),
        onClick: (_e, active, chart) => {
          if (!active.length) return
          const label = chart.data.labels?.[active[0].index] as string | undefined
          if (label) patch({ category: filters.category === label ? 'All' : label })
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${formatPeso(ctx.parsed.x)}` } },
        },
        scales: { x: { ticks: { callback: (v) => formatPeso(Number(v)) } } },
      },
    }
  }, [byCategory, palette, patch, filters.category])

  const yearConfig = useMemo<ChartConfiguration<'line'>>(
    () => ({
      type: 'line',
      data: {
        labels: byYear.map((r) => String(r.year)),
        datasets: [
          {
            label: 'Total budget',
            data: byYear.map((r) => r.total_budget),
            borderColor: palette[0],
            backgroundColor: withAlpha(palette[0], 0.2),
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Index mode: hovering anywhere on the x-axis shows that year's value.
        interaction: { mode: 'index', intersect: false },
        elements: { point: { radius: 2, hoverRadius: 5 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: (items) => `Year ${items[0]?.label ?? ''}`,
              label: (ctx) => ` ${formatPeso(ctx.parsed.y)}`,
            },
          },
        },
        scales: { y: { ticks: { callback: (v) => formatPeso(Number(v)) } } },
      },
    }),
    [byYear, palette],
  )

  const statusConfig = useMemo<ChartConfiguration<'doughnut'>>(() => {
    const colors = byStatus.map((_, i) => palette[i % palette.length])
    return {
      type: 'doughnut',
      data: { labels: byStatus.map((r) => r.status), datasets: [{ data: byStatus.map((r) => r.n), backgroundColor: colors }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onHover: makeHoverDim(colors),
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatInt(ctx.parsed)}` } },
        },
      },
    }
  }, [byStatus, palette])

  const contractorConfig = useMemo<ChartConfiguration<'bar'>>(() => {
    const colors = topContractors.map((_, i) => palette[i % palette.length])
    return {
      type: 'bar',
      data: {
        labels: topContractors.map((r) => r.contractor),
        datasets: [{ label: 'Total budget', data: topContractors.map((r) => r.total_budget), backgroundColor: colors }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        onHover: makeHoverDim(colors),
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${formatPeso(ctx.parsed.x)}` } },
        },
        scales: { x: { ticks: { callback: (v) => formatPeso(Number(v)) } } },
      },
    }
  }, [topContractors, palette])

  if (error) {
    return (
      <main className="p-3 text-foreground">
        <Card className="p-4 text-destructive">
          Failed to load dashboard: {error}
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-4 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col gap-3">
        <Card className="gap-2 p-3">
          <h1 className="text-base font-bold tracking-tight">
            DPWH Transparency{' '}
            <span className="font-normal text-muted-foreground">· DuckDB-WASM</span>
          </h1>
          {/* Interactive filter bar (scope toggle, selects, sliders, date, theme) */}
          <FilterBar
            ready={ready}
            lastMs={lastMs}
            regions={regions}
            categories={categories}
            budgetMax={budgetMax}
            value={filters}
            onChange={patch}
          />
        </Card>

        {/* --- KPI strip (compact, centered) --- */}
        <section className="grid grid-cols-3 gap-3">
          <Kpiard label="Projects" value={kpi ? formatInt(kpi.projects) : '—'} />
          <Kpiard label="Total budget" value={kpi ? formatPeso(kpi.budget) : '—'} />
          <Kpiard
            label="Avg. progress"
            value={kpi ? `${(kpi.progress ?? 0).toFixed(1)}%` : '—'}
          />
        </section>

        {/* --- Bento grid: map + charts --- */}
        <section className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-3 lg:auto-rows-[minmax(0,1fr)]">
          <Panel title="Region" className="lg:col-span-1 lg:row-span-3">
            <RegionMap
              regions={regions}
              selected={filters.region}
              onSelect={(r) => patch({ region: r })}
            />
          </Panel>
          {byCategory.length > 1 && (
            <Panel title="Budget by category" className="lg:col-span-2 lg:row-span-2">
              <ChartCanvas config={categoryConfig} ariaLabel="Budget by category" />
            </Panel>
          )}
          <Panel title="Projects by status">
            <ChartCanvas config={statusConfig} ariaLabel="Projects by status" />
          </Panel>
          <Panel title="Budget by year">
            <ChartCanvas config={yearConfig} ariaLabel="Budget by year" />
          </Panel>
          <Panel title="Top contractors" className="lg:col-span-3">
            <ChartCanvas config={contractorConfig} ariaLabel="Top contractors" />
          </Panel>
        </section>
      </div>
    </main>
  )
}

function Kpiard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="items-center gap-0.5 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </Card>
  )
}

function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('flex h-full flex-col gap-1 p-3', className)}>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  )
}
