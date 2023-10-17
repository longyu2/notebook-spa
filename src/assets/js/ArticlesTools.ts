// 本工具模块用于存储可复用的对文章进行增删改查的函数
import { server_url } from '@/assets/constants/index'
import axios from 'axios'
axios.interceptors.request.use((config) => {
  // 添加自定义token
  config.headers.authorization = localStorage.getItem('token')
  return config
})

// 导出saveArticle 函数
export const saveArticle = function (articleId: string, title: string, content: string) {
  // 将内容保存到云
  axios
    .post(server_url + '/updateContent', {
      Notebookid: articleId,
      content: content,
      title: title
    })
    .then(function (response) {
      if (response.data == null) {
        console.error('error')
      }
    })
}
