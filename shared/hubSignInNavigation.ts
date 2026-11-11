import { DEFAULT_HUB_ORIGIN, hubUrlOnOrigin } from './hubOrigins'

/** Query on Hub: content script shows “return to the extension” when this is `1`. */
export const HUB_EXTENSION_RETURN_QUERY = 'vchExtensionReturn'

export function openHubSignIn() {
  void browser.tabs.create({
    url: hubUrlOnOrigin(DEFAULT_HUB_ORIGIN, `/?signin=1&${HUB_EXTENSION_RETURN_QUERY}=1`)
  })
}
