import {
  CLAIM_COLOR_THEMES,
  claimColorThemeById,
  DEFAULT_CLAIM_COLOR_THEME,
  type ClaimColorThemeId
} from '@/shared/claimColorThemes'
import { readPopupColorTheme, writePopupColorTheme } from '@/shared/popupColorTheme'

const themeId = ref<ClaimColorThemeId>(DEFAULT_CLAIM_COLOR_THEME)
const ready = ref(false)

export function usePopupColorTheme() {
  const activeTheme = computed(() => claimColorThemeById(themeId.value))

  async function hydrate() {
    themeId.value = await readPopupColorTheme()
    ready.value = true
  }

  async function setTheme(next: ClaimColorThemeId) {
    themeId.value = next
    await writePopupColorTheme(next)
  }

  return {
    themeId,
    ready,
    activeTheme,
    themes: CLAIM_COLOR_THEMES,
    setTheme,
    hydrate
  }
}
