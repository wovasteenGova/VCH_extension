import {
  clearRatingsPasskeyLockCredential,
  getRatingsLockStatus,
  isRatingsPasskeySupported,
  registerRatingsPasskeyLock,
  unlockRatingsWithPasskey
} from '@/shared/ratingsPasskeyLock'

const unlocked = ref(false)
const hasCredential = ref(false)
const supported = ref(false)
const busy = ref(false)
const lockError = ref<string | null>(null)
let initialized = false

export function useRatingsPasskeyLock() {
  async function init() {
    if (initialized) return

    supported.value = isRatingsPasskeySupported()
    const status = await getRatingsLockStatus()
    hasCredential.value = status.hasCredential
    initialized = true
  }

  function lock() {
    unlocked.value = false
  }

  async function setupLock() {
    busy.value = true
    lockError.value = null

    try {
      await registerRatingsPasskeyLock()
      hasCredential.value = true
      unlocked.value = true
    } catch (error) {
      lockError.value = error instanceof Error ? error.message : 'Could not set up passkey.'
      unlocked.value = false
    } finally {
      busy.value = false
    }
  }

  async function unlock() {
    busy.value = true
    lockError.value = null

    try {
      unlocked.value = await unlockRatingsWithPasskey()
      if (!unlocked.value) {
        lockError.value = 'Passkey verification failed.'
      }
    } catch (error) {
      lockError.value = error instanceof Error ? error.message : 'Could not verify passkey.'
      unlocked.value = false
    } finally {
      busy.value = false
    }
  }

  async function removeLock() {
    busy.value = true
    lockError.value = null

    try {
      const ok = await unlockRatingsWithPasskey()
      if (!ok) {
        throw new Error('Could not verify passkey.')
      }
      await clearRatingsPasskeyLockCredential()
      hasCredential.value = false
      unlocked.value = false
    } catch (error) {
      lockError.value = error instanceof Error ? error.message : 'Could not remove passkey lock.'
    } finally {
      busy.value = false
    }
  }

  return {
    unlocked,
    hasCredential,
    supported,
    busy,
    lockError,
    init,
    lock,
    setupLock,
    unlock,
    removeLock
  }
}
