import ui from '@nuxt/ui/vite'
import { defineConfig } from 'wxt'

const hubUrl = process.env.VITE_VCH_HUB_URL || 'https://www.veteranscentralhub.com'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Veterans Central Hub',
    description: 'Track VA claims from your signed-in VA.gov session, plus quick access to Veterans Central Hub.',
    permissions: ['storage', 'cookies'],
    host_permissions: [
      'https://api.va.gov/*',
      'https://www.va.gov/*',
      'https://va.gov/*',
      'https://veteranscentralhub.com/*',
      'https://*.veteranscentralhub.com/*',
      'https://veteranscentralhub.us/*',
      'https://*.veteranscentralhub.us/*'
    ],
    action: {
      default_title: 'VCH — Claim tracker & Hub'
    },
    externally_connectable: {
      matches: [
        `${hubUrl}/*`,
        'https://veteranscentralhub.com/*',
        'https://www.veteranscentralhub.com/*',
        'https://veteranscentralhub.us/*',
        'https://www.veteranscentralhub.us/*',
        'https://claimbuilder.veteranscentralhub.com/*'
      ]
    }
  },
  vite: () => ({
    ssr: {
      noExternal: ['@nuxt/ui']
    },
    plugins: [
      ui({
        router: false,
        ui: {
          colors: {
            primary: 'brass',
            neutral: 'slate'
          }
        }
      })
    ]
  })
})
