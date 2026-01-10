import { createRouter, createWebHistory } from 'vue-router'

const Login = () => import('@/views/LoginView.vue')
const Regist = () => import('@/views/RegistView.vue')
const NoteBookView = () => import('@/views/NoteBookView.vue')

const NoteBookPhoneView = () => import('@/views/NoteBookPhoneView.vue')
const DiskView = () => import('@/views/WebDiskView.vue')
const Admin = () => import('@/views/AdminView.vue')

const Random = () => import('@/views/RandomArticleView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/notebook' },
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
    },
    {
      path: '/disk',
      name: 'disk',
      component: DiskView
    },
    {
      path: '/show',
      name: 'show',
      component: () => import('@/views/ShowView.vue')
    }
  ]
})

router.beforeEach((to, from) => {
  if (to.path != '/login' && to.path != '/regist' && to.path != '/disk') {
    if (localStorage.getItem('token') == null) {
      return { name: 'login' }
    }
  }

  return true
  // 返回 false 以取消导航
})

export default router
