<template>
  <div v-if="visible" class="update-notice">
    <span class="update-text">
      发现新版本
      <strong v-if="remoteVersion">{{ remoteVersion }}</strong>
    </span>
    <button class="update-btn" @click="refresh">刷新</button>
    <button class="update-close" title="稍后再说" @click="dismiss">×</button>
  </div>
</template>

<script setup>
/**
 * 新版本自动提示
 *
 * 原理：构建时把 version.json 一起产出到 dist 根目录（见 vite.config.js 的
 * pim-version-manifest 插件）；页面启动后拉取线上那份，和打进包里的
 * sha / buildTime 比对，不一致就提示刷新。
 *
 * 没有 SW、没有 PWA，纯静态比对，部署到任意静态托管都能用。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { BUILD_TIME, COMMIT_SHA, VERSION } from '../version'

const POLL_MS = 10 * 60 * 1000
const DISMISS_KEY = 'pim_update_dismissed'

const visible = ref(false)
const remoteVersion = ref('')
const remoteKey = ref('')

let timer = null

function versionUrl() {
  const base = document.baseURI || location.href
  return new URL(`version.json?t=${Date.now()}`, base).toString()
}

async function checkOnce() {
  if (!import.meta.env.PROD) return
  try {
    const res = await fetch(versionUrl(), { cache: 'no-store' })
    if (!res.ok) return
    const remote = await res.json()

    const remoteSha = typeof remote.sha === 'string' ? remote.sha : ''
    const shaKnown = remoteSha && remoteSha !== 'unknown'
    const localShaKnown = COMMIT_SHA && COMMIT_SHA !== 'unknown'

    // 同一个提交就是同一份代码（资源文件名都是内容哈希），不需要提示重新加载
    if (shaKnown && localShaKnown && remoteSha === COMMIT_SHA) return

    const key = shaKnown ? remoteSha : `${remoteSha}@${remote.buildTime || ''}`
    const sameByBuildTime = !shaKnown && remote.buildTime === BUILD_TIME
    if (sameByBuildTime) return

    // 用户手动关掉后，同一个远端版本不再打扰
    if (sessionStorage.getItem(DISMISS_KEY) === key) return

    remoteKey.value = key
    remoteVersion.value = remote.version || remote.tag || ''
    visible.value = true
  } catch {
    // 拉不到 version.json（旧部署 / 网络问题）就当没有更新
  }
}

function refresh() {
  location.reload()
}

function dismiss() {
  if (remoteKey.value) {
    try {
      sessionStorage.setItem(DISMISS_KEY, remoteKey.value)
    } catch {
      /* 隐私模式下忽略 */
    }
  }
  visible.value = false
}

onMounted(() => {
  if (!import.meta.env.PROD) return
  checkOnce()
  timer = setInterval(checkOnce, POLL_MS)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// 当前版本，仅用于调试时在控制台核对
if (import.meta.env.DEV) {
  console.log('[Version]', VERSION, COMMIT_SHA, BUILD_TIME)
}
</script>

<style scoped>
.update-notice {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(24, 24, 27, 0.96);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.update-text strong {
  margin-left: 6px;
  font-weight: 600;
}

.update-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 6px;
  background: #fff;
  color: #18181b;
  font-size: 13px;
  cursor: pointer;
}

.update-btn:hover {
  background: #e4e4e7;
}

.update-close {
  border: none;
  background: transparent;
  color: #a1a1aa;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.update-close:hover {
  color: #fff;
}
</style>
