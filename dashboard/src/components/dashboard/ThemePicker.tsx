import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  applyMode,
  applyTheme,
  savedThemeName,
  THEMES,
  type Mode,
} from '@/lib/theme'

export function ThemePicker() {
  const [mode, setMode] = useState<Mode>('auto')
  const [themeName, setThemeName] = useState('')

  useEffect(() => {
    const savedMode = window.localStorage.getItem('theme') as Mode | null
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'auto') {
      setMode(savedMode)
    }
    const name = savedThemeName()
    if (name) {
      const t = THEMES.find((x) => x.name === name)
      if (t) {
        setThemeName(t.name)
        applyTheme(t)
      }
    }
  }, [])

  const chooseMode = (m: Mode) => {
    setMode(m)
    applyMode(m)
    localStorage.setItem('theme', m)
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}
        aria-label="Theme settings"
      >
        <span
          className="size-3 rounded-full ring-1 ring-black/10"
          style={{ background: 'var(--primary)' }}
        />
        Theme
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3">
        {/* Light / Dark / Auto */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Mode</Label>
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[mode]}
            onValueChange={(v) => {
              const next = v[0] as Mode | undefined
              if (next) chooseMode(next)
            }}
          >
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Color themes — each is a coordinated group of colors */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Color theme</Label>
          <div className="flex flex-col gap-1">
            {THEMES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setThemeName(t.name)
                  applyTheme(t)
                }}
                className={cn(
                  'flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-sm transition hover:bg-accent',
                  themeName === t.name && 'border-border bg-accent',
                )}
              >
                <span className="text-foreground">{t.name}</span>
                <span className="flex gap-1">
                  {t.palette.map((c) => (
                    <span
                      key={c}
                      className="size-3.5 rounded-full ring-1 ring-black/10"
                      style={{ background: c }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
