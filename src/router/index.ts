import { createRouter, createWebHistory } from 'vue-router'

const Login = () => import('@/views/LoginView.vue')
const Regist = () => import('@/views/RegistView.vue')
const NoteBookView = () => import('@/views/NoteBookView.vue')

const NoteBookPhoneView = () => import('@/views/NoteBookPhoneView.vue')
const DiskView = () => import('@/views/WebDiskView.vue')
const Admin = () => import('@/views/AdminView.vue')

const Random = () => import('@/views/RandomArticleView.vue')

/* 公开页：列表和详情共用同一个组件，靠 /public/:aid 参数切换 */
const PublicBlog = () => import('@/views/PublicBlogView.vue')

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
    },

    /* 搜索：左侧搜索框回车后跳到这里，卡片式展示「全部笔记」的命中结果。
       需要登录（不在 OPEN_PATHS 里），所以只搜得到自己的文章。 */
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchView.vue'),
      meta: { pageScroll: true }
    },
    /* 搜索结果的单篇详情：同一个组件靠 /search/:aid 参数切换，
       点卡片后原地用 MdArticle 渲染全文（和随机推荐同一套效果），
       不再跳回笔记主页。 */
    {
      path: '/search/:aid',
      name: 'searchArticle',
      component: () => import('@/views/SearchView.vue'),
      meta: { pageScroll: true }
    },

    /* 公开页：不需要登录，任何人都能看（只显示 is_public = 1 的文章） */
    {
      path: '/public',
      name: 'public',
      component: PublicBlog,
      meta: { pageScroll: true }
    },
    {
      path: '/public/:aid',
      name: 'publicArticle',
      component: PublicBlog,
      meta: { pageScroll: true }
    },

    /* 阅览模式：替代主页的只读整页 —— 左边文件夹 + 文章列表，右边只读渲染全文。
       和搜索页的唯一差别是「不筛关键词」，其余（卡片、排序、分页、详情）同一套。
       需要登录（不在 OPEN_PATHS 里）。
       详情态 /reading/:aid 复用同一个组件，靠 :aid 参数切换。 */
    {
      path: '/reading',
      name: 'reading',
      component: () => import('@/views/ReadingView.vue'),
      meta: { pageScroll: true }
    },
    {
      path: '/reading/:aid',
      name: 'readingArticle',
      component: () => import('@/views/ReadingView.vue'),
      meta: { pageScroll: true }
    }
  ]
})

/* 免登录可访问的路径前缀（/disk 是历史遗留，保持原样不动） */
const OPEN_PATHS = ['/login', '/regist', '/disk', '/public']

router.beforeEach((to, from) => {
  const open = OPEN_PATHS.some(
    (p) => to.path === p || to.path.startsWith(p + '/')
  )

  if (!open && localStorage.getItem('token') == null) {
    /* 未登录的访客不再直接扔到登录页：站点对外的门面是公开页（像博客首页），
       登录入口放在公开页右上角。这样分享出去的链接对方能看到内容。 */
    return { name: 'public' }
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
