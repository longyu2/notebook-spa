import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import '@/assets/css/pc.scss'
import '@/assets/css/phone.scss'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import Vant from 'vant'
import 'vant/lib/index.css'

import '@/assets/css/main.css'

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus)
app.use(router)

app.use(Vant)
app.mount('#app')
