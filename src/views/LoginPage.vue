<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { message } from "ant-design-vue";
import QRCode from "qrcode";
import { useAuthStore } from "../stores/authStore";

type Provider = "wechat" | "dingtalk";
type ProviderMode = "real" | "mock";
type QrStatus = "waiting" | "scanned" | "cancelled" | "expired";

interface OAuthConfig {
  mock: boolean;
  providers: Record<Provider, { mode: ProviderMode }>;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const activeTab = ref<Provider>("wechat");
const config = ref<OAuthConfig | null>(null);

// Mock 二维码
const qrDataUrl = ref("");
const qrStatus = ref<QrStatus>("waiting");
const qrScene = ref("");
const qrLoading = ref(false);

// 真实模式 iframe
const iframeSrc = ref("");

let pollTimer: ReturnType<typeof setInterval> | null = null;

const statusText: Record<QrStatus, string> = {
  waiting: "请使用手机扫码登录",
  scanned: "已扫码，请在手机上确认",
  cancelled: "已取消登录，请刷新二维码",
  expired: "二维码已失效，请刷新",
};

// ─── 初始化 ──────────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch("/api/oauth/config");
    config.value = (await res.json()) as OAuthConfig;
  } catch {
    message.error("无法连接授权服务，请确认已启动：npm run server");
  }
}

function setupProvider(provider: Provider) {
  stopPolling();
  const mode = config.value?.providers[provider]?.mode ?? "mock";
  if (mode === "mock") {
    iframeSrc.value = "";
    void refreshMockQr(provider);
  } else {
    qrDataUrl.value = "";
    iframeSrc.value = `/api/oauth/${provider}/authorize?embed=1`;
  }
}

// ─── Mock 出码 + 轮询 ────────────────────────────────────────
async function refreshMockQr(provider: Provider) {
  qrLoading.value = true;
  try {
    const res = await fetch("/api/oauth/mock/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = (await res.json()) as { scene: string };
    qrScene.value = data.scene;
    qrStatus.value = "waiting";
    // 真实场景下二维码内容由开放平台生成，这里扫码对象是我们的 scene
    qrDataUrl.value = await QRCode.toDataURL(
      `mock-login://${provider}/${data.scene}`,
      {
        width: 220,
        margin: 1,
      },
    );
    startPolling();
  } finally {
    qrLoading.value = false;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!qrScene.value) return;
    const res = await fetch(`/api/oauth/mock/status?scene=${qrScene.value}`);
    const data = (await res.json()) as {
      status: string;
      token?: string;
      provider?: Provider;
    };
    if (data.status === "success" && data.token) {
      stopPolling();
      await onLoginSuccess(data.token);
    } else if (["cancelled", "expired"].includes(data.status)) {
      stopPolling();
      qrStatus.value = data.status as QrStatus;
    } else {
      qrStatus.value = data.status as QrStatus;
    }
  }, 1500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** 模拟手机端动作：扫码 / 确认 / 取消 */
async function simulate(action: "scan" | "confirm" | "cancel") {
  if (!qrScene.value) return;
  await fetch("/api/oauth/mock/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: qrScene.value, action }),
  });
  if (action === "scan") qrStatus.value = "scanned";
}

// ─── 登录成功统一处理 ────────────────────────────────────────
async function onLoginSuccess(token: string) {
  auth.setToken(token);
  const ok = await auth.fetchProfile();
  if (ok) message.success(`欢迎回来，${auth.user?.name}`);
  else message.error("token 校验失败");
}

function onMessage(e: MessageEvent) {
  const d = e.data as { type?: string; token?: string; error?: string };
  if (d?.type !== "oauth:result") return;
  if (d.token) void onLoginSuccess(d.token);
  else message.error("授权失败，请重新扫码");
}

// ─── 生命周期 ────────────────────────────────────────────────
onMounted(async () => {
  window.addEventListener("message", onMessage);

  // 整页跳转回流：/login?token=xxx
  const q = route.query;
  if (typeof q.token === "string") {
    await onLoginSuccess(q.token);
    void router.replace({ query: {} });
  }

  await loadConfig();
  if (auth.token) await auth.fetchProfile();
  setupProvider(activeTab.value);
});

watch(activeTab, (p) => setupProvider(p));

onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  stopPolling();
});

// ─── 展示辅助 ────────────────────────────────────────────────
const providerLabel: Record<Provider, string> = {
  wechat: "微信",
  dingtalk: "钉钉",
};

function currentMode(p: Provider): ProviderMode {
  return config.value?.providers[p]?.mode ?? "mock";
}

function logout() {
  auth.logout();
  setupProvider(activeTab.value);
}
</script>

<template>
  <div class="login-demo">
    <a-row :gutter="24">
      <!-- 左：登录卡片 -->
      <a-col :xs="24" :md="10" :lg="8">
        <a-card :bordered="false" class="login-card">
          <template #title>企业统一登录</template>
          <template #extra>
            <a-tag :color="config?.mock ? 'orange' : 'green'">
              {{ config?.mock ? "Mock 演示模式" : "真实 OAuth 模式" }}
            </a-tag>
          </template>

          <a-tabs v-model:activeKey="activeTab" centered>
            <a-tab-pane key="wechat">
              <template #tab>
                <span><span class="tab-icon">💬</span> 微信</span>
              </template>
            </a-tab-pane>
            <a-tab-pane key="dingtalk">
              <template #tab>
                <span><span class="tab-icon">📌</span> 钉钉</span>
              </template>
            </a-tab-pane>
          </a-tabs>

          <!-- 已登录 -->
          <div v-if="auth.user" class="logged-panel">
            <a-avatar :src="auth.user.avatar" :size="72" />
            <h3>{{ auth.user.name }}</h3>
            <a-descriptions :column="1" size="small" bordered>
              <a-descriptions-item label="登录方式">
                {{ providerLabel[auth.user.provider] }}扫码
              </a-descriptions-item>
              <a-descriptions-item label="UnionID/OpenID">
                <code>{{ auth.user.userId }}</code>
              </a-descriptions-item>
              <a-descriptions-item label="Token 过期">
                {{ new Date(auth.user.expiresAt).toLocaleString() }}
              </a-descriptions-item>
            </a-descriptions>
            <a-button block danger style="margin-top: 16px" @click="logout"
              >退出登录</a-button
            >
          </div>

          <!-- 未登录：二维码区 -->
          <div v-else class="qr-area">
            <!-- 真实模式：iframe 内嵌官方扫码页 -->
            <div
              v-if="currentMode(activeTab) === 'real' && iframeSrc"
              class="qr-frame"
            >
              <iframe :key="iframeSrc" :src="iframeSrc" class="oauth-iframe" />
              <a-button
                type="link"
                size="small"
                @click="setupProvider(activeTab)"
              >
                刷新二维码
              </a-button>
            </div>

            <!-- Mock 模式：本地二维码 + 轮询 -->
            <div
              v-else
              class="qr-frame"
              :class="{ dimmed: qrStatus !== 'waiting' }"
            >
              <a-spin :spinning="qrLoading">
                <img
                  v-if="qrDataUrl"
                  :src="qrDataUrl"
                  alt="登录二维码"
                  class="qr-img"
                />
              </a-spin>
              <p class="qr-status">{{ statusText[qrStatus] }}</p>
              <a-button
                v-if="qrStatus === 'expired' || qrStatus === 'cancelled'"
                size="small"
                @click="refreshMockQr(activeTab)"
              >
                刷新二维码
              </a-button>
            </div>

            <p class="qr-tip">
              当前为 <b>{{ providerLabel[activeTab] }}</b>
              {{
                currentMode(activeTab) === "mock"
                  ? "演示二维码"
                  : "官方扫码组件（真实模式）"
              }}
            </p>

            <!-- 开发者模拟面板（仅 Mock 模式） -->
            <a-collapse
              v-if="currentMode(activeTab) === 'mock'"
              ghost
              size="small"
            >
              <a-collapse-panel key="dev" header="🧪 开发者模拟（代替手机端）">
                <a-space>
                  <a-button
                    size="small"
                    :disabled="qrStatus !== 'waiting'"
                    @click="simulate('scan')"
                  >
                    模拟扫码
                  </a-button>
                  <a-button
                    size="small"
                    type="primary"
                    :disabled="qrStatus !== 'scanned'"
                    @click="simulate('confirm')"
                  >
                    确认登录
                  </a-button>
                  <a-button
                    size="small"
                    danger
                    :disabled="qrStatus === 'expired'"
                    @click="simulate('cancel')"
                  >
                    取消
                  </a-button>
                </a-space>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </a-card>
      </a-col>

      <!-- 右：企业接入说明 -->
      <a-col :xs="24" :md="14" :lg="16">
        <a-card :bordered="false" title="企业接入指南">
          <a-timeline>
            <a-timeline-item color="blue">
              <b>1. 应用资质申请</b>
              <p>
                微信：开放平台 (open.weixin.qq.com)
                创建「网站应用」，审核通过后获得 AppID/AppSecret，
                并配置<b>授权回调域</b>（如
                <code>login.your-company.com</code>）。<br />
                钉钉：开发者后台创建「企业内部应用 /
                三方应用」，开通「个人手机号信息 / 通讯录个人信息读权限」， 获得
                Client ID/Secret，配置回调域名。
              </p>
            </a-timeline-item>
            <a-timeline-item color="blue">
              <b>2. 扫码授权流程（OAuth2 授权码模式）</b>
              <p>
                前端内嵌二维码 → 用户扫码确认 → 平台重定向
                <code>redirect_uri?code=xx&state=xx</code> → 服务端校验
                state、用 code + secret 换取 access_token 与用户信息（secret
                绝不出现在前端）→ 签发自有 JWT/Session → 前端保存登录态。
              </p>
            </a-timeline-item>
            <a-timeline-item color="blue">
              <b>3. 本仓库启用真实模式</b>
              <p>
                在 <code>.env</code> 配置
                <code
                  >WECHAT_APPID / WECHAT_APPSECRET / DINGTALK_CLIENT_ID /
                  DINGTALK_CLIENT_SECRET</code
                >
                后重启 <code>npm run server</code>；未配置时自动进入 Mock
                演示模式（出码/扫码/确认/轮询/过期与真实架构一致）。
              </p>
            </a-timeline-item>
            <a-timeline-item color="blue">
              <b>4. 账号体系设计</b>
              <p>
                以
                <code>provider + unionid</code>
                作为唯一外部身份，与内部员工账号绑定（首次扫码需绑定手机/工号）；
                微信网站应用请优先使用 unionid 而非 openid，便于多应用打通。企业
                SSO 场景可再叠加 钉钉免登（jsapi
                <code>requestAuthCode</code>）实现工作台内无感登录。
              </p>
            </a-timeline-item>
            <a-timeline-item color="blue">
              <b>5. 安全要点</b>
              <p>
                state 防 CSRF（一次性、5 分钟过期）；code 一次性且 5
                分钟有效；JWT 服务端 HMAC 签名并支持过期；
                回调地址白名单校验；iframe 回传 token 时限定
                targetOrigin；生产环境必须 HTTPS。
              </p>
            </a-timeline-item>
          </a-timeline>

          <a-alert
            v-if="config?.mock"
            type="warning"
            show-icon
            message="当前为 Mock 演示模式"
            description="未检测到微信/钉钉 AppID 配置，扫码流程为本地模拟。企业内网部署时按上方步骤配置 .env 即可无缝切换真实授权，前端代码零改动。"
          />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.login-demo {
  padding-top: 24px;
}

.login-card {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.tab-icon {
  margin-right: 4px;
}

.qr-area {
  text-align: center;
  padding: 8px 0;
}

.qr-frame {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.qr-frame.dimmed .qr-img {
  opacity: 0.15;
  filter: blur(2px);
}

.qr-img {
  width: 220px;
  height: 220px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  transition: opacity 0.3s;
}

.oauth-iframe {
  width: 300px;
  height: 400px;
  border: none;
}

.qr-status {
  color: #595959;
  margin: 4px 0;
}

.qr-tip {
  color: #8c8c8c;
  font-size: 12px;
}

.logged-panel {
  text-align: center;
  padding: 8px 0;
}

.logged-panel h3 {
  margin: 12px 0;
}

.logged-panel :deep(.ant-descriptions) {
  text-align: left;
}
</style>
