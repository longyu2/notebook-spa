<script setup lang="ts">
import { ref } from 'vue'

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
  </div>
</template>

<style lang="scss" scoped>
#right {
  width: 260px;
  flex-shrink: 0;
  height: 99vh;
  box-sizing: border-box;
  padding: 16px;

  .theme-card {
    /* 跟随主题：浅色=淡灰底/深色边框，半透明=淡白底/浅色边框 */
    background-color: rgba(0, 0, 0, 0.02);
    background-color: color-mix(in srgb, var(--word-color) 4%, transparent);
    border: 1px solid var(--color-border);
    border-color: color-mix(in srgb, var(--word-color) 14%, transparent);
    border-radius: var(--radius-panel);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;

    &__header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    &__icon {
      color: var(--color-primary);
      font-size: 18px;
    }

    &__title {
      color: var(--word-color);
      font-size: 14px;
      font-weight: 500;
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
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--word-color) 16%, transparent) inset;
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
      font-size: 13px;
    }

    :deep(.el-select__caret) {
      color: var(--color-text-secondary);
      color: color-mix(in srgb, var(--word-color) 55%, transparent);
      transition: color 0.2s ease;
    }

    :deep(.el-select__caret:hover) {
      color: var(--color-primary);
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
  height: 34px;
  line-height: 34px;
  margin: 2px 6px;
  padding-left: 14px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--word-color);
  transition: background-color 0.15s ease;
}

.theme-select-popper .el-select-dropdown__item.hover {
  background-color: rgba(85, 144, 226, 0.12);
}

.theme-select-popper .el-select-dropdown__item.selected {
  color: var(--color-primary);
  font-weight: 500;
  background-color: rgba(85, 144, 226, 0.14);
}
</style>
