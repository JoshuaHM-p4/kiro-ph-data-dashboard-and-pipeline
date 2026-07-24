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
  const refineCount =
    (value.dateFrom ? 1 : 0) +
    (value.budget[0] > 0 || value.budget[1] < budgetMax ? 1 : 0) +
    (value.progress[0] > 0 || value.progress[1] < 100 ? 1 : 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Scope: Global (region/category only) vs Local (adds refinements) */}
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

      {/* Region select */}
      <Select
        value={value.region}
        onValueChange={(v) => onChange({ region: (v as string) ?? 'All' })}
      >
        <SelectTrigger size="sm" className="max-w-52">
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

      {/* Category select */}
      <Select
        value={value.category}
        onValueChange={(v) => onChange({ category: (v as string) ?? 'All' })}
      >
        <SelectTrigger size="sm" className="max-w-56">
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

      {/* Refine (local) filters tucked into a popover to keep the bar compact */}
      <Popover>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
        >
          Refine{refineCount > 0 && local ? ` (${refineCount})` : ''}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Scope</Label>
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

          <div className={cn('flex flex-col gap-1', !local && 'opacity-50')}>
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

          <div className={cn('flex flex-col gap-1', !local && 'opacity-50')}>
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

          <div className={cn('flex flex-col gap-1', !local && 'opacity-50')}>
            <Label className="text-xs text-muted-foreground">Start date ≥</Label>
            <Popover>
              <PopoverTrigger
                disabled={!local}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'justify-start')}
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
        </PopoverContent>
      </Popover>

      {/* Latency badge + theme picker */}
      <div className="ml-auto flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            background: withAlpha(lastMs < 100 ? PALETTE[2] : PALETTE[3], 0.18),
            color: lastMs < 100 ? PALETTE[2] : PALETTE[3],
          }}
          aria-live="polite"
        >
          {ready ? `${lastMs.toFixed(1)} ms` : 'loading…'}
        </span>
        <ThemePicker />
      </div>
    </div>
  )
}
