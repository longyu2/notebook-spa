/**
 * 本次会话里已解锁的私密笔记（只在内存里，刷新/关页面即失效）。
 *
 * 存两样东西：
 *   - 派生好的密钥：切走再切回来不用重新输口令，也不用再跑 31 万轮 PBKDF2
 *   - 解密出来的标题：列表卡片上要显示（库里 title 是空的）
 *
 * 刻意不写 localStorage / sessionStorage：
 *   一旦持久化，等于把「打开网页就能看明文」还给了任何拿到这台机器的人，
 *   私密就白设了。密钥 Map 故意是非响应式的，避免进 devtools 的响应式快照。
 */
import { reactive } from 'vue'
import type { PrivateKey } from './privateNote'

const unlockedKeys = new Map<number, PrivateKey>()

/** 只放「可以显示在界面上」的东西，密钥不进这里 */
export const privateSession = reactive({
  titles: {} as Record<number, string>
})

function keyOf(articleId: number | string): number {
  return Number(articleId)
}

export function rememberPrivate(articleId: number | string, key: PrivateKey, title: string) {
  unlockedKeys.set(keyOf(articleId), key)
  privateSession.titles[keyOf(articleId)] = title
}

export function forgetPrivate(articleId: number | string) {
  unlockedKeys.delete(keyOf(articleId))
  delete privateSession.titles[keyOf(articleId)]
}

export function forgetAllPrivate() {
  unlockedKeys.clear()
  for (const id of Object.keys(privateSession.titles)) {
    delete privateSession.titles[Number(id)]
  }
}

/** 拿本次会话缓存的密钥；没解锁过就是 null */
export function getPrivateKey(articleId: number | string): PrivateKey | null {
  return unlockedKeys.get(keyOf(articleId)) || null
}

export function isPrivateUnlocked(articleId: number | string): boolean {
  return unlockedKeys.has(keyOf(articleId))
}

/** 卡片上显示的标题：解锁过就显示真标题，否则只能显示占位 */
export function privateTitleOf(articleId: number | string, fallback = '私密笔记'): string {
  return privateSession.titles[keyOf(articleId)] || fallback
}
