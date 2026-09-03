import {
  CLAIMBUILDER_URL,
  HUB_QUICK_LINKS,
  hubUrlForActiveSession,
  SYMPTOM_TRACKER_URL,
  type HubQuickLink
} from './urls'

export type PopupFooterLink = {
  id: string
  label: string
  description: string
  url: string
  icon: string
  /** Optional amber callout shown under the description. */
  warning?: string
}

export type PopupFooterIconAccent = {
  border: string
  bg: string
  icon: string
}

export const POPUP_FOOTER_LINK_ICON_ACCENTS: PopupFooterIconAccent[] = [
  { border: 'border-sky-500/50', bg: 'bg-sky-500/15', icon: 'text-sky-400' },
  { border: 'border-violet-500/50', bg: 'bg-violet-500/15', icon: 'text-violet-400' },
  { border: 'border-amber-500/50', bg: 'bg-amber-500/15', icon: 'text-amber-400' },
  { border: 'border-emerald-500/50', bg: 'bg-emerald-500/15', icon: 'text-emerald-400' },
  { border: 'border-rose-500/50', bg: 'bg-rose-500/15', icon: 'text-rose-400' },
  { border: 'border-cyan-500/50', bg: 'bg-cyan-500/15', icon: 'text-cyan-400' }
]

export function footerLinkIconAccent(index: number): PopupFooterIconAccent {
  return POPUP_FOOTER_LINK_ICON_ACCENTS[index % POPUP_FOOTER_LINK_ICON_ACCENTS.length]!
}

export type PopupFooterPanelConfig = {
  id: string
  title: string
  icon: string
  accent: PopupFooterIconAccent
  links: PopupFooterLink[]
}

/** VA.gov pages that pair with this extension (same URLs as ClaimBuilder records guides). */
export const VA_QUICK_LINKS: PopupFooterLink[] = [
  {
    id: 'decision-letters',
    label: 'Download decision letters',
    description: 'Rating decisions and benefit letters on VA.gov',
    url: 'https://www.va.gov/records/download-va-letters/',
    icon: 'i-lucide-file-text'
  },
  {
    id: 'foia-records',
    label: 'FOIA / records request',
    description: 'VA Form 20-10206 — claim file or C&P exam copies',
    url: 'https://www.va.gov/forms/20-10206/request-personal-records/introduction',
    icon: 'i-lucide-folder-search',
    warning: 'A full C-file request can take a year or longer. If you only need C&P exam results, request those specifically to avoid unnecessary delay.'
  },
  {
    id: 'track-claims',
    label: 'Track claims on VA.gov',
    description: 'Open Track Claims — sign in required',
    url: 'https://www.va.gov/track-claims/your-claims/',
    icon: 'i-lucide-clipboard-list'
  }
]

/** VCH tools from Hub /benefits (calculator, entitlements, and related apps). */
export const VCH_TOOLS_LINKS: PopupFooterLink[] = [
  {
    id: 'benefits-hub',
    label: 'Benefits tools hub',
    description: 'Overview of calculators, guides, and apps',
    url: hubUrlForActiveSession('/benefits'),
    icon: 'i-lucide-shield'
  },
  {
    id: 'claim-calculator',
    label: 'Claim calculator',
    description: '2026 disability pay, dependents, and TDIU estimates',
    url: hubUrlForActiveSession('/benefits/claim-calculator'),
    icon: 'i-lucide-calculator'
  },
  {
    id: 'entitlements',
    label: 'Entitlements guide',
    description: 'Federal, state, and healthcare benefits by rating',
    url: hubUrlForActiveSession('/benefits/entitlements'),
    icon: 'i-lucide-award'
  },
  {
    id: 'claimbuilder',
    label: 'ClaimBuilder',
    description: 'Draft statements, evidence, and workflow guides',
    url: CLAIMBUILDER_URL,
    icon: 'i-lucide-file-pen-line'
  },
  {
    id: 'symptom-tracker',
    label: 'Symptom Tracker',
    description: 'Log symptoms and export signed PDF reports',
    url: SYMPTOM_TRACKER_URL,
    icon: 'i-lucide-activity'
  }
]

export function hubQuickLinksAsFooterLinks(links: HubQuickLink[] = HUB_QUICK_LINKS): PopupFooterLink[] {
  return links.map(link => ({
    id: link.id,
    label: link.label,
    description: link.description,
    icon: link.icon,
    url: link.external ? link.path : hubUrlForActiveSession(link.path)
  }))
}
