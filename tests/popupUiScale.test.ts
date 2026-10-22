import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POPUP_UI_SCALE,
  normalizePopupUiScale,
  popupUiScalePresetId
} from '../shared/popupUiScale'

describe('popupUiScale', () => {
  it('normalizes unknown values to the default preset', () => {
    expect(normalizePopupUiScale(undefined)).toBe(DEFAULT_POPUP_UI_SCALE)
  })

  it('snaps near values to presets and clamps extremes', () => {
    expect(normalizePopupUiScale(1.1875)).toBe(1.1875)
    expect(normalizePopupUiScale(1.2)).toBe(1.1875)
    expect(normalizePopupUiScale(99)).toBe(1.3125)
    expect(normalizePopupUiScale(0.1)).toBe(0.9375)
  })

  it('maps scale to preset id', () => {
    expect(popupUiScalePresetId(1.3125)).toBe('xlarge')
    expect(popupUiScalePresetId(1.0625)).toBe('default')
  })
})
