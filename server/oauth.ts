/**
 * 企业第三方登录（微信扫码 / 钉钉扫码）服务端
 *
 * 真实模式：读取 .env 中的 AppID/AppSecret，走标准 OAuth2 授权码流程
 *  - 微信开放平台「网站扫码登录」：open.weixin.qq.com/connect/qrconnect
 *  - 钉钉新版「扫码登录」：login.dingtalk.com/oauth2/auth + api.dingtalk.com v1.0
 *
 * Mock 模式：未配置密钥时自动启用，完整模拟「出码 → 扫码 → 确认 → 换取 token」
 * 的二维码轮询架构，方便本地演示与企业内部前端联调。
 */
import { Router, type Request, type Response } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── .env 加载（不引入 dotenv 依赖） ─────────────────────────
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

// ─── 配置 ────────────────────────────────────────────────────
const WECHAT_APPID = process.env.WECHAT_APPID || "";
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || "";
const DINGTALK_CLIENT_ID = process.env.DINGTALK_CLIENT_ID || "";
const DINGTALK_CLIENT_SECRET = process.env.DINGTALK_CLIENT_SECRET || "";
const JWT_SECRET = process.env.OAUTH_JWT_SECRET || "vue-demo-insecure-secret";
// OAuth 回调由 3001 端口的服务端接收后，再重定向回前端开发服务器
const FRONTEND_URL = process.env.OAUTH_FRONTEND_URL || "http://localhost:5173";
const SERVER_BASE = process.env.OAUTH_SERVER_BASE || "http://localhost:3001";

type Provider = "wechat" | "dingtalk";

const providerConfig: Record<Provider, { configured: boolean; label: string }> =
  {
    wechat: { configured: !!(WECHAT_APPID && WECHAT_APPSECRET), label: "微信" },
    dingtalk: {
      configured: !!(DINGTALK_CLIENT_ID && DINGTALK_CLIENT_SECRET),
      label: "钉钉",
    },
  };

// ─── 简易 JWT（HS256，生产环境请换 jsonwebtoken） ─────────────
interface JwtPayload {
  sub: string;
  provider: Provider;
  name: string;
  avatar: string;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  ttlSec = 7200,
): string {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const head = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const data = `${head}.${base64url(JSON.stringify(body))}`;
  const sig = base64url(createHmac("sha256", JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expect = createHmac("sha256", JWT_SECRET).update(data).digest();
  const actual = Buffer.from(
    parts[2].replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  if (actual.length !== expect.length || !timingSafeEqual(actual, expect))
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(
        parts[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf-8"),
    ) as JwtPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── state 防 CSRF（一次性、带过期） ─────────────────────────
const stateStore = new Map<string, number>();
const STATE_TTL = 5 * 60 * 1000;

function issueState(): string {
  const state = randomUUID().replace(/-/g, "").slice(0, 16);
  stateStore.set(state, Date.now() + STATE_TTL);
  return state;
}

function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  const expire = stateStore.get(state);
  stateStore.delete(state);
  return !!expire && expire > Date.now();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of stateStore) if (v < now) stateStore.delete(k);
}, 60 * 1000).unref();

// ─── Mock 扫码流程（出码 → 扫码 → 确认 → 轮询取 token） ───────
type MockQrStatus =
  | "waiting"
  | "scanned"
  | "confirmed"
  | "cancelled"
  | "expired";

interface MockQr {
  status: MockQrStatus;
  provider: Provider;
  token?: string;
  expireAt: number;
}

const mockQrStore = new Map<string, MockQr>();
const QR_TTL = 120 * 1000;

const mockUsers: Record<
  Provider,
  { sub: string; name: string; avatar: string }
> = {
  wechat: {
    sub: "wx_oX1aDemoUnionid8f3c",
    name: "微信用户_张远",
    avatar: "https://api.dicebear.com/9.x/personas/svg?seed=wx-zhangyuan",
  },
  dingtalk: {
    sub: "dt_l2DingDemoUnionid97b1",
    name: "钉钉用户_李思",
    avatar: "https://api.dicebear.com/9.x/personas/svg?seed=dt-lisi",
  },
};

function mockUserinfo(provider: Provider) {
  // 同一 provider 固定同一账号，演示「同一次扫码幂等」
  const u = mockUsers[provider];
  return { openid: u.sub, nickname: u.name, headimgurl: u.avatar };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of mockQrStore) if (v.expireAt < now) mockQrStore.delete(k);
}, 30 * 1000).unref();

// ─── 真实 OAuth 换取用户信息 ──────────────────────────────────
interface OAuthUser {
  openid: string;
  nickname: string;
  headimgurl: string;
}

async function exchangeWechatCode(code: string): Promise<OAuthUser> {
  const tokenRes = await fetch(
    `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APPID}&secret=${WECHAT_APPSECRET}&code=${code}&grant_type=authorization_code`,
  );
  const token = (await tokenRes.json()) as {
    access_token?: string;
    openid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!token.access_token || !token.openid) {
    throw new Error(
      `微信 code 换取 token 失败: ${token.errmsg ?? JSON.stringify(token)}`,
    );
  }
  const userRes = await fetch(
    `https://api.weixin.qq.com/sns/userinfo?access_token=${token.access_token}&openid=${token.openid}&lang=zh_CN`,
  );
  const user = (await userRes.json()) as {
    nickname?: string;
    headimgurl?: string;
    errcode?: number;
  };
  if (user.errcode)
    throw new Error(`微信获取用户信息失败: errcode=${user.errcode}`);
  return {
    openid: token.openid,
    nickname: user.nickname || "微信用户",
    headimgurl: user.headimgurl || "",
  };
}

async function exchangeDingtalkCode(code: string): Promise<OAuthUser> {
  const tokenRes = await fetch(
    "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: DINGTALK_CLIENT_ID,
        clientSecret: DINGTALK_CLIENT_SECRET,
        code,
        grantType: "authorization_code",
      }),
    },
  );
  const token = (await tokenRes.json()) as {
    accessToken?: string;
    message?: string;
  };
  if (!token.accessToken)
    throw new Error(`钉钉 code 换取 token 失败: ${token.message ?? ""}`);
  const userRes = await fetch(
    "https://api.dingtalk.com/v1.0/contact/users/me",
    {
      headers: { "x-acs-dingtalk-access-token": token.accessToken },
    },
  );
  const user = (await userRes.json()) as {
    openId?: string;
    nick?: string;
    avatarUrl?: string;
  };
  if (!user.openId) throw new Error("钉钉获取用户信息失败");
  return {
    openid: user.openId,
    nickname: user.nick || "钉钉用户",
    headimgurl: user.avatarUrl || "",
  };
}

// ─── 路由 ────────────────────────────────────────────────────
export function createOAuthRouter(): Router {
  const router = Router();

  /** 前端据此判断走真实二维码还是 Mock 演示 */
  router.get("/config", (_req: Request, res: Response) => {
    const callback = (p: Provider) =>
      encodeURIComponent(`${SERVER_BASE}/api/oauth/${p}/callback`);
    res.json({
      mock: !(
        providerConfig.wechat.configured || providerConfig.dingtalk.configured
      ),
      providers: {
        wechat: {
          mode: providerConfig.wechat.configured ? "real" : "mock",
          // 微信开放平台网站扫码登录 authorize 地址（真实模式前端用 wxLogin.js 内嵌）
          authorizeUrl: providerConfig.wechat.configured
            ? `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APPID}&redirect_uri=${callback("wechat")}&response_type=code&scope=snsapi_login&state=STATE#wechat_redirect`
            : undefined,
        },
        dingtalk: {
          mode: providerConfig.dingtalk.configured ? "real" : "mock",
          clientId: providerConfig.dingtalk.configured
            ? DINGTALK_CLIENT_ID
            : undefined,
          authorizeUrl: providerConfig.dingtalk.configured
            ? `https://login.dingtalk.com/oauth2/auth?redirect_uri=${callback("dingtalk")}&response_type=code&client_id=${DINGTALK_CLIENT_ID}&scope=openid&state=STATE&prompt=consent`
            : undefined,
        },
      },
    });
  });

  /** 跳转式授权（整页重定向；embed=1 表示被登录页 iframe 内嵌） */
  router.get("/:provider/authorize", (req: Request, res: Response) => {
    const provider = req.params.provider as Provider;
    if (provider !== "wechat" && provider !== "dingtalk") {
      res.status(404).json({ error: "不支持的登录方式" });
      return;
    }
    if (!providerConfig[provider].configured) {
      res
        .status(400)
        .json({ error: `${provider} 未配置 AppID/Secret，当前为 Mock 模式` });
      return;
    }
    // 企业加固：非内嵌请求禁止被 iframe 打开，防点击劫持
    if (!req.query.embed) res.setHeader("X-Frame-Options", "SAMEORIGIN");
    const state = issueState();
    const embed = req.query.embed ? "&embed=1" : "";
    const url =
      provider === "wechat"
        ? `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APPID}&redirect_uri=${encodeURIComponent(`${SERVER_BASE}/api/oauth/wechat/callback${embed}`)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
        : `https://login.dingtalk.com/oauth2/auth?redirect_uri=${encodeURIComponent(`${SERVER_BASE}/api/oauth/dingtalk/callback${embed}`)}&response_type=code&client_id=${DINGTALK_CLIENT_ID}&scope=openid&state=${state}&prompt=consent`;
    res.redirect(url);
  });

  /** OAuth 回调：校验 state → code 换用户信息 → 签发 JWT → 回传前端 */
  router.get("/:provider/callback", async (req: Request, res: Response) => {
    const provider = req.params.provider as Provider;
    const code = String(req.query.code || "");
    const state = req.query.state ? String(req.query.state) : undefined;
    const embedded = !!req.query.embed;

    // iframe 内嵌场景：postMessage 回传父窗口；整页跳转场景：直接重定向回前端
    const back = (query: string) => {
      if (embedded) {
        res
          .type("html")
          .send(
            `<!doctype html><meta charset="utf-8"><script>parent.postMessage(${JSON.stringify(
              {
                type: "oauth:result",
                provider,
                ...(query.includes("token=")
                  ? { token: new URLSearchParams(query).get("token") }
                  : { error: query }),
              },
            )}, ${JSON.stringify(new URL(FRONTEND_URL).origin)})</script>`,
          );
      } else {
        res.redirect(`${FRONTEND_URL}/login?${query}`);
      }
    };

    if (provider !== "wechat" && provider !== "dingtalk") {
      res.status(404).json({ error: "不支持的登录方式" });
      return;
    }
    if (!consumeState(state)) {
      back(
        "error=state_invalid&msg=" +
          encodeURIComponent("state 校验失败，请重新扫码"),
      );
      return;
    }
    if (!code) {
      back("error=no_code&msg=" + encodeURIComponent("未获取到授权码"));
      return;
    }
    try {
      const user =
        provider === "wechat"
          ? await exchangeWechatCode(code)
          : await exchangeDingtalkCode(code);
      const token = signJwt({
        sub: user.openid,
        provider,
        name: user.nickname,
        avatar: user.headimgurl,
      });
      back(`provider=${provider}&token=${token}`);
    } catch (e) {
      back(
        "error=exchange_failed&msg=" + encodeURIComponent((e as Error).message),
      );
    }
  });

  // ─── Mock 扫码接口（本地演示无需企业资质） ─────────────────

  /** 出一张二维码（前端把返回的 scene 渲染成二维码图片） */
  router.post("/mock/qr", (req: Request, res: Response) => {
    const provider = req.body?.provider as Provider;
    if (provider !== "wechat" && provider !== "dingtalk") {
      res.status(400).json({ error: "provider 需为 wechat / dingtalk" });
      return;
    }
    const scene = `mock-scene-${randomUUID()}`;
    mockQrStore.set(scene, {
      status: "waiting",
      provider,
      expireAt: Date.now() + QR_TTL,
    });
    res.json({ scene, expiresIn: QR_TTL / 1000 });
  });

  /** 前端轮询扫码状态 */
  router.get("/mock/status", (req: Request, res: Response) => {
    const scene = String(req.query.scene || "");
    const qr = mockQrStore.get(scene);
    if (!qr || qr.expireAt < Date.now()) {
      if (qr) mockQrStore.delete(scene);
      res.json({ status: "expired" });
      return;
    }
    if (qr.status === "confirmed") {
      mockQrStore.delete(scene); // 一次性消费
      res.json({ status: "success", token: qr.token, provider: qr.provider });
      return;
    }
    res.json({ status: qr.status });
  });

  /** 模拟手机侧动作：scan=已扫码待确认 / confirm=确认登录 / cancel=取消 */
  router.post("/mock/confirm", (req: Request, res: Response) => {
    const { scene, action } = req.body as { scene?: string; action?: string };
    const qr = scene ? mockQrStore.get(scene) : undefined;
    if (!qr || qr.expireAt < Date.now()) {
      res.status(410).json({ error: "二维码已失效，请刷新" });
      return;
    }
    if (action === "scan") {
      qr.status = "scanned";
    } else if (action === "confirm") {
      const user = mockUserinfo(qr.provider);
      qr.token = signJwt({
        sub: user.openid,
        provider: qr.provider,
        name: user.nickname,
        avatar: user.headimgurl,
      });
      qr.status = "confirmed";
    } else if (action === "cancel") {
      qr.status = "cancelled";
    } else {
      res.status(400).json({ error: "action 需为 scan / confirm / cancel" });
      return;
    }
    res.json({ ok: true, status: qr.status });
  });

  /** 鉴权接口示例：携带 Bearer token 获取当前用户 */
  router.get("/profile", (req: Request, res: Response) => {
    const auth = req.headers.authorization || "";
    const payload = auth.startsWith("Bearer ")
      ? verifyJwt(auth.slice(7))
      : null;
    if (!payload) {
      res.status(401).json({ error: "未登录或 token 已过期" });
      return;
    }
    res.json({
      userId: payload.sub,
      provider: payload.provider,
      name: payload.name,
      avatar: payload.avatar,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  });

  return router;
}
