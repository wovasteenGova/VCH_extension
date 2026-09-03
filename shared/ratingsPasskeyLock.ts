const STORAGE_CREDENTIAL_ID = 'vch_ratings_lock_credential_id'
const STORAGE_CREDENTIAL_TRANSPORTS = 'vch_ratings_lock_credential_transports'

const DEFAULT_PASSKEY_TRANSPORTS: AuthenticatorTransport[] = [
  'internal',
  'hybrid',
  'usb',
  'nfc',
  'ble'
]

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
      return 'This browser blocked the passkey request. Try Edge or Chrome, or choose a different passkey option.'
    }
    if (error.name === 'InvalidStateError') {
      return 'A ratings passkey is already set up for this extension.'
    }
    if (error.message) return error.message
  }

  if (error instanceof Error && error.message) return error.message
  return fallback
}

function readCredentialTransports(value: unknown): AuthenticatorTransport[] {
  if (!Array.isArray(value)) return DEFAULT_PASSKEY_TRANSPORTS
  const allowed = new Set<AuthenticatorTransport>(DEFAULT_PASSKEY_TRANSPORTS)
  const transports = value.filter(
    (entry): entry is AuthenticatorTransport =>
      typeof entry === 'string' && allowed.has(entry as AuthenticatorTransport)
  )
  return transports.length ? transports : DEFAULT_PASSKEY_TRANSPORTS
}

function credentialTransports(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse
  if (typeof response.getTransports === 'function') {
    const transports = response.getTransports()
    if (transports.length) return transports
  }
  return DEFAULT_PASSKEY_TRANSPORTS
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
          residentKey: 'preferred',
          userVerification: 'required'
        },
        attestation: 'none',
        timeout: 60_000
      }
    }) as PublicKeyCredential | null
  } catch (error) {
    throw new Error(passkeyErrorMessage(error, 'Could not create a passkey.'))
  }

  if (!credential) {
    throw new Error('Passkey setup was cancelled.')
  }

  await browser.storage.local.set({
    [STORAGE_CREDENTIAL_ID]: bufferToBase64url(credential.rawId),
    [STORAGE_CREDENTIAL_TRANSPORTS]: credentialTransports(credential)
  })
}

export async function unlockRatingsWithPasskey() {
  if (!isRatingsPasskeySupported()) {
    throw new Error('Passkeys are not supported in this browser.')
  }

  const stored = await browser.storage.local.get([
    STORAGE_CREDENTIAL_ID,
    STORAGE_CREDENTIAL_TRANSPORTS
  ])
  const credentialId = stored[STORAGE_CREDENTIAL_ID]
  if (typeof credentialId !== 'string' || !credentialId) {
    throw new Error('Set up a passkey before viewing ratings.')
  }

  const transports = readCredentialTransports(stored[STORAGE_CREDENTIAL_TRANSPORTS])
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
          transports
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

export async function clearRatingsPasskeyLockCredential() {
  await browser.storage.local.remove([
    STORAGE_CREDENTIAL_ID,
    STORAGE_CREDENTIAL_TRANSPORTS
  ])
}
