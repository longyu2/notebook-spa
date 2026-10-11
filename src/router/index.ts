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
      component: Random,
      // 整页长文，需要文档级滚动（见 main.scss 的 body.page-scroll）
      meta: { pageScroll: true }
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
      component: () => import('@/views/ShowView.vue'),
      // 整页长文，需要文档级滚动（见 main.scss 的 body.page-scroll）
      meta: { pageScroll: true }
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

/* 全局 body 是 overflow: hidden（笔记页三栏各自内部滚，不需要文档级滚动）。
   数据统计 / 随机推荐这类整页长文必须放开，否则滚动条消失、滚轮也推不动。
   用路由 meta 声明，进出这些页面时切 body 上的 class。 */
router.afterEach((to) => {
  document.body.classList.toggle('page-scroll', !!to.meta.pageScroll)
})

export default router
