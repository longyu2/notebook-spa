<script setup lang="ts">
import { ref, computed } from 'vue'
import AiAssistant from '@/components/pc/AiAssistant.vue'

// AI 面板不直接碰编辑器：正文靠这个回调取，回写靠 apply 事件抛回 ArticleContent.vue
defineProps<{
  getContext: () => { title: string; content: string; selection: string }
}>()

const emit = defineEmits<{
  (e: 'apply', payload: { text: string; mode: 'replaceAll' | 'replaceSelection' | 'insert' }): void
}>()

/* 主题实际只有两种：semiTransparent（半透明，铺壁纸 + 暗面板）和浅色（走 body 上的默认令牌）。
   localStorage 里可能残留 light / no 这类历史值，只有 semiTransparent 才算半透明，
   其余一律当浅色 —— 比原来 el-select 直接绑原始字符串更稳（否则下拉会显示空白）。 */
const theme = ref(localStorage.getItem('theme') === 'semiTransparent' ? 'semiTransparent' : 'dark')

const themeLabel = computed(() => (theme.value === 'semiTransparent' ? '半透明' : '浅色'))

/* 按钮 title 里的目标主题。注意别在模板里写 theme.value ——
   script setup 的 ref 在模板中已自动解包，theme.value 会取到 undefined */
const nextThemeLabel = computed(() => (theme.value === 'semiTransparent' ? '浅色' : '半透明'))

/* 只有两个值，一次点击就能切到位，不用再展开下拉 */
function toggleTheme() {
  theme.value = theme.value === 'semiTransparent' ? 'dark' : 'semiTransparent'
  localStorage.setItem('theme', theme.value)
  console.log('主题已更改为：' + theme.value)

  /* 主题是往 body / vditor 上挂内联变量（见 ArticleContent.vue 的 setTheme），
     没有响应式链路，沿用原来的整页刷新最省事也最稳 */
  location.reload()
}
</script>

<template>
  <div id="right">
    <div class="theme-card">
      <div class="theme-card__header">
        <el-icon class="theme-card__icon"><MagicStick /></el-icon>
        <span class="theme-card__title">主题切换</span>
      </div>

      <!-- 一个按钮一个动作：显示当前主题，点一下切到另一种 -->
      <button
        type="button"
        class="theme-btn"
        :title="`当前${themeLabel}，点击切换到${nextThemeLabel}`"
        @click="toggleTheme"
      >
        <el-icon class="theme-btn__icon">
          <Moon v-if="theme === 'semiTransparent'" />
          <Sunny v-else />
        </el-icon>
        <span class="theme-btn__label">{{ themeLabel }}</span>
        <span class="theme-btn__hint">点击切换</span>
      </button>
    </div>

    <AiAssistant :get-context="getContext" @apply="emit('apply', $event)" />
  </div>
</template>

<style lang="scss" scoped>
#right {
  /* 宽度响应式：把「编辑器用不完的余量」让给 AI 栏。
     这个式子不是拍脑袋来的 —— 右边栏能吃到的最大宽度是：
       视口宽 - 979px
     = 视口宽 - (左右内边距40 + 文件夹160 + 列表315+24 + 间距24+16 + 编辑器min-width 400)
     所以写成 calc(100vw - 920px)，留约 60px 余量 —— 比原来（-1000px）多让出 80px，
     编辑器中间会更窄一些，AI 栏更宽。
     为什么不用固定值：实测小屏下定宽会顶穿编辑器 min-width，
     而 .article-list-box 没写 flex-shrink:0，它会替编辑器挨刀被压窄，
     导致 #left 的凸出量算错、列表排版坏掉。响应式则小屏自动退让，不会伤到别人。
     窄屏兜底 280px（原来 260px，太窄字都放不下），宽屏封顶 460px（原来 380px）。
     下限也要够大：编辑器 min-width 400 是硬底，AI 栏再宽也不会把列表挤变形。 */
  width: clamp(280px, calc(100vw - 920px), 460px);
  flex-shrink: 0;
  height: 99vh;
  box-sizing: border-box;
  padding: 16px;

  /* 竖向排列：主题卡按内容高度，AI 卡吃掉剩下的全部空间 */
  display: flex;
  flex-direction: column;
  gap: 16px;

  .theme-card {
    flex-shrink: 0;
    /* 跟随主题：浅色=淡灰底/深色边框，半透明=淡白底/浅色边框。
       不透明度要和 .ai-card 保持一致，否则两张卡片叠在一起会有明显的「一深一浅」。 */
    background-color: rgba(0, 0, 0, 0.02);
    background-color: color-mix(in srgb, var(--word-color) 5%, transparent);
    border: 1px solid var(--color-border);
    border-color: color-mix(in srgb, var(--word-color) 18%, transparent);
    border-radius: var(--radius-panel);
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;

    &__header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    &__icon {
      /* 蓝字压浅底必须用 --color-primary-text：#5590e2 在白底上只有 2.5:1，看不清 */
      color: var(--color-primary-text);
      font-size: 22px;
    }

    &__title {
      color: var(--word-color);
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
  }

  /* 主题按钮：占满整行，两个主题下都要能看清 ——
     底色/边框/文字全部走主题令牌，不写死颜色（半透明主题下写死 #fff 就是白底白字） */
  .theme-btn {
    width: 100%;
    font-family: inherit;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    border-radius: var(--radius-item);
    color: var(--word-color);
    background-color: #fff;
    background-color: var(--all-backcolor);
    border: 1px solid var(--color-border);
    border-color: color-mix(in srgb, var(--word-color) 24%, transparent);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      background-color 0.2s ease;

    &:hover {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px rgba(85, 144, 226, 0.15);
    }

    &:active {
      background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }

    &__icon {
      /* 蓝字压浅底必须用 --color-primary-text，理由同上面的卡片图标 */
      color: var(--color-primary-text);
      font-size: 18px;
    }

    &__label {
      flex: 1;
      font-weight: 600;
    }

    &__hint {
      font-size: 12px;
      color: color-mix(in srgb, var(--word-color) 60%, transparent);
    }
  }
}
</style>
