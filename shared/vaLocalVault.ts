export const VA_VAULT_CONFIG_KEY = 'vch-va-vault-v1'
export const VA_VAULT_SESSION_KEY = 'vch-va-vault-unlocked-v1'

const PASSPHRASE_CHECK = 'VCH VA cache v1'
const PBKDF2_ITERATIONS = 600_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type SealedRecord = { version: 1, iv: string, ciphertext: string }
type VaultConfig = { id: string, salt: string, check: SealedRecord }
type VaultSession = { id: string, key: string }
export type VaVaultStatus = 'session' | 'locked' | 'unlocked'

export function withVaVaultLock<T>(task: () => Promise<T>) {
  return globalThis.navigator?.locks?.request('vch-va-local-vault', task) ?? task()
}

function encode(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

function decode(base64: string) {
  return Uint8Array.from(atob(base64), byte => byte.charCodeAt(0))
}

async function seal(name: string, value: unknown, key: CryptoKey): Promise<SealedRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(name) },
    key,
    encoder.encode(JSON.stringify(value))
  )
  return { version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }
}

async function unseal(name: string, value: SealedRecord, key: CryptoKey): Promise<unknown> {
  if (value?.version !== 1 || typeof value.iv !== 'string' || typeof value.ciphertext !== 'string') {
    throw new Error('The saved VA data is in an unsupported format.')
  }
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(value.iv), additionalData: encoder.encode(name) },
    key,
    decode(value.ciphertext)
  )
  return JSON.parse(decoder.decode(clear))
}

async function readConfig() {
  return (await browser.storage.local.get(VA_VAULT_CONFIG_KEY))[VA_VAULT_CONFIG_KEY] as VaultConfig | undefined
}

async function readSession(config: VaultConfig) {
  const stored = await browser.storage.session.get(VA_VAULT_SESSION_KEY)
  const session = stored[VA_VAULT_SESSION_KEY] as VaultSession | undefined
  return session?.id === config.id && typeof session.key === 'string' ? session : undefined
}

async function sessionKey(config: VaultConfig) {
  const session = await readSession(config)
  if (!session) return null
  return crypto.subtle.importKey('raw', decode(session.key), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function readVaVaultStatus(): Promise<VaVaultStatus> {
  const config = await readConfig()
  if (!config) return 'session'
  return await readSession(config) ? 'unlocked' : 'locked'
}

function isVaRecord(name: string) {
  return name === 'vch-va-device-cache-v1' || name === 'vch-va-cache-owner-v1'
    || name.startsWith('vch-va-letter-status:') || name.startsWith('vch-va-profile-sync:')
}

export function prepareVaSessionCache() {
  return withVaVaultLock(async () => {
    if (await readConfig()) return
    const local = await browser.storage.local.get(null)
    const names = Object.keys(local).filter(isVaRecord)
    if (!names.length) return
    const session = await browser.storage.session.get(names)
    await browser.storage.session.set(Object.fromEntries(names.map(name => [name, session[name] ?? local[name]])))
    await browser.storage.local.remove(names)
  })
}

export function unlockVaVault(passphrase: string, hasConsent: () => Promise<boolean>) {
  return withVaVaultLock(async () => {
    if (!await hasConsent()) throw new Error('Enable VA data access first.')
    const existing = await readConfig()
    if (!passphrase || passphrase.length > 1024 || (!existing && passphrase.length < 12)) {
      throw new Error('Enter a passphrase of at least 12 characters.')
    }
    const salt = existing?.salt ?? encode(crypto.getRandomValues(new Uint8Array(16)))
    const secret = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: decode(salt), iterations: PBKDF2_ITERATIONS },
      secret,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
    if (existing) {
      const verified = await unseal(VA_VAULT_CONFIG_KEY, existing.check, key).catch(() => null)
      if (verified !== PASSPHRASE_CHECK) throw new Error('Could not unlock saved VA data. Check your passphrase.')
    }
    const id = existing?.id ?? crypto.randomUUID()
    const raw = await crypto.subtle.exportKey('raw', key)
    const session = { id, key: encode(new Uint8Array(raw)) }
    if (!existing) {
      const local = await browser.storage.local.get(null)
      const inMemory = await browser.storage.session.get(null)
      const names = Object.keys({ ...local, ...inMemory }).filter(isVaRecord)
      const records: Record<string, unknown> = {}
      for (const name of names) {
        records[name] = await seal(name, inMemory[name] ?? local[name], key)
      }
      records[VA_VAULT_CONFIG_KEY] = { id, salt, check: await seal(VA_VAULT_CONFIG_KEY, PASSPHRASE_CHECK, key) }
      await browser.storage.session.set({ [VA_VAULT_SESSION_KEY]: session })
      try {
        await browser.storage.local.set(records)
      } catch (error) {
        await browser.storage.session.remove(VA_VAULT_SESSION_KEY)
        throw error
      }
      await browser.storage.session.remove(names)
      return
    }
    await browser.storage.session.set({ [VA_VAULT_SESSION_KEY]: session })
  })
}

export function lockVaVault() {
  return withVaVaultLock(() => browser.storage.session.remove(VA_VAULT_SESSION_KEY))
}

export function useVaSessionCache() {
  return withVaVaultLock(async () => {
    const config = await readConfig()
    if (!config) return
    const key = await sessionKey(config)
    if (!key) throw new Error('Unlock saved VA data first.')
    const local = await browser.storage.local.get(null)
    const names = Object.keys(local).filter(isVaRecord)
    const records: Record<string, unknown> = {}
    for (const name of names) {
      records[name] = await unseal(name, local[name] as SealedRecord, key)
    }
    await browser.storage.session.set(records)
    try {
      await browser.storage.local.remove([VA_VAULT_CONFIG_KEY, ...names])
    } catch (error) {
      await browser.storage.session.remove(names)
      throw error
    }
    await browser.storage.session.remove(VA_VAULT_SESSION_KEY)
  })
}

export async function readVaVaultRecord<T>(name: string): Promise<T | undefined> {
  const config = await readConfig()
  if (!config) return (await browser.storage.session.get(name))[name] as T | undefined
  const key = await sessionKey(config)
  if (!key) return undefined
  const value = (await browser.storage.local.get(name))[name] as SealedRecord | undefined
  return value === undefined ? undefined : await unseal(name, value, key) as T
}

/** Call within withVaVaultLock so a lock or reset cannot race the write. */
export async function writeVaVaultRecord(name: string, value: unknown) {
  const config = await readConfig()
  if (!config) {
    await browser.storage.session.set({ [name]: value })
    return true
  }
  const key = await sessionKey(config)
  if (!key) return false
  await browser.storage.local.set({ [name]: await seal(name, value, key) })
  return true
}
