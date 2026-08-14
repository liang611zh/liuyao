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

// 断言比的是中文标准答案（「甲子日」而不是「甲子 Day」），这里把语言钉死，
// 免得测试结果取决于 detectLang() 的默认值怎么定。
// setupFiles 早于测试文件的 import 执行，所以这一行赶得上。
store.set('liuyao_lang', 'zh-CN')
