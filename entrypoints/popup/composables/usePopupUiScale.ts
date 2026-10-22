import {
  DEFAULT_POPUP_UI_SCALE,
  POPUP_UI_SCALE_PRESETS,
  readPopupUiScale,
  writePopupUiScale,
  type PopupUiScalePresetId
} from '@/shared/popupUiScale'

export function usePopupUiScale() {
  const scale = ref(DEFAULT_POPUP_UI_SCALE)
  const ready = ref(false)

  const activePresetId = computed<PopupUiScalePresetId>(() => {
    const match = POPUP_UI_SCALE_PRESETS.find(preset => preset.scale === scale.value)
    return match?.id ?? 'default'
  })

  async function hydrate() {
    scale.value = await readPopupUiScale()
    ready.value = true
  }

  async function setPreset(presetId: PopupUiScalePresetId) {
    const preset = POPUP_UI_SCALE_PRESETS.find(item => item.id === presetId)
    if (!preset) return
    scale.value = await writePopupUiScale(preset.scale)
  }

  void hydrate()

  return {
    scale,
    ready,
    presets: POPUP_UI_SCALE_PRESETS,
    activePresetId,
    setPreset
  }
}
