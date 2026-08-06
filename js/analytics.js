// ============================================================
// 六爻排盘 - 匿名使用统计 (PostHog)
// ============================================================
//
// 隐私约定 —— 改动本文件前请先读完：
//   1. 绝不上报「占问之事」的文本内容，只上报是否填写（has_question 布尔值）
//   2. 绝不上报任何 API Key、端点 URL 或模型返回的正文
//   3. 关闭 autocapture 与 session recording，杜绝误采输入框内容
//   4. 尊重浏览器 Do Not Track，并提供 opt-out 开关
//
// POSTHOG_KEY / POSTHOG_HOST / POSTHOG_UI_HOST / ANALYTICS_HOSTS 定义在 js/config.js，
// 由构建脚本从服务器环境变量注入。未填 key 或域名不在白名单时，
// track() 全程是空操作，不发出任何网络请求 —— 本地开发和他人 fork 部署都不会产生数据。

const ANALYTICS_OPTOUT_KEY = 'liuyao_analytics_optout';

let analyticsReady = false;
let analyticsEnabled = false;
const pendingEvents = [];

// ============================================================
// opt-out
// ============================================================

function isAnalyticsOptedOut() {
  try {
    return localStorage.getItem(ANALYTICS_OPTOUT_KEY) === '1';
  } catch { return false; }
}

function setAnalyticsOptOut(optOut) {
  try {
    if (optOut) {
      localStorage.setItem(ANALYTICS_OPTOUT_KEY, '1');
      analyticsEnabled = false;
      pendingEvents.length = 0;
      if (window.posthog && analyticsReady) window.posthog.opt_out_capturing();
    } else {
      localStorage.removeItem(ANALYTICS_OPTOUT_KEY);
    }
  } catch { /* localStorage 不可用时忽略 */ }
}

function isDoNotTrack() {
  const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

// ============================================================
// 初始化
// ============================================================

function initAnalytics() {
  // ?noanalytics=1 → 永久退出统计
  try {
    if (new URLSearchParams(location.search).has('noanalytics')) {
      setAnalyticsOptOut(true);
    }
  } catch { /* 忽略 */ }

  if (!POSTHOG_KEY) return;
  if (!isHostAllowed(ANALYTICS_HOSTS)) return;
  if (isDoNotTrack()) return;
  if (isAnalyticsOptedOut()) return;

  analyticsEnabled = true;

  const script = document.createElement('script');
  script.src = `${POSTHOG_HOST}/static/array.js`;
  script.async = true;
  script.onload = () => {
    if (!window.posthog) return;
    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      // 排盘是单页应用，页面浏览量手动在 init 时报一次即可
      capture_pageview: true,
      capture_pageleave: true,
      // 关掉自动采集：#question-text 里是用户的隐私问题，绝不能被 autocapture 抓走
      autocapture: false,
      disable_session_recording: true,
      persistence: 'localStorage',
      person_profiles: 'always',
    });
    analyticsReady = true;
    for (const [name, props, opts] of pendingEvents) {
      window.posthog.capture(name, props, opts);
    }
    pendingEvents.length = 0;
  };
  script.onerror = () => {
    analyticsEnabled = false;
    pendingEvents.length = 0;
  };
  document.head.appendChild(script);
}

// ============================================================
// 上报
// ============================================================

// 全局埋点入口。统计未启用时为空操作，调用方无需判断。
// opts 透传给 posthog.capture，例如 { transport: 'sendBeacon' } 用于页面卸载前上报。
function track(name, props, opts) {
  if (!analyticsEnabled) return;
  const payload = { ...props, lang: typeof currentLang !== 'undefined' ? currentLang : undefined };
  if (analyticsReady && window.posthog) {
    window.posthog.capture(name, payload, opts);
  } else {
    // array.js 还没加载完，先攒着
    pendingEvents.push([name, payload, opts]);
  }
}

// 供日后接入用户系统时把匿名行为和账号打通（Supabase 登录后调用）
function identifyUser(userId, props) {
  if (!analyticsEnabled || !analyticsReady || !window.posthog) return;
  window.posthog.identify(userId, props);
}

function resetAnalyticsIdentity() {
  if (!analyticsEnabled || !analyticsReady || !window.posthog) return;
  window.posthog.reset();
}

// 供页面上的「不参与统计」开关调用
window.liuyaoAnalytics = {
  optOut: () => setAnalyticsOptOut(true),
  optIn: () => setAnalyticsOptOut(false),
  isOptedOut: isAnalyticsOptedOut,
  isEnabled: () => analyticsEnabled,
};
