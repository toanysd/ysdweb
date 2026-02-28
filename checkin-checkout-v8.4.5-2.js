/*
checkin-checkout-v8.4.5-2.js

MoldCutterSearch - Check-in / Check-out modal (PA1: 2 cột)

Mục tiêu bản v8.4.5-2:
- Thay thế full module (không cần patch file).
- Tính đến address bar mobile (iOS/Android): dùng VisualViewport + CSS var --cio-vh.
- Actionbar luôn nhìn thấy (fixed bottom + safe-area).
- Giữ API cũ:
  - window.CheckInOut.openModal(mode, item)   mode: 'check-in' | 'check-out'
  - window.CheckInOut.close()
  - window.CheckInOut.refreshHistoryInPlace(item)

Yêu cầu:
- window.DataManager (data-manager-v8.4.x)
- (tùy chọn) window.createSearchableSelect
- (tùy chọn) window.LocationManager.openModal(item)
*/

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5-2';

  // -----------------------------
  // CONFIG
  // -----------------------------
  var DEFAULT_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
  var DEFAULT_DELETE_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/deletelog';

  function getCfg() {
    var c = global.CIO_CONFIG && typeof global.CIO_CONFIG === 'object' ? global.CIO_CONFIG : {};
    return {
      apiUrl: c.apiUrl || DEFAULT_API_URL,
      deleteApiUrl: c.deleteApiUrl || DEFAULT_DELETE_API_URL
    };
  }

  // -----------------------------
  // STATE
  // -----------------------------
  var currentItem = null;
  var currentMode = 'check-in';
  var _opened = false;

  var _bodyPrevOverflow = null;
  var _bodyPrevTouchAction = null;

  var _vhBound = false;
  var _vv = null;
  var _vhRaf = 0;

  var _hisQuery = '';
  var _hisSortKey = 'Timestamp';
  var _hisSortDir = 'desc';

  var SESSION_KEY_LAST_ACTION = 'checkinlastactiontimestamp';
  var STORAGE_KEY_DEFAULT_EMP = 'ciodefault-employee-id';
  var STORAGE_KEY_HIS_UNLOCK = 'ciohistory-unlocked';
  var STORAGE_KEY_HIS_INITED = 'ciohistory-unlock-inited';

  // Storage safe (fallback nếu localStorage bị chặn)
  var _cio_storage_ok = null;
  var _cio_mem_his_unlocked = false;
  var _cio_mem_his_inited = false;

  function _cioStorageOk() {
    if (_cio_storage_ok !== null) return _cio_storage_ok;
    try {
      var k = '__cio_ls_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      _cio_storage_ok = true;
    } catch (e) {
      _cio_storage_ok = false;
    }
    return _cio_storage_ok;
  }

  // -----------------------------
  // I18N helpers (JP/VN)
  // -----------------------------
  function JV(ja, vi) { return String(ja || '') + ' / ' + String(vi || ''); }

  // -----------------------------
  // UTILS
  // -----------------------------
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function safeArray(x) { return Array.isArray(x) ? x : []; }

  function normalizeId(v) { return String(v === null || v === undefined ? '' : v).trim(); }

  function getField(obj, keys, fallback) {
    if (!obj) return fallback;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (obj[k] !== null && obj[k] !== undefined && obj[k] !== '') return obj[k];
    }
    return fallback;
  }

  function isMobile() { return (window.innerWidth || 0) <= 900; }

  function fmt(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var da = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + mo + '-' + da + ' ' + hh + ':' + mm;
  }

  function setLastActionTime() {
    try { sessionStorage.setItem(SESSION_KEY_LAST_ACTION, String(Date.now())); } catch (e) {}
  }

  function getDefaultEmpId() {
    try { return localStorage.getItem(STORAGE_KEY_DEFAULT_EMP); } catch (e) { return null; }
  }

  function setDefaultEmpId(id) {
    try { if (id) localStorage.setItem(STORAGE_KEY_DEFAULT_EMP, String(id)); } catch (e) {}
  }

  function clearDefaultEmpId() {
    try { localStorage.removeItem(STORAGE_KEY_DEFAULT_EMP); } catch (e) {}
  }

  function isHistoryUnlocked() {
    if (_cioStorageOk()) {
      try {
        var v = localStorage.getItem(STORAGE_KEY_HIS_UNLOCK);
        _cio_mem_his_unlocked = (v === '1');
        return _cio_mem_his_unlocked;
      } catch (e) {
        return _cio_mem_his_unlocked === true;
      }
    }
    return _cio_mem_his_unlocked === true;
  }

  function setHistoryUnlocked(v) {
    _cio_mem_his_unlocked = !!v;
    if (_cioStorageOk()) {
      try { localStorage.setItem(STORAGE_KEY_HIS_UNLOCK, _cio_mem_his_unlocked ? '1' : '0'); } catch (e) {}
    }
  }

  function ensureHistoryUnlockDefault() {
    if (_cioStorageOk()) {
      try {
        if (localStorage.getItem(STORAGE_KEY_HIS_INITED) === '1') return;
        setHistoryUnlocked(!isMobile());
        localStorage.setItem(STORAGE_KEY_HIS_INITED, '1');
      } catch (e) {}
      return;
    }

    if (_cio_mem_his_inited) return;
    setHistoryUnlocked(!isMobile());
    _cio_mem_his_inited = true;
  }

  function parseSelectedIdFromSearchableInput(inputEl) {
    if (!inputEl) return '';
    if (inputEl.dataset && inputEl.dataset.selectedId) return String(inputEl.dataset.selectedId).trim();

    var raw = String(inputEl.value || '').trim();
    if (!raw) return '';

    var m = raw.match(/\(([^)]+)\)\s*$/);
    if (m) return String(m[1]).trim();

    m = raw.match(/-\s*([A-Za-z0-9._-]+)\s*$/);
    if (m) return String(m[1]).trim();

    return raw;
  }

  function getItemKey(item) {
    if (item && item.MoldID !== undefined && item.MoldID !== null && String(item.MoldID).trim() !== '') {
      return { itemType: 'mold', id: normalizeId(item.MoldID), idField: 'MoldID' };
    }
    if (item && item.CutterID !== undefined && item.CutterID !== null && String(item.CutterID).trim() !== '') {
      return { itemType: 'cutter', id: normalizeId(item.CutterID), idField: 'CutterID' };
    }
    return { itemType: (item && item.type) ? String(item.type) : 'unknown', id: '', idField: '' };
  }

  function getDestinationName(destId, destList) {
    if (!destId) return '';
    destList = safeArray(destList);
    var found = destList.find(function (d) { return normalizeId(d.DestinationID) === normalizeId(destId); });
    return found ? String(found.DestinationName || destId) : String(destId);
  }

  function getEmployeeName(empId, empList) {
    if (!empId) return '-';
    empList = safeArray(empList);
    var found = empList.find(function (e) { return normalizeId(e.EmployeeID) === normalizeId(empId); });
    if (!found) return String(empId);
    return String(found.EmployeeName || found.name || empId);
  }

  function normalizeLogPendingFlag(log) {
    if (!log) return { pending: false, error: false, localId: '' };
    var pending = !!(log._pending || log.pending || log._Pending || log.Pending);
    var localId = String(log._localId || log.localId || log._LocalId || log.LocalId || '');
    var error = !!(log._syncError || log.syncError || log._SyncError || log.SyncError);
    return { pending: pending, error: error, localId: localId };
  }

  // -----------------------------
  // TOAST (JP/VN)
  // -----------------------------
  function showBilingualToast(type) {
    var msgJa = '';
    var msgVi = '';
    var cls = 'info';

    if (type === 'saved') {
      msgJa = '保存しました';
      msgVi = 'Đã lưu';
      cls = 'success';
    } else if (type === 'pending') {
      msgJa = '一時保存（同期中）';
      msgVi = 'Đã lưu tạm (đang đồng bộ)';
      cls = 'warning';
    } else if (type === 'refreshed') {
      msgJa = '更新しました';
      msgVi = 'Đã làm mới';
      cls = 'success';
    } else if (type === 'deleted') {
      msgJa = '削除しました';
      msgVi = 'Đã xóa';
      cls = 'success';
    } else if (type === 'deleting') {
      msgJa = '削除中...';
      msgVi = 'Đang xóa...';
      cls = 'warning';
    } else {
      msgJa = 'エラー';
      msgVi = 'Lỗi';
      cls = 'error';
    }

    try {
      if (global.notify && typeof global.notify === 'object') {
        var msg = msgVi + ' / ' + msgJa;
        if (cls === 'success' && typeof global.notify.success === 'function') return global.notify.success(msg);
        if (cls === 'warning' && typeof global.notify.warning === 'function') return global.notify.warning(msg);
        if (cls === 'error' && typeof global.notify.error === 'function') return global.notify.error(msg);
        if (typeof global.notify.info === 'function') return global.notify.info(msg);
      }
    } catch (e0) {}

    try {
      if (global.NotificationModule && typeof global.NotificationModule.show === 'function') {
        global.NotificationModule.show(msgVi + ' / ' + msgJa, cls);
        return;
      }
    } catch (e1) {}

    var id = 'cio-toast';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.bottom = '18px';
      el.style.transform = 'translateX(-50%) translateY(10px)';
      el.style.zIndex = '500010';
      el.style.padding = '10px 12px';
      el.style.borderRadius = '14px';
      el.style.fontSize = '12px';
      el.style.boxShadow = '0 14px 34px rgba(0,0,0,0.18)';
      el.style.maxWidth = '90vw';
      el.style.lineHeight = '1.35';
      el.style.opacity = '0';
      el.style.transition = 'opacity .18s ease, transform .18s ease';
      el.style.border = '1px solid rgba(0,0,0,0.10)';
      el.style.background = '#fff';
      el.style.color = '#111827';
      document.body.appendChild(el);
    }

    var border = '#e5e7eb';
    var bg = '#fff';
    if (cls === 'success') { border = 'rgba(22,163,74,0.35)'; bg = 'rgba(22,163,74,0.10)'; }
    if (cls === 'warning') { border = 'rgba(245,158,11,0.35)'; bg = 'rgba(245,158,11,0.10)'; }
    if (cls === 'error') { border = 'rgba(239,68,68,0.35)'; bg = 'rgba(239,68,68,0.10)'; }

    el.style.borderColor = border;
    el.style.background = bg;
    el.innerHTML = '<div style="font-weight:950">' + escapeHtml(msgVi) + '</div>' +
      '<div style="opacity:.88;font-size:11px;font-weight:850">' + escapeHtml(msgJa) + '</div>';

    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });

    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(10px)';
    }, 1600);
  }

  // -----------------------------
  // CSS (full in JS) + Mobile address bar fix
  // -----------------------------
  function ensureCss() {
    var id = 'cio-style-v8.4.5-2';
    if (document.getElementById(id)) return;

    var css = '';
    css += ':root{--cio-font:Inter,"Be Vietnam Pro","Hiragino Sans","Yu Gothic UI",Meiryo,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;';
    css += '--cio-z-backdrop:500000;--cio-z-dialog:500001;';
    css += '--cio-border:rgba(2,6,23,0.10);--cio-surface:#ffffff;--cio-surface-2:#f8fafc;';
    css += '--cio-text:#0b1220;--cio-muted:#64748b;';
    css += '--cio-accent:#0f766e;--cio-accent-hover:#0a5c56;';
    css += '--cio-success:#16a34a;--cio-danger:#ef4444;--cio-warning:#f59e0b;';
    css += '--cio-shadow:0 14px 34px rgba(2,6,23,0.14);--cio-shadow-sm:0 2px 10px rgba(2,6,23,0.10);';
    css += '--cio-r:14px;--cio-gap:10px;--cio-actionbar-h:72px;}';

    css += '.cio-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:var(--cio-z-backdrop);}';

    css += '#cio-panel.cio-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:96%;max-width:1400px;';
    css += 'height:90vh;max-height:920px;background:var(--cio-surface);border:1px solid var(--cio-border);border-radius:var(--cio-r);';
    css += 'box-shadow:var(--cio-shadow);z-index:var(--cio-z-dialog);display:flex;flex-direction:column;overflow:hidden;font-family:var(--cio-font);color:var(--cio-text);}';

    css += '#cio-panel .cio-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;color:#fff;user-select:none;touch-action:pan-y;cursor:grab;}';
    css += '#cio-panel .cio-header:active{cursor:grabbing;}';
    css += '#cio-panel .cio-header.check-in{background:linear-gradient(135deg,var(--cio-success),#0f8a4a);}';
    css += '#cio-panel .cio-header.check-out{background:linear-gradient(135deg,var(--cio-danger),#c81e1e);}';

    css += '#cio-panel .cio-title{display:flex;flex-direction:column;line-height:1.05;}';
    css += '#cio-panel .cio-title .ja{font-size:16px;font-weight:950;}';
    css += '#cio-panel .cio-title .vi{font-size:11px;font-weight:900;opacity:.95;}';

    css += '#cio-panel .cio-header-actions{display:flex;gap:8px;align-items:center;}';
    css += '#cio-panel .cio-icon-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:12px;padding:6px 10px;cursor:pointer;font-weight:950;transition:transform .15s ease, background .15s ease;}';
    css += '#cio-panel .cio-icon-btn:hover{background:rgba(255,255,255,.22);transform:translateY(-1px);}';

    css += '#cio-panel .cio-main{flex:1;min-height:0;background:var(--cio-surface-2);padding:var(--cio-gap);display:grid;grid-template-columns:minmax(520px,1fr) 460px;gap:var(--cio-gap);overflow:hidden;}';

    css += '#cio-panel .cio-card{background:var(--cio-surface);border:1px solid var(--cio-border);border-radius:var(--cio-r);box-shadow:var(--cio-shadow-sm);overflow:hidden;min-height:0;display:flex;flex-direction:column;}';

    css += '#cio-panel .cio-card-head{padding:10px 12px;border-bottom:1px solid var(--cio-border);display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(180deg, rgba(2,6,23,0.02), transparent);}';
    css += '#cio-panel .cio-card-title{font-weight:950;font-size:13px;display:flex;flex-direction:column;line-height:1.05;}';
    css += '#cio-panel .cio-card-title .ja{font-size:13px;font-weight:950;}';
    css += '#cio-panel .cio-card-title .vi{font-size:10px;font-weight:900;opacity:.78;color:var(--cio-muted);}';

    css += '#cio-panel .cio-history-controls{display:flex;gap:8px;align-items:center;min-width:0;flex:1;justify-content:flex-end;}';
    css += '#cio-panel .cio-search{width:100%;max-width:520px;min-width:220px;padding:9px 10px;border-radius:12px;border:2px solid rgba(245,158,11,.55);background:#FFF7DB;font-weight:900;color:var(--cio-text);}';
    css += '#cio-panel .cio-search:focus{outline:none;border-color:var(--cio-warning);box-shadow:0 0 0 3px rgba(245,158,11,.20);background:var(--cio-surface);}';

    css += '#cio-panel .cio-lock{flex-shrink:0;border:1px solid rgba(79,70,229,.25);border-radius:12px;padding:9px 12px;background:rgba(79,70,229,.10);color:rgba(11,18,32,.92);font-weight:950;cursor:pointer;display:flex;align-items:center;gap:8px;}';
    css += '#cio-panel .cio-lock:hover{background:rgba(79,70,229,.16);}';

    css += '#cio-panel .cio-history-wrap{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;}';
    css += '#cio-panel .cio-history-wrap.scroll-unlocked{overflow-x:auto;touch-action:pan-x pan-y;}';

    css += '#cio-panel .cio-history-table{border-collapse:collapse;font-size:12px;background:var(--cio-surface);}';
    css += '#cio-panel .cio-history-wrap:not(.scroll-unlocked) .cio-history-table{width:100%;table-layout:fixed;}';
    css += '#cio-panel .cio-history-wrap.scroll-unlocked .cio-history-table{width:max-content;min-width:920px;}';

    css += '#cio-panel .cio-history-table thead th{position:sticky;top:0;z-index:5;background:var(--cio-accent);color:#fff;font-size:11px;font-weight:950;text-align:left;padding:8px 8px;white-space:nowrap;cursor:pointer;}';
    css += '#cio-panel .cio-history-table thead th:hover{background:var(--cio-accent-hover);}';

    css += '#cio-panel .cio-history-table tbody td{padding:7px 8px;border-bottom:1px solid rgba(2,6,23,0.08);vertical-align:middle;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}';
    css += '#cio-panel .cio-history-table tbody tr:nth-child(odd){background:rgba(2,6,23,.02);}';
    css += '#cio-panel .cio-history-table tbody tr:hover{background:rgba(15,118,110,.08);}';

    css += '#cio-panel .cio-note-cell{max-width:360px;}';
    css += '#cio-panel .cio-history-wrap.scroll-unlocked .cio-note-cell{max-width:none;overflow:visible;text-overflow:clip;}';

    css += '#cio-panel .cio-status-badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;font-weight:950;font-size:11px;border:1px solid rgba(0,0,0,.10);background:rgba(0,0,0,.03);min-width:46px;}';
    css += '#cio-panel .cio-b-in{border-color:rgba(22,163,74,.30);background:rgba(22,163,74,.12);color:#14532d;}';
    css += '#cio-panel .cio-b-out{border-color:rgba(239,68,68,.30);background:rgba(239,68,68,.10);color:#7f1d1d;}';

    css += '#cio-panel .cio-sync-dot{font-weight:950;font-size:14px;display:inline-block;}';
    css += '#cio-panel .cio-sync-dot.synced{color:var(--cio-success);}';
    css += '#cio-panel .cio-sync-dot.pending{color:var(--cio-warning);animation:cio_pulse 1.5s ease-in-out infinite;}';
    css += '#cio-panel .cio-sync-dot.error{color:var(--cio-danger);}';
    css += '@keyframes cio_pulse{0%,100%{opacity:1}50%{opacity:.45}}';

    css += '#cio-panel .cio-delete-btn{border:none;background:none;color:var(--cio-danger);cursor:pointer;font-size:16px;font-weight:950;padding:2px 6px;border-radius:10px;}';
    css += '#cio-panel .cio-delete-btn:hover{background:rgba(239,68,68,.10);transform:scale(1.05);}';

    css += '#cio-panel .cio-history-table.cio-history-locked th.col-sync,';
    css += '#cio-panel .cio-history-table.cio-history-locked td.col-sync,';
    css += '#cio-panel .cio-history-table.cio-history-locked th.col-del,';
    css += '#cio-panel .cio-history-table.cio-history-locked td.col-del{display:none !important;}';

    css += '#cio-panel .cio-history-table.cio-history-unlocked th.col-sync,';
    css += '#cio-panel .cio-history-table.cio-history-unlocked td.col-sync,';
    css += '#cio-panel .cio-history-table.cio-history-unlocked th.col-del,';
    css += '#cio-panel .cio-history-table.cio-history-unlocked td.col-del{display:table-cell !important;}';

    css += '#cio-panel .cio-right{min-height:0;display:flex;flex-direction:column;gap:var(--cio-gap);}';

    css += '#cio-panel .cio-status-box{padding:10px 12px;display:grid;gap:4px;max-height:none;overflow:visible;}';

    css += '#cio-panel .cio-kv{display:grid;grid-template-columns:108px 1fr;gap:10px;align-items:center;}';
    css += '#cio-panel .cio-k{font-size:11px;font-weight:950;color:var(--cio-muted);}';
    css += '#cio-panel .cio-v{border:1px solid rgba(2,6,23,0.10);background:var(--cio-surface);border-radius:12px;padding:8px 10px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
    css += '#cio-panel .cio-v.wrap{white-space:normal;}';

    css += '#cio-panel .cio-input-card{flex:1;min-height:0;}';
    css += '#cio-panel .cio-input-scroll{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}';

    css += '#cio-panel .cio-mode-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;}';
    css += '#cio-panel .cio-mode-btn{border:1px solid rgba(2,6,23,0.12);border-radius:12px;padding:10px 10px;font-weight:950;cursor:pointer;transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;line-height:1.05;}';
    css += '#cio-panel .cio-mode-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(2,6,23,0.10);}';
    css += '#cio-panel .cio-mode-btn .ja{font-size:12px;font-weight:950;white-space:nowrap;}';
    css += '#cio-panel .cio-mode-btn .vi{font-size:10px;font-weight:900;opacity:.90;white-space:nowrap;}';
    css += '#cio-panel .cio-mode-btn.btn-in{background:rgba(22,163,74,.10);border-color:rgba(22,163,74,.28);}';
    css += '#cio-panel .cio-mode-btn.btn-out{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.24);}';
    css += '#cio-panel .cio-mode-btn.btn-in.active{background:rgba(22,163,74,.18);border-color:rgba(22,163,74,.55);box-shadow:0 0 0 3px rgba(22,163,74,.14);}';
    css += '#cio-panel .cio-mode-btn.btn-out.active{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.50);box-shadow:0 0 0 3px rgba(239,68,68,.12);}';

    css += '#cio-panel .dest-group{min-height:74px;display:grid;gap:6px;}';
    css += '#cio-panel .dest-group.is-hidden{visibility:hidden;opacity:0;pointer-events:none;}';

    css += '#cio-panel .cio-label{font-weight:950;color:var(--cio-text);font-size:12px;}';
    css += '#cio-panel .cio-control{width:100%;border:1px solid rgba(2,6,23,0.12);border-radius:12px;padding:10px 10px;font-weight:900;font-size:13px;background:var(--cio-surface);color:var(--cio-text);}';
    css += '#cio-panel .cio-control:focus{outline:none;border-color:rgba(15,118,110,.55);box-shadow:0 0 0 3px rgba(15,118,110,.20);}';

    css += '#cio-panel .cio-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;}';

    css += '#cio-panel .cio-btn{border:none;border-radius:12px;padding:10px 10px;font-weight:950;cursor:pointer;transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;display:flex;align-items:center;justify-content:center;gap:6px;}';
    css += '#cio-panel .cio-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(2,6,23,0.12);}';
    css += '#cio-panel .cio-btn:active{transform:translateY(0);}';
    css += '#cio-panel .cio-btn.secondary{background:rgba(100,116,139,.14);color:#0b1220;}';
    css += '#cio-panel .cio-btn.primary{background:rgba(15,118,110,.96);color:#fff;}';

    css += '#cio-panel .cio-face-status{font-weight:950;font-size:12px;padding:8px 10px;border-radius:12px;border:1px solid rgba(2,6,23,0.10);background:rgba(2,6,23,0.03);}';
    css += '#cio-panel .cio-face-status.confirmed{border-color:rgba(22,163,74,.30);background:rgba(22,163,74,.10);color:#14532d;}';

    css += '#cio-panel .cio-actionbar{flex-shrink:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 12px;border-top:1px solid var(--cio-border);background:linear-gradient(to top, rgba(248,250,252,1), rgba(255,255,255,1));}';

    css += '#cio-panel .cio-act{border:none;border-radius:12px;padding:10px 10px;font-weight:950;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:44px;transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;}';
    css += '#cio-panel .cio-act:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(2,6,23,0.12);}';
    css += '#cio-panel .cio-act:active{transform:translateY(0);}';
    css += '#cio-panel .cio-act .ja{font-size:12px;font-weight:950;white-space:nowrap;}';
    css += '#cio-panel .cio-act .vi{font-size:10px;font-weight:900;opacity:.95;white-space:nowrap;}';
    css += '#cio-panel .cio-act.cancel{background:rgba(100,116,139,.14);color:#0b1220;}';
    css += '#cio-panel .cio-act.relocate{background:rgba(245,158,11,.92);color:#fff;}';
    css += '#cio-panel .cio-act.save{background:rgba(15,118,110,.96);color:#fff;}';

    css += '#cio-panel .hidden{display:none !important;}';

    // Mobile: address-bar safe height + fixed actionbar
    css += '@media (max-width: 900px){';
    css += '#cio-panel.cio-panel{top:0;left:0;transform:none;inset:0;width:100vw;max-width:100vw;';
    css += 'height:var(--cio-vh, 100dvh);height:var(--cio-vh, 100vh);max-height:none;border-radius:0;}';

    css += '#cio-panel .cio-main{display:flex;flex-direction:column;gap:10px;padding:10px;';
    css += 'overflow:auto;';
    css += 'padding-bottom:calc(var(--cio-actionbar-h, 72px) + env(safe-area-inset-bottom));}';

    css += '#cio-panel .cio-search{max-width:none;min-width:0;}';
    css += '#cio-panel .cio-right{order:1;}';
    css += '#cio-panel .cio-history-card{order:2;min-height:46vh;}';

    css += '#cio-panel .cio-actionbar{position:fixed;left:0;right:0;bottom:0;z-index:10;';
    css += 'padding-bottom:calc(10px + env(safe-area-inset-bottom));}';
    css += '}';

    // Reduce motion
    css += '@media (prefers-reduced-motion: reduce){#cio-panel .cio-icon-btn,#cio-panel .cio-btn,#cio-panel .cio-act,#cio-panel .cio-mode-btn{transition:none !important;}#cio-panel .cio-sync-dot.pending{animation:none !important;}}';

    var st = document.createElement('style');
    st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
  }

  // -----------------------------
  // Mobile viewport height handler
  // -----------------------------
  function _getViewportHeight() {
    try {
      if (global.visualViewport) {
        return Math.round(global.visualViewport.height);
      }
    } catch (e) {}
    return Math.round(window.innerHeight || 0);
  }

  function _applyVhNow() {
    _vhRaf = 0;
    var panel = document.getElementById('cio-panel');
    if (!panel) return;
    var h = _getViewportHeight();
    if (!h || h < 200) return;
    panel.style.setProperty('--cio-vh', h + 'px');

    // actionbar height -> padding main
    try {
      var bar = panel.querySelector('.cio-actionbar');
      if (bar) {
        var bh = Math.round(bar.getBoundingClientRect().height);
        if (bh > 40) panel.style.setProperty('--cio-actionbar-h', bh + 'px');
      }
    } catch (e2) {}
  }

  function _scheduleVhApply() {
    if (_vhRaf) return;
    _vhRaf = requestAnimationFrame(_applyVhNow);
  }

  function bindViewportHeight() {
    if (_vhBound) return;
    _vhBound = true;

    _vv = null;
    try { _vv = global.visualViewport || null; } catch (e) { _vv = null; }

    window.addEventListener('resize', _scheduleVhApply, { passive: true });
    window.addEventListener('orientationchange', _scheduleVhApply, { passive: true });

    if (_vv) {
      try {
        _vv.addEventListener('resize', _scheduleVhApply, { passive: true });
        _vv.addEventListener('scroll', _scheduleVhApply, { passive: true });
      } catch (e2) {}
    }

    _scheduleVhApply();
  }

  function unbindViewportHeight() {
    if (!_vhBound) return;
    _vhBound = false;

    window.removeEventListener('resize', _scheduleVhApply);
    window.removeEventListener('orientationchange', _scheduleVhApply);

    if (_vv) {
      try {
        _vv.removeEventListener('resize', _scheduleVhApply);
        _vv.removeEventListener('scroll', _scheduleVhApply);
      } catch (e2) {}
    }

    _vv = null;
    if (_vhRaf) {
      try { cancelAnimationFrame(_vhRaf); } catch (e3) {}
      _vhRaf = 0;
    }
  }

  // -----------------------------
  // Modal DOM
  // -----------------------------
  function ensureModalSkeleton() {
    ensureCss();

    var oldBackdrop = document.getElementById('cio-backdrop');
    if (!oldBackdrop) {
      oldBackdrop = document.createElement('div');
      oldBackdrop.id = 'cio-backdrop';
      oldBackdrop.className = 'cio-backdrop hidden';
      document.body.appendChild(oldBackdrop);
    }

    var panel = document.getElementById('cio-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cio-panel';
      panel.className = 'cio-panel hidden';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Check-in / Check-out');
      document.body.appendChild(panel);
    }

    return panel;
  }

  function buildModalHtml(mode, item) {
    var key = getItemKey(item);

    var code = getField(item, ['displayCode', 'MoldCode', 'CutterNo', 'code'], '');
    var name = getField(item, ['MoldName', 'CutterName', 'CutterDesignName', 'name'], '');
    var size = getField(item, ['displaySize', 'Size', 'Dimensions', 'dimensions'], '');
    var location = getField(item, ['displayRackLocation', 'location', 'rackNo'], '');
    var company = getField(item, ['displayStorageCompany', 'storageCompany', 'company'], '');
    var date = getField(item, ['ProductionDate', 'displayDate', 'date'], '');

    var titleJa = (mode === 'check-in') ? 'チェックイン' : 'チェックアウト';
    var titleVi = (mode === 'check-in') ? 'Check-in' : 'Check-out';

    var destHiddenClass = (mode === 'check-out') ? '' : 'is-hidden';

    return (
      '<div class="cio-header ' + (mode === 'check-in' ? 'check-in' : 'check-out') + '">' +
        '<div class="cio-title">' +
          '<div class="ja">' + escapeHtml(titleJa) + '</div>' +
          '<div class="vi">' + escapeHtml(titleVi) + '</div>' +
        '</div>' +
        '<div class="cio-header-actions">' +
          '<button type="button" class="cio-icon-btn" id="cio-refresh" aria-label="Refresh">⟳</button>' +
          '<button type="button" class="cio-icon-btn" id="cio-close" aria-label="Close">✕</button>' +
        '</div>' +
      '</div>' +

      '<div class="cio-main">' +
        '<div class="cio-card cio-history-card">' +
          '<div class="cio-card-head">' +
            '<div class="cio-card-title">' +
              '<div class="ja">履歴</div>' +
              '<div class="vi">Lịch sử</div>' +
            '</div>' +

            '<div class="cio-history-controls">' +
              '<input id="cio-history-search" class="cio-search" placeholder="Search..." value="' + escapeHtml(_hisQuery) + '">' +
              '<button type="button" class="cio-lock" id="cio-lock-btn">🔒</button>' +
            '</div>' +
          '</div>' +

          '<div class="cio-history-wrap" id="cio-history-wrap">' +
            '<table class="cio-history-table" id="cio-history-table">' +
              '<thead>' +
                '<tr>' +
                  '<th data-sort="Timestamp">' + escapeHtml(JV('日時', 'Thời gian')) + '</th>' +
                  '<th data-sort="Status">' + escapeHtml(JV('状態', 'Trạng thái')) + '</th>' +
                  '<th data-sort="DestinationID">' + escapeHtml(JV('行き先', 'Điểm đến')) + '</th>' +
                  '<th data-sort="EmployeeID">' + escapeHtml(JV('担当者', 'Nhân viên')) + '</th>' +
                  '<th data-sort="Notes">' + escapeHtml(JV('メモ', 'Ghi chú')) + '</th>' +
                  '<th class="col-sync" data-sort="_sync">' + escapeHtml(JV('同期', 'Sync')) + '</th>' +
                  '<th class="col-del">' + escapeHtml(JV('削除', 'Xóa')) + '</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="cio-history-tbody"></tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +

        '<div class="cio-right">' +
          '<div class="cio-card">' +
            '<div class="cio-card-head">' +
              '<div class="cio-card-title">' +
                '<div class="ja">対象</div>' +
                '<div class="vi">Đối tượng</div>' +
              '</div>' +
            '</div>' +
            '<div class="cio-status-box">' +
              '<div class="cio-kv"><div class="cio-k">Type</div><div class="cio-v">' + escapeHtml(String(key.itemType || '')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Code</div><div class="cio-v">' + escapeHtml(String(code || '')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Name</div><div class="cio-v wrap">' + escapeHtml(String(name || '')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Size</div><div class="cio-v">' + escapeHtml(String(size || '')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Location</div><div class="cio-v">' + escapeHtml(String(location || '')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Company</div><div class="cio-v">' + escapeHtml(String(company || '')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Date</div><div class="cio-v">' + escapeHtml(String(date || '')) + '</div></div>' +
            '</div>' +
          '</div>' +

          '<div class="cio-card cio-input-card">' +
            '<div class="cio-card-head">' +
              '<div class="cio-card-title">' +
                '<div class="ja">入力</div>' +
                '<div class="vi">Nhập liệu</div>' +
              '</div>' +
            '</div>' +

            '<div class="cio-input-scroll">' +
              '<div class="cio-mode-buttons">' +
                '<button type="button" class="cio-mode-btn btn-in" id="btn-in">' +
                  '<div class="ja">IN</div><div class="vi">Check-in</div>' +
                '</button>' +
                '<button type="button" class="cio-mode-btn btn-out" id="btn-out">' +
                  '<div class="ja">OUT</div><div class="vi">Check-out</div>' +
                '</button>' +
              '</div>' +

              '<div>' +
                '<div class="cio-label">' + escapeHtml(JV('担当者', 'Nhân viên')) + '</div>' +
                '<div id="employee-select-container"></div>' +
                '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:900;font-size:12px;">' +
                  '<input type="checkbox" id="cio-emp-default"> ' + escapeHtml(JV('デフォルト', 'Mặc định')) +
                '</label>' +
              '</div>' +

              '<div class="cio-row">' +
                '<div id="cio-face-status" class="cio-face-status">' + escapeHtml(JV('入力してください', 'Nhập trực tiếp')) + '</div>' +
                '<button type="button" class="cio-btn secondary" id="btn-face">' + escapeHtml(JV('FaceID', 'FaceID')) + '</button>' +
              '</div>' +

              '<div class="dest-group ' + destHiddenClass + '">' +
                '<div class="cio-label">' + escapeHtml(JV('行き先', 'Điểm đến')) + '</div>' +
                '<div id="destination-select-container"></div>' +
              '</div>' +

              '<div>' +
                '<div class="cio-label">' + escapeHtml(JV('メモ', 'Ghi chú')) + '</div>' +
                '<textarea id="cio-note" class="cio-control" rows="4" placeholder="..."></textarea>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="cio-actionbar">' +
        '<button type="button" class="cio-act cancel" id="btn-cancel"><div class="ja">キャンセル</div><div class="vi">Hủy</div></button>' +
        '<button type="button" class="cio-act relocate" id="btn-relocate"><div class="ja">移動</div><div class="vi">Đổi vị trí</div></button>' +
        '<button type="button" class="cio-act save" id="btn-save"><div class="ja">保存</div><div class="vi">Lưu</div></button>' +
      '</div>'
    );
  }

  function openModal(mode, item) {
    if (!item) {
      alert(JV('対象がありません', 'Không có đối tượng'));
      return;
    }

    ensureHistoryUnlockDefault();

    currentItem = item;
    currentMode = (mode === 'check-out') ? 'check-out' : 'check-in';
    _opened = true;

    var panel = ensureModalSkeleton();
    panel.innerHTML = buildModalHtml(currentMode, currentItem);

    var bd = document.getElementById('cio-backdrop');
    bd.classList.remove('hidden');
    panel.classList.remove('hidden');

    lockBodyScroll();

    applyModeButtons();
    initSelectsForMode(currentMode);

    applyHistoryLockState();
    renderHistory(currentItem);

    bindModalEvents(currentItem);
    bindViewportHeight();
    _scheduleVhApply();

    // initial focus
    setTimeout(function () {
      try {
        var el = document.getElementById('cio-history-search');
        if (el && !isMobile()) el.focus();
      } catch (e) {}
    }, 0);
  }

  function closeModal() {
    _opened = false;

    var bd = document.getElementById('cio-backdrop');
    var panel = document.getElementById('cio-panel');

    if (bd) bd.classList.add('hidden');
    if (panel) panel.classList.add('hidden');

    unlockBodyScroll();
    unbindViewportHeight();

    currentItem = null;
  }

  function lockBodyScroll() {
    try {
      if (_bodyPrevOverflow === null) _bodyPrevOverflow = document.body.style.overflow;
      if (_bodyPrevTouchAction === null) _bodyPrevTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } catch (e) {}
  }

  function unlockBodyScroll() {
    try {
      document.body.style.overflow = (_bodyPrevOverflow === null ? '' : _bodyPrevOverflow);
      document.body.style.touchAction = (_bodyPrevTouchAction === null ? '' : _bodyPrevTouchAction);
    } catch (e) {}
    _bodyPrevOverflow = null;
    _bodyPrevTouchAction = null;
  }

  // -----------------------------
  // Mode UI
  // -----------------------------
  function applyModeButtons() {
    var inBtn = document.getElementById('btn-in');
    var outBtn = document.getElementById('btn-out');
    if (inBtn) inBtn.classList.toggle('active', currentMode === 'check-in');
    if (outBtn) outBtn.classList.toggle('active', currentMode === 'check-out');

    var header = document.querySelector('#cio-panel .cio-header');
    if (header) {
      header.classList.toggle('check-in', currentMode === 'check-in');
      header.classList.toggle('check-out', currentMode === 'check-out');
      var title = header.querySelector('.cio-title');
      if (title) {
        var ja = title.querySelector('.ja');
        var vi = title.querySelector('.vi');
        if (ja) ja.textContent = (currentMode === 'check-in') ? 'チェックイン' : 'チェックアウト';
        if (vi) vi.textContent = (currentMode === 'check-in') ? 'Check-in' : 'Check-out';
      }
    }

    var destGroup = document.querySelector('#cio-panel .dest-group');
    if (destGroup) {
      if (currentMode === 'check-out') destGroup.classList.remove('is-hidden');
      else destGroup.classList.add('is-hidden');
    }
  }

  function switchMode(newMode) {
    currentMode = (newMode === 'check-out') ? 'check-out' : 'check-in';
    applyModeButtons();

    if (currentMode === 'check-out') {
      var destContainer = document.getElementById('destination-select-container');
      if (destContainer && destContainer.children.length === 0) initSelectsForMode('check-out');
    } else {
      var destEl = document.getElementById('cio-dest');
      if (destEl) {
        destEl.value = '';
        if (destEl.dataset) destEl.dataset.selectedId = '';
      }
    }

    _scheduleVhApply();
  }

  // -----------------------------
  // Selects (employee, destination)
  // -----------------------------
  function initSelectsForMode(mode) {
    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];
    var destList = dm && dm.data ? dm.data.destinations : [];

    var empContainer = document.getElementById('employee-select-container');
    if (empContainer) {
      empContainer.innerHTML = '';

      var empOptions = safeArray(empList).map(function (e) {
        return { id: String(e.EmployeeID), name: String(e.EmployeeName || e.name || e.EmployeeID) };
      });

      if (typeof global.createSearchableSelect === 'function') {
        try {
          var empSelect = global.createSearchableSelect('cio-emp', empOptions, function () {
            var faceStat = document.getElementById('cio-face-status');
            if (faceStat) {
              faceStat.textContent = JV('入力してください', 'Nhập trực tiếp');
              faceStat.classList.remove('confirmed');
            }
          });
          empContainer.appendChild(empSelect);

          var defEmpId = getDefaultEmpId();
          if (defEmpId) {
            setTimeout(function () {
              try { if (empSelect && typeof empSelect.setValue === 'function') empSelect.setValue(String(defEmpId)); } catch (e0) {}
              var chk = document.getElementById('cio-emp-default');
              if (chk) chk.checked = true;
            }, 0);
          }
        } catch (e1) {
          // fallback to native
          _renderNativeEmployeeSelect(empContainer, empOptions);
        }
      } else {
        _renderNativeEmployeeSelect(empContainer, empOptions);
      }
    }

    // Destination: reserve space always, create select only for checkout
    var destContainer = document.getElementById('destination-select-container');
    if (destContainer) {
      destContainer.innerHTML = '';

      if (mode === 'check-out') {
        var destOptions = safeArray(destList).map(function (d) {
          return { id: String(d.DestinationID), name: String(d.DestinationName || d.DestinationID) };
        });

        if (typeof global.createSearchableSelect === 'function') {
          try {
            var destSelect = global.createSearchableSelect('cio-dest', destOptions);
            destContainer.appendChild(destSelect);
          } catch (e2) {
            _renderNativeDestinationSelect(destContainer, destOptions);
          }
        } else {
          _renderNativeDestinationSelect(destContainer, destOptions);
        }
      }
    }

    _scheduleVhApply();
  }

  function _renderNativeEmployeeSelect(container, empOptions) {
    var sel = document.createElement('select');
    sel.id = 'cio-emp';
    sel.className = 'cio-control';

    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = JV('担当者を選択', 'Chọn nhân viên');
    sel.appendChild(ph);

    empOptions.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });

    container.appendChild(sel);

    var defEmp = getDefaultEmpId();
    if (defEmp) sel.value = String(defEmp);
  }

  function _renderNativeDestinationSelect(container, destOptions) {
    var sel2 = document.createElement('select');
    sel2.id = 'cio-dest';
    sel2.className = 'cio-control';

    var ph2 = document.createElement('option');
    ph2.value = '';
    ph2.textContent = JV('行き先を選択', 'Chọn điểm đến');
    sel2.appendChild(ph2);

    destOptions.forEach(function (o2) {
      var opt2 = document.createElement('option');
      opt2.value = o2.id;
      opt2.textContent = o2.name;
      sel2.appendChild(opt2);
    });

    container.appendChild(sel2);
  }

  // -----------------------------
  // History lock/unlock
  // -----------------------------
  function applyHistoryLockState() {
    var unlocked = isHistoryUnlocked();

    var wrap = document.getElementById('cio-history-wrap');
    if (wrap) wrap.classList.toggle('scroll-unlocked', unlocked);

    var table = document.getElementById('cio-history-table');
    if (table) {
      table.classList.toggle('cio-history-unlocked', unlocked);
      table.classList.toggle('cio-history-locked', !unlocked);
    }

    var btn = document.getElementById('cio-lock-btn');
    if (btn) {
      btn.textContent = unlocked ? '🔓' : '🔒';
      btn.setAttribute('aria-label', unlocked ? 'Unlock' : 'Lock');
      btn.title = unlocked ? JV('横スクロール ON', 'Cho phép cuộn ngang') : JV('横スクロール OFF', 'Khóa cuộn ngang');
    }
  }

  function toggleHistoryLock() {
    setHistoryUnlocked(!isHistoryUnlocked());
    applyHistoryLockState();
    _scheduleVhApply();
  }

  // -----------------------------
  // History render
  // -----------------------------
  function getLogsForItem(item) {
    var dm = global.DataManager;
    var logs = dm && dm.data ? dm.data.statuslogs : [];
    logs = safeArray(logs);

    var k = getItemKey(item);
    var id = normalizeId(k.id);
    if (!id) return [];

    var res = logs.filter(function (l) {
      if (!l) return false;
      if (k.itemType === 'mold') return normalizeId(l.MoldID) === id;
      if (k.itemType === 'cutter') return normalizeId(l.CutterID) === id;
      // fallback: try both
      return normalizeId(l.MoldID) === id || normalizeId(l.CutterID) === id;
    });

    return res;
  }

  function _sortLogs(logs, destList, empList) {
    var key = _hisSortKey;
    var dir = _hisSortDir;
    var mul = (dir === 'asc') ? 1 : -1;

    function val(l) {
      if (!l) return '';
      if (key === '_sync') {
        var pf = normalizeLogPendingFlag(l);
        if (pf.error) return 2;
        if (pf.pending) return 1;
        return 0;
      }
      if (key === 'EmployeeID') return getEmployeeName(l.EmployeeID, empList);
      if (key === 'DestinationID') return getDestinationName(l.DestinationID, destList);
      return l[key] !== undefined && l[key] !== null ? l[key] : '';
    }

    return logs.slice().sort(function (a, b) {
      var av = val(a);
      var bv = val(b);

      if (key === 'Timestamp') {
        var at = new Date(av).getTime();
        var bt = new Date(bv).getTime();
        if (isNaN(at)) at = 0;
        if (isNaN(bt)) bt = 0;
        return mul * (at - bt);
      }

      if (typeof av === 'number' || typeof bv === 'number') {
        return mul * ((Number(av) || 0) - (Number(bv) || 0));
      }

      return mul * String(av).localeCompare(String(bv), 'ja');
    });
  }

  function renderHistory(item) {
    var dm = global.DataManager;
    var destList = dm && dm.data ? dm.data.destinations : [];
    var empList = dm && dm.data ? dm.data.employees : [];

    var logs = getLogsForItem(item);

    // filter by query
    var q = String(_hisQuery || '').trim().toLowerCase();
    if (q) {
      logs = logs.filter(function (l) {
        var s = '';
        try {
          s += String(l.Timestamp || '') + ' ';
          s += String(l.Status || '') + ' ';
          s += String(getDestinationName(l.DestinationID, destList) || '') + ' ';
          s += String(getEmployeeName(l.EmployeeID, empList) || '') + ' ';
          s += String(l.Notes || '') + ' ';
        } catch (e) {}
        return s.toLowerCase().indexOf(q) >= 0;
      });
    }

    logs = _sortLogs(logs, destList, empList);

    var tbody = document.getElementById('cio-history-tbody');
    if (!tbody) return;

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:12px;opacity:.8;font-weight:900;">' + escapeHtml(JV('履歴なし', 'Chưa có lịch sử')) + '</td></tr>';
      return;
    }

    var unlocked = isHistoryUnlocked();

    var html = '';
    logs.forEach(function (l) {
      var status = String(l.Status || '').toUpperCase();
      var badgeCls = (status === 'IN') ? 'cio-b-in' : (status === 'OUT') ? 'cio-b-out' : '';

      var destName = getDestinationName(l.DestinationID, destList);
      var empName = getEmployeeName(l.EmployeeID, empList);

      var pf = normalizeLogPendingFlag(l);
      var syncDot = '<span class="cio-sync-dot synced">●</span>';
      if (pf.error) syncDot = '<span class="cio-sync-dot error" title="error">●</span>';
      else if (pf.pending) syncDot = '<span class="cio-sync-dot pending" title="pending">●</span>';

      var delBtn = '';
      if (unlocked) {
        delBtn = '<button type="button" class="cio-delete-btn" data-del-ts="' + escapeHtml(String(l.Timestamp || '')) + '" data-del-local="' + escapeHtml(String(pf.localId || '')) + '">✕</button>';
      } else {
        delBtn = '<span style="opacity:.25">—</span>';
      }

      html += '<tr>' +
        '<td>' + escapeHtml(fmt(l.Timestamp)) + '</td>' +
        '<td><span class="cio-status-badge ' + badgeCls + '">' + escapeHtml(status || '-') + '</span></td>' +
        '<td>' + escapeHtml(destName || '-') + '</td>' +
        '<td>' + escapeHtml(empName || '-') + '</td>' +
        '<td class="cio-note-cell">' + escapeHtml(String(l.Notes || '')) + '</td>' +
        '<td class="col-sync">' + syncDot + '</td>' +
        '<td class="col-del">' + delBtn + '</td>' +
      '</tr>';
    });

    tbody.innerHTML = html;

    bindHistoryHeaderSort();
    bindHistoryDeleteButtons(item);
  }

  function bindHistoryHeaderSort() {
    var table = document.getElementById('cio-history-table');
    if (!table) return;

    if (table.dataset.sortBound === '1') return;
    table.dataset.sortBound = '1';

    table.querySelectorAll('thead th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (!k) return;

        if (_hisSortKey === k) {
          _hisSortDir = (_hisSortDir === 'asc') ? 'desc' : 'asc';
        } else {
          _hisSortKey = k;
          _hisSortDir = 'desc';
        }

        if (currentItem) renderHistory(currentItem);
      });
    });
  }

  function bindHistoryDeleteButtons(item) {
    var tbody = document.getElementById('cio-history-tbody');
    if (!tbody) return;

    // event delegation
    if (tbody.dataset.delBound === '1') return;
    tbody.dataset.delBound = '1';

    tbody.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;

      // If click icon inside button, move up
      if (t && t.closest) t = t.closest('button[data-del-ts]') || t;

      if (!t || !t.getAttribute) return;
      var ts = t.getAttribute('data-del-ts');
      if (!ts) return;

      var localId = t.getAttribute('data-del-local') || '';

      var ok = confirm(JV('この履歴を削除しますか？', 'Bạn có chắc muốn xóa lịch sử này không?'));
      if (!ok) return;

      deleteLog(item, ts, localId);
    });
  }

  function refreshHistoryInPlace(item) {
    if (!item) item = currentItem;
    if (!item) return;
    renderHistory(item);
  }

  // -----------------------------
  // Delete log
  // -----------------------------
  function _removeLogFromLocal(timestamp, localId) {
    try {
      if (global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.remove === 'function' && localId) {
        global.DataManager.PendingCache.remove(localId);
      }
    } catch (e0) {}

    try {
      if (global.DataManager && global.DataManager.data && Array.isArray(global.DataManager.data.statuslogs)) {
        global.DataManager.data.statuslogs = global.DataManager.data.statuslogs.filter(function (l) {
          var lid = String(l && (l._localId || l.localId || '') || '');
          if (localId && lid && lid === String(localId)) return false;
          return String(l && (l.Timestamp || '') || '') !== String(timestamp);
        });
      }
      if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e1) {}
  }

  function deleteLog(item, timestamp, localId) {
    if (!item) return;

    // If pending local -> delete locally
    if (localId) {
      _removeLogFromLocal(timestamp, localId);
      showBilingualToast('deleted');
      setLastActionTime();
      refreshHistoryInPlace(item);
      try {
        var k0 = getItemKey(item);
        document.dispatchEvent(new CustomEvent('detailchanged', { detail: { item: item, itemType: k0.itemType, itemId: k0.id, source: 'checkin-delete-local' } }));
      } catch (e0) {}
      return;
    }

    showBilingualToast('deleting');

    var cfg = getCfg();
    var k = getItemKey(item);

    fetch(cfg.deleteApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemType: k.itemType,
        MoldID: (k.itemType === 'mold') ? k.id : null,
        CutterID: (k.itemType === 'cutter') ? k.id : null,
        Timestamp: timestamp
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rj) {
        if (!rj || !rj.success) throw new Error(rj && rj.message ? rj.message : 'Delete failed');

        _removeLogFromLocal(timestamp, '');

        showBilingualToast('deleted');
        setLastActionTime();
        refreshHistoryInPlace(item);

        try {
          document.dispatchEvent(new CustomEvent('detailchanged', { detail: { item: item, itemType: k.itemType, itemId: k.id, source: 'checkin-delete' } }));
        } catch (e2) {}
      })
      .catch(function (err) {
        console.warn('[CheckInOut] delete failed', err);
        showBilingualToast('error');
      });
  }

  // -----------------------------
  // FaceID (mock)
  // -----------------------------
  function mockFaceID(empList) {
    empList = safeArray(empList);
    var empSel = document.getElementById('cio-emp');
    var faceStat = document.getElementById('cio-face-status');

    if (!empSel || !empList.length) {
      alert(JV('担当者リストが空です', 'Danh sách nhân viên trống'));
      return;
    }

    var rnd = Math.floor(Math.random() * empList.length);
    var emp = empList[rnd];
    var empId = String(emp.EmployeeID || '').trim();
    if (!empId) return;

    try {
      empSel.value = empId;
      if (empSel.dataset) empSel.dataset.selectedId = empId;
    } catch (e0) {}

    if (faceStat) {
      faceStat.textContent = JV('Face ID 確認', 'Face ID xác nhận');
      faceStat.classList.add('confirmed');
    }

    var defChk = document.getElementById('cio-emp-default');
    if (defChk) defChk.checked = empId === String(getDefaultEmpId() || '');
  }

  // -----------------------------
  // Save
  // -----------------------------
  function validateInputs(mode) {
    var empInput = document.getElementById('cio-emp');
    var destInput = document.getElementById('cio-dest');

    var empId = parseSelectedIdFromSearchableInput(empInput);
    var destId = (mode === 'check-out') ? parseSelectedIdFromSearchableInput(destInput) : '';

    if (!empId) {
      alert(JV('担当者を選択してください', 'Vui lòng chọn nhân viên'));
      return null;
    }

    if (mode === 'check-out' && !destId) {
      alert(JV('行き先を選択してください', 'Vui lòng chọn điểm đến khi Check-out'));
      return null;
    }

    return { empId: empId, destId: destId };
  }

  function saveRecord(item) {
    if (!item) return;

    var key = getItemKey(item);
    if (!key.id) {
      alert(JV('IDが見つかりません', 'Không tìm thấy ID Mold/Cutter'));
      return;
    }

    var input = validateInputs(currentMode);
    if (!input) return;

    var empId = input.empId;
    var destId = input.destId;

    var noteInput = document.getElementById('cio-note');
    var notes = String(noteInput ? noteInput.value : '').trim();

    var ts = new Date().toISOString();
    var status = (currentMode === 'check-in') ? 'IN' : 'OUT';

    var logData = {
      StatusLogID: 'S' + Date.now(),
      Timestamp: ts,
      MoldID: (key.itemType === 'mold') ? key.id : null,
      CutterID: (key.itemType === 'cutter') ? key.id : null,
      Status: status,
      DestinationID: (currentMode === 'check-out') ? destId : 'AREA-MOLDROOM',
      EmployeeID: empId,
      Notes: notes
    };

    // 1) add pending
    var pending = null;
    try {
      if (global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.add === 'function') {
        pending = global.DataManager.PendingCache.add(logData);
      } else {
        if (global.DataManager && global.DataManager.data) {
          if (!Array.isArray(global.DataManager.data.statuslogs)) global.DataManager.data.statuslogs = [];
          pending = Object.assign({}, logData, {
            _pending: true,
            _localId: 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
            _createdAt: new Date().toISOString()
          });
          global.DataManager.data.statuslogs.unshift(pending);
        }
      }

      if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e1) {}

    // default emp
    var defChk = document.getElementById('cio-emp-default');
    if (defChk && defChk.checked) setDefaultEmpId(empId);

    refreshHistoryInPlace(item);
    showBilingualToast('pending');
    setLastActionTime();

    // 2) sync
    var cfg = getCfg();
    fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: currentMode,
        itemType: key.itemType,
        MoldID: logData.MoldID,
        CutterID: logData.CutterID,
        Timestamp: logData.Timestamp,
        Status: logData.Status,
        DestinationID: logData.DestinationID,
        EmployeeID: logData.EmployeeID,
        Notes: logData.Notes
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rj) {
        if (!rj || !rj.success) throw new Error(rj && rj.message ? rj.message : 'Sync failed');

        try {
          var localId = String((pending && (pending._localId || pending.localId)) || '');
          if (localId && global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.remove === 'function') {
            global.DataManager.PendingCache.remove(localId);
          }

          if (rj.newStatusLog && global.DataManager && global.DataManager.data) {
            if (!Array.isArray(global.DataManager.data.statuslogs)) global.DataManager.data.statuslogs = [];
            global.DataManager.data.statuslogs.unshift(rj.newStatusLog);
          }

          if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
        } catch (e2) {}

        showBilingualToast('saved');
        refreshHistoryInPlace(item);

        try {
          document.dispatchEvent(new CustomEvent('detailchanged', {
            detail: { item: item, itemType: key.itemType, itemId: key.id, source: 'checkin-save' }
          }));
        } catch (e3) {}
      })
      .catch(function (err) {
        try {
          var localId = String((pending && (pending._localId || pending.localId)) || '');
          if (localId && global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.markError === 'function') {
            global.DataManager.PendingCache.markError(localId, err && err.message ? err.message : 'Sync error');
          } else if (pending) {
            pending._syncError = err && err.message ? err.message : 'Sync error';
            pending._syncErrorAt = new Date().toISOString();
          }
          if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
        } catch (e4) {}

        console.warn('[CheckInOut] sync failed', err);
        showBilingualToast('error');
        refreshHistoryInPlace(item);
      });
  }

  // -----------------------------
  // Events
  // -----------------------------
  function bindModalEvents(item) {
    var panel = document.getElementById('cio-panel');
    var backdrop = document.getElementById('cio-backdrop');

    if (backdrop && backdrop.dataset.bound !== '1') {
      backdrop.dataset.bound = '1';
      backdrop.addEventListener('click', function () { closeModal(); });
    }

    var closeBtn = document.getElementById('cio-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    var cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    var lockBtn = document.getElementById('cio-lock-btn');
    if (lockBtn) lockBtn.addEventListener('click', toggleHistoryLock);

    // Search
    var search = document.getElementById('cio-history-search');
    if (search) {
      search.addEventListener('input', function () {
        _hisQuery = String(search.value || '');
        renderHistory(item);
      });
    }

    // Refresh
    var refreshBtn = document.getElementById('cio-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refreshBtn.disabled = true;
        var old = refreshBtn.textContent;
        refreshBtn.textContent = '...';

        var p;
        if (global.DataManager && typeof global.DataManager.loadAllData === 'function') p = global.DataManager.loadAllData();
        else p = Promise.resolve();

        p.then(function () {
          refreshHistoryInPlace(item);
          showBilingualToast('refreshed');
        }).catch(function () {
          showBilingualToast('error');
        }).finally(function () {
          setTimeout(function () {
            refreshBtn.textContent = old;
            refreshBtn.disabled = false;
          }, 700);
        });
      });
    }

    // FaceID
    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];
    var faceBtn = document.getElementById('btn-face');
    if (faceBtn) faceBtn.addEventListener('click', function () { mockFaceID(empList); });

    // Save
    var saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveRecord(item); });

    // Mode switch
    var inBtn = document.getElementById('btn-in');
    var outBtn = document.getElementById('btn-out');
    if (inBtn) inBtn.addEventListener('click', function () { if (currentMode !== 'check-in') switchMode('check-in'); });
    if (outBtn) outBtn.addEventListener('click', function () { if (currentMode !== 'check-out') switchMode('check-out'); });

    // Relocate
    var relocateBtn = document.getElementById('btn-relocate');
    if (relocateBtn) {
      relocateBtn.addEventListener('click', function () {
        closeModal();
        if (global.LocationManager && typeof global.LocationManager.openModal === 'function') {
          global.LocationManager.openModal(item);
        } else {
          alert(JV('LocationManager が見つかりません', 'Không tìm thấy LocationManager'));
        }
      });
    }

    // Default employee
    var defChk = document.getElementById('cio-emp-default');
    if (defChk) {
      defChk.addEventListener('change', function () {
        var empInput = document.getElementById('cio-emp');
        var id = parseSelectedIdFromSearchableInput(empInput);
        if (defChk.checked) {
          if (id) setDefaultEmpId(id);
        } else {
          clearDefaultEmpId();
        }
      });
    }

    // ESC
    if (!document.body.dataset.cioEscBound) {
      document.body.dataset.cioEscBound = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          var p = document.getElementById('cio-panel');
          if (p && !p.classList.contains('hidden')) closeModal();
        }
      });
    }

    // Swipe down on header to close (mobile friendly)
    if (panel && panel.dataset.swipeBound !== '1') {
      panel.dataset.swipeBound = '1';

      var header = panel.querySelector('.cio-header');
      if (header) {
        var startX = 0;
        var startY = 0;
        var tracking = false;

        header.addEventListener('pointerdown', function (ev) {
          try {
            tracking = true;
            startX = ev.clientX;
            startY = ev.clientY;
          } catch (e0) {}
        }, { passive: true });

        header.addEventListener('pointermove', function (ev) {
          if (!tracking) return;
          var dx = (ev.clientX - startX);
          var dy = (ev.clientY - startY);
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            tracking = false;
            return;
          }
          if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
            tracking = false;
            closeModal();
          }
        }, { passive: true });

        header.addEventListener('pointerup', function () { tracking = false; }, { passive: true });
        header.addEventListener('pointercancel', function () { tracking = false; }, { passive: true });
      }
    }

    _scheduleVhApply();
  }

  // -----------------------------
  // Public API
  // -----------------------------
  var CheckInOut = {
    version: VERSION,
    openModal: openModal,
    close: closeModal,
    refreshHistoryInPlace: refreshHistoryInPlace,
    init: function () {
      console.log('checkin-checkout ' + VERSION + ' loaded');
    }
  };

  global.CheckInOut = CheckInOut;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { CheckInOut.init(); }, { once: true });
  } else {
    CheckInOut.init();
  }

})(window);
