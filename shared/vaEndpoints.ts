/** VA.gov session API paths (v0): same JSON the official site loads when you are signed in. */
export const VA_API_ORIGIN = 'https://api.va.gov'

export const VA_ENDPOINTS = {
  claimsList: `${VA_API_ORIGIN}/v0/benefits_claims`,
  claimDetail: (id: string) => `${VA_API_ORIGIN}/v0/benefits_claims/${encodeURIComponent(id)}`,
  appeals: `${VA_API_ORIGIN}/v0/appeals`,
  ratedDisabilities: `${VA_API_ORIGIN}/v0/rated_disabilities`,
  user: `${VA_API_ORIGIN}/v0/user`,
  personalInformation: `${VA_API_ORIGIN}/v0/profile/personal_information`,
  serviceHistory: `${VA_API_ORIGIN}/v0/profile/service_history`,
  backendStatuses: `${VA_API_ORIGIN}/v0/backend_statuses`,
  maintenanceWindows: `${VA_API_ORIGIN}/v0/maintenance_windows`
} as const

/** Primary VA.gov entry: sign-in redirect lands here and unlocks the claims API. */
export const VA_TRACK_CLAIMS_PAGE = 'https://www.va.gov/track-claims/your-claims/'

export const VA_MY_VA_PAGE = 'https://www.va.gov/my-va/'

/** Content-script hosts for the VCH track-claims sync bar (signed-in VA workspace). */
export const VA_TRACK_CLAIMS_BAR_MATCHES = [
  'https://www.va.gov/track-claims/*',
  'https://va.gov/track-claims/*',
  'https://www.va.gov/records/download-va-letters/*',
  'https://va.gov/records/download-va-letters/*',
  'https://www.va.gov/my-va',
  'https://va.gov/my-va',
  'https://www.va.gov/my-va/*',
  'https://va.gov/my-va/*'
] as const

export function isVaMyVaPathname(pathname: string) {
  return pathname === '/my-va' || pathname.startsWith('/my-va/')
}

export const VA_CLAIMS_PAGE = VA_TRACK_CLAIMS_PAGE
export const VA_SIGN_IN_PAGE = VA_TRACK_CLAIMS_PAGE
export const VA_DISABILITY_RATING_PAGE = 'https://www.va.gov/disability/view-disability-rating/rating'
