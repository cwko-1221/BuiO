// Pet Paradise already carries its own bilingual copy inside the bundle, keyed
// off the signed-in user's language. These are the few strings that live
// outside it: the boot shell that paints before the bundle runs, and the
// fallbacks used when a request fails before any locale is known.
BuiI18n.register({
  'pet.pageTitle':   { 'zh-HK': '寵物樂園 · Pet Paradise', 'en-US': 'Pet Paradise' },
  'pet.title':       { 'zh-HK': '寵物樂園', 'en-US': 'Pet Paradise' },
  'pet.booting':     { 'zh-HK': '正在準備你的小天地…', 'en-US': 'Getting your little world ready…' },
  'pet.description': { 'zh-HK': 'BuiO 寵物樂園：孵化、養成、佈置與探索。', 'en-US': 'BuiO Pet Paradise: hatch, raise, decorate and explore.' },
  'pet.badResponse': { 'zh-HK': '伺服器回應格式不正確。', 'en-US': 'The server sent something unexpected.' },
  'pet.actionFailed': { 'zh-HK': '操作失敗。', 'en-US': 'That did not work.' },
  'pet.fatalTitle':  { 'zh-HK': '寵物樂園暫時未能開啟', 'en-US': 'Pet Paradise could not open' },
  'pet.backHome':    { 'zh-HK': '返回平台首頁', 'en-US': 'Back to the platform' }
});
