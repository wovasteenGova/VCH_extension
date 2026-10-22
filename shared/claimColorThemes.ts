export const CLAIM_COLOR_THEME_STORAGE_KEY = 'claim-color-theme'

export const CLAIM_COLOR_THEME_IDS = [
  'classic-warm',
  'service-blue',
  'field-manual',
  'pacific-slate',
  'night-ops',
  'high-contrast'
] as const

export type ClaimColorThemeId = typeof CLAIM_COLOR_THEME_IDS[number]

export interface ClaimColorThemeOption {
  id: ClaimColorThemeId
  label: string
  /** CSS linear-gradient for the picker swatch */
  swatch: string
}

export const CLAIM_COLOR_THEMES: ClaimColorThemeOption[] = [
  {
    id: 'classic-warm',
    label: 'Classic Warm',
    swatch: 'linear-gradient(135deg, #f7f4ef 0 48%, #b08844 48% 100%)'
  },
  {
    id: 'service-blue',
    label: 'Service Blue',
    swatch: 'linear-gradient(135deg, #f4f6f9 0 48%, #2c5282 48% 100%)'
  },
  {
    id: 'field-manual',
    label: 'Field Manual',
    swatch: 'linear-gradient(135deg, #f5f4ef 0 48%, #556b2f 48% 100%)'
  },
  {
    id: 'pacific-slate',
    label: 'Pacific Slate',
    swatch: 'linear-gradient(135deg, #f8fafc 0 48%, #64748b 48% 100%)'
  },
  {
    id: 'night-ops',
    label: 'Night Ops',
    swatch: 'linear-gradient(135deg, #e8e0d6 0 48%, #000000 48% 100%)'
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    swatch: 'linear-gradient(135deg, #ffffff 0 48%, #005fcc 48% 100%)'
  }
]

export const DEFAULT_CLAIM_COLOR_THEME: ClaimColorThemeId = 'classic-warm'

export function isClaimColorThemeId(value: string | null | undefined): value is ClaimColorThemeId {
  return Boolean(value && (CLAIM_COLOR_THEME_IDS as readonly string[]).includes(value))
}

export function claimColorThemeById(id: ClaimColorThemeId) {
  return CLAIM_COLOR_THEMES.find(theme => theme.id === id) ?? CLAIM_COLOR_THEMES[0]!
}
