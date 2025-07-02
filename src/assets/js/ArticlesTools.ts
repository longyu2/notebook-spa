// 本工具模块用于存储可复用的对文章进行增删改查的函数
import { server_url } from '@/assets/constants/index'
import axios from 'axios'

// 导出saveArticle 函数
const saveArticle = async (articleId: string, title: string, content: string) => {
  // 将内容保存到云
  const res = await axios.put(server_url + '/article', {
    Notebookid: articleId,
    content: content,
    title: title
  })

  if (res.data == null) {
    console.error('error')
  }
}

export { saveArticle }
