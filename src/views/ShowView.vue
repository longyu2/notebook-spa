<template>
  <div class="container"></div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { server_url } from '@/assets/constants/index'
import { onMounted } from 'vue'

const pushToHtml = (text: string, style = 'basic') => {
  const p = document.createElement('p')
  p.innerHTML = text

  if (style == 'bold') {
    p.classList.add('bold-text')
  }

  document.querySelector('.container')!.appendChild(p)
}

const addSpan = (text: number | string) => {
  return `<span>${text}</span>`
}

let AllArticleData: [] = []
const getData = async () => {
  try {
    const response = await axios.get(`${server_url}/articles?folder=-2`)
    AllArticleData = response.data.data.reverse()

    // 分别分析文章数量
    // 从第一年到最后一年

    let totalWordCount: number = 0
    let wordCountTrigger = 100000
    let yearlyCountArr = []
    let articleMAxYear = 2017
    let maxArticleCount = 0

    let wordCountByYear = []
    let maxWordCount = 0
    let maxWordCountYear = 2017

    for (let i = 2017; i <= 2026; i++) {
      yearlyCountArr.push({
        year: i,
        count: 0
      })
      wordCountByYear.push({
        year: i,
        wordCount: 0
      })
    }

    // 首次文章字数冲刺记录
    for (let i = 0; i < AllArticleData.length; i++) {
      const article: object = AllArticleData[i]
      const createtime = (article as { createtime: string }).createtime

      //   记录字数，首次达到十万字的日期
      const length = parseInt((article as { length: string }).length)

      totalWordCount += length

      if (totalWordCount >= wordCountTrigger) {
        const reachDate = new Date(createtime)
        pushToHtml(
          `达到${addSpan(wordCountTrigger)}字的日期: ${addSpan(
            createtime.substring(0, 10)
          )}  这一天，总字数达到:${addSpan(totalWordCount)}`
        )
        wordCountTrigger += 100000
      }
    }

    pushToHtml(
      `即将突破${addSpan(wordCountTrigger)}字！敬请期待！进度：${addSpan(
        `${totalWordCount}/${wordCountTrigger}`
      )}`,
      'bold'
    )

    // 各年文章数量统计
    for (let i = 0; i < AllArticleData.length; i++) {
      const article: object = AllArticleData[i]

      const createtime = (article as { createtime: string }).createtime

      const articleYear = new Date(createtime).getFullYear()

      for (let j = 0; j < yearlyCountArr.length; j++) {
        if (articleYear === yearlyCountArr[j].year) {
          yearlyCountArr[j].count += 1
          wordCountByYear[j].wordCount += parseInt((article as { length: string }).length)
        }
        if (i === AllArticleData.length - 1) {
          pushToHtml(
            `年份: ${addSpan(yearlyCountArr[j].year)},  文章数量: ${addSpan(
              yearlyCountArr[j].count
            )}`
          )
        }
      }
    }

    // 各年文章总字数
    for (let k = 0; k < yearlyCountArr.length; k++) {
      if (yearlyCountArr[k].count > maxArticleCount) {
        articleMAxYear = yearlyCountArr[k].year
        maxArticleCount = yearlyCountArr[k].count
      }
    }

    pushToHtml(
      `文章数量最多的一年: ${addSpan(articleMAxYear)} 文章数量： ${addSpan(maxArticleCount)}`,
      'bold'
    )

    pushToHtml(`各年字数统计：`)

    for (let i = 0; i < wordCountByYear.length; i++) {
      if (wordCountByYear[i].wordCount > maxWordCount) {
        maxWordCount = wordCountByYear[i].wordCount
        maxWordCountYear = wordCountByYear[i].year
      }
      pushToHtml(
        `年份: ${addSpan(wordCountByYear[i].year)}, 该年字数 : ${addSpan(
          wordCountByYear[i].wordCount
        )}`
      )
    }

    pushToHtml(
      `字数最多的一年: <span>${addSpan(maxWordCountYear)}</span> 字数： <span>${addSpan(
        maxWordCount
      )}</span>`,
      'bold'
    )
  } catch (error) {
    console.error('Error fetching data:', error)
  }
}

onMounted(() => {
  document.title = '数据统计'
  getData()
})
</script>

<style scoped lang="scss">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', 'Inter', sans-serif;
}

body {
  /* 页面背景与盒子形成对比，提升层次感 */
  background-color: #f0f2f5;
  /* 避免页面滚动时盒子贴顶/贴底 */
  min-height: 100vh;
  /* 优化后的 container 盒子核心样式 */
  .container {
    /* 保留你的基础配置 */
    margin: 100px auto;
    width: 30vw;
    color: white;

    /* ========== 核心优化项 ========== */
    /* 1. 背景与边框：提升质感 */
    background: linear-gradient(135deg, #277631 0%, #1d2e87 100%); /* 渐变背景，更有层次感 */
    border: 1px solid rgba(255, 255, 255, 0.1); /* 半透明白边，弱化边缘 */
    border-radius: 12px; /* 更大的圆角，更现代 */

    /* 2. 内边距：避免内容贴边 */
    padding: 24px;

    /* 3. 阴影：增强立体感（模拟悬浮效果） */
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.25);

    /* 4. 交互优化：hover 悬浮效果 */
    transition: all 0.3s ease; /* 过渡动画，避免生硬 */
    cursor: default; /* 鼠标样式统一 */

    /* 5. 文字优化：抗锯齿，提升清晰度 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;

    /* 6. 轻微内阴影：增加质感 */
    box-shadow:
      0 8px 24px rgba(37, 99, 235, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    ::v-deep p {
      margin-top: 0 px;
      line-height: 1.8;
      margin-bottom: 16px;
      font-size: 18px;
      padding: 8px 12px;
      border-radius: 8px;
      background-color: rgba(255, 255, 255, 0.1); /* 半透明背景，和盒子融合 */
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: background-color 0.2s ease;
    }
    ::v-deep .bold-text {
      font-weight: 800;
      font-size: 20px;
    }
    ::v-deep span {
      -webkit-text-fill-color: transparent;
      background: linear-gradient(135deg, #eece2e 0%, #e78141 100%);
      font-weight: 800;
      background-clip: text;
      margin: 6px;
    }
    p:hover {
      background-color: rgba(255, 255, 255, 0.15); /* 悬浮加深背景 */
    }
  }

  /* 悬浮交互效果（可选，提升体验） */
  .container:hover {
    transform: translate(4px, 4px); /* 轻微上移 */
    box-shadow: 0 12px 32px rgba(37, 99, 235, 0.35); /* 阴影放大 */
  }
}
</style>
