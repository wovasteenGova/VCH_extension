import { DEFAULT_HUB_ORIGIN, hubUrlOnOrigin } from './hubOrigins'

export const VCH_HUB_URL = import.meta.env.VITE_VCH_HUB_URL || DEFAULT_HUB_ORIGIN
export const CLAIMBUILDER_URL = import.meta.env.VITE_CLAIMBUILDER_URL || 'https://claimbuilder.veteranscentralhub.com'
export const SYMPTOM_TRACKER_URL = import.meta.env.VITE_SYMPTOM_TRACKER_URL || 'https://tracker.veteranscentralhub.com'
/** Canonical Hub page for install help, permissions, and extension updates */
export const VCH_EXTENSION_HUB_PATH = '/extension'

export type HubQuickLink = {
  id: string
  label: string
  description: string
  path: string
  icon: string
  external?: boolean
}

/** In-app Hub routes — opens on veteranscentralhub.com */
export const HUB_QUICK_LINKS: HubQuickLink[] = [
  {
    id: 'home',
    label: 'Hub home',
    description: 'Main landing page',
    path: '/',
    icon: 'i-lucide-house'
  },
  {
    id: 'benefits',
    label: 'Benefits',
    description: 'Tools, guides, and ClaimBuilder',
    path: '/benefits',
    icon: 'i-lucide-shield'
  },
  {
    id: 'services',
    label: 'Services directory',
    description: 'VSOs and veteran service providers',
    path: '/services',
    icon: 'i-lucide-map-pin'
  },
  {
    id: 'donate',
    label: 'Support VCH',
    description: 'Donate and sponsor the mission',
    path: '/donate',
    icon: 'i-lucide-heart-handshake'
  },
  {
    id: 'dashboard',
    label: 'My dashboard',
    description: 'Account and profile',
    path: '/dashboard/profile',
    icon: 'i-lucide-user-round'
  }
]

export function hubUrl(path: string) {
  return hubUrlOnOrigin(VCH_HUB_URL, path)
}

/** Open a Hub path on veteranscentralhub.com. */
export function hubUrlForActiveSession(path: string) {
  return hubUrlOnOrigin(DEFAULT_HUB_ORIGIN, path)
}
