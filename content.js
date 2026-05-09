/**
 * ChatGPT Auto-Send - content.js
 *
 * Adds a small Auto button beside ChatGPT's send button while an upload is
 * blocking send. If armed, it keeps trying the real send button until it works.
 */

(() => {
  'use strict';

  const BUTTON_ID = 'chatgpt-autosend-btn';

  const CONFIG = {
    refreshMs: 100,
    pollMs: 180,
    verifyClickMs: 220,
    sendTimeoutMs: 30000,
    sentFlashMs: 1100,
    selectors: {
      input: [
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
        'textarea[placeholder]',
        'div[contenteditable="true"]',
      ],
      send: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send" i]',
      ],
      uploadSignal: [
        '[role="progressbar"]',
        'progress',
        '[aria-busy="true"]',
        '[aria-label*="uploading" i]',
        '[aria-label*="loading" i]',
        '[data-testid*="upload" i]',
        '[data-testid*="progress" i]',
        '[class*="progress" i]',
        '[class*="spinner" i]',
        '[class*="loading" i]',
        '[class*="animate-spin"]',
        'svg circle[stroke-dasharray]',
      ],
    },
    fileWords: [
      'file',
      'pdf',
      'doc',
      'docx',
      'txt',
      'csv',
      'xlsx',
      'ppt',
      'pptx',
      'html',
      'json',
      'zip',
      'png',
      'jpg',
      'jpeg',
      'webp',
    ],
  };

  const state = {
    armed: false,
    sending: false,
    refreshTimer: null,
    sendTimer: null,
    button: null,
  };

  function queryFirst(selectors, root = document) {
    for (const selector of selectors) {
      try {
        const match = root.querySelector(selector);
        if (match) return match;
      } catch (_) {
        // Ignore selectors unsupported by the current browser.
      }
    }
    return null;
  }

  function queryMany(selectors, root = document) {
    const matches = [];
    for (const selector of selectors) {
      try {
        matches.push(...root.querySelectorAll(selector));
      } catch (_) {
        // Ignore unsupported selectors.
      }
    }
    return [...new Set(matches)];
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isOurButton(element) {
    return element?.id === BUTTON_ID || element?.closest?.(`#${BUTTON_ID}`);
  }

  function getPromptInput() {
    return queryFirst(CONFIG.selectors.input);
  }

  function getPromptText() {
    const input = getPromptInput();
    if (!input) return '';
    if ('value' in input) return input.value.trim();
    return (input.textContent || '').trim();
  }

  function getComposer() {
    const input = getPromptInput();
    const inputComposer = input?.closest('form, [data-type="unified-composer"], main');
    if (inputComposer) return inputComposer;

    const sendButton = getSendButton();
    return sendButton?.closest('form, [data-type="unified-composer"], main') || document.body;
  }

  function buttonLooksLikeSend(button) {
    if (!button || isOurButton(button) || !isVisible(button)) return false;

    const label = `${button.getAttribute('aria-label') || ''} ${button.title || ''}`.toLowerCase();
    if (/\bsend\b/.test(label)) return true;
    if (button.dataset.testid === 'send-button') return true;

    const svgText = button.innerHTML.toLowerCase();
    return svgText.includes('viewbox') && (svgText.includes('arrow') || svgText.includes('path'));
  }

  function getSendButton() {
    const direct = queryMany(CONFIG.selectors.send).find(buttonLooksLikeSend);
    if (direct) return direct;

    const composer = getComposerFromInputOnly();
    const buttons = [...(composer || document).querySelectorAll('button')].filter(buttonLooksLikeSend);
    if (!buttons.length) return null;

    // The send button sits at the right side of the composer. Pick the visible
    // candidate farthest down and right, while excluding our own button.
    return buttons.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.bottom + br.right) - (ar.bottom + ar.right);
    })[0];
  }

  function getComposerFromInputOnly() {
    const input = getPromptInput();
    return input?.closest('form, [data-type="unified-composer"], main') || null;
  }

  function isSendEnabled() {
    const sendButton = getSendButton();
    if (!sendButton) return false;
    return !sendButton.disabled && sendButton.getAttribute('aria-disabled') !== 'true';
  }

  function isAttachControl(element) {
    return Boolean(element.closest?.(
      'button[aria-label*="attach" i], button[aria-label*="upload" i], label[for], input[type="file"]'
    ));
  }

  function elementHasFileText(element) {
    const text = (element.textContent || '').trim().toLowerCase();
    if (!text || text.length > 180) return false;

    if (/\b[\w()[\] -]+\.(pdf|docx?|txt|csv|xlsx?|pptx?|html?|json|zip|png|jpe?g|webp)\b/i.test(text)) {
      return true;
    }

    return CONFIG.fileWords.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));
  }

  function findAttachmentElements(composer) {
    if (!composer) return [];

    const candidates = [...composer.querySelectorAll('div, li, article, section, button, [data-testid], [aria-label]')];
    return candidates.filter((element) => {
      if (isOurButton(element) || isAttachControl(element)) return false;
      if (!isVisible(element)) return false;

      const rect = element.getBoundingClientRect();
      if (rect.width < 35 || rect.height < 24) return false;

      const hasFileIcon = Boolean(element.querySelector('svg, img, canvas, [role="img"]'));
      return hasFileIcon && elementHasFileText(element);
    });
  }

  function hasUploadSignal(composer) {
    if (!composer) return false;

    const signals = queryMany(CONFIG.selectors.uploadSignal, composer);
    const realSignal = signals.some((signal) => {
      if (isOurButton(signal) || isAttachControl(signal) || !isVisible(signal)) return false;

      const hostText = (signal.closest('div, li, section, article')?.textContent || '').toLowerCase();
      if (hostText.includes('upload') || hostText.includes('file') || hostText.includes('.')) return true;

      const rect = signal.getBoundingClientRect();
      return rect.width >= 12 && rect.width <= 60 && rect.height >= 12 && rect.height <= 60;
    });
    if (realSignal) return true;

    const text = (composer.textContent || '').toLowerCase();
    return /\b(uploading|processing|preparing|scanning|reading file)\b/.test(text);
  }

  function hasAttachment() {
    return findAttachmentElements(getComposer()).length > 0;
  }

  function shouldShowButton() {
    const composer = getComposer();
    return hasUploadSignal(composer) || (hasAttachment() && !isSendEnabled());
  }

  function setStatus(status) {
    if (!state.button) return;

    state.button.dataset.status = status;
    state.button.setAttribute('aria-pressed', state.armed ? 'true' : 'false');

    const label = state.button.querySelector('.as-label');
    if (!label) return;

    if (status === 'armed') label.textContent = 'Waiting';
    else if (status === 'sending') label.textContent = 'Sending';
    else if (status === 'sent') label.textContent = 'Sent';
    else label.textContent = 'Auto';
  }

  function buildButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.hidden = true;
    button.dataset.status = 'idle';
    button.setAttribute('aria-label', 'Auto send after file upload');
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Send automatically when the file is ready';
    button.innerHTML = '<span class="as-label">Auto</span>';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.armed ? disarm() : arm();
    });

    return button;
  }

  function ensureButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      state.button = existing;
      mountButton(existing);
      return existing;
    }

    const button = buildButton();
    state.button = button;
    mountButton(button);
    return button;
  }

  function mountButton(button) {
    const composer = getComposer();
    if (!composer || composer === document.body) return;

    composer.classList.add('chatgpt-autosend-composer');
    if (button.parentElement !== composer) {
      composer.appendChild(button);
    }
  }

  function showButton() {
    const button = ensureButton();
    if (button) button.hidden = false;
  }

  function hideButton() {
    if (!state.button || state.armed || state.sending) return;
    state.button.hidden = true;
    setStatus('idle');
  }

  function arm() {
    showButton();
    state.armed = true;
    state.sending = false;
    setStatus('armed');
    startSendPolling();
  }

  function disarm() {
    state.armed = false;
    state.sending = false;
    clearTimeout(state.sendTimer);
    state.sendTimer = null;
    setStatus('idle');
    refresh();
  }

  function trySendOnce() {
    const sendButton = getSendButton();
    if (!sendButton || !isSendEnabled()) return false;

    if (typeof PointerEvent === 'function') {
      sendButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    }
    sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    sendButton.click();
    sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    if (typeof PointerEvent === 'function') {
      sendButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    }
    return true;
  }

  function finishSent() {
    state.armed = false;
    state.sending = false;
    clearTimeout(state.sendTimer);
    state.sendTimer = null;
    setStatus('sent');

    setTimeout(() => {
      setStatus('idle');
      refresh();
    }, CONFIG.sentFlashMs);
  }

  function startSendPolling(deadline = Date.now() + CONFIG.sendTimeoutMs) {
    clearTimeout(state.sendTimer);

    if (!state.armed) return;

    if (isSendEnabled()) {
      state.sending = true;
      setStatus('sending');

      if (trySendOnce()) {
        state.sendTimer = setTimeout(() => {
          if (!isSendEnabled() || !hasAttachment()) {
            finishSent();
          } else {
            startSendPolling(deadline);
          }
        }, CONFIG.verifyClickMs);
        return;
      }
    } else if (state.sending) {
      setStatus('armed');
      state.sending = false;
    }

    if (Date.now() >= deadline) {
      disarm();
      return;
    }

    state.sendTimer = setTimeout(() => startSendPolling(deadline), CONFIG.pollMs);
  }

  function refresh() {
    ensureButton();

    if (shouldShowButton()) {
      showButton();
      if (state.armed) startSendPolling();
      return;
    }

    hideButton();
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(refresh, CONFIG.refreshMs);
  }

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-disabled', 'aria-busy', 'class', 'data-testid', 'disabled'],
  });

  document.addEventListener('input', scheduleRefresh, true);
  document.addEventListener('change', scheduleRefresh, true);
  document.addEventListener('click', scheduleRefresh, true);

  refresh();
  setTimeout(refresh, 500);
  setTimeout(refresh, 1500);
  setTimeout(refresh, 3000);
})();
