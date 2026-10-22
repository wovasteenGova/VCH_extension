import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'
import { bindAutoHideScrollbars } from '@/shared/autoHideScrollbar'
import { applyPopupUiScale, readPopupUiScale } from '@/shared/popupUiScale'
import App from './App.vue'
import './main.css'

async function bootstrap() {
  applyPopupUiScale(await readPopupUiScale())

  const app = createApp(App)
  app.use(ui)
  app.mount('#app')
  bindAutoHideScrollbars(document)
}

void bootstrap()
