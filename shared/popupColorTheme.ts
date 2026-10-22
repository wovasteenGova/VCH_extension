import {
  CLAIM_COLOR_THEME_STORAGE_KEY,
  DEFAULT_CLAIM_COLOR_THEME,
  isClaimColorThemeId,
  type ClaimColorThemeId
} from '@/shared/claimColorThemes'

export async function readPopupColorTheme(): Promise<ClaimColorThemeId> {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(CLAIM_COLOR_THEME_STORAGE_KEY)
      if (isClaimColorThemeId(stored)) return stored
    } catch {
      /* private mode */
    }
  }

  if (browser.storage?.local?.get) {
    try {
      const result = await browser.storage.local.get(CLAIM_COLOR_THEME_STORAGE_KEY)
      const stored = result[CLAIM_COLOR_THEME_STORAGE_KEY]
      if (isClaimColorThemeId(stored)) return stored
    } catch {
      /* extension context invalidated */
    }
  }

  return DEFAULT_CLAIM_COLOR_THEME
}

export function applyPopupColorTheme(themeId: ClaimColorThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = themeId
}

export async function writePopupColorTheme(themeId: ClaimColorThemeId): Promise<void> {
  applyPopupColorTheme(themeId)
  try {
    window.localStorage.setItem(CLAIM_COLOR_THEME_STORAGE_KEY, themeId)
  } catch {
    /* ignore */
  }
  if (!browser.storage?.local?.set) return
  try {
    await browser.storage.local.set({ [CLAIM_COLOR_THEME_STORAGE_KEY]: themeId })
  } catch {
    /* extension context invalidated */
  }
}
