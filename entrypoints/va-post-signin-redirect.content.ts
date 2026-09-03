import { consumeVaTrackClaimsIntent } from '@/shared/vaSignInNavigation'
import { VA_TRACK_CLAIMS_PAGE } from '@/shared/vaEndpoints'

export default defineContentScript({
  matches: [
    'https://www.va.gov/my-va/*',
    'https://va.gov/my-va/*'
  ],
  runAt: 'document_idle',
  main() {
    void consumeVaTrackClaimsIntent().then((shouldRedirect) => {
      if (!shouldRedirect) return
      window.location.replace(VA_TRACK_CLAIMS_PAGE)
    })
  }
})
