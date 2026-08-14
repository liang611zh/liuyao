// 排盘逻辑本身不碰浏览器 API，但 i18n / history / ai 会读写 localStorage。
// 在 node 环境下补一个最小实现，避免为了几个 getItem 拖进整个 jsdom。

const store = new Map<string, string>()

const localStorageStub: Storage = {
  get length() {
    return store.size
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageStub,
  writable: true,
  configurable: true,
})

// i18n 在模块加载时就会 detectLang()，而 node 的 navigator.language 是 en-US，
// 会让「甲子日」变成「甲子 Day」。断言比的是中文标准答案，这里先把语言钉死。
// setupFiles 早于测试文件的 import 执行，所以这一行赶得上。
store.set('liuyao_lang', 'zh-CN')
