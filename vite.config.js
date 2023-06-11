import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vitePluginAutodeploys from "vite-plugin-autodeploys";
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vitePluginAutodeploys({
      dev: {
        host: "175.178.10.204", //服务器IP
        port: 22, //服务器端口
        username: "root", //服务器ssh登录用户名
        password: "20010506longyuL.", //服务器ssh登录密码
        serverpath: "/home/ubuntu/website/website_nginx/notebook", //服务器web目录
      },
    }),
  ],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
