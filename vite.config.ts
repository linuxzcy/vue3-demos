import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// 复制 TinyMCE 静态资源到 public（皮肤、语言包）
const tinymcePublic = resolve('public/tinymce')
mkdirSync(tinymcePublic, { recursive: true })

const langSrc = resolve('node_modules/tinymce-i18n/langs/zh_CN.js')
const langDestDir = resolve(tinymcePublic, 'langs')
if (existsSync(langSrc)) {
  mkdirSync(langDestDir, { recursive: true })
  cpSync(langSrc, resolve(langDestDir, 'zh_CN.js'))
} else {
  // TinyMCE 6/7 语言包兜底
  const lang7 = resolve('node_modules/tinymce-i18n/langs7/zh_CN.js')
  if (existsSync(lang7)) {
    mkdirSync(langDestDir, { recursive: true })
    cpSync(lang7, resolve(langDestDir, 'zh_CN.js'))
  }
}

const skinsSrc = resolve('node_modules/tinymce/skins')
const skinsDest = resolve(tinymcePublic, 'skins')
if (existsSync(skinsSrc)) {
  cpSync(skinsSrc, skinsDest, { recursive: true })
}

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
