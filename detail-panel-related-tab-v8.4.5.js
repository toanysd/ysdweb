/**
 * detail-panel-related-tab-v8.4.5.js
 * Detail Panel Related Tab Module - Windows-style Detail default + bilingual headers + built-in photo viewer
 * MoldCutterSearch
 *
 * Update v8.4.5:
 * - Mặc định hiển thị dạng Chi tiết (detail).
 * - Header bảng dạng song ngữ: Nhật (trên) / Việt (dưới).
 * - Kích thước thumbnail trong bảng chi tiết theo Tab Ảnh (44x44).
 * - Click vào thumbnail: mở ảnh lớn ngay trong giao diện (popup viewer, fit khung).
 * - Click vào ảnh trong viewer: toggle zoom kích thước thật (scroll như Photo Viewer Windows).
 * - Fix lỗi lặp tiêu đề (toolbar chỉ render 1 lần).
 *
 * Host (DetailPanel) cung cấp:
 * - dp.currentItem, dp.currentItemType
 * - dp.getRelatedCuttersForMold(mold), dp.getSharedMoldsForCutter(cutter)
 * - dp.openPreview(item, itemType) (có sẵn trong detail-panel-v8.4.2.js)
 *
 * Depends (optional):
 * - window.DevicePhotoStore.getThumbnailForDevice(deviceType, deviceId)
 * - window.DevicePhotoStore.getLatestActivePhotoForDevice(deviceType, deviceId)
 * - window.DataManager.data (statuslogs, racklayers, racks)
 */

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5';

  // -------------------- basic helpers --------------------
  function safeStr(v) {
    return (v === null || v === undefined) ? '' : String(v);
  }

  function trimStr(v) {
    return safeStr(v).trim();
  }

  function escHtml(str) {
    return safeStr(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toLower(v) {
    return safeStr(v).toLowerCase();
  }

  function fmtDateYMD(val) {
    try {
      if (!val) return '-';
      var d = new Date(val);
      if (isNaN(d.getTime())) return safeStr(val);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return y + '.' + m + '.' + dd;
    } catch (e) {
      return safeStr(val) || '-';
    }
  }

  function getCurrentItemType(dp) {
    try {
      return dp && dp.currentItemType ? String(dp.currentItemType).toLowerCase() : 'mold';
    } catch (e) {
      return 'mold';
    }
  }

  function getCurrentItem(dp) {
    try {
      return dp && dp.currentItem ? dp.currentItem : null;
    } catch (e) {
      return null;
    }
  }

  // -------------------- per-record view state --------------------
  function recordKey(dp) {
    try {
      var t = getCurrentItemType(dp);
      var it = getCurrentItem(dp);
      if (!it) return t + ':none';
      var id = (t === 'cutter')
        ? trimStr(it.CutterID || it.ID || it.CutterNo || it.CutterCode)
        : trimStr(it.MoldID || it.ID || it.MoldCode || it.MoldNo);
      return t + ':' + safeStr(id);
    } catch (e) {
      return 'mold:none';
    }
  }

  function ensureStateForRecord(dp) {
    if (!dp) return;
    var key = recordKey(dp);
    if (dp.dprLastRecordKey !== key) {
      dp.dprLastRecordKey = key;
      dp.dprViewKey = key;
      // yêu cầu: mặc định dạng chi tiết
      dp.dprView = 'detail';
      dp.dprCache = null;
    }
  }

  function getView(dp) {
    if (!dp) return 'detail';
    if (dp.dprViewKey !== recordKey(dp)) return 'detail';
    return (dp.dprView === 'grid') ? 'grid' : 'detail';
  }

  function setView(dp, v) {
    if (!dp) return;
    dp.dprViewKey = recordKey(dp);
    dp.dprView = (v === 'grid') ? 'grid' : 'detail';
  }

  // -------------------- data mapping helpers --------------------
  function getList(dp, item, itemType) {
    try {
      if (!dp || !item) return [];
      var t = String(itemType || '').toLowerCase();
      if (t === 'mold') {
        if (typeof dp.getRelatedCuttersForMold === 'function') return dp.getRelatedCuttersForMold(item) || [];
        if (Array.isArray(item.relatedCutters)) return item.relatedCutters;
        return [];
      }
      // cutter => shared molds
      if (typeof dp.getSharedMoldsForCutter === 'function') return dp.getSharedMoldsForCutter(item) || [];
      if (Array.isArray(item.relatedMolds)) return item.relatedMolds;
      return [];
    } catch (e) {
      return [];
    }
  }

  function getRowItemType(itemType) {
    return (String(itemType).toLowerCase() === 'mold') ? 'cutter' : 'mold';
  }

  function getTitle(itemType) {
    return (String(itemType).toLowerCase() === 'mold') ? 'Dao cắt liên quan' : 'Khuôn liên quan';
  }

  function getRowId(row, rowType) {
    try {
      var t = String(rowType).toLowerCase();
      if (t === 'cutter') return trimStr(row && (row.CutterID || row.ID || row.CutterNo || row.CutterCode));
      return trimStr(row && (row.MoldID || row.ID || row.MoldCode || row.MoldNo));
    } catch (e) {
      return '';
    }
  }

  function getRowCode(row, rowType) {
    try {
      var t = String(rowType).toLowerCase();
      if (t === 'cutter') return trimStr(row && (row.CutterNo || row.CutterCode || row.code || row.Code || row.CutterID || row.ID));
      return trimStr(row && (row.MoldCode || row.MoldNo || row.code || row.Code || row.MoldID || row.ID));
    } catch (e) {
      return '';
    }
  }

  function getRowName(row, rowType) {
    try {
      var t = String(rowType).toLowerCase();
      if (t === 'cutter') return trimStr(row && (row.CutterName || row.CutterDesignName || row.Name || row.DisplayName || row.ProductName));
      return trimStr(row && (row.MoldName || row.MoldDesignName || row.Name || row.DisplayName || row.ProductName));
    } catch (e) {
      return '';
    }
  }

  function getRowDimensions(row) {
    try {
      if (!row) return '-';
      var s = trimStr(row.dimensions || row.displaySize || row.Size || row.Dimensions);
      if (s) return s;

      var l = trimStr(row.DimensionsLength || row.DimLength || row.Length || row.L || row.dimension_l || row.dimensionL);
      var w = trimStr(row.DimensionsWidth || row.DimWidth || row.Width || row.W || row.dimension_w || row.dimensionW);
      var h = trimStr(row.DimensionsDepth || row.DimDepth || row.Height || row.H || row.Depth || row.D || row.dimension_h || row.dimensionH);

      var parts = [l, w, h].filter(function (x) { return !!trimStr(x); });
      if (parts.length >= 2) return parts.join('x');

      s = trimStr(row.Dim || row.Dimension || row.DimText || row.MoldSize || row.CutterSize);
      return s || '-';
    } catch (e) {
      return '-';
    }
  }

  // Chuyển số Giá thành ký tự tròn kiểu ㊿
  function toCircledNumber(n) {
    var num = Number(n);
    if (!Number.isFinite(num)) return null;
    var i = Math.floor(num);

    // Unicode ⓵ (0x245F + 1) đến ⓶⓪ (0x245F + 20)
    if (i >= 1 && i <= 20) {
      return String.fromCharCode(0x245F + i);
    }
    // Ngoài khoảng 1–20 thì trả về số thường
    return String(i);
  }

  function getRackLocation(row) {
    try {
      if (!global.DataManager || !global.DataManager.data) {
        return { display: '-', rackId: null, layerNum: null, rackLayerId: null, rackLayerText: '-' };
      }

      var rackLayerId = row ? row.RackLayerID : null;
      if (!rackLayerId) {
        return { display: '-', rackId: null, layerNum: null, rackLayerId: null, rackLayerText: '-' };
      }

      var rl = global.DataManager.data.racklayers && global.DataManager.data.racklayers.find(function (x) {
        return String(x.RackLayerID).trim() === String(rackLayerId).trim();
      });
      if (!rl) {
        return { display: '-', rackId: null, layerNum: null, rackLayerId: rackLayerId, rackLayerText: '-' };
      }

      var rackId = rl.RackID;
      var layerNum = rl.RackLayerNumber;

      var rack = global.DataManager.data.racks && global.DataManager.data.racks.find(function (r) {
        return String(r.RackID).trim() === String(rackId).trim();
      });

      // Giá (số kệ) dùng cho badge ㊿-1
      var rackNum = rack && (rack.RackNumber || rack.RackSymbol || rack.RackID || rackId);

      // Vị trí giá: ưu tiên RackLocation, sau đó RackName / RackCode
      var rackName =
        rack && (rack.RackLocation || rack.RackName || rack.RackCode || rackNum);

      var rackLocationText =
        (rackName ? String(rackName) : String(rackId)) + '-' + String(layerNum);

      // Giá - tầng hiển thị dạng ㊿-1
      var circle = toCircledNumber(rackNum);
      var rackLayerText =
        (circle || String(rackNum || '-')) +
        (layerNum != null ? '-' + String(layerNum) : '');

      return {
        display: rackLocationText,
        rackId: rackId,
        layerNum: layerNum,
        rackLayerId: rackLayerId,
        rackLayerText: rackLayerText
      };
    } catch (e) {
      return { display: '-', rackId: null, layerNum: null, rackLayerId: null, rackLayerText: '-' };
    }
  }

  function getLatestStatus(row, rowType) {
    try {
      if (!global.DataManager || !global.DataManager.data || !Array.isArray(global.DataManager.data.statuslogs)) {
        return { status: null, date: null };
      }
      var id = getRowId(row, rowType);
      if (!id) return { status: null, date: null };

      var idField = (String(rowType).toLowerCase() === 'mold') ? 'MoldID' : 'CutterID';

      var logs = global.DataManager.data.statuslogs.filter(function (log) {
        try {
          return String(log[idField]).trim() === String(id).trim();
        } catch (e) {
          return false;
        }
      });
      if (!logs.length) return { status: null, date: null };

      logs.sort(function (a, b) {
        var ta = Date.parse(a.Timestamp || a.Date || 0) || 0;
        var tb = Date.parse(b.Timestamp || b.Date || 0) || 0;
        return tb - ta;
      });

      var latest = logs[0];
      return { status: latest ? (latest.Status || latest.Action || null) : null, date: latest ? (latest.Timestamp || latest.Date || null) : null };
    } catch (e) {
      return { status: null, date: null };
    }
  }

  function getStatusLabel(status) {
    if (!status) return '-';
    var s = String(status).toUpperCase();
    var labels = {
      'IN': 'IN',
      'OUT': 'OUT',
      'AUDIT': 'AUDIT',
      'DISPOSED': 'DISPOSED',
      'RETURNED': 'RETURNED'
    };
    return labels[s] || String(status);
  }

  function getStatusClass(status) {
    var s = toLower(status);
    if (!s) return 'dpr-status-unknown';
    if (s.indexOf('in') === 0) return 'dpr-status-in';
    if (s.indexOf('out') === 0) return 'dpr-status-out';
    if (s.indexOf('audit') === 0) return 'dpr-status-audit';
    if (s.indexOf('dispose') === 0) return 'dpr-status-danger';
    if (s.indexOf('return') === 0) return 'dpr-status-return';
    return 'dpr-status-unknown';
  }

  // -------------------- thumbnail hydrate (DevicePhotoStore) --------------------
  var thumbUrlCache = new Map();
  var thumbPromiseCache = new Map();
  var hydrateTimer = null;

  function scheduleHydrate(scopeEl) {
    if (!scopeEl) return;
    if (hydrateTimer) clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(function () {
      hydrateTimer = null;
      hydrateThumbnails(scopeEl);
    }, 80);
  }

  async function hydrateThumbnails(scopeEl) {
    try {
      if (!scopeEl || !scopeEl.isConnected) return;
      if (!global.DevicePhotoStore || typeof global.DevicePhotoStore.getThumbnailForDevice !== 'function') return;

      var imgs = scopeEl.querySelectorAll('img.dpr-thumb-img[data-devicetype][data-deviceid]');
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || !img.isConnected) continue;
        if (img.dataset.dprHydrated === '1') continue;

        var dt = trimStr(img.dataset.devicetype);
        var did = trimStr(img.dataset.deviceid);
        if (!dt || !did) continue;

        var key = dt + ':' + did;

        if (thumbUrlCache.has(key)) {
          applyThumb(img, thumbUrlCache.get(key));
          continue;
        }

        if (thumbPromiseCache.has(key)) {
          try {
            var u0 = await thumbPromiseCache.get(key);
            applyThumb(img, u0);
          } catch (e0) {
            applyThumb(img, '');
          }
          continue;
        }

        var p = (async function () {
          try {
            var row = await global.DevicePhotoStore.getThumbnailForDevice(dt, did);
            var url = row ? String(row.thumbnailurl || row.thumbnailUrl || row.thumbnailpublicurl || row.thumbpublicurl || row.publicurl || row.publicUrl || '').trim() : '';
            thumbUrlCache.set(key, url);
            return url;
          } catch (e) {
            thumbUrlCache.set(key, '');
            return '';
          } finally {
            thumbPromiseCache.delete(key);
          }
        })();

        thumbPromiseCache.set(key, p);
        var u = await p;
        applyThumb(img, u);
      }
    } catch (e) {
      // silent
    }
  }

  function applyThumb(img, url) {
    try {
      if (!img || !img.isConnected) return;
      var wrap = img.closest('.dpr-thumb-wrap');
      var ph = wrap ? wrap.querySelector('.dpr-thumb-ph') : null;

      img.dataset.dprHydrated = '1';

      if (!url) {
        img.style.display = 'none';
        try { img.removeAttribute('src'); } catch (e0) {}
        if (ph) ph.style.display = 'flex';
        return;
      }

      img.onerror = function () {
        try { img.style.display = 'none'; } catch (e1) {}
        if (ph) ph.style.display = 'flex';
      };

      img.onload = function () {
        try { img.style.display = 'block'; } catch (e2) {}
        if (ph) ph.style.display = 'none';
      };

      if (img.getAttribute('src') !== url) img.src = url;
    } catch (e) {
      // silent
    }
  }

  // -------------------- built-in photo viewer --------------------
  var viewer = {
    mounted: false,
    open: false,
    zoom: false,
    lastFocus: null
  };

  function viewerEnsure() {
    try {
      if (viewer.mounted) return;

      var div = document.createElement('div');
      div.innerHTML = (
        '<div class="dpr-viewer dpr-hidden" id="dprViewer" role="dialog" aria-modal="true">' +
          '<div class="dpr-vw-backdrop" data-dpr-vw-action="close"></div>' +
          '<div class="dpr-vw-panel" role="document">' +
            '<div class="dpr-vw-header">' +
              '<div class="dpr-vw-title">' +
                '<div class="dpr-vw-name" id="dprVwName">Ảnh</div>' +
                '<div class="dpr-vw-meta" id="dprVwMeta">Click ảnh để zoom kích thước thật</div>' +
              '</div>' +
              '<div class="dpr-vw-actions">' +
                '<button type="button" class="dpr-vw-btn" id="dprVwZoomBtn" data-dpr-vw-action="toggle-zoom" title="Zoom"><i class="fas fa-search-plus"></i></button>' +
                '<button type="button" class="dpr-vw-btn dpr-vw-close" data-dpr-vw-action="close" title="Đóng"><i class="fas fa-times"></i></button>' +
              '</div>' +
            '</div>' +
            '<div class="dpr-vw-body" id="dprVwBody">' +
              '<div class="dpr-vw-stage" id="dprVwStage">' +
                '<img class="dpr-vw-img" id="dprVwImg" alt="image" />' +
                '<div class="dpr-vw-loading dpr-hidden" id="dprVwLoading"><i class="fas fa-spinner fa-spin"></i><span>Đang tải...</span></div>' +
                '<div class="dpr-vw-error dpr-hidden" id="dprVwError"><i class="fas fa-exclamation-circle"></i><span>Không tải được ảnh</span></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      while (div.firstChild) document.body.appendChild(div.firstChild);

      var root = document.getElementById('dprViewer');
      var img = document.getElementById('dprVwImg');
      var zoomBtn = document.getElementById('dprVwZoomBtn');

      function close() {
        viewerClose();
      }

      root.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-dpr-vw-action]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-dpr-vw-action');
        if (act === 'close') {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
        if (act === 'toggle-zoom') {
          e.preventDefault();
          e.stopPropagation();
          viewerToggleZoom();
          return;
        }
      });

      // click on image => toggle zoom
      img.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        viewerToggleZoom();
      });

      document.addEventListener('keydown', function (e) {
        try {
          if (!viewer.open) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            viewerClose();
            return;
          }
          if (e.key === 'Enter') {
            // Enter => toggle zoom (như double action)
            viewerToggleZoom();
            return;
          }
        } catch (err) {}
      });

      // prevent background scroll when open
      viewer.mounted = true;

      // ensure button reflect state
      function syncZoomBtn() {
        var icon = zoomBtn ? zoomBtn.querySelector('i') : null;
        if (!icon) return;
        icon.className = viewer.zoom ? 'fas fa-search-minus' : 'fas fa-search-plus';
      }
      viewer._syncZoomBtn = syncZoomBtn;

    } catch (e) {
      // silent
    }
  }

  function viewerSetLoading(isLoading, isError) {
    try {
      var ld = document.getElementById('dprVwLoading');
      var er = document.getElementById('dprVwError');
      if (ld) ld.classList.toggle('dpr-hidden', !isLoading);
      if (er) er.classList.toggle('dpr-hidden', !isError);
    } catch (e) {}
  }

  function viewerSetText(name, meta) {
    try {
      var n = document.getElementById('dprVwName');
      var m = document.getElementById('dprVwMeta');
      if (n) n.textContent = name || 'Ảnh';
      if (m) m.textContent = meta || 'Click ảnh để zoom kích thước thật';
    } catch (e) {}
  }

  function viewerSetZoom(zoomOn) {
    try {
      viewer.zoom = !!zoomOn;
      var root = document.getElementById('dprViewer');
      if (root) root.classList.toggle('dpr-vw-zoom', viewer.zoom);
      if (viewer._syncZoomBtn) viewer._syncZoomBtn();

      // hint text
      viewerSetText(
        document.getElementById('dprVwName') ? document.getElementById('dprVwName').textContent : 'Ảnh',
        viewer.zoom ? 'Đang zoom 1:1 (kéo/scroll để xem) - Click ảnh để thu nhỏ' : 'Fit khung - Click ảnh để zoom kích thước thật'
      );
    } catch (e) {}
  }

  function viewerToggleZoom() {
    viewerSetZoom(!viewer.zoom);
  }

  function viewerOpen(opts) {
    try {
      viewerEnsure();

      var root = document.getElementById('dprViewer');
      var img = document.getElementById('dprVwImg');
      if (!root || !img) return;

      viewer.lastFocus = document.activeElement;

      viewer.open = true;
      viewerSetZoom(false);

      root.classList.remove('dpr-hidden');
      requestAnimationFrame(function () {
        try { root.classList.add('dpr-show'); } catch (e0) {}
      });

      // text
      viewerSetText(opts && opts.title ? opts.title : 'Ảnh', 'Fit khung - Click ảnh để zoom kích thước thật');

      // load
      viewerSetLoading(true, false);
      img.style.opacity = '0';

      img.onload = function () {
        try { img.style.opacity = '1'; } catch (e1) {}
        viewerSetLoading(false, false);
      };
      img.onerror = function () {
        viewerSetLoading(false, true);
      };

      var url = opts && opts.url ? String(opts.url).trim() : '';
      if (!url) {
        viewerSetLoading(false, true);
        try { img.removeAttribute('src'); } catch (e2) {}
      } else {
        img.src = url;
      }

      // lock background scroll
      try { document.body.classList.add('dpr-vw-lock'); } catch (e3) {}

    } catch (e) {
      // silent
    }
  }

  function viewerClose() {
    try {
      var root = document.getElementById('dprViewer');
      if (!root) return;
      viewer.open = false;
      viewerSetZoom(false);
      root.classList.remove('dpr-show');
      setTimeout(function () {
        try { root.classList.add('dpr-hidden'); } catch (e0) {}
      }, 160);
      try { document.body.classList.remove('dpr-vw-lock'); } catch (e1) {}
      try {
        if (viewer.lastFocus && typeof viewer.lastFocus.focus === 'function') viewer.lastFocus.focus();
      } catch (e2) {}
    } catch (e) {}
  }

  async function getFullImageUrlForDevice(deviceType, deviceId) {
    try {
      if (!global.DevicePhotoStore) return '';
      var dt = String(deviceType || '').toLowerCase();
      var did = String(deviceId || '').trim();
      if (!dt || !did) return '';

      // try thumbnail API first (nhiều hệ thống trả kèm row có public url)
      if (typeof global.DevicePhotoStore.getThumbnailForDevice === 'function') {
        try {
          var row = await global.DevicePhotoStore.getThumbnailForDevice(dt, did);
          var full = row ? String(row.publicurl || row.publicUrl || '').trim() : '';
          if (full) return full;
        } catch (e0) {}
      }

      // fallback: latest active
      if (typeof global.DevicePhotoStore.getLatestActivePhotoForDevice === 'function') {
        try {
          var row2 = await global.DevicePhotoStore.getLatestActivePhotoForDevice(dt, did);
          var full2 = row2 ? String(row2.publicurl || row2.publicUrl || '').trim() : '';
          if (full2) return full2;
        } catch (e1) {}
      }

      return '';
    } catch (e) {
      return '';
    }
  }

  // -------------------- UI styles --------------------
  function injectStyles() {
    try {
      var styleId = 'dpr-styles-v845';
      if (document.getElementById(styleId)) return;
      var st = document.createElement('style');
      st.id = styleId;
      st.type = 'text/css';
      st.textContent = [
        '/* Related tab v8.4.5 */',
        '.dpr-section{padding:0 !important;border:none !important;}',
        '.dpr-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 10px;background:var(--bg-sidebar,#f8fafc);border-radius:10px 10px 0 0;border-bottom:1px solid var(--border-color,#e5e9f2);}',
        '.dpr-toolbar-title{display:flex;align-items:center;gap:7px;font-weight:800;font-size:13px;color:var(--text-primary,#0b1220);}',
        '.dpr-count{background:rgba(15,118,110,0.10);border:1px solid rgba(15,118,110,0.20);color:rgba(15,118,110,0.95);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:900;}',
        '.dpr-toolbar-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
        '.dpr-view-switcher{display:flex;gap:2px;border-left:1px solid var(--border-color,#e5e9f2);padding-left:6px;}',
        '.dpr-view-btn{width:28px;height:28px;border:1px solid var(--border-color,#e5e9f2);background:transparent;color:var(--text-secondary,#1f2937);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:background .15s,color .15s,border-color .15s;}',
        '.dpr-view-btn:hover,.dpr-view-btn.dpr-view-active{background:var(--ui-accent,#0F766E);border-color:var(--ui-accent,#0F766E);color:#fff;}',
        '[data-dp-related-host]{transition:opacity .12s ease;}',
        '.dpr-host-fading{opacity:.25;}',
        '@media (prefers-reduced-motion: reduce){[data-dp-related-host]{transition:none;}}',
        '',
        '/* Bilingual header (JA above / VI below) */',
        '.dpr-th-label{display:flex;flex-direction:column;gap:2px;min-width:0;}',
        '.dpr-ja{font-size:10px;font-weight:750;line-height:1.05;color:rgba(17,24,39,0.92);}',
        '.dpr-vi{font-size:9px;font-weight:600;line-height:1.05;color:rgba(71,85,105,0.82);}',
        '',
        '/* GRID */',
        '.dpr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px;padding:10px;}',
        '.dpr-card{border:1px solid var(--border-color,#e5e9f2);border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.05);cursor:pointer;transition:box-shadow .15s, transform .15s, border-color .15s;user-select:none;}',
        '.dpr-card:hover{border-color:rgba(15,118,110,0.35);box-shadow:0 6px 18px rgba(0,0,0,.10);transform:translateY(-1px);}',
        '.dpr-thumb-wrap{background:var(--bg-sidebar,#f8fafc);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;}',
        '.dpr-thumb-wrap-card{height:124px;}',
        '.dpr-thumb-img{width:100%;height:100%;object-fit:contain;display:none;background:transparent;cursor:pointer;}',
        '.dpr-thumb-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:28px;}',
        '.dpr-card-body{padding:8px 10px 10px;}',
        '.dpr-code{font-size:12px;font-weight:900;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;}',
        '.dpr-name{font-size:11px;font-weight:700;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;}',
        '.dpr-meta{display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:#475569;}',
        '.dpr-meta-row{display:flex;align-items:center;gap:6px;min-width:0;}',
        '.dpr-meta-row i{width:14px;text-align:center;color:#64748b;flex:0 0 auto;}',
        '.dpr-meta-row span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.dpr-status-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900;border:1px solid rgba(2,6,23,0.10);background:rgba(2,6,23,0.04);color:#334155;}',
        '.dpr-status-in{background:rgba(16,185,129,0.10);border-color:rgba(16,185,129,0.22);color:#047857;}',
        '.dpr-status-out{background:rgba(239,68,68,0.10);border-color:rgba(239,68,68,0.22);color:#b91c1c;}',
        '.dpr-status-audit{background:rgba(59,130,246,0.10);border-color:rgba(59,130,246,0.22);color:#1d4ed8;}',
        '.dpr-status-return{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.22);color:#b45309;}',
        '.dpr-status-danger{background:rgba(220,38,38,0.12);border-color:rgba(220,38,38,0.24);color:#991b1b;}',
        '.dpr-status-unknown{background:rgba(100,116,139,0.10);border-color:rgba(100,116,139,0.22);color:#475569;}',
        '',
        '/* DETAIL (Windows Explorer list) */',
        '.dpr-detail{padding:8px 10px 10px;}',
        '.dpr-detail-table{width:100%;border-collapse:collapse;font-size:12px;}',
        '.dpr-detail-table thead th{position:sticky;top:0;background:var(--bg-sidebar,#f8fafc);border-bottom:2px solid var(--border-color,#e5e9f2);padding:7px 10px;text-align:left;font-weight:900;color:#334155;white-space:nowrap;z-index:2;}',
        '.dpr-detail-table tbody tr{border-bottom:1px solid var(--border-color,#e5e9f2);cursor:pointer;transition:background .15s;}',
        '.dpr-detail-table tbody tr:hover{background:rgba(15,118,110,0.05);}',
        '.dpr-detail-table td{padding:6px 10px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;}',
        '.dpr-td-thumb{width:52px;padding:4px 6px !important;}',
        '/* thumb size học theo Tab Ảnh: 44x44 */',
        '.dpr-td-thumb .dpr-thumb-wrap{width:44px;height:44px;border:1px solid var(--border-color,#e5e9f2);border-radius:8px;}',
        '.dpr-td-thumb .dpr-thumb-ph{font-size:18px;}',
        '.dpr-td-thumb .dpr-thumb-img{object-fit:contain;}',
        '.dpr-td-code{font-weight:900;}',
        '.dpr-td-name{font-weight:700;color:#334155;max-width:420px;}',
        '.dpr-td-dim{color:#0f766e;font-weight:800;}',
        '.dpr-td-loc{color:#2563eb;font-weight:800;}',
        '',
        '/* Mobile: ưu tiên cột quan trọng */',
        '@media (max-width: 768px){',
        '  .dpr-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));}',
        '  .dpr-detail-table thead th.dpr-col-dim, .dpr-detail-table td.dpr-col-dim{display:none;}',
        '  .dpr-detail-table thead th.dpr-col-name, .dpr-detail-table td.dpr-col-name{display:none;}',
        '  .dpr-detail-table td{max-width:180px;}',
        '}',
        '',
        '/* Viewer */',
        '.dpr-vw-lock{overflow:hidden !important;}',
        '.dpr-viewer{position:fixed;inset:0;z-index:10450;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:opacity .18s ease, visibility .18s ease;}',
        '.dpr-viewer.dpr-show{opacity:1;visibility:visible;}',
        '.dpr-hidden{display:none !important;}',
        '.dpr-vw-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.70);backdrop-filter:blur(2px);}',
        '.dpr-vw-panel{position:relative;width:min(1100px, calc(100vw - 36px));height:min(760px, calc(100vh - 36px));background:rgba(255,255,255,0.98);border-radius:16px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,0.35);display:flex;flex-direction:column;border:1px solid rgba(2,6,23,0.12);}',
        '.dpr-vw-header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(248,250,252,0.95);border-bottom:1px solid rgba(2,6,23,0.10);flex:0 0 auto;}',
        '.dpr-vw-title{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}',
        '.dpr-vw-name{font-size:13px;font-weight:950;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.dpr-vw-meta{font-size:11px;font-weight:700;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.dpr-vw-actions{display:flex;align-items:center;gap:6px;}',
        '.dpr-vw-btn{width:36px;height:36px;border-radius:10px;border:1px solid rgba(2,6,23,0.12);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#0f766e;transition:transform .15s, box-shadow .15s, background .15s;}',
        '.dpr-vw-btn:hover{transform:translateY(-1px);box-shadow:0 12px 20px rgba(2,6,23,0.14);background:rgba(15,118,110,0.06);}',
        '.dpr-vw-btn.dpr-vw-close{color:#b91c1c;border-color:rgba(185,28,28,0.18);}',
        '.dpr-vw-btn.dpr-vw-close:hover{background:rgba(220,38,38,0.08);}',
        '.dpr-vw-body{flex:1;position:relative;}',
        '.dpr-vw-stage{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg, rgba(15,23,42,0.06), rgba(15,23,42,0.02));}',
        '.dpr-vw-img{max-width:92%;max-height:92%;object-fit:contain;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.18);cursor:zoom-in;transition:opacity .15s;}',
        '.dpr-vw-loading,.dpr-vw-error{position:absolute;inset:auto 14px 14px 14px;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:800;}',
        '.dpr-vw-loading{background:rgba(2,6,23,0.62);color:#fff;}',
        '.dpr-vw-error{background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.28);color:#991b1b;}',
        '/* Zoom 1:1: ảnh đúng kích thước thật trong vùng scroll */',
        '.dpr-viewer.dpr-vw-zoom .dpr-vw-stage{overflow:auto;align-items:flex-start;justify-content:flex-start;padding:12px;}',
        '.dpr-viewer.dpr-vw-zoom .dpr-vw-img{max-width:none;max-height:none;object-fit:unset;border-radius:10px;cursor:zoom-out;}',
      ].join('\n');
      // Bổ sung style cho cột Tên (link), Giá - tầng và theme theo loại thiết bị
      st.textContent += '\n/* Name column as hyperlink-style to open preview */\n' +
        '.dpr-detail-table .dpr-td-name {' +
          'color: var(--ui-link, #2563eb);' +
          'text-decoration: underline;' +
          'cursor: pointer;' +
          'font-weight: 800;' +
        '}\n' +
        '.dpr-detail-table .dpr-td-name:hover {' +
          'color: var(--ui-link-hover, #1d4ed8);' +
        '}\n' +

        '/* Giá - tầng badge: ㊿-1 */\n' +
        '.dpr-detail-table .dpr-td-rack {' +
          'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;' +
          'font-weight: 900;' +
          'color: #1d4ed8;' +
        '}\n' +
        '.dpr-rack-badge {' +
          'display: inline-flex;' +
          'align-items: center;' +
          'justify-content: center;' +
          'min-width: 44px;' +
          'height: 22px;' +
          'padding: 0 10px;' +
          'border-radius: 999px;' +
          'border: 1px solid rgba(37, 99, 235, 0.35);'+
          'background: rgba(59, 130, 246, 0.10);' +
          'font-size: 11px;' +
          'font-weight: 900;' +
          'color: #1d4ed8;' +
          'box-sizing: border-box;' +
        '}\n' +

        '/* Đổi màu header theo loại thiết bị liên quan */\n' +
        '[data-dpr-rowtype=\"mold\"] .dpr-toolbar {' +
          'background: linear-gradient(135deg, rgba(8,145,178,0.12), rgba(8,145,178,0.02));' +
          'border-bottom-color: rgba(8,145,178,0.35);' +
        '}\n' +
        '[data-dpr-rowtype=\"mold\"] .dpr-toolbar-title i {' +
          'color: #0e7490;' +
        '}\n' +
        '[data-dpr-rowtype=\"cutter\"] .dpr-toolbar {' +
          'background: linear-gradient(135deg, rgba(234,88,12,0.10), rgba(234,88,12,0.02));' +
          'border-bottom-color: rgba(234,88,12,0.35);' +
        '}\n' +
        '[data-dpr-rowtype=\"cutter\"] .dpr-toolbar-title i {' +
          'color: #c2410c;' +
        '}\n';

      document.head.appendChild(st);
    } catch (e) {
      // silent
    }
  }

  // -------------------- render (outer shell only) --------------------
  function emptyHtml() {
    return (
      '<div style="padding:14px;color:var(--text-muted,#64748b);">' +
        '<i class="fas fa-link" style="opacity:0.7;margin-right:6px"></i>' +
        'Không có thiết bị liên quan.' +
      '</div>'
    );
  }

  function renderToolbar(itemType, total, view) {
    var title = getTitle(itemType);
    return (
      '<div class="dpr-toolbar">' +
        '<div class="dpr-toolbar-title">' +
          '<i class="fas fa-link"></i>' +
          '<span>' + escHtml(title) + '</span>' +
          '<span class="dpr-count" data-dpr-count="1">' + escHtml(total) + '</span>' +
        '</div>' +
        '<div class="dpr-toolbar-actions">' +
          '<div class="dpr-view-switcher" role="group" aria-label="View mode">' +
            '<button type="button" class="dpr-view-btn ' + (view === 'grid' ? 'dpr-view-active' : '') + '" data-dpr-view="grid" title="Icon (thumbnail)"><i class="fas fa-th"></i></button>' +
            '<button type="button" class="dpr-view-btn ' + (view === 'detail' ? 'dpr-view-active' : '') + '" data-dpr-view="detail" title="Chi tiết"><i class="fas fa-list"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function render(dp) {
    injectStyles();
    ensureStateForRecord(dp);

    var item = getCurrentItem(dp);
    if (!item) {
      return '<p class="no-data" style="padding:14px">Chưa chọn thiết bị.</p>';
    }

    var itemType = getCurrentItemType(dp);
    var list = getList(dp, item, itemType);

    dp.dprCache = { key: recordKey(dp), list: Array.isArray(list) ? list : [], itemType: itemType };

    var toolbar = renderToolbar(itemType, Array.isArray(list) ? list.length : 0, getView(dp));
    // IMPORTANT: chỉ render toolbar 1 lần, host chỉ render body => tránh lặp tiêu đề
    return (
      '<div class="modal-section dpr-section">' +
        toolbar +
        '<div data-dp-related-host>' +
          (Array.isArray(list) && list.length ? '<div style="padding:14px;color:var(--text-muted,#64748b)"><i class="fas fa-spinner fa-spin" style="opacity:.6"></i> Đang tải...</div>' : emptyHtml()) +
        '</div>' +
      '</div>'
    );
  }

  // -------------------- render body (grid / detail) --------------------
  function setCount(container, total) {
    try {
      var c = container.querySelector('[data-dpr-count="1"]');
      if (c) c.textContent = String(total);
    } catch (e) {}
  }

  function renderGridBody(list, rowItemType) {
    var html = '<div class="dpr-grid">';

    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var id = getRowId(row, rowItemType);
      var code = getRowCode(row, rowItemType) || id || '-';
      var name = getRowName(row, rowItemType) || '-';
      var dims = getRowDimensions(row);
      var loc = getRackLocation(row).display;
      var st = getLatestStatus(row, rowItemType);
      var stLabel = getStatusLabel(st.status);
      var stCls = getStatusClass(st.status);
      var updated = fmtDateYMD(st.date);

      html += (
        '<div class="dpr-card" data-dpr-open="1" data-dpr-idx="' + i + '">' +
          '<div class="dpr-thumb-wrap dpr-thumb-wrap-card" title="Click để xem ảnh lớn">' +
            '<img class="dpr-thumb-img" data-devicetype="' + escHtml(String(rowItemType).toLowerCase()) + '" data-deviceid="' + escHtml(id) + '" alt="thumb" />' +
            '<div class="dpr-thumb-ph"><i class="fas fa-image"></i></div>' +
          '</div>' +
          '<div class="dpr-card-body">' +
            '<div class="dpr-code" title="' + escHtml(code) + '">' + escHtml(code) + '</div>' +
            '<div class="dpr-name" title="' + escHtml(name) + '">' + escHtml(name) + '</div>' +
            '<div class="dpr-meta">' +
              '<div class="dpr-meta-row" title="ID"><i class="fas fa-hashtag"></i><span>ID: ' + escHtml(id || '-') + '</span></div>' +
              '<div class="dpr-meta-row" title="Kích thước"><i class="fas fa-ruler-combined"></i><span>' + escHtml(dims) + '</span></div>' +
              '<div class="dpr-meta-row" title="Vị trí"><i class="fas fa-map-marker-alt"></i><span>' + escHtml(loc) + '</span></div>' +
              '<div class="dpr-meta-row" title="Trạng thái">' +
                '<i class="fas fa-clipboard-check"></i>' +
                '<span class="dpr-status-badge ' + escHtml(stCls) + '">' + escHtml(stLabel) + '</span>' +
                '<span title="Ngày cập nhật" style="margin-left:auto;opacity:.85;">' + escHtml(updated) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    html += '</div>';
    return html;
  }

  function thLabel(ja, vi) {
    return (
      '<span class="dpr-th-label">' +
        '<span class="dpr-ja">' + escHtml(ja) + '</span>' +
        '<span class="dpr-vi">' + escHtml(vi) + '</span>' +
      '</span>'
    );
  }

  function renderDetailBody(list, rowItemType) {
    var html = '';
    html += '<div class="dpr-detail">';
    html += '<table class="dpr-detail-table">';
    html += '<thead><tr>';
    html += '<th style="width:52px">' + thLabel('サムネ', 'Ảnh') + '</th>';
    html += '<th style="width:72px">' + thLabel('ID', 'ID') + '</th>';
    html += '<th style="width:160px">' + thLabel('コード', 'Mã') + '</th>';
    html += '<th class="dpr-col-name" style="min-width:220px">' + thLabel('名前', 'Tên') + '</th>';
    html += '<th class="dpr-col-dim" style="width:170px">' + thLabel('サイズ', 'Kích thước') + '</th>';
    html += '<th style="width:120px">' + thLabel('棚-段', 'Giá - tầng') + '</th>';
    html += '<th style="width:150px">' + thLabel('位置', 'Vị trí giá') + '</th>';
    html += '<th style="width:150px">' + thLabel('状態', 'Trạng thái') + '</th>';
    html += '<th style="width:120px">' + thLabel('更新日', 'Ngày cập nhật') + '</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var id = getRowId(row, rowItemType);
      var code = getRowCode(row, rowItemType) || id || '-';
      var name = getRowName(row, rowItemType) || '-';
      var dims = getRowDimensions(row);

      var rackInfo = getRackLocation(row);
      var loc = rackInfo.display;
      var rackLayerText = rackInfo.rackLayerText || '-';

      var st = getLatestStatus(row, rowItemType);
      var stLabel = getStatusLabel(st.status);
      var stCls = getStatusClass(st.status);
      var updated = fmtDateYMD(st.date);

      html += (
        '<tr data-dpr-open="1" data-dpr-idx="' + i + '">' +
          '<td class="dpr-td-thumb">' +
            '<div class="dpr-thumb-wrap" title="Click để xem ảnh lớn">' +
              '<img class="dpr-thumb-img" data-devicetype="' + escHtml(String(rowItemType).toLowerCase()) + '" data-deviceid="' + escHtml(id) + '" alt="thumb" />' +
              '<div class="dpr-thumb-ph"><i class="fas fa-image"></i></div>' +
            '</div>' +
          '</td>' +
          '<td title="' + escHtml(id || '-') + '">' + escHtml(id || '-') + '</td>' +
          '<td class="dpr-td-code" title="Mở chi tiết">' + escHtml(code) + '</td>' +
          '<td class="dpr-td-name dpr-col-name" title="' + escHtml(name) + '">' + escHtml(name) + '</td>' +
          '<td class="dpr-td-dim dpr-col-dim" title="' + escHtml(dims) + '">' + escHtml(dims) + '</td>' +
          '<td class="dpr-td-rack" title="' + escHtml(rackLayerText) + '"><span class="dpr-rack-badge">' + escHtml(rackLayerText) + '</span></td>' +
          '<td class="dpr-td-loc" title="' + escHtml(loc) + '">' + escHtml(loc) + '</td>' +
          '<td><span class="dpr-status-badge ' + escHtml(stCls) + '">' + escHtml(stLabel) + '</span></td>' +
          '<td title="' + escHtml(updated) + '">' + escHtml(updated) + '</td>' +
        '</tr>'
      );
    }

    html += '</tbody></table></div>';
    return html;
  }

  function renderBody(dp, host, list, itemType, smooth) {
    var v = getView(dp);

    function doRender() {
      if (!list || !list.length) {
        host.innerHTML = emptyHtml();
        return;
      }
      var rowItemType = getRowItemType(itemType);
      host.innerHTML = (v === 'grid') ? renderGridBody(list, rowItemType) : renderDetailBody(list, rowItemType);
      scheduleHydrate(host);
    }

    if (!smooth) {
      doRender();
      return;
    }

    try { host.classList.add('dpr-host-fading'); } catch (e) {}
    requestAnimationFrame(function () {
      doRender();
      requestAnimationFrame(function () {
        try { host.classList.remove('dpr-host-fading'); } catch (e2) {}
      });
    });
  }

  // -------------------- bind --------------------
  function bind(dp, container) {
    try {
      if (!dp || !container) return;
      ensureStateForRecord(dp);

      function getHostNow() {
        return container.querySelector('[data-dp-related-host]');
      }

      function syncViewButtons() {
        var v = getView(dp);
        var btns = container.querySelectorAll('.dpr-view-btn[data-dpr-view]');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          if (!b) continue;
          b.classList.toggle('dpr-view-active', b.getAttribute('data-dpr-view') === v);
        }
      }

      function openPreviewByIndex(idx) {
        try {
          ensureStateForRecord(dp);
          var cache = dp.dprCache;
          if (!cache || cache.key !== recordKey(dp) || !Array.isArray(cache.list)) return;
          var row = cache.list[idx];
          if (!row) return;
          var rowItemType = getRowItemType(cache.itemType);

          if (typeof dp.openPreview === 'function') {
            dp.openPreview(row, rowItemType);
            return;
          }

          try {
            document.dispatchEvent(new CustomEvent('openDetailPanel', { detail: { item: row, type: rowItemType } }));
          } catch (e2) {}
        } catch (e) {}
      }

      async function openViewerByIndex(idx) {
        try {
          ensureStateForRecord(dp);
          var cache = dp.dprCache;
          if (!cache || cache.key !== recordKey(dp) || !Array.isArray(cache.list)) return;
          var row = cache.list[idx];
          if (!row) return;
          var rowItemType = getRowItemType(cache.itemType);

          var id = getRowId(row, rowItemType);
          var code = getRowCode(row, rowItemType) || id || '-';
          var name = getRowName(row, rowItemType) || '';
          var title = code + (name ? ' - ' + name : '');

          var url = await getFullImageUrlForDevice(rowItemType, id);
          viewerOpen({ title: title, url: url });
        } catch (e) {
          viewerOpen({ title: 'Ảnh', url: '' });
        }
      }

      // Delegation bind 1 lần
      if (!container.dataset.dprBound) {
        container.dataset.dprBound = '1';

        container.addEventListener('click', function (e) {
          try {
            ensureStateForRecord(dp);
            var host = getHostNow();
            if (!host) return;

            // 1) Chuyển view
            var viewBtn = e.target && e.target.closest ? e.target.closest('.dpr-view-btn[data-dpr-view]') : null;
            if (viewBtn) {
              e.preventDefault();
              e.stopPropagation();
              var v = viewBtn.getAttribute('data-dpr-view');
              setView(dp, v);
              syncViewButtons();
              var cache = dp.dprCache;
              if (cache && cache.key === recordKey(dp) && Array.isArray(cache.list)) {
                renderBody(dp, host, cache.list, cache.itemType, true);
              }
              return;
            }

            // 2) Click thumbnail => mở viewer (ưu tiên)
            var thumbWrap = e.target && e.target.closest ? e.target.closest('.dpr-thumb-wrap') : null;
            if (thumbWrap && host.contains(thumbWrap)) {
              var holder = thumbWrap.closest('[data-dpr-idx]');
              if (holder) {
                var idxV = Number(holder.getAttribute('data-dpr-idx'));
                if (!isNaN(idxV)) {
                  e.preventDefault();
                  e.stopPropagation();
                  openViewerByIndex(idxV);
                  return;
                }
              }
            }

            // 3) Click dòng/card => mở preview chi tiết
            var cardOrRow = e.target && e.target.closest ? e.target.closest('[data-dpr-open="1"]') : null;
            if (cardOrRow && host.contains(cardOrRow)) {
              var idx = Number(cardOrRow.getAttribute('data-dpr-idx'));
              if (!isNaN(idx)) {
                e.preventDefault();
                e.stopPropagation();
                openPreviewByIndex(idx);
                return;
              }
            }

          } catch (err) {
            // silent
          }
        });
      }

      // mỗi lần bind: render body theo record hiện tại
      var hostNow = getHostNow();
      if (!hostNow) return;

      var item = getCurrentItem(dp);
      if (!item) {
        hostNow.innerHTML = '<p class="no-data" style="padding:14px">Chưa chọn thiết bị.</p>';
        return;
      }

      var itemType = getCurrentItemType(dp);
      // Gắn loại thiết bị liên quan để đổi màu header (mold: xanh, cutter: cam)
      try {
        var rowItemType = getRowItemType(itemType);
        container.setAttribute(
          'data-dpr-rowtype',
          String(rowItemType || '').toLowerCase()
        );
      } catch (e) {
        // bỏ qua nếu có lỗi nhỏ, không ảnh hưởng chức năng chính
      }

      var list;
      if (dp.dprCache && dp.dprCache.key === recordKey(dp) && Array.isArray(dp.dprCache.list)) {
        list = dp.dprCache.list;
      } else {
        list = getList(dp, item, itemType);
        dp.dprCache = { key: recordKey(dp), list: Array.isArray(list) ? list : [], itemType: itemType };
      }

      setCount(container, dp.dprCache.list.length);
      syncViewButtons();
      renderBody(dp, hostNow, dp.dprCache.list, itemType, true);

    } catch (e) {
      // silent
    }
  }

  // -------------------- export / register --------------------
  var RelatedTabModule = {
    version: VERSION,
    render: function (dp) { return render(dp); },
    bind: function (dp, container) { return bind(dp, container); }
  };

  try {
    if (!global.DetailPanelTabModules || typeof global.DetailPanelTabModules !== 'object') {
      global.DetailPanelTabModules = {};
    }
    global.DetailPanelTabModules.related = RelatedTabModule;
  } catch (e) {}

  // compat alias
  try { global.DetailPanelRelatedTabModule = RelatedTabModule; } catch (e2) {}

  // ready event
  try {
    document.dispatchEvent(new CustomEvent('detail-panel-related-tab-module-ready', { detail: { version: VERSION } }));
  } catch (e3) {}

  try { console.log('DetailPanel RelatedTabModule', VERSION, 'loaded'); } catch (e4) {}

})(window);
