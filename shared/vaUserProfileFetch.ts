import {
  fetchVaPersonalInformation,
  fetchVaServiceHistory,
  fetchVaUser
} from './vaClient'
import { checkVaCacheEpoch, readVaDeviceCache, saveVaProfileCache } from './vaDeviceCache'
import { parseVaServiceHistoryForImport } from './vaServiceHistoryParse'
import {
  mergeVaUserProfileImports,
  parseVaPersonalInformationForImport,
  parseVaUserProfileForClaimBuilder,
  type ParsedVaUserProfileForImport
} from './vaUserProfileParse'

export async function refreshVaProfileForImport(): Promise<ParsedVaUserProfileForImport | null> {
  const [userResponse, personalResponse, historyResponse] = await Promise.all([
    fetchVaUser(),
    fetchVaPersonalInformation(),
    fetchVaServiceHistory()
  ])

  const cached = (await readVaDeviceCache()).profile
  if (!userResponse.ok || !userResponse.ownerEpoch) return cached
  const { ownerEpoch } = userResponse
  if (!await checkVaCacheEpoch(ownerEpoch)) return null
  const fromUser = parseVaUserProfileForClaimBuilder(userResponse.data)
  const fromPersonal = personalResponse.ok && personalResponse.ownerEpoch === ownerEpoch
    ? parseVaPersonalInformationForImport(personalResponse.data)
    : null
  const servicePeriods = historyResponse.ok && historyResponse.ownerEpoch === ownerEpoch
    ? parseVaServiceHistoryForImport(historyResponse.data)
    : []

  const live = mergeVaUserProfileImports(
    fromUser,
    fromPersonal,
    servicePeriods.length ? { servicePeriods } : null
  )
  if (!live) return cached
  await saveVaProfileCache(live, ownerEpoch)
  return await checkVaCacheEpoch(ownerEpoch) ? mergeVaUserProfileImports(cached, live) : null
}
