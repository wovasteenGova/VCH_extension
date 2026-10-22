export const POPUP_UI_SCALE_STORAGE_KEY = 'vch-popup-ui-scale'

/** Presets — rem-based UI scales with html font-size (Chrome popup height stays 600px). */
export const POPUP_UI_SCALE_PRESETS = [
  { id: 'compact', label: 'S', scale: 0.9375, title: 'Compact text' },
  { id: 'default', label: 'M', scale: 1.0625, title: 'Default text' },
  { id: 'large', label: 'L', scale: 1.1875, title: 'Large text' },
  { id: 'xlarge', label: 'XL', scale: 1.3125, title: 'Extra large text' }
] as const

export type PopupUiScalePresetId = (typeof POPUP_UI_SCALE_PRESETS)[number]['id']

export const DEFAULT_POPUP_UI_SCALE = POPUP_UI_SCALE_PRESETS[1].scale

const SCALE_MIN = POPUP_UI_SCALE_PRESETS[0].scale
const SCALE_MAX = POPUP_UI_SCALE_PRESETS[POPUP_UI_SCALE_PRESETS.length - 1].scale

export function normalizePopupUiScale(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_POPUP_UI_SCALE
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, numeric))
  const match = POPUP_UI_SCALE_PRESETS.find(preset => preset.scale === clamped)
  if (match) return match.scale
  return POPUP_UI_SCALE_PRESETS.reduce((closest, preset) => {
    return Math.abs(preset.scale - clamped) < Math.abs(closest.scale - clamped) ? preset : closest
  }).scale
}

export function popupUiScalePresetId(scale: number): PopupUiScalePresetId {
  const normalized = normalizePopupUiScale(scale)
  return POPUP_UI_SCALE_PRESETS.find(preset => preset.scale === normalized)?.id ?? 'default'
}

export function applyPopupUiScale(scale: number) {
  if (typeof document === 'undefined') return
  const normalized = normalizePopupUiScale(scale)
  document.documentElement.style.setProperty('--popup-ui-scale', String(normalized))
  document.documentElement.dataset.popupUiScale = popupUiScalePresetId(normalized)
}

export async function readPopupUiScale(): Promise<number> {
  if (!browser.storage?.local?.get) return DEFAULT_POPUP_UI_SCALE
  try {
    const result = await browser.storage.local.get(POPUP_UI_SCALE_STORAGE_KEY)
    return normalizePopupUiScale(result[POPUP_UI_SCALE_STORAGE_KEY])
  } catch {
    return DEFAULT_POPUP_UI_SCALE
  }
}

export async function writePopupUiScale(scale: number): Promise<number> {
  const normalized = normalizePopupUiScale(scale)
  applyPopupUiScale(normalized)
  if (!browser.storage?.local?.set) return normalized
  try {
    await browser.storage.local.set({ [POPUP_UI_SCALE_STORAGE_KEY]: normalized })
  } catch {
    /* extension context invalidated */
  }
  return normalized
}
