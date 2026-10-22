import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'
import { bindAutoHideScrollbars } from '@/shared/autoHideScrollbar'
import { applyPopupUiScale, readPopupUiScale } from '@/shared/popupUiScale'
import { applyPopupColorTheme, readPopupColorTheme } from '@/shared/popupColorTheme'
import { isExpandedPopupWindow, markExpandedPopupWindow } from '@/shared/popupWindow'
import App from './App.vue'
import './main.css'

async function bootstrap() {
  if (isExpandedPopupWindow()) markExpandedPopupWindow()
  applyPopupUiScale(await readPopupUiScale())
  applyPopupColorTheme(await readPopupColorTheme())

  const app = createApp(App)
  app.use(ui)
  app.mount('#app')
  bindAutoHideScrollbars(document)
}

void bootstrap()
