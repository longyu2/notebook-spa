<script setup lang="ts">
import axios from 'axios'
const server_url = localStorage.getItem('server_url')

import { ref, watch } from 'vue'
import ArticleContent from './ArticleContent.vue'
import { reactive, computed } from 'vue'
import MoveToFolder from '@/components/pc/MoveToFolder.vue'

const props = defineProps(['folderId'])

// 监视folderId,如有变化，重新渲染文章列表
watch(
  () => props.folderId,
  (folderId, prevFolderId) => {
    /* ... */
    if (folderId == prevFolderId) {
      console.error('错误，watch新旧值相等了！')
    }

    getArticleByFoldeId(folderId)
  }
)

let IsShowMoveToFolder = ref(false)
let articles: any = ref([])
let ArticleCheckId = ref(0)

let IsContentShow = ref(false)

// 电脑端不隐藏
IsContentShow.value = !_isMobile()

// 判断是否移动端的函数
function _isMobile() {
  let flag = navigator.userAgent.match(
    /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
  )
  return flag
}

// 根据folderId 获取文章信息并渲染
function getArticleByFoldeId(folderId: any) {
  axios.get(`${server_url}/articles?folderid=${folderId}`).then((result) => {
    articles.value = result.data.data //  查询到的信息存储到article数组中
    /* 空文件夹时 data 是空数组，原来直接取 [0].Notebookid 会抛 TypeError，
       列表整块白掉 —— 这里要判空。 */
    ArticleCheckId.value = articles.value.length ? articles.value[0].Notebookid : 0
    //在信息获取完成后，为其添加控制checkbox 的属性
    articles.value.forEach((element: any) => {
      element.checked = false
    })
  })
}

/* 列表里只显示到「天」：原来的 createtime 带完整时分秒（2024-10-05 16:41:14），
   窄屏上一行直接被日期占满。 */
function fmtDay(s: any) {
  if (!s) return ''
  const d = new Date(String(s).replace(' ', 'T'))
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

getArticleByFoldeId(props.folderId) // 初始时调用查询方法，并填充

// 更改显示的文章
function byIdSelContent(Notebookid: any) {
  ArticleCheckId.value = Notebookid

  IsContentShow.value = true // 显示文章
}

// 删除选中的文章
function delete_content() {
  let del_object: any = { del_sql_notebookid_list: [] }

  for (let i = 0; i < articles.value.length; i++) {
    // 删除articles 数组中对应数据
    if (articles.value[i].checked) {
      del_object.del_sql_notebookid_list.push(articles.value[i].Notebookid)
    }
  }

  // 调用后台的删除接口，将参数传递给后台进行删除
  axios.delete(`${server_url}/articles`, del_object).then((res) => {
    if (res == null) {
      console.error('res is null!')
    }
  })

  // 重新获取文章列表,由于不进行延迟的话，服务器返回太快，获取的数据是未删除的数据，所以延时0.1秒再去服务器获取数据
  setTimeout(function () {
    getArticleByFoldeId(props.folderId)
  }, 100)
}

function move_article() {
  let move_list = []
  for (let i = 0; i < articles.value.length; i++) {
    // 删除articles 数组中对应数据
    if (articles.value[i].checked) {
      move_list.push(articles.value[i].Notebookid)
    }
  }
  // 显示文件移动框
  IsShowMoveToFolder.value = true
}

// closeMoveCallback 根据emit事件关闭 文件夹移动框
function closeMoveCallback() {
  IsShowMoveToFolder.value = false
}

// 使用一个计算属性 ref来表示是否有check button 被选中，只要有一个以上被选中，该值为true
const isButtonChecked = computed(() => {
  let count = 0
  // 遍历所有的checked 属性值，只要有一项的checkd 值为true，则count > 0 ，计算属性返回true
  articles.value.forEach((element: any) => {
    if (element.checked) {
      count++
    }
  })
  if (count > 0) {
    return true
  } else {
    return false
  }
})

// 使用一个计算属性来表示所有被选中的文章
const CheckedArticles = computed(() => {
  let arr: any = []
  // 遍历所有的checked 属性值，只要有一项的checkd 值为true，则count > 0 ，计算属性返回true
  articles.value.forEach((element: { checked: any }) => {
    if (element.checked) {
      arr.push(element)
    }
  })
  return arr
})

// 添加新文章
function addArticle() {
  axios
    // 在发起请求时，传给后端此时的folderid
    .post(`${server_url}/articles`, {
      folderid: props.folderId
    })
    .then((result) => {
      let newArticle = result.data.data.articleInfo
      newArticle.checked = false
      ArticleCheckId.value = newArticle.Notebookid
      //返回的是只有一个元素的数组，还是需要用下标0取
      articles.value.unshift(newArticle)
      // 新建文章后跳转此文章的编辑页面
      console.log('新建完成')
      byIdSelContent(newArticle.Notebookid)
    })
}

// 接收子组件传来的值
function contentUpdate(data: { articleId: any; content: any; title: any }) {
  // 对articles 进行遍历，找到Notebookid 与 子组件传来的articleId 相同的那一项，更改其内容
  articles.value.forEach((element: { Notebookid: any; title: any; content: any }) => {
    if (element.Notebookid == data.articleId) {
      element.title = data.title
      element.content = data.content
    }
  })
}
// 接受子组件传来的emit ，关闭content 框
function contentHide() {
  IsContentShow.value = false
}
</script>

<template>
  <div class="article-list-box shadow">
    <div id="left">
      <!-- 手机端单列卡片：原来的「奇偶拆两列」在 390px 宽下每列只剩 195px，
           标题和摘要全被挤成两三行，读起来很费劲。单列 + 卡片更清楚。 -->
      <div class="ph-list">
        <article
          v-for="item in articles"
          :key="item.Notebookid"
          class="ph-card"
          :class="{ 'is-on': item.Notebookid === ArticleCheckId, 'has-check': CheckedArticles.length > 0 }"
          @click="byIdSelContent(item['Notebookid'])"
        >
          <input
            v-show="CheckedArticles.length > 0"
            type="checkbox"
            class="ph-check"
            v-model="item.checked"
            @click.stop
          />

          <h3 class="ph-card__title" v-text="item.title || '无标题'"></h3>

          <p class="ph-card__excerpt" v-text="item.content || '（这篇还没有正文）'"></p>

          <div class="ph-card__meta">
            <span class="ph-card__time">{{ fmtDay(item.createtime) }}</span>
            <span v-if="item.length" class="ph-card__words">{{ item.length }} 字</span>
          </div>
        </article>
      </div>

      <div class="img-add-btn" @click="addArticle()">
        <img src="@/assets/addNewNoteBook.svg" alt="" />
      </div>
    </div>
  </div>

  <MoveToFolder
    :check_list="CheckedArticles"
    v-if="IsShowMoveToFolder"
    @some-event="closeMoveCallback()"
  ></MoveToFolder>

  <ArticleContent
    v-show="IsContentShow"
    @content-hide="contentHide"
    @content-update="contentUpdate"
    :articleId="ArticleCheckId"
  ></ArticleContent>
</template>
