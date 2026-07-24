// Formatting helpers + an accessible, color-blind-friendly palette (Okabe-Ito).
export const PALETTE = [
  '#0072B2', '#E69F00', '#009E73', '#D55E00',
  '#CC79A7', '#56B4E9', '#F0E442', '#999999',
]

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatPeso = (v: number | null | undefined) => peso.format(v ?? 0)
export const formatInt = (v: number | null | undefined) =>
  new Intl.NumberFormat('en-PH').format(v ?? 0)
