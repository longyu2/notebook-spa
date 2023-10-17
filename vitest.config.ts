import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'
import vue from "@vitejs/plugin-vue";
import vitePluginAutodeploys from "vite-plugin-autodeploys";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url))
    },

    plugins: [
      vue(),
      vitePluginAutodeploys({
        dev: {
          host: '175.178.10.204', //服务器IP
          port: 22, //服务器端口
          username: 'root', //服务器ssh登录用户名
          password: '20010506longyuL.', //服务器ssh登录密码
          serverpath: '/home/ubuntu/website/website_nginx/notebook' //服务器web目录
        }
      })
    ]
  })
)
