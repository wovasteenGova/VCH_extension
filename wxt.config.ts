import ui from '@nuxt/ui/vite'
import { defineConfig } from 'wxt'

const hubUrl = process.env.VITE_VCH_HUB_URL || 'https://veteranscentralhub.us'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Veterans Central Hub Connector',
    description: 'Connect VA.gov with Veterans Central Hub and ClaimBuilder.',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://www.va.gov/*',
      'https://*.veteranscentralhub.us/*',
      'https://*.veteranscentralhub.com/*'
    ],
    action: {
      default_title: 'Open VCH Connector'
    },
    externally_connectable: {
      matches: [
        `${hubUrl}/*`,
        'https://veteranscentralhub.us/*',
        'https://veteranscentralhub.com/*',
        'https://claimbuilder.veteranscentralhub.us/*',
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
