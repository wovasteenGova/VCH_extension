import ui from '@nuxt/ui/vite'
import { defineConfig } from 'wxt'

const hubUrl = process.env.VITE_VCH_HUB_URL || 'https://www.veteranscentralhub.com'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'VCH Web Extension',
    description: 'VCH Web Extension — VA.gov tools, Hub, and ClaimBuilder shortcuts from your browser.',
    permissions: ['storage', 'cookies', 'scripting'],
    host_permissions: [
      'https://api.va.gov/*',
      'https://www.va.gov/*',
      'https://va.gov/*',
      'https://veteranscentralhub.com/*',
      'https://*.veteranscentralhub.com/*',
      'https://veteranscentralhub.us/*',
      'https://*.veteranscentralhub.us/*',
      'https://claimbuilder.veteranscentralhub.com/*'
    ],
    action: {
      default_title: 'VCH Web Extension'
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
