<script setup lang="ts">
import axios from 'axios'
import { server_url } from '@/assets/constants/index'
import { ref, watch } from 'vue'
import ArticleContent from './ArticleContent.vue'
import { computed } from 'vue'
import MoveToFolder from '@/components/pc/MoveToFolder.vue'
import { ElMessage } from 'element-plus'
const props = defineProps(['folderId'])
let isCheckedAll = ref(false) // 定义全选按钮状态的变量
let IsShowMoveToFolder = ref(false)
let articles: any = ref([])
let ArticleCheckId = ref(0)
let articleCheckedIndex = ref(1)

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

// 监听全选按钮，全选按钮如有变化，改变所有选中
// 单个 ref
watch(isCheckedAll, (newIsCheckedAll) => {
  /**
   * 触发以后，就为所有的列表取消或设置选中
   */
  articles.value.forEach((element: { checked: boolean }) => {
    element.checked = newIsCheckedAll
  })
})

// 根据folderId 获取文章信息并渲染
function getArticleByFoldeId(folderId: string) {
  axios.get(`${server_url}/articles?folderid=${folderId}`).then((result) => {
    articles.value = result.data.data //  查询到的信息存储到article数组中
    ArticleCheckId = ref(articles.value[0].Notebookid) // 选中列表中最新的文章
    updateCheckIndex()
    //在信息获取完成后，为其添加控制checkbox 的属性
    articles.value.forEach((element: any) => {
      element.checked = false
    })
  })
}



// 更改显示的文章
function byIdSelContent(Notebookid: any) {
  ArticleCheckId.value = Notebookid
  updateCheckIndex()
}

// queryStr 用来查询
const queryStr = ref('')
const allWordCount = ref(0)

// 获取总字数
axios.get(`${server_url}/wordCount`).then((results) => (allWordCount.value = results.data.data))

// 搜索
const searchArticle = () => {
  if (queryStr.value === '') {
    getArticleByFoldeId(props.folderId)
  } else {
    axios.get(`${server_url}/search/${queryStr.value}`).then((results) => {
      articles.value = results.data // 用搜索到的内容代替 articleList

      // 还要对搜索到的部分高亮处理
      for (let index = 0; index < articles.value.length; index++) {
        const element = articles.value[index]

        // 找到搜索关键字在content 中的索引，然后要将其高亮
        const searchContentIndex = element.content.indexOf(queryStr.value)
        const contentStr = element.content.replace(queryStr.value, `<b>${queryStr.value}</b>`)

        const searchTitleIndex = element.title.indexOf(queryStr.value)
        const titleStr = element.title.replace(queryStr.value, `<b>${queryStr.value}</b>`)

        element.title = titleStr

        // 如果出现在content 的位置大于3，则展示前面四个字符，不大于则直接从  searchIndex 开始展示
        if (searchContentIndex > 3) {
          element.content = contentStr.substring(searchContentIndex - 4, contentStr.length)
        } else {
          element.content = contentStr.substring(searchContentIndex, contentStr.length)
        }
      }
    })
  }
}

// 修改时间
const editCreatetime = (notebookId: string) => {
  const createtime = prompt('请输入时间，默认按 xxxx-xx-xx xx:xx:xx输入')
  axios
    .put(`${server_url}/createtime`, {
      notebookId: notebookId,
      newCreatetime: createtime
    })
    .then((result) => {
      ElMessage({
        showClose: true,
        message: result.data.data,
        type: 'success'
      })
    })
}

// 修改id的index，方便展示当前选中的是第几篇文章
function updateCheckIndex() {
  for (let i = 0; i < articles.value.length; i++) {
    if (ArticleCheckId.value == articles.value[i].Notebookid) {
      articleCheckedIndex.value = i + 1
    }
  }
}

// 删除选中的文章
function delete_content() {
  let del_object: any = { del_sql_notebookid_list: [] }
  for (let i = 0; i < articles.value.length; i++) {
    if (articles.value[i].checked) {
      del_object.del_sql_notebookid_list.push(articles.value[i].Notebookid)
    }
  }
  // 调用后台的删除接口，将参数传递给后台进行删除
  axios.delete(`${server_url}/articles`, { data: del_object }).then((res) => {
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
  getArticleByFoldeId(props.folderId) // 完成以后刷新文章列表
}

/*
  使用一个计算属性 ref来表示是否有check button 被选中，
  只要有一个以上被选中，该值为true,目的是为了只有当有文章
  被选中时才显示出操作的按钮
*/
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
  let arr: any[] = []
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
      updateCheckIndex()
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



getArticleByFoldeId(props.folderId) // 初始时调用查询方法，并填充
</script>

<template>
  <div class="article-list-box shadow">
    <div id="TopLeft">
      <nav class="topleft-top">
        <span class="article-count"> 共{{ articles.length }}条笔记 </span>
        <span class="article-count">累计字数：{{ allWordCount }}</span>
      </nav>

      <div class="search-box">
        <el-input v-model="queryStr" @keyup.enter="searchArticle">
          <template #append>
            <el-icon class="search-icon" @click="searchArticle"><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <nav class="topleft-middle">
        <div class="movebtn-and-delbtn">
          <el-button size="large" class="del-btn" v-if="isButtonChecked" @click="delete_content()">
            删除
          </el-button>

          <el-button class="del-btn" size="large" v-if="isButtonChecked" @click="move_article()"
            >移动到..</el-button
          >
        </div>
        <img id="ImageButtonAdd" @click="addArticle()" src="@/assets/addNewNoteBook.svg" alt="" />
      </nav>

      <nav class="topleft-bottom">
        <span v-if="isButtonChecked">
          <input
            type="checkbox"
            name=""
            v-model="isCheckedAll"
            class="checkbox checkbox-all"
            id=""
          />
          全选
        </span>
      </nav>
    </div>

    <div id="left">
      <ul id="List-ul">
        <li
          v-for="(item, index) in articles"
          :key="index"
          @click="byIdSelContent(item['Notebookid'])"
          :class="{
            'article-list-buttonchecked': item.Notebookid === ArticleCheckId
          }"
        >
          <el-card shadow="hover" class="el-articlelist-card">
            <div class="ul-li-item">
              <input type="checkbox" name="" v-model="item.checked" class="checkbox" id="" />

              <div class="ul-list-texts">
                <p
                  class="p_1"
                  v-html="
                    `${
                      item.title != ''
                        ? item.title.substring(0, queryStr == '' ? 14 : 20)
                        : '无标题'
                    }`
                  "
                ></p>

                <!-- 三元表达式，在query字符串有值的时候，会多生成一个B标签，多6字符，所以三元表达式来substring -->
                <p class="p_2" v-html="item.content.substring(0, queryStr == '' ? 14 : 20)"></p>
                <p class="p_3">
                  {{ item.createtime }}
                  <el-icon><Edit @click="editCreatetime(item.Notebookid)" /></el-icon>
                </p>
              </div>
            </div>
          </el-card>
        </li>
      </ul>
    </div>
  </div>

  <MoveToFolder
    :check_list="CheckedArticles"
    v-if="IsShowMoveToFolder"
    @some-event="closeMoveCallback()"
  ></MoveToFolder>

  <ArticleContent
    @content-update="contentUpdate"
    :articleCheckedIndex="articleCheckedIndex"
    :articleId="ArticleCheckId"
  ></ArticleContent>
</template>
