<script setup lang="ts">
import axios from 'axios'
const server_url = localStorage.getItem('server_url')

import { ref, watch } from 'vue'
import ArticleContent from './ArticleContent.vue'
import { computed } from 'vue'
import MoveToFolder from '@/components/pc/MoveToFolder.vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

const router = useRouter()

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

// 监听articleChecked 的id变化，如有变化，存储到localStorage 中，实现记忆上次选中的文章
watch(
  () => articleChecked.value.id,
  (articleChecked, prevArticleChecked) => {
    console.log('articleChecked 变化了', articleChecked)
    localStorage.setItem('lastCheckedArticleId', articleChecked.toString())
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

/* 从搜索页点进来时，目标文章可能不在当前列表里 —— 它可能排在第 100 名开外，
   也可能当前停在某个文件夹而它不属于这个文件夹。这时单独把它拉出来补在列表
   最前面，保证左侧有选中项、编辑器也能按 id 加载正文。
   用 localStorage 传而不是 query 参数，省得把 id 一层层透传过 FolderList。 */
const takePendingOpenArticle = async () => {
  const openId = parseInt(localStorage.getItem('openArticleId') || '')
  localStorage.removeItem('openArticleId') // 一次性的，读完就删

  if (!openId) return 0

  const already = articleList.value.find(
    (article: { Notebookid: number }) => article.Notebookid === openId
  )
  if (already) return openId

  try {
    const res = await axios.get(`${server_url}/article/${openId}`)
    const row = res.data?.[0]
    if (!row) return 0

    row.checked = false
    row.hovered = false
    row.length = (row.content || '').length
    articleList.value.unshift(row)
    return openId
  } catch {
    return 0
  }
}

// 根据folderId 获取文章信息并渲染
const getArticleByFoldeId = async (folderId: string) => {
  const result = await axios.get(`${server_url}/articles?folderid=${folderId}`)
  articles = result.data.data
  articleLength.value = articles.length

  //在信息获取完成后，为其添加控制checkbox 的属性,和hover 属性，用来控制，这几项服务器端没有，只有客户端有
  articles.forEach((element: any) => {
    element.checked = false
    element.hovered = false
  })

  articleList.value = articles.splice(0, 100) //  查询到的信息存储到article数组中

  // 搜索页指定的一次性 id 优先，其次才是上次选中的文章
  const openId = await takePendingOpenArticle()
  const lastCheckedArticleId = openId || parseInt(localStorage.getItem('lastCheckedArticleId')!)

  // 如果存在上次选中的文章id，则选中该文章
  const lastCheckedArticle = articleList.value.find(
    (article: { Notebookid: number }) => article.Notebookid === lastCheckedArticleId
  )

  if (lastCheckedArticle) {
    articleChecked.value.id = lastCheckedArticleId
  } else if (articleList.value.length > 0) {
    articleChecked.value.id = articleList.value[0].Notebookid // 选中列表中最新的文章
  } else {
    articleChecked.value.id = -9999 // -9999 代表列表已经没有文章，编辑器会被禁用
  }

  updateCheckIndex()
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
}

const queryStr = ref('') // queryStr 用来查询

// 列表卡片/排序用的时间只显示到「天」，时分秒挪到右侧编辑器头部
const fmtDay = (s: string) => {
  if (!s) return ''
  const str = String(s)
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : str
}

/* 列表排序：创建时间 / 更新时间 / 字数（默认创建时间）。
   决定两件事：① 列表顺序 ② 卡片上显示的日期（按创建就显创建，按更新就显更新）。
   搜索时同样带进 /search 的 query（默认创建时间不写进 URL）。 */
const listSort = ref<'createtime' | 'updatetime' | 'word'>('createtime')
const allWordCount = ref(0)
const getWordCount = () =>
  axios
    .get(`${server_url}/wordCount/${props.folderId}`)
    .then((results) => (allWordCount.value = results.data.data))

// 获取总字数
getWordCount()

/* 搜索改成跳到独立的卡片页（复用公开页的卡片样式），覆盖「全部笔记」。
   以前是把结果替换进左侧列表，问题一堆：最多 100 条、没有摘要、
   高亮只替第一处、还要把标记写进正文。现在左边只管输入，结果交给 /search。
   清空输入框再回车 = 取消搜索，回到当前文件夹的列表。 */
const searchArticle = () => {
  const q = queryStr.value.trim()
  if (q === '') {
    getArticleByFoldeId(props.folderId)
    return
  }
  /* 排序跟着一起带过去：默认创建时间不写进 URL，非默认才带 */
  const query: Record<string, string> = { q }
  if (listSort.value !== 'createtime') query.sort = listSort.value
  router.push({ path: '/search', query })
}

/* 卡片上显示的日期跟着排序字段走：按更新时间排就显示更新时间，其余显示创建时间。
   时分秒不在这里显示（挪到右侧编辑器头部），所以只取到「天」。 */
const cardDate = (item: any) => {
  const s = listSort.value === 'updatetime' ? item.updatetime : item.createtime
  return fmtDay(s)
}

/* 切换排序：本地给当前列表排一遍（不重新请求，列表本来就全量在手） */
const sortArticleList = () => {
  const key = listSort.value
  const cmp = (a: any, b: any) => {
    let va: any
    let vb: any
    if (key === 'word') {
      va = a.length || 0
      vb = b.length || 0
    } else {
      va = a[key] || ''
      vb = b[key] || ''
    }
    if (va < vb) return 1 // 倒序：大的在前
    if (va > vb) return -1
    return (b.Notebookid || 0) - (a.Notebookid || 0)
  }
  articleList.value = [...articleList.value].sort(cmp)
}

const setListSort = (s: 'createtime' | 'updatetime' | 'word') => {
  if (listSort.value === s) return
  listSort.value = s
  sortArticleList()
}

/*
  按「可见字符数」截断，忽略 <b></b> 这类高亮标签本身占用的字符。
  这样无论搜索框有没有值、内容里有没有高亮标签，列表显示的文字长度都一致。
*/
const visibleSlice = (html: string, max: number) => {
  let result = ''
  let visible = 0
  let i = 0
  while (i < html.length && visible < max) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end === -1) break
      result += html.slice(i, end + 1)
      i = end + 1
    } else {
      result += html[i]
      visible++
      i++
    }
  }
  return result
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
  await axios.delete(`${server_url}/articles`, {
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
    if (element.Notebookid == data.articleId) {
      element.title = data.title
      element.content = data.content
    }
  })
  // 同时修改累计字数显示
  setTimeout(() => {
    getWordCount()
  }, 100)
}
import { onMounted } from 'vue'
onMounted(() => {
  getArticleByFoldeId(props.folderId) // 初始时调用查询方法，并填充
})
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

        <!-- 排序小字：决定列表顺序，也决定卡片上显示哪个时间（跳搜索页时一并带上） -->
        <div class="search-sort">
          <span class="search-sort__label">排序</span>
          <button
            type="button"
            class="search-sort__item"
            :class="{ 'is-on': listSort === 'createtime' }"
            @click="setListSort('createtime')"
          >
            创建时间
          </button>
          <span class="search-sort__sep">/</span>
          <button
            type="button"
            class="search-sort__item"
            :class="{ 'is-on': listSort === 'updatetime' }"
            @click="setListSort('updatetime')"
          >
            更新时间
          </button>
          <span class="search-sort__sep">/</span>
          <button
            type="button"
            class="search-sort__item"
            :class="{ 'is-on': listSort === 'word' }"
            @click="setListSort('word')"
          >
            字数
          </button>
        </div>
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
          :class="{ 'article-list-buttonchecked': item.Notebookid === articleChecked.id }"
          @mousemove="articleList[index].hovered = true"
          @mouseleave="articleList[index].hovered = false"
          shadow="hover"
          class="el-articlelist-card ul-li-item"
        >
          <el-checkbox v-model="item.checked" class="checkbox" size="large" />
          <div class="ul-list-texts">
            <p class="p_1" v-html="item.title != '' ? visibleSlice(item.title, 14) : '无标题'"></p>
            <!-- 按可见字符数截断（visibleSlice），标签不占长度，搜索前后显示长度一致 -->
            <p class="p_2" v-html="visibleSlice(item.content, 14)"></p>
            <p class="p_3" id="p_3">
              <span class="p_3__date">
                {{ cardDate(item) }}
                <el-icon style="margin-left: 5px"
                  ><Edit @click="editCreatetime(item.Notebookid)"
                /></el-icon>
              </span>
              <!-- 时分秒挪到了右侧编辑器头部，这里空出来的位置显示字数。
                   注意用 item.length（后端给的真实字数），不是 item.content.length
                   —— 列表接口的 content 只截了前 16 字。 -->
              <span class="p_3__words">{{ item.length || 0 }} 字</span>
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
  ></ArticleContent>
</template>
