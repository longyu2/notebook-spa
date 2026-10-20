<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sunny } from '@element-plus/icons-vue'
import { getTheme, toggleTheme } from '@/assets/js/theme'

/* 一个通用的小主题开关：显示当前主题，点一下切到另一种。
   各独立整页（/reading /search /public /random 等）把它放进顶栏，就能「任何模式都能切主题」。
   主题值在组件创建时读一次即可 —— 切换会整页刷新。 */
const theme = getTheme()

const label = computed(() => (theme === 'semiTransparent' ? '半透明' : '浅色'))
const nextLabel = computed(() => (theme === 'semiTransparent' ? '浅色' : '半透明'))
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="`当前${label}，点击切换到${nextLabel}`"
    @click="toggleTheme"
  >
    <el-icon class="theme-toggle__icon">
      <Moon v-if="theme === 'semiTransparent'" />
      <Sunny v-else />
    </el-icon>
    <span class="theme-toggle__label">{{ label }}</span>
  </button>
</template>

<style lang="scss" scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 6px 12px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  border-radius: 999px;
  color: color-mix(in srgb, var(--word-color) 86%, transparent);
  background-color: color-mix(in srgb, var(--word-color) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 18%, transparent);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;

  &:hover {
    background-color: color-mix(in srgb, var(--word-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 52%, transparent);
  }

  &__icon {
    font-size: 14px;
  }
}

/* 手机端把点击区抬到 36px 高，手指才点得准 */
@media (max-width: 860px) {
  .theme-toggle {
    min-height: 36px;
    padding: 9px 12px;
    font-size: 12.5px;
  }
}
</style>
