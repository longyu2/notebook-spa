<script setup lang="ts">
import axios from 'axios'
import { server_url } from '@/assets/constants/index'
import { ref, watch } from 'vue'
import ArticleContent from './ArticleContent.vue'
import { computed } from 'vue'
import MoveToFolder from '@/components/pc/MoveToFolder.vue'
import { ElMessage } from 'element-plus'
import { log } from 'console'
const props = defineProps(['folderId'])
let isCheckedAll = ref(false) // 定义全选按钮状态的变量
let IsShowMoveToFolder = ref(false)
let articleList: any = ref([]) // 定义显示的整个文章列表
let articleLength = ref(0)
let articles: any = []

let articleChecked = ref({
  // 表示当前选中的文章
  id: 0,
  index: 1
})

// 监视folderId,如有变化，重新渲染文章列表
watch(
  () => props.folderId,
  (folderId, prevFolderId) => {
    /* ... */
    if (folderId == prevFolderId) {
      console.error('错误，watch新旧值相等了！')
    }

    getArticleByFoldeId(folderId)
    getWordCount()
  }
)

const isAllButtonShow = ref(false) // 控制全选按钮显示

// 监听全选按钮，全选按钮如有变化，改变所有选中
// 单个 ref

// 为所有的列表取消或设置选中
const CheckedBoxAllChagne = () => {
  articleList.value.forEach((element: { checked: boolean }) => {
    element.checked = isCheckedAll.value
  })
  articles.forEach((element: { checked: boolean }) => {
    element.checked = isCheckedAll.value
  })
}

// 根据folderId 获取文章信息并渲染
const getArticleByFoldeId = (folderId: string) => {
  axios.get(`${server_url}/articles?folderid=${folderId}`).then((result) => {
    articles = result.data.data
    articleLength.value = articles.length

    //在信息获取完成后，为其添加控制checkbox 的属性,和hover 属性，用来控制，这几项服务器端没有，只有客户端有
    articles.forEach((element: any) => {
      element.checked = false
      element.hovered = false
    })

    articleList.value = articles.splice(0, 100) //  查询到的信息存储到article数组中

    articleChecked.value.id = articleList.value[0].Notebookid // 选中列表中最新的文章
    updateCheckIndex()
  })
}
// 动态加载
const scrollChange = (event: any) => {
  let progress = Math.floor(
    (event.target!.scrollTop * 100) / document.querySelector('#List-ul')!.clientHeight
  ) // 求得滚动条进度

  if (progress > 70 && articles.length > 0) {
    // 每当progress > 70 ,就从articles 取100个值添加
    articleList.value = articleList.value.concat(articles.splice(0, 100))
  }
}

// 切换显示的文章
const byIdSelContent = (event: any, Notebookid: any) => {
  if (event.target.tagName === 'SPAN') {
    return // 如果事件对象是子元素，直接停止执行，防止穿透
  }

  articleChecked.value.id = Notebookid // 更改需要展示的文章
  updateCheckIndex()
}

const queryStr = ref('') // queryStr 用来查询
const allWordCount = ref(0)
const getWordCount = () =>
  axios
    .get(`${server_url}/wordCount/${props.folderId}`)
    .then((results) => (allWordCount.value = results.data.data))

// 获取总字数
getWordCount()

// 搜索
const searchArticle = () => {
  if (queryStr.value === '') {
    getArticleByFoldeId(props.folderId)
  } else {
    axios.get(`${server_url}/search/${queryStr.value}`).then((results) => {
      articleList.value = results.data // 用搜索到的内容代替 articleList

      // 还要对搜索到的部分高亮处理
      for (let index = 0; index < articleList.value.length; index++) {
        const element = articleList.value[index]

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
const editCreatetime = async (notebookId: string) => {
  const createtime = prompt('请输入时间，默认按 xxxx-xx-xx xx:xx:xx输入')
  if (createtime !== '' && createtime !== undefined && createtime != null) {
    const result = await axios.put(`${server_url}/createtime`, {
      notebookId: notebookId,
      newCreatetime: createtime
    })

    ElMessage({
      showClose: true,
      message: result.data.data,
      type: 'success'
    })
  }
}

// 修改当前选中文章的变量articleChecked的index，方便展示当前选中的是第几篇文章
const updateCheckIndex = () => {
  for (let i = 0; i < articleList.value.length; i++) {
    if (articleChecked.value.id == articleList.value[i].Notebookid) {
      articleChecked.value.index = i + 1
    }
  }
}

// 删除选中的文章
const delete_content = () => {
  let del_object: any = { del_sql_notebookid_list: [] }
  for (let i = 0; i < articleList.value.length; i++) {
    if (articleList.value[i].checked) {
      del_object.del_sql_notebookid_list.push(articleList.value[i].Notebookid)
    }
  }
  // 为了动态加载引入的articles必须重复进行一次删除操作
  for (let i = 0; i < articles.length; i++) {
    if (articles[i].checked) {
      del_object.del_sql_notebookid_list.push(articles[i].Notebookid)
    }
  }

  // 调用后台的删除接口，将参数传递给后台进行删除
  axios.delete(`${server_url}/articles`, { data: del_object }).then((res) => {
    //  重新获取文章列表,由于不进行延迟的话，服务器返回太快，获取的数据是未删除的数据，所以延时0.1秒再去服务器获取数据

    getArticleByFoldeId(props.folderId)

    // 如果列表最后一篇文章被删除，必须禁用右边的文本编辑器
    if (articleList.value.length === 1) {
      articleChecked.value.id = -9999 // -9999 代表列表已经没有文章
    }
  })
}

/** 删除单篇文章 */
const deleteArticle = async (articleId: number) => {
  // 调用后台的删除接口，将参数传递给后台进行删除
  let result = await axios.delete(`${server_url}/articles`, {
    data: { del_sql_notebookid_list: [articleId] }
  })

  getArticleByFoldeId(props.folderId)

  // 如果列表最后一篇文章被删除，必须禁用右边的文本编辑器
  if (articleList.value.length === 1) {
    articleChecked.value.id = -9999 // -9999 代表列表已经没有文章
  }
}

// 将文章移动到不同文件夹
const move_article = () => {
  let move_list = []
  for (let i = 0; i < articleList.value.length; i++) {
    // 删除articleList 数组中对应数据
    if (articleList.value[i].checked) {
      move_list.push(articleList.value[i].Notebookid)
    }
  }
  // 显示文件移动框
  IsShowMoveToFolder.value = true
}

// closeMoveCallback 根据emit事件关闭 文件夹移动框
const closeMoveCallback = () => {
  IsShowMoveToFolder.value = false
  getArticleByFoldeId(props.folderId) // 完成以后刷新文章列表
}

/*
  使用一个计算属性 ref来表示是否有check button 被选中，
  只要有一个以上被选中，该值为true,目的是为了只有当有文章
  被选中时才显示出操作的按钮
*/
const buttonCheckedCount = computed(() => {
  let count = 0
  // 遍历所有的checked 属性值，只要有一项的checkd 值为true，则count > 0 ，计算属性返回true
  articleList.value.forEach((element: any) => {
    if (element.checked) {
      count++
    }
  })
  return count
})

// 监听被选中文章数量的计算属性，用来控制全选按钮显示
watch(buttonCheckedCount, (newButtonCheckedCount, oldButtonCheckedCount) => {
  // 只有当 被选中文章数量从1变成0时，才隐藏全选按钮
  if (newButtonCheckedCount === 1 && oldButtonCheckedCount === 0) {
    isAllButtonShow.value = true
  }

  if (oldButtonCheckedCount === 1 && newButtonCheckedCount === 0) {
    isAllButtonShow.value = false
  }

  isCheckedAll.value = newButtonCheckedCount === articleList.value.length // 当选中文章数量等于 articleList 数量，将全选按钮选中,不等于于则取消选中
})

// 使用一个计算属性来表示所有被选中的文章
const CheckedarticleList = computed(() => {
  let arr: any[] = []
  // 遍历所有的checked 属性值，只要有一项的checkd 值为true，则count > 0 ，计算属性返回true
  articleList.value.forEach((element: { checked: any }) => {
    if (element.checked) {
      arr.push(element)
    }
  })
  return arr
})

// 添加新文章
const addArticle = () => {
  axios
    // 在发起请求时，传给后端此时的folderid
    .post(`${server_url}/articles`, {
      folderid: props.folderId
    })
    .then((result) => {
      let newArticle = result.data.data.articleInfo
      newArticle.checked = false
      articleChecked.value.id = newArticle.Notebookid
      updateCheckIndex()
      //返回的是只有一个元素的数组，还是需要用下标0取
      articleList.value.unshift(newArticle)
      articleLength.value++
    })
}

// 接收子组件传来的值
const contentUpdate = (data: { articleId: any; content: any; title: any }) => {
  // 对articleList 进行遍历，找到Notebookid 与 子组件传来的articleId 相同的那一项，更改其内容
  articleList.value.forEach((element: { Notebookid: any; title: any; content: any }) => {
    if (element.Notebookid == data.articleId && queryStr.value === '') {
      element.title = data.title
      element.content = data.content
    }
  })
  // 同时修改累计字数显示
  setTimeout(() => {
    getWordCount()
  }, 100)
}

getArticleByFoldeId(props.folderId) // 初始时调用查询方法，并填充
</script>

<template>
  <div class="article-list-box shadow">
    <div id="TopLeft">
      <nav class="topleft-top">
        <span class="article-count"> 共{{ articleLength }}条笔记 </span>
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
          <el-button
            size="large"
            class="del-btn"
            v-if="buttonCheckedCount > 0"
            @click="delete_content()"
          >
            删除
          </el-button>

          <el-button
            class="del-btn"
            size="large"
            v-if="buttonCheckedCount > 0"
            @click="move_article()"
            >移动到..</el-button
          >
        </div>
        <img id="ImageButtonAdd" @click="addArticle()" src="@/assets/addNewNoteBook.svg" alt="" />
      </nav>

      <nav class="topleft-bottom">
        <span v-if="isAllButtonShow">
          <el-checkbox
            v-model="isCheckedAll"
            @change="CheckedBoxAllChagne"
            class="checkbox checkbox-all"
            size="large"
          />
          全选
        </span>
      </nav>
    </div>

    <div id="left" @scroll="scrollChange">
      <ul id="List-ul">
        <li
          v-for="(item, index) in articleList"
          :key="index"
          @click="byIdSelContent($event, item['Notebookid'])"
          :class="{
            'article-list-buttonchecked': item.Notebookid === articleChecked.id
          }"
        >
          <el-card
            id="el-card"
            @mousemove="articleList[index].hovered = true"
            @mouseleave="articleList[index].hovered = false"
            shadow="hover"
            class="el-articlelist-card"
          >
            <div class="ul-li-item">
              <el-checkbox v-model="item.checked" class="checkbox" size="large" />
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
                <p class="p_2">
                  {{ item.content.substring(0, queryStr == '' ? 14 : 20) }}
                </p>
                <p class="p_3" id="p_3">
                  {{ item.createtime }}
                  <el-icon style="margin-left: 5px"
                    ><Edit @click="editCreatetime(item.Notebookid)"
                  /></el-icon>
                </p>
              </div>

              <div class="del-icon-box">
                <el-icon
                  class="article-del-icon"
                  @click="deleteArticle(item.Notebookid)"
                  v-show="item.hovered"
                  size="large"
                  ><Delete
                /></el-icon>
              </div>
            </div>
          </el-card>
        </li>
      </ul>
    </div>
  </div>

  <MoveToFolder
    :check_list="CheckedarticleList"
    v-if="IsShowMoveToFolder"
    @some-event="closeMoveCallback()"
  ></MoveToFolder>

  <ArticleContent
    @content-update="contentUpdate"
    :articleCheckedIndex="articleChecked.index"
    :articleId="articleChecked.id"
    :queryStr="queryStr"
  ></ArticleContent>
</template>
