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

// 这个拦截器会暴露到子组件中去，即子组件引入的axios依然能拥有token请求头
import axios from 'axios'
axios.interceptors.request.use(
  function (config) {
    // 在发送请求之前做些什么
    config.headers.Authorization = localStorage.getItem('token2')
    return config
  },
  function (error) {
    // 对请求错误做些什么
    return Promise.reject(error)
  }
)

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus)
app.use(router)

app.use(Vant)
app.mount('#app')
