import {
  fetchVaPersonalInformation,
  fetchVaServiceHistory,
  fetchVaUser
} from './vaClient'
import { readVaDeviceCache, saveVaProfileCache } from './vaDeviceCache'
import { parseVaServiceHistoryForImport } from './vaServiceHistoryParse'
import {
  mergeVaUserProfileImports,
  parseVaPersonalInformationForImport,
  parseVaUserProfileForClaimBuilder,
  type ParsedVaUserProfileForImport
} from './vaUserProfileParse'

export async function fetchVaUserProfileForImport(): Promise<ParsedVaUserProfileForImport | null> {
  const [userResponse, personalResponse, historyResponse] = await Promise.all([
    fetchVaUser(),
    fetchVaPersonalInformation(),
    fetchVaServiceHistory()
  ])

  const fromUser = userResponse.ok
    ? parseVaUserProfileForClaimBuilder(userResponse.data)
    : null
  const fromPersonal = personalResponse.ok
    ? parseVaPersonalInformationForImport(personalResponse.data)
    : null
  const servicePeriods = historyResponse.ok
    ? parseVaServiceHistoryForImport(historyResponse.data)
    : []

  return mergeVaUserProfileImports(
    fromUser,
    fromPersonal,
    servicePeriods.length ? { servicePeriods } : null
  )
}

export async function hydrateVaProfileFromDevice(): Promise<ParsedVaUserProfileForImport | null> {
  const cache = await readVaDeviceCache()
  return cache.profile
}

export async function refreshVaProfileForImport(): Promise<ParsedVaUserProfileForImport | null> {
  const cached = await hydrateVaProfileFromDevice()
  const live = await fetchVaUserProfileForImport()
  const merged = mergeVaUserProfileImports(cached, live)

  if (merged) {
    await saveVaProfileCache(merged)
    return merged
  }

  return cached
}
