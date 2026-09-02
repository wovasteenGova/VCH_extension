export type ParsedVaUserProfileForImport = {
  dateOfBirth?: string
  phone?: string
  fullName?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function normalizeIsoBirthDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined

  const trimmed = raw.trim()
  if (ISO_DATE.test(trimmed)) return trimmed

  const compact = trimmed.replace(/\D/g, '')
  if (compact.length === 8) {
    const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    if (ISO_DATE.test(iso)) {
      const date = new Date(`${iso}T12:00:00`)
      if (!Number.isNaN(date.getTime())) return iso
    }
  }

  return undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function formatUsPhone(areaCode: unknown, phoneNumber: unknown): string | undefined {
  const area = readString(areaCode)?.replace(/\D/g, '')
  const number = readString(phoneNumber)?.replace(/\D/g, '')
  if (!area || !number) return undefined

  if (number.length === 7) {
    return `(${area}) ${number.slice(0, 3)}-${number.slice(3)}`
  }

  if (number.length === 10) {
    return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`
  }

  return `(${area}) ${number}`.slice(0, 40)
}

function readPhoneFromVet360(vet360: Record<string, unknown>): string | undefined {
  for (const key of ['mobile_phone', 'home_phone', 'work_phone'] as const) {
    const entry = readRecord(vet360[key])
    if (!entry) continue
    const formatted = formatUsPhone(entry.area_code, entry.phone_number)
    if (formatted) return formatted
  }
  return undefined
}

function readAttributes(payload: unknown): Record<string, unknown> | null {
  const root = readRecord(payload)
  if (!root) return null

  const data = readRecord(root.data) || root
  return readRecord(data.attributes) || data
}

/** Fields ClaimBuilder Project settings can use, from `GET /v0/user`. */
export function parseVaUserProfileForClaimBuilder(payload: unknown): ParsedVaUserProfileForImport | null {
  const attrs = readAttributes(payload)
  if (!attrs) return null

  const profile = readRecord(attrs.profile)
  const vaProfile = readRecord(attrs.va_profile)
  const vet360 = readRecord(attrs.vet360_contact_information)

  const dateOfBirth = normalizeIsoBirthDate(profile?.birth_date)
    ?? normalizeIsoBirthDate(vaProfile?.birth_date)

  const phone = vet360 ? readPhoneFromVet360(vet360) : undefined

  const first = readString(profile?.first_name) || readString(profile?.givenName)
  const last = readString(profile?.last_name) || readString(profile?.familyName)
  const fullName = [first, last].filter(Boolean).join(' ') || undefined

  if (!dateOfBirth && !phone && !fullName) return null

  return {
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(phone ? { phone } : {}),
    ...(fullName ? { fullName } : {})
  }
}
