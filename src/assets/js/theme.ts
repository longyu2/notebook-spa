/* 主题：全局只有两态
   - 'semiTransparent'：铺壁纸 + 暗色半透面板 + 白字
   - 'light'          ：浅白底 + 黑字（localStorage 里历史残留的 'dark'/'no' 一律归到这一档）

   主题是往 <body> 上挂 `data-theme` 属性 + 两个内联变量实现的（vditor 那套还得额外挂到
   .vditor 元素上，见 ArticleContent.vue 的 setTheme）。因为没有响应式链路，
   切换后统一整页刷新最稳，也保证编辑器 / 各独立页渲染完全一致。 */

export type Theme = 'light' | 'semiTransparent'

const KEY = 'theme'

/** 归一化：localStorage 里可能是 light / dark / no / semiTransparent 等历史值 */
export function normalizeTheme(raw: string | null | undefined): Theme {
  return raw === 'semiTransparent' ? 'semiTransparent' : 'light'
}

export function getTheme(): Theme {
  return normalizeTheme(localStorage.getItem(KEY))
}

/** 把主题写到 body（+ vditor 实例，如果页面上有）——和各页现有实现保持一致 */
export function applyTheme(theme: Theme) {
  document.body.setAttribute('data-theme', theme)

  if (theme === 'semiTransparent') {
    document.body.style.setProperty('--word-color', 'white')
    document.body.style.setProperty('--all-backcolor', 'rgba(0, 0, 0, 0.1)')

    const el = document.body.querySelector('.vditor') as HTMLElement | null
    if (el) {
      el.style.setProperty('--panel-background-color', 'rgba(0, 0, 0, 0.1)')
      el.style.setProperty('--toolbar-background-color', 'rgba(0, 0, 0, 0.3)')
      el.style.setProperty('--textarea-background-color', 'rgba(0, 0, 0, 0.2)')
    }
  } else {
    /* 切回浅色：把半透明主题挂上去的内联变量清掉，否则会残留白字 */
    document.body.style.removeProperty('--word-color')
    document.body.style.removeProperty('--all-backcolor')

    const el = document.body.querySelector('.vditor') as HTMLElement | null
    if (el) {
      el.style.removeProperty('--panel-background-color')
      el.style.removeProperty('--toolbar-background-color')
      el.style.removeProperty('--textarea-background-color')
    }
  }
}

/** 切换主题（写入 localStorage 并刷新）。reload 保证所有页面/实例彻底重渲 */
export function toggleTheme() {
  const next: Theme = getTheme() === 'semiTransparent' ? 'light' : 'semiTransparent'
  localStorage.setItem(KEY, next)
  applyTheme(next)
  location.reload()
}

/** 各独立页 onMounted 时调一次：确保 body 上带着当前主题属性 */
export function initTheme() {
  applyTheme(getTheme())
}
