import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'
import App from './App.vue'
import './main.css'

const app = createApp(App)
app.use(ui)
app.mount('#app')
