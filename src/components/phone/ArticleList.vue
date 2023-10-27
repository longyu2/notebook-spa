<script setup lang="ts">
import axios from 'axios'
import { server_url } from '@/assets/constants/index'
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
    ArticleCheckId = ref(articles.value[0].Notebookid) // 选中列表中最新的文章
    //在信息获取完成后，为其添加控制checkbox 的属性
    articles.value.forEach((element: any) => {
      element.checked = false
    })
  })
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
      console.table(newArticle)

      console.table(newArticle)
      newArticle.checked = false
      ArticleCheckId.value = newArticle.Notebookid
      //返回的是只有一个元素的数组，还是需要用下标0取
      articles.value.unshift(newArticle)
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
      <van-list id="List-ul">
        <van-cell
          v-for="(item, index) in articles"
          :key="index"
          @click="byIdSelContent(item['Notebookid'])"
          :class="{
            'article-list-buttonchecked': item.Notebookid === ArticleCheckId
          }"
        >
          <div class="ul-li-item">
            <input type="checkbox" name="" v-model="item.checked" class="checkbox" id="" />

            <div class="ul-list-texts">
              <span class="p_1" v-text="item.title.substring(0, 14)"></span>

              <p class="p_2" v-text="item.content.substring(0, 14)"></p>
              <p class="p_3" v-text="item.createtime"></p>
            </div>
          </div>
        </van-cell>
      </van-list>

      <img class="img-add-btn" @click="addArticle()" src="@/assets/addNewNoteBook.svg" alt="" />
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
