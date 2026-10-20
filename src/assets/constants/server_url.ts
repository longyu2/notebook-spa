// 将APIurl作为常量输出提供给其他

/* 后端地址的唯一来源。
   不再写死域名 —— 前端部署在哪，就打到哪的同源 /v1：
   线上 nginx 把 :9995/v1/ 反代到后端 :9994，所以同源地址天然可用，
   换域名、换端口、走内网 IP 都不用再改代码。
   唯一例外是 vite 本地开发（:5173）没有配 /v1 反代，直连本机后端。 */
const DEV_SERVER_URL = 'http://localhost:9999/v1'

/* 历史上写死过的默认值，现在都不可达：
   - *:9999 —— 9999 只监听本机，没有对外暴露
   - https://misaka-mikoto.cn:9995 —— 9995 是 http，没有 TLS
   浏览器里已经存了这些值的用户会一直卡在「登录失败」，读到就替换成新默认值。 */
const LEGACY_DEFAULTS = [
  'http://home.misaka-mikoto.cn:9999/v1',
  'http://b.misaka-mikoto.cn:9999/v1',
  'https://misaka-mikoto.cn:9995/v1'
]

function defaultServerUrl(): string {
  const { origin, port, protocol } = window.location
  // 本地开发服务没有 /v1 反代，直连本机后端
  if (port === '5173') return DEV_SERVER_URL
  // 直接 file:// 打开构建产物时没有可用 origin
  if (protocol === 'file:') return DEV_SERVER_URL
  return `${origin}/v1`
}

let server_url: string = defaultServerUrl()

const stored = localStorage.getItem('server_url')
if (stored == null || LEGACY_DEFAULTS.includes(stored)) {
  localStorage.setItem('server_url', server_url)
} else {
  server_url = stored
}

export { server_url }
