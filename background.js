/**
 * ChatGPT Auto-Send - background.js
 *
 * The extension logic runs in content.js. This service worker only logs
 * install/update events for easier debugging.
 */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[AutoSend] Extension installed. Open chatgpt.com to use it.');
  }

  if (reason === 'update') {
    console.log('[AutoSend] Extension updated to version', chrome.runtime.getManifest().version);
  }
});
