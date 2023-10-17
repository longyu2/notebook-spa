import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/LoginView.vue'
import Regist from '@/views/RegistView.vue'
import NoteBookView from '@/views/NoteBookView.vue'
import NoteBookPhoneView from '@/views/NoteBookPhoneView.vue'
import Admin from '@/views/AdminView.vue'
import Random from '@/views/RandomArticleView.vue'
import App from '@/App.vue'
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'app',
      component: App
    },
    {
      path: '/admin',
      name: 'admin',
      component: Admin
    },
    {
      path: '/random',
      name: 'random',
      component: Random
    },

    {
      path: '/login',
      name: 'login',
      component: Login
    },
    {
      path: '/regist',
      name: 'regist',
      component: Regist
    },
    {
      path: '/notebook',
      name: 'notebook',
      component: NoteBookView
    },
    {
      path: '/notebook_phone',
      name: 'phone',
      component: NoteBookPhoneView
      // redirect: "/notebook_phone/list",
    }
  ]
})

router.beforeEach((to, from) => {
  if (to.path != '/login' && to.path != '/regist') {
    if (localStorage.getItem('token') != null) {
      console.log('有token')
    } else {
      console.log('无token，请登录')
      return { name: 'login' }
    }
  }

  return true
  // 返回 false 以取消导航
})

export default router
