/**
 * ChatGPT Auto-Send — popup.js
 * Minimal: just displays the current extension version in the footer.
 */
document.addEventListener('DOMContentLoaded', () => {
  const versionEl = document.getElementById('ext-version');
  if (versionEl) {
    const { version } = chrome.runtime.getManifest();
    versionEl.textContent = `v${version}`;
  }
});
