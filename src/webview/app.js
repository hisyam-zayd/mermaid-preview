/**
 * Mermaid Live Preview Client Application
 */

let panZoomInstance = null;
let currentCode = '';
let currentFile = 'untitled.mmd';
let renderCounter = 0;
let currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

// DOM Elements
const filenameEl = document.getElementById('filename');
const statusDotEl = document.getElementById('status-dot');
const statusTextEl = document.getElementById('status-text');
const svgWrapperEl = document.getElementById('svg-wrapper');
const errorBannerEl = document.getElementById('error-banner');
const errorTitleTextEl = document.getElementById('error-title-text');
const errorDescEl = document.getElementById('error-desc');
const toastEl = document.getElementById('toast');

// Initialize Mermaid
function initMermaid(theme) {
  if (typeof window.mermaid !== 'undefined') {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      flowchart: { htmlLabels: true, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
    });
  }
}

initMermaid(currentTheme);

// Toast Notification
function showToast(message, duration = 2000) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  setTimeout(() => {
    toastEl.classList.remove('visible');
  }, duration);
}

// Error Banner
function showError(errorObj) {
  if (!errorObj) return;
  const lineInfo = errorObj.line ? ` (Line ${errorObj.line})` : '';
  errorTitleTextEl.textContent = `Syntax Error${lineInfo}`;
  errorDescEl.textContent = errorObj.message || errorObj.fullMessage || 'Invalid diagram definition';
  errorBannerEl.classList.add('visible');
}

function clearError() {
  errorBannerEl.classList.remove('visible');
}

// Render Diagram with Viewport State Lock
async function renderDiagram(code, forceRefit = false) {
  if (!code || !code.trim()) {
    svgWrapperEl.innerHTML = '<div class="placeholder-msg">Empty diagram definition</div>';
    return;
  }

  // Preserve current pan/zoom coordinates if available
  let prevPan = null;
  let prevZoom = null;
  if (panZoomInstance && !forceRefit) {
    try {
      prevPan = panZoomInstance.getPan();
      prevZoom = panZoomInstance.getZoom();
    } catch {
      // ignore
    }
  }

  const renderId = 'mermaid-svg-' + ++renderCounter;

  try {
    const { svg } = await window.mermaid.render(renderId, code);
    svgWrapperEl.innerHTML = svg;
    clearError();

    const svgElement = svgWrapperEl.querySelector('svg');
    if (svgElement && typeof window.svgPanZoom !== 'undefined') {
      svgElement.style.width = '100%';
      svgElement.style.height = '100%';

      if (panZoomInstance) {
        panZoomInstance.destroy();
      }

      panZoomInstance = window.svgPanZoom(svgElement, {
        zoomEnabled: true,
        controlIconsEnabled: false,
        fit: false,
        center: false,
        minZoom: 0.05,
        maxZoom: 30,
        zoomScaleSensitivity: 0.25,
        dblClickZoomEnabled: false,
      });

      if (prevPan && prevZoom && !forceRefit) {
        panZoomInstance.zoom(prevZoom);
        panZoomInstance.pan(prevPan);
      } else {
        panZoomInstance.fit();
        panZoomInstance.center();
      }
    }
  } catch (renderErr) {
    showError({
      message: renderErr.message || 'Render failed',
      line: renderErr.hash?.line || null,
    });
    // Remove temporary error divs injected by mermaid if any
    const tempDiv = document.getElementById(renderId);
    if (tempDiv) tempDiv.remove();
  }
}

// Toolbar Handlers
document.getElementById('btn-fit').addEventListener('click', () => {
  if (panZoomInstance) {
    panZoomInstance.fit();
    panZoomInstance.center();
  }
});

document.getElementById('btn-center').addEventListener('click', () => {
  if (panZoomInstance) {
    panZoomInstance.center();
  }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (panZoomInstance) {
    panZoomInstance.resetZoom();
    panZoomInstance.center();
  }
});

document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if (panZoomInstance) {
    panZoomInstance.zoomIn();
  }
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if (panZoomInstance) {
    panZoomInstance.zoomOut();
  }
});

document.getElementById('btn-theme').addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  initMermaid(currentTheme);
  if (currentCode) {
    renderDiagram(currentCode, false);
  }
  showToast(`Switched to ${currentTheme} theme`);
});

document.getElementById('btn-export-svg').addEventListener('click', () => {
  const svgEl = svgWrapperEl.querySelector('svg');
  if (!svgEl) {
    showToast('No diagram to copy');
    return;
  }
  navigator.clipboard.writeText(svgEl.outerHTML).then(() => {
    showToast('SVG copied to clipboard! 📋');
  });
});

document.getElementById('btn-export-png').addEventListener('click', () => {
  const svgEl = svgWrapperEl.querySelector('svg');
  if (!svgEl) {
    showToast('No diagram to export');
    return;
  }

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    const scale = 2; // High-res 2x
    canvas.width = img.naturalWidth * scale || 1600;
    canvas.height = img.naturalHeight * scale || 1200;
    ctx.fillStyle = currentTheme === 'dark' ? '#18181b' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    const a = document.createElement('a');
    a.download = (currentFile ? currentFile.replace(/\.[^/.]+$/, '') : 'diagram') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
    showToast('Exported PNG! 💾');
  };

  img.src = url;
});

// WebSocket Connection Management
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);

  statusDotEl.className = 'status-dot';
  statusTextEl.textContent = 'Connecting...';

  socket.onopen = () => {
    statusDotEl.className = 'status-dot connected';
    statusTextEl.textContent = 'Live Connected';
    socket.send(JSON.stringify({ type: 'client_ready' }));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'init' || data.type === 'update') {
        currentFile = data.file || currentFile;
        filenameEl.textContent = currentFile;
        document.title = `${currentFile} - Mermaid Live Preview`;

        if (!data.valid && data.error) {
          showError(data.error);
        } else {
          clearError();
          const isInitial = !currentCode;
          currentCode = data.content;
          renderDiagram(currentCode, isInitial);
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  };

  socket.onclose = () => {
    statusDotEl.className = 'status-dot disconnected';
    statusTextEl.textContent = 'Disconnected';
    setTimeout(connectWebSocket, 1500);
  };

  socket.onerror = () => {
    statusDotEl.className = 'status-dot disconnected';
  };
}

connectWebSocket();
