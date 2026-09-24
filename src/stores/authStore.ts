import { defineStore } from "pinia";
import { ref } from "vue";

const TOKEN_KEY = "oauth_token";

export interface OAuthProfile {
  userId: string;
  provider: "wechat" | "dingtalk";
  name: string;
  avatar: string;
  expiresAt: string;
}

/**
 * 企业常见的登录态管理：token 持久化 localStorage，
 * 用户信息以 /api/oauth/profile 校验结果为准（不信任本地解密）
 */
export const useAuthStore = defineStore("auth", () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || "");
  const user = ref<OAuthProfile | null>(null);
  const profileLoading = ref(false);

  function setToken(value: string) {
    token.value = value;
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function fetchProfile(): Promise<boolean> {
    if (!token.value) return false;
    profileLoading.value = true;
    try {
      const res = await fetch("/api/oauth/profile", {
        headers: { Authorization: `Bearer ${token.value}` },
      });
      if (!res.ok) {
        setToken("");
        user.value = null;
        return false;
      }
      user.value = (await res.json()) as OAuthProfile;
      return true;
    } finally {
      profileLoading.value = false;
    }
  }

  function logout() {
    setToken("");
    user.value = null;
  }

  return { token, user, profileLoading, setToken, fetchProfile, logout };
});
