const STORAGE_CREDENTIAL_ID = 'vch_ratings_lock_credential_id'

export type RatingsLockStatus = {
  hasCredential: boolean
}

function extensionRpId() {
  if (typeof window === 'undefined') return 'vch-extension'

  const { protocol, hostname } = window.location
  if (protocol === 'chrome-extension:' || protocol === 'moz-extension:') {
    return hostname
  }

  return hostname || 'localhost'
}

function bufferToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuffer(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function passkeyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Passkey prompt was closed or timed out. Try again when ready.'
    }
    if (error.name === 'SecurityError') {
      return 'This browser blocked the passkey request. Try Edge or Chrome on this device.'
    }
    if (error.name === 'InvalidStateError') {
      return 'A ratings passkey is already set up on this device.'
    }
    if (error.message) return error.message
  }

  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function isRatingsPasskeySupported() {
  return typeof PublicKeyCredential !== 'undefined'
    && typeof navigator.credentials?.create === 'function'
    && typeof navigator.credentials?.get === 'function'
}

export async function getRatingsLockStatus(): Promise<RatingsLockStatus> {
  const stored = await browser.storage.local.get(STORAGE_CREDENTIAL_ID)
  const credentialId = stored[STORAGE_CREDENTIAL_ID]
  return {
    hasCredential: typeof credentialId === 'string' && credentialId.length > 0
  }
}

export async function registerRatingsPasskeyLock() {
  if (!isRatingsPasskeySupported()) {
    throw new Error('Passkeys are not supported in this browser.')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))
  const rpId = extensionRpId()

  let credential: PublicKeyCredential | null

  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'VCH Web Extension',
          id: rpId
        },
        user: {
          id: userId,
          name: 'vch-ratings-lock',
          displayName: 'VCH disability ratings'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required'
        },
        timeout: 60_000
      }
    }) as PublicKeyCredential | null
  } catch (error) {
    throw new Error(passkeyErrorMessage(error, 'Could not create a device passkey.'))
  }

  if (!credential) {
    throw new Error('Passkey setup was cancelled.')
  }

  await browser.storage.local.set({
    [STORAGE_CREDENTIAL_ID]: bufferToBase64url(credential.rawId)
  })
}

export async function unlockRatingsWithPasskey() {
  if (!isRatingsPasskeySupported()) {
    throw new Error('Passkeys are not supported in this browser.')
  }

  const stored = await browser.storage.local.get(STORAGE_CREDENTIAL_ID)
  const credentialId = stored[STORAGE_CREDENTIAL_ID]
  if (typeof credentialId !== 'string' || !credentialId) {
    throw new Error('Set up a device passkey before viewing ratings.')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const rpId = extensionRpId()

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: [{
          id: base64urlToBuffer(credentialId),
          type: 'public-key',
          transports: ['internal', 'hybrid']
        }],
        userVerification: 'required',
        timeout: 60_000
      }
    })

    return Boolean(assertion)
  } catch (error) {
    throw new Error(passkeyErrorMessage(error, 'Could not verify your passkey.'))
  }
}

export async function removeRatingsPasskeyLock() {
  await unlockRatingsWithPasskey()
  await browser.storage.local.remove(STORAGE_CREDENTIAL_ID)
}
