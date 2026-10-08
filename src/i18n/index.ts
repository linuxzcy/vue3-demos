import { createI18n, type Composer } from "vue-i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// erasableSyntaxOnly 禁止 enum，用 const 对象 + 联合类型代替
export const LOCALES = ["zh-CN", "en-US"] as const;
export type AppLocale = (typeof LOCALES)[number];

// 以 zh-CN.json 结构为准；messages 的类型约束保证 en-US 缺 key 时编译期报错
type Messages = typeof zhCN;

const STORAGE_KEY = "app-locale";

function getInitialLocale(): AppLocale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh-CN" || saved === "en-US") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export const messages: Record<AppLocale, Messages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export const i18n = createI18n({
  legacy: false, // 组合式 API：setup 里用 useI18n()
  globalInjection: true, // template 里可直接用 $t
  locale: getInitialLocale(),
  fallbackLocale: "zh-CN",
  messages,
});

// ---- 纯 .ts（setup 之外）用法：通过 i18n.global 取文案 ----
// legacy:false 时 global 是 Composer；显式收窄类型，避开 Composer|VueI18n 联合调用报错
const global = i18n.global as unknown as Composer;

/**
 * 在任意 .ts 文件里翻译，支持传参插值：
 * - 命名参数 t('common.welcome', { name: '张三', count: 5 })  → 文案里的 {name} / {count}
 * - 位置参数 t('common.addedToCart', ['iPhone', 2])            → 文案里的 {0} / {1}
 */
export function t(
  key: string,
  arg?: Record<string, unknown> | (string | number)[],
): string {
  return arg === undefined ? global.t(key) : global.t(key, arg as never);
}

/** 切换语言：同步 i18n、持久化、并更新 document.title（演示 .ts 里消费文案） */
export function setLocale(locale: AppLocale): void {
  global.locale.value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  applyDocumentTitle();
}

export function currentLocale(): AppLocale {
  return global.locale.value as AppLocale;
}

/** 用 .ts 里的 t() 更新浏览器标题 */
export function applyDocumentTitle(): void {
  document.title = t("doc.title");
}
