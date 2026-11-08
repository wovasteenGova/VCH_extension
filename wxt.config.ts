import ui from '@nuxt/ui/vite'
import { defineConfig } from 'wxt'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Bundle every icon used by our own source, including icons stored in link
// definitions. An extension should never need an external icon API to render.
function sourceIcons(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceIcons(path)
    if (!/\.(vue|ts)$/.test(entry.name)) return []
    return [...readFileSync(path, 'utf8').matchAll(/\bi-lucide-[a-z0-9-]+/g)].map(match => match[0].replace('i-lucide-', 'lucide:'))
  })
}
const localIcons = [...new Set(['entrypoints', 'shared'].flatMap(sourceIcons))].sort()

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'VCH Web Extension',
    description: 'VCH Web Extension: VA.gov tools, Hub, and ClaimBuilder shortcuts from your browser.',
    permissions: ['storage', 'cookies', 'scripting'],
    minimum_chrome_version: '120',
    homepage_url: 'https://www.veteranscentralhub.com/extension',
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
    host_permissions: [
      'https://api.va.gov/*', 'https://www.va.gov/*', 'https://va.gov/*',
      'https://veteranscentralhub.com/*', 'https://www.veteranscentralhub.com/*',
      'https://veteranscentralhub.us/*', 'https://www.veteranscentralhub.us/*',
      'https://claimbuilder.veteranscentralhub.com/*', 'https://claimbuilder.veteranscentralhub.us/*',
      'https://extension.veteranscentralhub.com/*', 'https://www.extension.veteranscentralhub.com/*',
      'https://extension.veteranscentralhub.us/*', 'https://www.extension.veteranscentralhub.us/*'
    ],
    action: {
      default_title: 'VCH Web Extension'
    },

  },
  vite: () => ({
    ssr: {
      noExternal: ['@nuxt/ui']
    },
    plugins: [
      ui({
        router: false,
        colorMode: true,
        icon: { clientBundle: { icons: localIcons, sizeLimitKb: 256 } },
        ui: {
          colors: {
            primary: 'brass',
            neutral: 'slate'
          },
          button: {
            slots: {
              base: 'cursor-pointer'
            }
          },
          tabs: {
            slots: {
              trigger: 'cursor-pointer'
            }
          }
        }
      })
    ]
  })
})
