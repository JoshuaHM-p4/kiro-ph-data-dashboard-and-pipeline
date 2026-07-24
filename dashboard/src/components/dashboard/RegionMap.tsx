import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { geoMercator, geoPath } from 'd3-geo'

const W = 320
const H = 460

interface RegionFeature {
  type: 'Feature'
  properties: { region: string; prov: string | null; psgc: number }
  geometry: GeoJSON.Geometry
}
interface RegionFC {
  type: 'FeatureCollection'
  features: RegionFeature[]
}

interface RegionMapProps {
  /** Region labels present in the dataset (only these are clickable). */
  regions: string[]
  selected: string // 'All' or a region label
  onSelect: (region: string) => void
}

export function RegionMap({ regions, selected, onSelect }: RegionMapProps) {
  const [fc, setFc] = useState<RegionFC | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/ph-regions.geojson')
      .then((r) => r.json())
      .then((d: RegionFC) => {
        if (!cancelled) setFc(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Project once the GeoJSON is loaded.
  const shapes = useMemo(() => {
    if (!fc) return []
    const projection = geoMercator().fitSize([W, H], fc as never)
    const path = geoPath(projection)
    return fc.features.map((f, i) => ({
      key: i,
      region: f.properties.region,
      prov: f.properties.prov,
      d: path(f as never) ?? '',
    }))
  }, [fc])

  const dataRegions = useMemo(() => new Set(regions), [regions])

  function styleFor(region: string): CSSProperties {
    const hasData = dataRegions.has(region)
    // Inline style (not presentation attrs) so CSS var() resolves reliably.
    if (!hasData) return { fill: 'var(--muted-foreground)', fillOpacity: 0.15 }
    if (selected === region) return { fill: 'var(--primary)', fillOpacity: 1 }
    if (hovered === region) return { fill: 'var(--primary)', fillOpacity: 0.7 }
    return { fill: 'var(--primary)', fillOpacity: 0.35 }
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        // h-full fills the tile when it has height; min-h guarantees the map is
        // never 0px if the flex/height chain collapses. `meet` never crops it.
        className="h-full min-h-[240px] w-full"
        role="group"
        aria-label="Philippine region picker"
      >
        {shapes.map((s) => {
          const clickable = dataRegions.has(s.region)
          return (
            <path
              key={s.key}
              d={s.d}
              style={{
                ...styleFor(s.region),
                stroke: 'var(--background)',
                strokeWidth: 0.4,
                cursor: clickable ? 'pointer' : 'default',
                transition: 'fill-opacity 120ms',
              }}
              onMouseEnter={() => clickable && setHovered(s.region)}
              onMouseLeave={() => setHovered(null)}
              onClick={() =>
                clickable && onSelect(selected === s.region ? 'All' : s.region)
              }
            >
              <title>{s.region}{s.prov ? ` — ${s.prov}` : ''}</title>
            </path>
          )
        })}
      </svg>
      <p className="text-center text-xs text-muted-foreground">
        {hovered ?? (selected !== 'All' ? selected : 'Click a region to filter')}
      </p>
    </div>
  )
}
