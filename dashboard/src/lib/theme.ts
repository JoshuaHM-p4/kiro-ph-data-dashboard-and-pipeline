// Dashboard theming: light/dark mode + named color THEMES (each a coordinated
// group of colors). A theme drives shadcn tokens (--primary/--ring) AND the
// chart palette (--chart-1..5), so controls and charts recolor together.
import { PALETTE } from './format'

export type Mode = 'light' | 'dark' | 'auto'

export interface DashTheme {
  name: string
  primary: string
  /** Exactly 5 chart series colors (hex). */
  palette: [string, string, string, string, string]
}

// Coordinated color groups. All hex so <canvas> can render them everywhere.
export const THEMES: DashTheme[] = [
  {
    name: 'Accessible',
    primary: '#0072b2',
    palette: ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7'],
  },
  {
    name: 'Ocean',
    primary: '#0e7490',
    palette: ['#0e7490', '#0891b2', '#06b6d4', '#38bdf8', '#818cf8'],
  },
  {
    name: 'Forest',
    primary: '#15803d',
    palette: ['#166534', '#15803d', '#16a34a', '#65a30d', '#ca8a04'],
  },
  {
    name: 'Sunset',
    primary: '#ea580c',
    palette: ['#b91c1c', '#ea580c', '#f59e0b', '#eab308', '#f43f5e'],
  },
  {
    name: 'Berry',
    primary: '#7c3aed',
    palette: ['#6d28d9', '#7c3aed', '#a855f7', '#d946ef', '#ec4899'],
  },
  {
    name: 'Slate',
    primary: '#334155',
    palette: ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1'],
  },
]

const THEME_KEY = 'dashboard-theme'

// ---- Light / Dark / Auto ---------------------------------------------------
export function applyMode(mode: Mode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  if (mode === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
  root.style.colorScheme = resolved
}

// ---- Color theme (group of colors) ----------------------------------------
export function applyTheme(theme: DashTheme) {
  const root = document.documentElement
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--ring', theme.primary)
  theme.palette.forEach((c, i) => root.style.setProperty(`--chart-${i + 1}`, c))
  localStorage.setItem(THEME_KEY, theme.name)
  window.dispatchEvent(new Event('dashboard-theme-change'))
}

export function savedThemeName(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(THEME_KEY)
}

/** Read the active chart palette from CSS vars; fall back to the default palette. */
export function readPalette(): string[] {
  if (typeof window === 'undefined') return PALETTE
  const cs = getComputedStyle(document.documentElement)
  const vals = [1, 2, 3, 4, 5].map((i) =>
    cs.getPropertyValue(`--chart-${i}`).trim(),
  )
  // Only trust the vars if a theme set them to hex (default tokens are oklch).
  return vals.every((v) => v.startsWith('#')) ? vals : PALETTE
}
