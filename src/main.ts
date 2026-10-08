import { createApp } from "vue";
import { createPinia } from "pinia";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import App from "./App.vue";
import router from "./router";
import { i18n, applyDocumentTitle, t, setLocale } from "./i18n";
import "./style.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Antd);
app.use(i18n);
applyDocumentTitle(); // 演示：在纯 .ts 里用全局 t() 消费文案

// 仅开发环境暴露，方便控制台验证传参插值：__i18n.t('common.welcome', { name:'张三', count:5 })
if (import.meta.env.DEV) {
  (window as unknown as { __i18n: unknown }).__i18n = { t, setLocale };
}

app.mount("#app");
