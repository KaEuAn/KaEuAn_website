---
title: "Cognitive Bias"
layout: fullwidth
---

<iframe id="app-frame" src="/app-cognitive-bias/index.html" style="width: 100%; border: none; overflow: hidden; min-height: 100vh;" title="Cognitive Bias Detector" scrolling="no"></iframe>

<script>
  function resizeIframe() {
    const iframe = document.getElementById('app-frame');
    if (iframe && iframe.contentWindow && iframe.contentWindow.document.body) {
      iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 'px';
    }
  }

  const iframe = document.getElementById('app-frame');
  iframe.onload = function() {
    resizeIframe();
    // Optional: Observe changes inside the iframe to auto-resize dynamically
    const resizeObserver = new ResizeObserver(() => resizeIframe());
    resizeObserver.observe(iframe.contentWindow.document.body);

    // Sync Theme (Dark Mode)
    function syncTheme() {
      const isDark = document.documentElement.classList.contains('dark');
      const iframeHtml = iframe.contentWindow.document.documentElement;
      if (isDark) {
        iframeHtml.classList.add('dark');
      } else {
        iframeHtml.classList.remove('dark');
      }
    }

    // Initial sync
    syncTheme();

    // Observe parent theme changes
    const themeObserver = new MutationObserver(() => syncTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  };
</script>
