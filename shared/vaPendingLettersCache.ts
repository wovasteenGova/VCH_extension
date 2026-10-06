import type { TrackLetterUploadPayload } from './vaClaimLetters'

export const VA_PENDING_TRACK_LETTERS_KEY = 'vch-va-pending-track-letters-v1'

export type VaPendingTrackLetters = {
  savedAt: string
  letters: TrackLetterUploadPayload[]
}

export async function savePendingTrackLetters(letters: TrackLetterUploadPayload[]) {
  if (!letters.length || !browser.storage?.local?.set) return
  const payload: VaPendingTrackLetters = {
    savedAt: new Date().toISOString(),
    letters: letters.slice(0, 10)
  }
  await browser.storage.local.set({ [VA_PENDING_TRACK_LETTERS_KEY]: payload })
}

export async function readPendingTrackLetters(): Promise<TrackLetterUploadPayload[]> {
  if (!browser.storage?.local?.get) return []
  const stored = await browser.storage.local.get(VA_PENDING_TRACK_LETTERS_KEY)
  const record = stored[VA_PENDING_TRACK_LETTERS_KEY] as VaPendingTrackLetters | undefined
  if (!record || !Array.isArray(record.letters)) return []
  return record.letters
}

export async function clearPendingTrackLetters() {
  if (!browser.storage?.local?.remove) return
  await browser.storage.local.remove(VA_PENDING_TRACK_LETTERS_KEY)
}
