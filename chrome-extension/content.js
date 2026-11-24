// Injected on demand by popup.js via chrome.scripting.executeScript (no always-on content script needed).
// Returns lightweight page info; the last expression is the script result.
(() => {
  const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content || null;
  return {
    title: meta('og:title') || document.title || '',
    thumbnail: meta('og:image'),
    hasVideoElement: !!document.querySelector('video'),
  };
})();
