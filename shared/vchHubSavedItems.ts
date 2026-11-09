/**
 * Hub "My saved" / bookmarked listings on veteranscentralhub.com are stored in
 * `localStorage` under the key `savedItems` (see Hub production bundle).
 * The extension reads that snapshot from an open Hub tab in the same browser.
 */

import { DEFAULT_HUB_ORIGIN } from '@/shared/hubOrigins'
import { extensionTabsApi } from '@/shared/extensionTabsApi'
import { hasLocalDataConsent, HUB_BOOKMARK_CACHE_KEY } from '@/shared/privacyConsent'

export const HUB_SAVED_ITEMS_STORAGE_KEY = 'savedItems' as const

export type HubSavedCategory = 'vetdeals' | 'blog' | 'services' | 'job' | 'federal-jobs'

export type HubSavedBookmarkRow = {
  id: string
  title: string
  url: string
  category: HubSavedCategory
  savedAt?: string
  /** First usable image from saved Hub records, if any */
  imageUrl: string | null
}

export type HubBookmarkSnapshot = { rows: HubSavedBookmarkRow[], totalCount: number }

export async function readHubBookmarkCache(): Promise<HubBookmarkSnapshot | null> {
  const stored = await browser.storage.local.get(HUB_BOOKMARK_CACHE_KEY).catch(() => ({} as Record<string, unknown>))
  const snapshot = stored[HUB_BOOKMARK_CACHE_KEY] as HubBookmarkSnapshot | undefined
  return snapshot && Array.isArray(snapshot.rows) && Number.isFinite(snapshot.totalCount) ? snapshot : null
}

export async function saveHubBookmarkCache(snapshot: HubBookmarkSnapshot) {
  if (!await hasLocalDataConsent()) return false
  return browser.storage.local.set({ [HUB_BOOKMARK_CACHE_KEY]: snapshot }).then(() => true).catch(() => false)
}

const HUB_TAB_URL_PATTERNS = [
  'https://www.veteranscentralhub.com/*',
  'https://veteranscentralhub.com/*',
  'https://www.veteranscentralhub.us/*',
  'https://veteranscentralhub.us/*'
] as const

const CATEGORIES: HubSavedCategory[] = ['vetdeals', 'blog', 'services', 'job', 'federal-jobs']

function normalizeTitle(title: string | undefined, fallback: string): string {
  const t = typeof title === 'string' ? title.trim() : ''
  return t || fallback
}

function isPlausibleImageUrl(s: string): boolean {
  const lower = s.toLowerCase()
  if (lower.includes('placeholder')) return false
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(s) || lower.includes('/image') || lower.includes('storage') || lower.includes('supabase')
}

function pickImageUrl(item: Record<string, unknown>): string | null {
  const keys = [
    'image_url',
    'featured_image',
    'preview_image',
    'preview',
    'thumbnail_url',
    'thumbnail',
    'logo_url',
    'logo',
    'company_logo',
    'photo_url',
    'photo',
    'image',
    'cover_image',
    'banner_url',
    'og_image'
  ]
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim()
      if (/^https:\/\//i.test(t) && isPlausibleImageUrl(t)) return t
    }
  }
  return null
}

function pickUrl(item: Record<string, unknown>, hubOrigin: string): string | null {
  const keys = ['url', 'link', 'href', 'website', 'externalUrl', 'applyUrl', 'application_url']
  for (const k of keys) {
    const v = item[k]
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim()
      if (/^https?:\/\//i.test(t)) return t
      if (t.startsWith('/')) return `${hubOrigin.replace(/\/$/, '')}${t}`
    }
  }
  return null
}

function stableId(category: HubSavedCategory, item: Record<string, unknown>, index: number): string {
  const id = item.id
  if (typeof id === 'number' || typeof id === 'string') return `${category}:${String(id)}`
  return `${category}:${index}`
}

type SavedItemsPayload = Partial<Record<HubSavedCategory, unknown[]>>

function parsePayload(raw: unknown): SavedItemsPayload {
  if (!raw || typeof raw !== 'object') return {}
  return raw as SavedItemsPayload
}

export class HubSavedItemsNoTabError extends Error {
  constructor() {
    super(
      'Open any page on veteranscentralhub.com in a tab on this device, then try again.'
    )
    this.name = 'HubSavedItemsNoTabError'
  }
}

async function resolveLatestHubTabId(): Promise<number | null> {
  const tabsApi = extensionTabsApi()
  if (!tabsApi?.query) return null

  const tabLists = await Promise.all(
    HUB_TAB_URL_PATTERNS.map(pattern => tabsApi.query({ url: pattern }))
  )
  const seenTab = new Set<number>()
  const tabs: Browser.tabs.Tab[] = []
  for (const list of tabLists) {
    for (const t of list) {
      if (t.id == null || seenTab.has(t.id)) continue
      seenTab.add(t.id)
      tabs.push(t)
    }
  }
  if (!tabs.length) return null

  tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
  return tabs[0]?.id ?? null
}

/** Take one snapshot of Hub localStorage so the rows and badge count agree. */
export async function fetchHubBookmarkSnapshot(): Promise<HubBookmarkSnapshot> {
  const tabId = await resolveLatestHubTabId()
  if (tabId == null) throw new HubSavedItemsNoTabError()

  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: (key: string) => localStorage.getItem(key),
    args: [HUB_SAVED_ITEMS_STORAGE_KEY]
  })
  const raw = results[0]?.result
  if (raw === undefined) throw new HubSavedItemsNoTabError()
  return parseHubBookmarkSnapshot(raw)
}

export function parseHubBookmarkSnapshot(raw: string | null): HubBookmarkSnapshot {
  const payload = parsePayload(raw === null ? null : JSON.parse(raw))
  const hubOrigin = DEFAULT_HUB_ORIGIN
  const rows: HubSavedBookmarkRow[] = []
  const seenUrl = new Set<string>()
  let totalCount = 0

  for (const category of CATEGORIES) {
    const list = payload[category]
    if (!Array.isArray(list)) continue
    totalCount += list.length
    list.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return
      const obj = entry as Record<string, unknown>
      const url = pickUrl(obj, hubOrigin)
      if (!url) return
      const norm = url.toLowerCase()
      if (seenUrl.has(norm)) return
      seenUrl.add(norm)

      const title = normalizeTitle(
        [obj.title, obj.name, obj.headline, obj.company_name, obj.label].find(
          v => typeof v === 'string'
        ) as string | undefined,
        url
      )

      const savedAt = typeof obj.saved_at === 'string' ? obj.saved_at : undefined
      const imageUrl = pickImageUrl(obj)

      rows.push({
        id: stableId(category, obj, index),
        title,
        url,
        category,
        savedAt,
        imageUrl
      })
    })
  }

  rows.sort((a, b) => {
    const ta = a.savedAt ? Date.parse(a.savedAt) : 0
    const tb = b.savedAt ? Date.parse(b.savedAt) : 0
    return tb - ta
  })

  return { rows: rows.slice(0, 500), totalCount }
}
