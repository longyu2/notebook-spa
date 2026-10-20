import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// 后端地址归一（副作用）：无论从哪个路由进来，都先把 localStorage.server_url
// 里的历史坏值（未暴露的 :9999 / 无 TLS 的 https:9995）换成可达的同源地址
import '@/assets/constants/server_url'

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import '@/assets/css/pc.scss'
import '@/assets/css/phone.scss'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import Vant from 'vant'

import '@/assets/css/main.scss'
import '@/assets/css/tools/bttn.min.css'

// 这个拦截器会暴露到子组件中去，即子组件引入的axios依然能拥有token请求头
import axios from 'axios'
axios.interceptors.request.use(
  function (config) {
    // 在发送请求之前做些什么
    config.headers.Authorization = localStorage.getItem('token')
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
