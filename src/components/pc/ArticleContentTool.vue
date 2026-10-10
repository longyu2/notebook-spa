<script setup lang="ts">
import { ref } from 'vue'
import AiAssistant from '@/components/pc/AiAssistant.vue'

// AI 面板不直接碰编辑器：正文靠这个回调取，回写靠 apply 事件抛回 ArticleContent.vue
defineProps<{
  getContext: () => { title: string; content: string; selection: string }
}>()

const emit = defineEmits<{
  (e: 'apply', payload: { text: string; mode: 'replaceAll' | 'replaceSelection' | 'insert' }): void
}>()

const theme = ref(localStorage.getItem('theme') || 'light') // 获取本地存储的主题，默认是light
function updateTheme() {
  localStorage.setItem('theme', theme.value)
  console.log('主题已更改为：' + theme.value)

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

      <el-select
        v-model="theme"
        class="theme-select"
        popper-class="theme-select-popper"
        @change="updateTheme"
      >
        <el-option value="semiTransparent" label="半透明"></el-option>
        <el-option value="dark" label="浅色"></el-option>
      </el-select>
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

  .theme-select {
    width: 100%;

    :deep(.el-input__wrapper) {
      /* 关键：不能用写死的 #fff，否则半透模式下会白底白字 */
      background-color: #fff;
      background-color: var(--all-backcolor);
      border-radius: var(--radius-item);
      box-shadow: 0 0 0 1px var(--color-border) inset;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--word-color) 24%, transparent) inset;
      transition: box-shadow 0.2s ease;

      &:hover {
        box-shadow: 0 0 0 1px var(--color-primary) inset;
      }

      &.is-focus {
        box-shadow:
          0 0 0 1px var(--color-primary) inset,
          0 0 0 3px rgba(85, 144, 226, 0.15);
      }
    }

    :deep(.el-input__inner) {
      color: var(--word-color);
      font-size: 15px;
    }

    :deep(.el-select__caret) {
      color: var(--color-text-secondary);
      color: color-mix(in srgb, var(--word-color) 70%, transparent);
      transition: color 0.2s ease;
    }

    :deep(.el-select__caret:hover) {
      color: var(--color-primary-text);
    }
  }
}
</style>

<style lang="scss">
/* 下拉面板被 teleport 到 body，需用非 scoped 样式才能命中 */
.theme-select-popper.el-popper {
  /* 跟随主题：浅色=白/半透明，半透明=暗/半透明，配合毛玻璃 */
  background-color: #fff;
  background-color: var(--all-backcolor);
  backdrop-filter: blur(20px);
  border-radius: var(--radius-item);
  border: 1px solid var(--color-border);
  border-color: color-mix(in srgb, var(--word-color) 14%, transparent);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.theme-select-popper .el-popper__arrow {
  display: none;
}

.theme-select-popper .el-select-dropdown__item {
  height: 36px;
  line-height: 36px;
  margin: 2px 6px;
  padding-left: 14px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--word-color);
  transition: background-color 0.15s ease;
}

.theme-select-popper .el-select-dropdown__item.hover {
  background-color: rgba(85, 144, 226, 0.12);
}

.theme-select-popper .el-select-dropdown__item.selected {
  color: var(--color-primary-text);
  font-weight: 500;
  background-color: rgba(85, 144, 226, 0.14);
}
</style>
