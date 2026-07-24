import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatPeso, PALETTE, withAlpha } from '@/lib/format'
import { ThemePicker } from './ThemePicker'

export type Scope = 'global' | 'local'

export interface FilterState {
  scope: Scope
  region: string
  category: string
  budget: [number, number] // in millions of PHP
  progress: [number, number] // percent
  dateFrom: Date | undefined
}

interface FilterBarProps {
  ready: boolean
  lastMs: number
  regions: string[]
  categories: string[]
  budgetMax: number // in millions
  value: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

export function FilterBar({
  ready,
  lastMs,
  regions,
  categories,
  budgetMax,
  value,
  onChange,
}: FilterBarProps) {
  const local = value.scope === 'local'

  return (
    <div className="flex flex-wrap items-end gap-4">
      {/* Scope: Global (region/category only) vs Local (adds refinements) */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Filter scope</Label>
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[value.scope]}
          onValueChange={(v) => {
            const next = v[0] as Scope | undefined
            if (next) onChange({ scope: next })
          }}
        >
          <ToggleGroupItem value="global">Global</ToggleGroupItem>
          <ToggleGroupItem value="local">Local</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Region select (always applies) */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Region</Label>
        <Select
          value={value.region}
          onValueChange={(v) => onChange({ region: (v as string) ?? 'All' })}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All regions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category select (always applies) */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Select
          value={value.category}
          onValueChange={(v) => onChange({ category: (v as string) ?? 'All' })}
        >
          <SelectTrigger size="sm" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Budget range slider (local refinement) */}
      <div className={cn('flex w-56 flex-col gap-1', !local && 'opacity-50')}>
        <Label className="text-xs text-muted-foreground">
          Budget {formatPeso(value.budget[0] * 1e6)} – {formatPeso(value.budget[1] * 1e6)}
        </Label>
        <Slider
          min={0}
          max={budgetMax}
          step={Math.max(1, Math.round(budgetMax / 100))}
          value={value.budget}
          disabled={!local}
          onValueChange={(v) => onChange({ budget: v as [number, number] })}
        />
      </div>

      {/* Progress range slider / scale (local refinement) */}
      <div className={cn('flex w-48 flex-col gap-1', !local && 'opacity-50')}>
        <Label className="text-xs text-muted-foreground">
          Progress {value.progress[0]}% – {value.progress[1]}%
        </Label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={value.progress}
          disabled={!local}
          onValueChange={(v) => onChange({ progress: v as [number, number] })}
        />
      </div>

      {/* Start-date picker (local refinement) */}
      <div className={cn('flex flex-col gap-1', !local && 'opacity-50')}>
        <Label className="text-xs text-muted-foreground">Start date ≥</Label>
        <Popover>
          <PopoverTrigger
            disabled={!local}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-40 justify-start')}
          >
            {value.dateFrom ? fmtDate(value.dateFrom) : 'Any date'}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value.dateFrom}
              onSelect={(d) => onChange({ dateFrom: d })}
              captionLayout="dropdown"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Latency badge + theme picker */}
      <div className="ml-auto flex items-end gap-2">
        <span
          className="rounded-full px-3 py-1 text-sm font-semibold"
          style={{
            background: withAlpha(lastMs < 100 ? PALETTE[2] : PALETTE[3], 0.18),
            color: lastMs < 100 ? PALETTE[2] : PALETTE[3],
          }}
          aria-live="polite"
        >
          {ready ? `query: ${lastMs.toFixed(1)} ms` : 'booting DuckDB-WASM…'}
        </span>
        <ThemePicker />
      </div>
    </div>
  )
}
