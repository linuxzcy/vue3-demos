/**
 * 谷歌翻译免费接口代理
 *
 * 官方 Cloud Translation API 虽有每月 50 万字符免费额度，但需要 Google Cloud
 * 账号并绑定信用卡。这里改用谷歌网页版翻译的公开接口（无需 Key、完全免费）：
 *   https://translate.googleapis.com/translate_a/single?client=gtx&sl=..&tl=..&dt=t&q=..
 *
 * 该接口浏览器直接调用会被 CORS 拦截且国内无法直连，所以走 Express 服务端代理，
 * 前端只请求本项目自己的 /api/translate。
 *
 * 注意：这是非官方接口，谷歌不承诺稳定性，仅适合 demo / 个人工具；
 * 生产环境建议换官方 API 或 Azure / 百度 / DeepL 等。
 */
import { Router, type Request, type Response } from "express";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

// ─── .env 加载（同 oauth.ts 约定，不引入 dotenv） ─────────────
function loadDotEnv() {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env))
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

// Node fetch 不读系统代理：国内需科学上网时，在 .env 配置
// TRANSLATE_PROXY=http://127.0.0.1:7897（或复用 HTTPS_PROXY）
const PROXY = process.env.TRANSLATE_PROXY || process.env.HTTPS_PROXY || "";
if (PROXY) {
  setGlobalDispatcher(new ProxyAgent(PROXY));
  console.log(`[translate] 使用代理 ${PROXY}`);
}

// 常用语言（value 即接口用的语言码，auto 表示自动检测）
export const LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "auto", name: "自动检测" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁体中文" },
  { code: "en", name: "英语" },
  { code: "ja", name: "日语" },
  { code: "ko", name: "韩语" },
  { code: "fr", name: "法语" },
  { code: "de", name: "德语" },
  { code: "es", name: "西班牙语" },
  { code: "ru", name: "俄语" },
  { code: "pt", name: "葡萄牙语" },
  { code: "it", name: "意大利语" },
  { code: "ar", name: "阿拉伯语" },
  { code: "th", name: "泰语" },
  { code: "vi", name: "越南语" },
];

/**
 * 解析谷歌返回的嵌套数组结构：
 * [ [ [译文, 原文, null, null], ... ], null, "检测到的语种", ... ]
 */
function parseGoogleResponse(json: unknown): {
  text: string;
  detectedLang: string;
} {
  if (!Array.isArray(json)) throw new Error("接口返回格式异常");
  const segments = Array.isArray(json[0]) ? json[0] : [];
  const text = segments
    .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : ""))
    .join("");
  const detectedLang = typeof json[2] === "string" ? json[2] : "";
  return { text, detectedLang };
}

async function callGoogle(params: URLSearchParams): Promise<unknown> {
  const url = `${GOOGLE_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; vue-demo-translate)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`谷歌接口返回 ${res.status}`);
  return res.json();
}

export function createTranslateRouter(): Router {
  const router = Router();

  // POST /api/translate  body: { text, sl, tl }
  router.post("/", async (req: Request, res: Response) => {
    const { text, sl = "auto", tl = "en" } = req.body ?? {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ message: "text 不能为空" });
    }
    try {
      const params = new URLSearchParams({
        client: "gtx",
        sl,
        tl,
        dt: "t",
        q: text,
      });
      const json = await callGoogle(params);
      const { text: translated, detectedLang } = parseGoogleResponse(json);
      return res.json({ text: translated, detectedLang });
    } catch (err) {
      return res.status(502).json({
        message: err instanceof Error ? err.message : "翻译失败",
      });
    }
  });

  // GET /api/translate/detect?q=xxx  单独检测语种
  router.get("/detect", async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "");
    if (!q) return res.status(400).json({ message: "q 不能为空" });
    try {
      const params = new URLSearchParams({
        client: "gtx",
        sl: "auto",
        tl: "en",
        dt: "t",
        q,
      });
      const json = await callGoogle(params);
      const { detectedLang } = parseGoogleResponse(json);
      return res.json({ detectedLang });
    } catch (err) {
      return res.status(502).json({
        message: err instanceof Error ? err.message : "检测失败",
      });
    }
  });

  // GET /api/translate/languages  支持的语言列表
  router.get("/languages", (_req: Request, res: Response) => {
    res.json(LANGUAGES);
  });

  return router;
}
