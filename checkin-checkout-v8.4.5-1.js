/*
checkin-checkout-v8.4.5-1.js

MoldCutterSearch - Check-in / Check-out modal
Layout: PA1 (2 cột)

Fixes (theo yêu cầu 2026-02-24):
- Z-index tăng rất cao để popup không bị ẩn dưới Detail Panel.
- Lock/Unlock hoạt động đúng: LOCK khóa cuộn ngang + ẩn cột Sync/Xóa; UNLOCK cho cuộn ngang + hiện Sync/Xóa.
- Cảnh báo/confirm hỗ trợ tiếng Nhật (JP/VN song ngữ).
- Nút IN/OUT dạng toggle, có màu nền rõ ràng, hiển thị Nhật-Việt.
- Khi chuyển chế độ Check-out có thêm “Chọn nơi đến”: không làm nhảy UI (giữ chỗ cố định), ưu tiên tăng vùng nhập liệu.

Yêu cầu hệ thống:
- window.DataManager (data-manager-v8.4.x)
- (tùy chọn) window.createSearchableSelect
- (tùy chọn) window.LocationManager.openModal(item)

Public API:
- window.CheckInOut.openModal(mode, item)   mode: 'check-in' | 'check-out'
- window.CheckInOut.close()
- window.CheckInOut.refreshHistoryInPlace(item)
*/

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5-1';

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

  var SESSION_KEY_LAST_ACTION = 'checkinlastactiontimestamp';
  var STORAGE_KEY_DEFAULT_EMP = 'ciodefault-employee-id';
  var STORAGE_KEY_HIS_UNLOCK = 'ciohistory-unlocked';
  var STORAGE_KEY_HIS_INITED = 'ciohistory-unlock-inited';

  // -----------------------------
  // Storage safe (fallback nếu localStorage bị chặn)
  // -----------------------------
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
  function JV(ja, vi) {
    return String(ja || '') + ' / ' + String(vi || '');
  }

  // -----------------------------
  // UTILS
  // -----------------------------
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function safeArray(x) {
    return Array.isArray(x) ? x : [];
  }

  function normalizeId(v) {
    return String(v === null || v === undefined ? '' : v).trim();
  }

  function getField(obj, keys, fallback) {
    if (!obj) return fallback;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (obj[k] !== null && obj[k] !== undefined && obj[k] !== '') return obj[k];
    }
    return fallback;
  }

  function isMobile() {
    return (window.innerWidth || 0) <= 900;
  }

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
        // Nếu đang lỗi đột xuất, vẫn trả về memory
        return _cio_mem_his_unlocked === true;
      }
    }
    return _cio_mem_his_unlocked === true;
  }

  function setHistoryUnlocked(v) {
    _cio_mem_his_unlocked = !!v;

    if (_cioStorageOk()) {
      try {
        localStorage.setItem(STORAGE_KEY_HIS_UNLOCK, _cio_mem_his_unlocked ? '1' : '0');
      } catch (e) {}
    }
  }

  function ensureHistoryUnlockDefault() {
    // Nếu localStorage dùng được: dùng key INITED như hiện tại
    if (_cioStorageOk()) {
      try {
        if (localStorage.getItem(STORAGE_KEY_HIS_INITED) === '1') return;
        setHistoryUnlocked(!isMobile()); // Desktop: UNLOCK, Mobile: LOCK
        localStorage.setItem(STORAGE_KEY_HIS_INITED, '1');
      } catch (e) {}
      return;
    }

    // Nếu localStorage bị chặn: chỉ init 1 lần bằng memory
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
    return { itemType: 'unknown', id: '', idField: '' };
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

    // Prefer notify.* if exists
    try {
      if (global.notify && typeof global.notify === 'object') {
        var msg = msgVi + ' / ' + msgJa;
        if (cls === 'success' && typeof global.notify.success === 'function') return global.notify.success(msg);
        if (cls === 'warning' && typeof global.notify.warning === 'function') return global.notify.warning(msg);
        if (cls === 'error' && typeof global.notify.error === 'function') return global.notify.error(msg);
        if (typeof global.notify.info === 'function') return global.notify.info(msg);
      }
    } catch (e0) {}

    // Fallback NotificationModule.show
    try {
      if (global.NotificationModule && typeof global.NotificationModule.show === 'function') {
        global.NotificationModule.show(msgVi + ' / ' + msgJa, cls);
        return;
      }
    } catch (e1) {}

    // Simple DOM toast
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
  // CSS loading
  // -----------------------------
  function injectInlineCssFallback() {
    var id = 'cio-style-inline-v8.4.5-1';
    if (document.getElementById(id)) return;

    var css = '';
    css += ':root{--cio-font:Inter,"Be Vietnam Pro","Hiragino Sans","Yu Gothic UI",Meiryo,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;';
    css += '--cio-z-backdrop:500000;--cio-z-dialog:500001;';
    css += '--cio-border:rgba(2,6,23,0.10);--cio-surface:#fff;--cio-surface-2:#f8fafc;';
    css += '--cio-text:#0b1220;--cio-muted:#64748b;';
    css += '--cio-accent:#0f766e;--cio-accent-hover:#0a5c56;';
    css += '--cio-success:#16a34a;--cio-danger:#ef4444;--cio-warning:#f59e0b;';
    css += '--cio-shadow:0 14px 34px rgba(2,6,23,0.14);--cio-shadow-sm:0 2px 10px rgba(2,6,23,0.10);';
    css += '--cio-r:14px;--cio-gap:10px;--cio-pad:12px;}';

    css += '.cio-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:var(--cio-z-backdrop);}';
    css += '.cio-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:96%;max-width:1400px;height:90vh;max-height:920px;';
    css += 'background:var(--cio-surface);border:1px solid var(--cio-border);border-radius:var(--cio-r);box-shadow:var(--cio-shadow);z-index:var(--cio-z-dialog);';
    css += 'display:flex;flex-direction:column;overflow:hidden;font-family:var(--cio-font);color:var(--cio-text);}';

    css += '.cio-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;color:#fff;user-select:none;touch-action:pan-y;cursor:grab;}';
    css += '.cio-header:active{cursor:grabbing;}';
    css += '.cio-header.check-in{background:linear-gradient(135deg,var(--cio-success),#0f8a4a);}';
    css += '.cio-header.check-out{background:linear-gradient(135deg,var(--cio-danger),#c81e1e);}';

    css += '.cio-title{display:flex;flex-direction:column;line-height:1.05;}';
    css += '.cio-title .ja{font-size:16px;font-weight:950;}';
    css += '.cio-title .vi{font-size:11px;font-weight:900;opacity:.95;}';

    css += '.cio-header-actions{display:flex;gap:8px;align-items:center;}';
    css += '.cio-icon-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:12px;padding:6px 10px;cursor:pointer;font-weight:950;transition:transform .15s ease,background .15s ease;}';
    css += '.cio-icon-btn:hover{background:rgba(255,255,255,.22);transform:translateY(-1px);}';

    css += '.cio-main{flex:1;min-height:0;background:var(--cio-surface-2);padding:var(--cio-gap);display:grid;grid-template-columns:minmax(520px,1fr) 460px;gap:var(--cio-gap);overflow:hidden;}';

    css += '.cio-card{background:var(--cio-surface);border:1px solid var(--cio-border);border-radius:var(--cio-r);box-shadow:var(--cio-shadow-sm);overflow:hidden;min-height:0;display:flex;flex-direction:column;}';
    css += '.cio-card-head{padding:10px 12px;border-bottom:1px solid var(--cio-border);display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(180deg,rgba(2,6,23,0.02),transparent);}';
    css += '.cio-card-title{font-weight:950;font-size:13px;display:flex;flex-direction:column;line-height:1.05;}';
    css += '.cio-card-title .ja{font-size:13px;font-weight:950;}';
    css += '.cio-card-title .vi{font-size:10px;font-weight:900;opacity:.78;color:var(--cio-muted);}';

    css += '.cio-history-controls{display:flex;gap:8px;align-items:center;min-width:0;flex:1;justify-content:flex-end;}';
    css += '.cio-search{width:100%;max-width:520px;min-width:220px;padding:9px 10px;border-radius:12px;border:2px solid rgba(245,158,11,.55);background:#FFF7DB;font-weight:900;color:var(--cio-text);}';
    css += '.cio-search:focus{outline:none;border-color:var(--cio-warning);box-shadow:0 0 0 3px rgba(245,158,11,.20);background:var(--cio-surface);}';
    css += '.cio-lock{flex-shrink:0;border:1px solid rgba(79,70,229,.25);border-radius:12px;padding:9px 12px;background:rgba(79,70,229,.10);color:rgba(11,18,32,.92);font-weight:950;cursor:pointer;display:flex;align-items:center;gap:8px;}';
    css += '.cio-lock:hover{background:rgba(79,70,229,.16);}';

    css += '.cio-history-wrap{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;}';
    css += '.cio-history-wrap.scroll-unlocked{overflow-x:auto;touch-action:pan-x pan-y;}';

    css += '.cio-history-table{border-collapse:collapse;font-size:12px;background:var(--cio-surface);}';
    css += '.cio-history-wrap:not(.scroll-unlocked) .cio-history-table{width:100%;table-layout:fixed;}';
    css += '.cio-history-wrap.scroll-unlocked .cio-history-table{width:max-content;min-width:920px;}';

    css += '.cio-history-table thead th{position:sticky;top:0;z-index:5;background:var(--cio-accent);color:#fff;font-size:11px;font-weight:950;text-align:left;padding:8px 8px;white-space:nowrap;cursor:pointer;}';
    css += '.cio-history-table thead th:hover{background:var(--cio-accent-hover);}';
    css += '.cio-history-table tbody td{padding:7px 8px;border-bottom:1px solid rgba(2,6,23,0.08);vertical-align:middle;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}';
    css += '.cio-history-table tbody tr:nth-child(odd){background:rgba(2,6,23,.02);}';
    css += '.cio-history-table tbody tr:hover{background:rgba(15,118,110,.08);}';

    css += '.cio-note-cell{max-width:360px;}';
    css += '.cio-history-wrap.scroll-unlocked .cio-note-cell{max-width:none;overflow:visible;text-overflow:clip;}';

    css += '.cio-status-badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:999px;font-weight:950;font-size:11px;border:1px solid rgba(0,0,0,.10);background:rgba(0,0,0,.03);min-width:46px;}';
    css += '.cio-b-in{border-color:rgba(22,163,74,.30);background:rgba(22,163,74,.12);color:#14532d;}';
    css += '.cio-b-out{border-color:rgba(239,68,68,.30);background:rgba(239,68,68,.10);color:#7f1d1d;}';
    css += '.cio-b-audit{border-color:rgba(2,132,199,.30);background:rgba(2,132,199,.10);color:#075985;}';
    css += '.cio-b-unknown{border-color:rgba(100,116,139,.30);background:rgba(100,116,139,.10);color:#334155;}';

    css += '.cio-sync-dot{font-weight:950;font-size:14px;display:inline-block;}';
    css += '.cio-sync-dot.synced{color:var(--cio-success);}';
    css += '.cio-sync-dot.pending{color:var(--cio-warning);animation:cio-pulse 1.5s ease-in-out infinite;}';
    css += '.cio-sync-dot.error{color:var(--cio-danger);}';
    css += '@keyframes cio-pulse{0%,100%{opacity:1}50%{opacity:.45}}';

    css += '.cio-delete-btn{border:none;background:none;color:var(--cio-danger);cursor:pointer;font-size:16px;font-weight:950;padding:2px 6px;border-radius:10px;}';
    css += '.cio-delete-btn:hover{background:rgba(239,68,68,.10);transform:scale(1.05);}';

    // Lock/unlock strong selectors
    css += '#cio-panel .cio-history-table.cio-history-locked th.col-sync, #cio-panel .cio-history-table.cio-history-locked td.col-sync, #cio-panel .cio-history-table.cio-history-locked th.col-del, #cio-panel .cio-history-table.cio-history-locked td.col-del{display:none !important;}';
    css += '#cio-panel .cio-history-table.cio-history-unlocked th.col-sync, #cio-panel .cio-history-table.cio-history-unlocked td.col-sync, #cio-panel .cio-history-table.cio-history-unlocked th.col-del, #cio-panel .cio-history-table.cio-history-unlocked td.col-del{display:table-cell !important;}';

    css += '.cio-right{min-height:0;display:flex;flex-direction:column;gap:var(--cio-gap);}';

    css += '.cio-status-box{padding:12px;display:grid;gap:8px;max-height:160px;overflow:auto;}';
    css += '.cio-kv{display:grid;grid-template-columns:108px 1fr;gap:10px;align-items:center;}';
    css += '.cio-k{font-size:11px;font-weight:950;color:var(--cio-muted);}';
    css += '.cio-v{border:1px solid rgba(2,6,23,0.10);background:var(--cio-surface);border-radius:12px;padding:8px 10px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
    css += '.cio-v.wrap{white-space:normal;}';

    css += '.cio-input-card{flex:1;min-height:0;}';
    css += '.cio-input-scroll{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}';

    css += '.cio-mode-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;}';
    css += '.cio-mode-btn{border:1px solid rgba(2,6,23,0.12);border-radius:12px;padding:10px 10px;font-weight:950;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;line-height:1.05;}';
    css += '.cio-mode-btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(2,6,23,0.10);}';
    css += '.cio-mode-btn .ja{font-size:12px;font-weight:950;white-space:nowrap;}';
    css += '.cio-mode-btn .vi{font-size:10px;font-weight:900;opacity:.90;white-space:nowrap;}';
    css += '.cio-mode-btn.btn-in{background:rgba(22,163,74,.10);border-color:rgba(22,163,74,.28);}';
    css += '.cio-mode-btn.btn-out{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.24);}';
    css += '.cio-mode-btn.btn-in.active{background:rgba(22,163,74,.18);border-color:rgba(22,163,74,.55);box-shadow:0 0 0 3px rgba(22,163,74,.14);}';
    css += '.cio-mode-btn.btn-out.active{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.50);box-shadow:0 0 0 3px rgba(239,68,68,.12);}';

    css += '.dest-group{min-height:74px;display:grid;gap:6px;}';
    css += '.dest-group.is-hidden{visibility:hidden;opacity:0;pointer-events:none;}';

    css += '.cio-label{font-weight:950;color:var(--cio-text);font-size:12px;}';
    css += '.cio-control{width:100%;border:1px solid rgba(2,6,23,0.12);border-radius:12px;padding:10px 10px;font-weight:900;font-size:13px;background:var(--cio-surface);color:var(--cio-text);}';
    css += '.cio-control:focus{outline:none;border-color:rgba(15,118,110,.55);box-shadow:0 0 0 3px rgba(15,118,110,.20);}';
    css += '.cio-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;}';

    css += '.cio-btn{border:none;border-radius:12px;padding:10px 10px;font-weight:950;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,filter .15s ease;display:flex;align-items:center;justify-content:center;gap:6px;}';
    css += '.cio-btn:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(2,6,23,0.12);}';
    css += '.cio-btn:active{transform:translateY(0);}';
    css += '.cio-btn.secondary{background:rgba(100,116,139,.14);color:#0b1220;}';

    css += '.cio-actionbar{flex-shrink:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 12px;border-top:1px solid var(--cio-border);background:linear-gradient(to top,rgba(248,250,252,1),rgba(255,255,255,1));}';
    css += '.cio-act{border:none;border-radius:12px;padding:10px 10px;font-weight:950;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:44px;transition:transform .15s ease,box-shadow .15s ease,filter .15s ease;}';
    css += '.cio-act:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(2,6,23,0.12);}';
    css += '.cio-act:active{transform:translateY(0);}';
    css += '.cio-act .ja{font-size:12px;font-weight:950;white-space:nowrap;}';
    css += '.cio-act .vi{font-size:10px;font-weight:900;opacity:.95;white-space:nowrap;}';
    css += '.cio-act.cancel{background:rgba(100,116,139,.14);color:#0b1220;}';
    css += '.cio-act.relocate{background:rgba(245,158,11,.92);color:#fff;}';
    css += '.cio-act.save{background:rgba(15,118,110,.96);color:#fff;}';

    css += '.hidden{display:none !important;}';

    css += '@media (max-width:900px){';
    css += '.cio-panel{top:0;left:0;transform:none;width:100%;height:100%;max-width:100%;max-height:100%;border-radius:0;}';
    css += '.cio-main{display:flex;flex-direction:column;gap:10px;padding:10px;overflow:auto;}';
    css += '.cio-search{max-width:none;min-width:0;}';
    css += '.cio-right{order:1;}';
    css += '.cio-history-card{order:2;min-height:46vh;}';
    css += '.cio-actionbar{position:sticky;bottom:0;z-index:3;}';
    css += '}';

    var style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureCssLoaded() {
    var linkId = 'cio-style-link-v8.4.5-1';
    if (document.getElementById(linkId) || document.getElementById('cio-style-inline-v8.4.5-1')) return;

    try {
      var link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'checkin-checkout-v8.4.5-1.css';
      link.onload = function () {};
      link.onerror = function () {
        try { link.remove(); } catch (e0) {}
        injectInlineCssFallback();
      };
      document.head.appendChild(link);

      // Fallback for local file mode
      setTimeout(function () {
        if (document.getElementById('cio-style-inline-v8.4.5-1')) return;
        var probe = document.createElement('div');
        probe.className = 'cio-panel';
        probe.style.position = 'fixed';
        probe.style.left = '-9999px';
        probe.style.top = '-9999px';
        document.body.appendChild(probe);
        var z = getComputedStyle(probe).zIndex;
        probe.remove();
        if (!z || z === 'auto') injectInlineCssFallback();
      }, 350);
    } catch (e1) {
      injectInlineCssFallback();
    }
  }

  // -----------------------------
  // DATA - pending + history
  // -----------------------------
  function getPendingLogs() {
    try {
      var dm = global.DataManager;
      if (!dm) return [];
      if (dm.PendingCache && Array.isArray(dm.PendingCache.logs)) return dm.PendingCache.logs;
      var logs = dm.data && dm.data.statuslogs ? dm.data.statuslogs : [];
      return safeArray(logs).filter(function (l) { return l && l.pending === true; });
    } catch (e) {
      return [];
    }
  }

  function getAllStatusLogs() {
    try {
      var dm = global.DataManager;
      if (!dm || !dm.data) return [];
      return safeArray(dm.data.statuslogs);
    } catch (e) {
      return [];
    }
  }

  function getHistoryLogsForItem(item) {
    var key = getItemKey(item);
    if (!key.id || key.itemType === 'unknown') return [];

    var allLogs = getAllStatusLogs();
    var pendingLogs = getPendingLogs();

    function isMatch(l) {
      if (!l) return false;
      if (key.itemType === 'mold') return normalizeId(l.MoldID) === key.id;
      if (key.itemType === 'cutter') return normalizeId(l.CutterID) === key.id;
      return false;
    }

    var pending = safeArray(pendingLogs).filter(function (p) {
      return p && p.pending === true && isMatch(p);
    });

    var real = safeArray(allLogs).filter(function (l) {
      return isMatch(l) && l.pending !== true;
    });

    var merged = pending.concat(real);
    merged.sort(function (a, b) {
      var ta = Date.parse(a.Timestamp || a.createdAt || a.DateEntry || 0) || 0;
      var tb = Date.parse(b.Timestamp || b.createdAt || b.DateEntry || 0) || 0;
      return tb - ta;
    });

    return merged;
  }

  // -----------------------------
  // HISTORY TABLE
  // -----------------------------
  function buildHistoryRows(logs, empList) {
    logs = safeArray(logs);

    return logs.map(function (l) {
      var statusRaw = String(l.Status || '').trim();
      var up = statusRaw.toUpperCase();

      var badgeClass = 'cio-b-unknown';
      var badgeText = statusRaw || '-';

      if (up === 'IN' || up === 'CHECKIN' || statusRaw.toLowerCase() === 'check-in') {
        badgeClass = 'cio-b-in';
        badgeText = 'IN';
      } else if (up === 'OUT' || up === 'CHECKOUT' || statusRaw.toLowerCase() === 'check-out') {
        badgeClass = 'cio-b-out';
        badgeText = 'OUT';
      } else if (up === 'AUDIT' || (l && l.AuditType)) {
        badgeClass = 'cio-b-audit';
        badgeText = l.AuditType ? String(l.AuditType) : 'AUDIT';
      }

      var isPending = l.pending === true;
      var hasError = !!l.syncError;

      var syncClass = 'synced';
      var syncTitle = 'Synced';
      var syncIcon = '●';

      if (hasError) {
        syncClass = 'error';
        syncTitle = String(l.syncError || 'Sync error');
        syncIcon = '!';
      } else if (isPending) {
        syncClass = 'pending';
        syncTitle = '同期中 / Đang đồng bộ';
        syncIcon = '◐';
      }

      var empId = getField(l, ['EmployeeID', 'employeeId'], '');
      var notes = getField(l, ['Notes', 'notes'], '-');
      var ts = String(l.Timestamp || '');

      var syncTd = '<td class="col-sync" style="width:68px"><span class="cio-sync-dot ' + escapeHtml(syncClass) + '" title="' + escapeHtml(syncTitle) + '">' + escapeHtml(syncIcon) + '</span></td>';

      var delTd = '<td class="col-del" style="width:56px;text-align:center">';
      if (!isPending) {
        delTd += '<button class="cio-delete-btn btn-delete-history" data-time="' + encodeURIComponent(String(ts)) + '" title="削除 / Xóa">🗑</button>';
      }
      delTd += '</td>';

      var rowCls = isPending ? 'row-pending' : '';
      if (hasError) rowCls += ' row-error';

      return (
        '<tr data-time="' + escapeHtml(ts) + '" class="' + escapeHtml(rowCls.trim()) + '">' +
          '<td style="width:160px">' + escapeHtml(fmt(ts)) + '</td>' +
          '<td style="width:84px"><span class="cio-status-badge ' + escapeHtml(badgeClass) + '">' + escapeHtml(badgeText) + '</span></td>' +
          '<td style="width:160px">' + escapeHtml(getEmployeeName(empId, empList)) + '</td>' +
          '<td class="cio-note-cell">' + escapeHtml(notes) + '</td>' +
          syncTd +
          delTd +
        '</tr>'
      );
    }).join('');
  }

  function renderHistory(logs, empList) {
    logs = safeArray(logs);

    if (!logs.length) {
      return '<div style="padding:16px;text-align:center;color:#64748b;font-weight:850">履歴がありません / Chưa có lịch sử</div>';
    }

    var unlocked = isHistoryUnlocked();
    var lockClass = unlocked ? 'cio-history-unlocked' : 'cio-history-locked';

    return (
      '<table class="cio-history-table ' + lockClass + '" id="cio-his">' +
        '<thead><tr>' +
          '<th data-sort="time">日時 / Thời gian</th>' +
          '<th data-sort="status">種別 / Loại</th>' +
          '<th data-sort="emp">担当 / NV</th>' +
          '<th data-sort="note">メモ / Ghi chú</th>' +
          '<th class="col-sync" data-sort="sync">同期 / Sync</th>' +
          '<th class="col-del">削除 / Xóa</th>' +
        '</tr></thead>' +
        '<tbody>' + buildHistoryRows(logs, empList) + '</tbody>' +
      '</table>'
    );
  }

  function applyHistoryLockState() {
    var unlocked = isHistoryUnlocked();

    var panel = document.getElementById('cio-panel');
    if (!panel) return;

    // 1) Table class (giữ lại để đồng bộ)
    var table = panel.querySelector('#cio-his');
    if (table) {
      table.classList.toggle('cio-history-unlocked', unlocked);
      table.classList.toggle('cio-history-locked', !unlocked);
    }

    // 2) Wrapper overflow-x (KHÓA/MỞ cuộn ngang)
    var wrap = panel.querySelector('.cio-history-wrap');
    if (wrap) {
      wrap.classList.toggle('scroll-unlocked', unlocked);
      wrap.style.overflowX = unlocked ? 'auto' : 'hidden';
      wrap.style.touchAction = unlocked ? 'pan-x pan-y' : 'pan-y';
    }

    // 3) ÉP ẩn/hiện 2 cột Sync + Xóa bằng inline style (không sợ CSS khác ghi đè)
    var cells = panel.querySelectorAll('#cio-his .col-sync, #cio-his .col-del');
    cells.forEach(function (el) {
      el.style.display = unlocked ? 'table-cell' : 'none';
    });

    // 4) Đổi icon/text nút lock
    var lockBtn = panel.querySelector('#cio-lock-toggle');
    if (lockBtn) {
      var icon = lockBtn.querySelector('.lock-icon');
      var text = lockBtn.querySelector('.lock-text');
      if (icon) icon.textContent = unlocked ? '🔓' : '🔒';
      if (text) text.textContent = unlocked ? 'Unlock' : 'Lock';
      lockBtn.setAttribute('data-state', unlocked ? 'unlocked' : 'locked');
    }
  }


  function refreshHistoryInPlace(item) {
    if (!item) return;

    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];

    var logs = getHistoryLogsForItem(item);

    var wrap = document.querySelector('#cio-panel .cio-history-wrap');
    if (!wrap) return;

    // Replace whole table for stability
    wrap.innerHTML = renderHistory(logs, empList);

    enableSort();
    enableFilter();
    bindDeleteHistoryEvents(item);
    applyHistoryLockState();
  }

  // -----------------------------
  // FILTER / SORT
  // -----------------------------
  function enableFilter() {
    var input = document.getElementById('cio-search');
    var table = document.getElementById('cio-his');
    if (!input || !table) return;
    if (input.dataset.bound) return;
    input.dataset.bound = '1';

    input.addEventListener('input', function () {
      var q = String(input.value || '').trim().toLowerCase();
      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function (tr) {
        var txt = String(tr.textContent || '').toLowerCase();
        tr.style.display = (!q || txt.indexOf(q) >= 0) ? '' : 'none';
      });
    });
  }

  function enableSort() {
    var table = document.getElementById('cio-his');
    if (!table) return;
    var thead = table.querySelector('thead');
    if (!thead || thead.dataset.bound) return;
    thead.dataset.bound = '1';

    var sortState = { key: 'time', dir: 'desc' };

    function cellText(tr, idx) {
      var tds = tr.querySelectorAll('td');
      return tds[idx] ? String(tds[idx].textContent || '').trim() : '';
    }

    function applySort() {
      var tbody = table.querySelector('tbody');
      if (!tbody) return;

      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      var idxMap = { time: 0, status: 1, emp: 2, note: 3, sync: 4 };
      var idx = idxMap[sortState.key] !== undefined ? idxMap[sortState.key] : 0;

      rows.sort(function (a, b) {
        if (sortState.key === 'time') {
          var ta = Date.parse(a.getAttribute('data-time') || 0) || 0;
          var tb = Date.parse(b.getAttribute('data-time') || 0) || 0;
          return ta - tb;
        }
        return cellText(a, idx).localeCompare(cellText(b, idx), 'ja');
      });

      if (sortState.dir === 'desc') rows.reverse();
      tbody.innerHTML = '';
      rows.forEach(function (r) { tbody.appendChild(r); });
    }

    thead.addEventListener('click', function (e) {
      var th = e.target && e.target.closest ? e.target.closest('th[data-sort],th.col-sync') : null;
      if (!th) return;
      var key = th.getAttribute('data-sort');
      if (!key) return;

      if (sortState.key === key) {
        sortState.dir = (sortState.dir === 'asc') ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.dir = 'desc';
      }
      applySort();
    });
  }

  // -----------------------------
  // DELETE HISTORY
  // -----------------------------
  function bindDeleteHistoryEvents(item) {
    var buttons = document.querySelectorAll('#cio-panel .btn-delete-history');
    buttons.forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (!isHistoryUnlocked()) {
          alert(JV('ロック解除してください', 'Vui lòng Unlock để xóa'));
          return;
        }

        var tsEnc = btn.getAttribute('data-time');
        var timestamp = tsEnc ? decodeURIComponent(tsEnc) : '';
        if (!timestamp) return;

        var ok = confirm(JV('削除しますか？', 'Bạn chắc chắn muốn xóa?'));
        if (!ok) return;

        showBilingualToast('deleting');

        var cfg = getCfg();
        var payload = {
          MoldID: item && item.MoldID ? item.MoldID : '',
          CutterID: item && item.CutterID ? item.CutterID : '',
          Timestamp: timestamp,
          ItemType: item && item.MoldID ? 'mold' : 'cutter'
        };

        fetch(cfg.deleteApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (res) { return res.json(); })
          .then(function (rj) {
            if (!rj || !rj.success) throw new Error((rj && rj.message) || 'Delete failed');

            try {
              if (global.DataManager && global.DataManager.data && Array.isArray(global.DataManager.data.statuslogs)) {
                global.DataManager.data.statuslogs = global.DataManager.data.statuslogs.filter(function (l) {
                  return String(l.Timestamp || '') !== String(timestamp);
                });
              }
              if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
            } catch (e1) {}

            showBilingualToast('deleted');
            setLastActionTime();

            refreshHistoryInPlace(item);

            try {
              var k = getItemKey(item);
              document.dispatchEvent(new CustomEvent('detailchanged', {
                detail: { item: item, itemType: k.itemType, itemId: k.id, source: 'checkin-delete' }
              }));
            } catch (e2) {}
          })
          .catch(function (err) {
            console.warn('[CheckInOut] delete failed', err);
            showBilingualToast('error');
          });
      });
    });
  }

  // -----------------------------
  // SELECTS
  // -----------------------------
  function initSearchableSelects(mode, destList, empList) {
    var empContainer = document.getElementById('employee-select-container');
    if (empContainer) {
      empContainer.innerHTML = '';

      var empOptions = safeArray(empList).map(function (e) {
        return { id: String(e.EmployeeID), name: String(e.EmployeeName || e.name || e.EmployeeID) };
      });

      if (typeof global.createSearchableSelect === 'function') {
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
            try { if (typeof empSelect.setValue === 'function') empSelect.setValue(String(defEmpId)); } catch (e0) {}
            var chk = document.getElementById('cio-emp-default');
            if (chk) chk.checked = true;
          }, 0);
        }
      } else {
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

        empContainer.appendChild(sel);

        var defEmp = getDefaultEmpId();
        if (defEmp) sel.value = String(defEmp);
      }
    }

    // Destination: always reserve space (dest-group), create select only when checkout
    var destContainer = document.getElementById('destination-select-container');
    if (destContainer) {
      destContainer.innerHTML = '';

      if (mode === 'check-out') {
        var destOptions = safeArray(destList).map(function (d) {
          return { id: String(d.DestinationID), name: String(d.DestinationName || d.DestinationID) };
        });

        if (typeof global.createSearchableSelect === 'function') {
          var destSelect = global.createSearchableSelect('cio-dest', destOptions);
          destContainer.appendChild(destSelect);
        } else {
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

          destContainer.appendChild(sel2);
        }
      }
    }
  }

  // -----------------------------
  // AUTOFILL
  // -----------------------------
  function applyAutoFillLogic(item, mode, historyLogs) {
    historyLogs = safeArray(historyLogs);
    var lastLog = historyLogs[0] || null;

    var empInput = document.getElementById('cio-emp');
    if (empInput) {
      var defEmpId = getDefaultEmpId();
      if (defEmpId) {
        empInput.value = String(defEmpId);
        empInput.dataset.selectedId = String(defEmpId);
      } else if (lastLog) {
        var lastEmp = getField(lastLog, ['EmployeeID', 'employeeId'], '');
        if (lastEmp) {
          empInput.value = String(lastEmp);
          empInput.dataset.selectedId = String(lastEmp);
        }
      }
    }

    var destGroup = document.querySelector('#cio-panel .dest-group');
    if (destGroup) {
      if (mode === 'check-out') destGroup.classList.remove('is-hidden');
      else destGroup.classList.add('is-hidden');
    }

    var destInput = document.getElementById('cio-dest');
    if (destInput && lastLog && mode === 'check-out') {
      var lastDest = getField(lastLog, ['DestinationID', 'destinationId'], '');
      if (lastDest) {
        destInput.value = String(lastDest);
        destInput.dataset.selectedId = String(lastDest);
      }
    }

    var noteInput = document.getElementById('cio-note');
    if (noteInput) {
      // Giữ logic cũ: check-in gợi ý "Kiểm kê" (đúng nghiệp vụ bạn dùng)
      if (mode === 'check-in') noteInput.value = 'Kiểm kê';
    }
  }

  // -----------------------------
  // MODAL open/close
  // -----------------------------
  function closeModal() {
    currentItem = null;

    var panel = document.getElementById('cio-panel');
    if (panel) panel.remove();

    var backdrop = document.getElementById('cio-backdrop');
    if (backdrop) backdrop.remove();

    try {
      if (document.body.classList.contains('modal-open')) {
        var anyOther = document.getElementById('loc-panel') || document.getElementById('ship-panel');
        if (!anyOther) document.body.classList.remove('modal-open');
      }
    } catch (e0) {}
  }

  function openModal(mode, item) {
    ensureCssLoaded();
    ensureHistoryUnlockDefault();

    if (!item) {
      alert(JV('項目を選択してください', 'Vui lòng chọn khuôn/dao trước'));
      return;
    }

    if (!item.MoldID && !item.CutterID) {
      alert(JV('IDが見つかりません', 'Không tìm thấy MoldID hoặc CutterID'));
      return;
    }

    currentMode = (mode === 'check-out') ? 'check-out' : 'check-in';
    currentItem = item;

    closeModal();

    if (isMobile()) document.body.classList.add('modal-open');

    var dm = global.DataManager;
    var key = getItemKey(item);

    var destList = dm && dm.data ? dm.data.destinations : [];
    var empList = dm && dm.data ? dm.data.employees : [];
    var racksList = dm && dm.data ? dm.data.racks : [];

    var historyLogs = getHistoryLogsForItem(item);
    var latestLog = historyLogs[0] || null;

    // Current status summary
    var currentStatusText = JV('履歴なし', 'Chưa có lịch sử');
    var statusSemantic = 'unknown';

    if (latestLog) {
      var s = String(latestLog.Status || '').toLowerCase();
      if (s === 'check-in' || s === 'in' || s === 'checkin') {
        var dn = getDestinationName(latestLog.DestinationID || 'AREA-MOLDROOM', destList);
        currentStatusText = '在庫 - ' + dn;
        statusSemantic = 'in';
      } else if (s === 'check-out' || s === 'out' || s === 'checkout') {
        var dn2 = getDestinationName(latestLog.DestinationID || '', destList);
        currentStatusText = '出庫 - ' + dn2;
        statusSemantic = 'out';
      } else if (String(latestLog.Status || '').toUpperCase() === 'AUDIT' || latestLog.AuditType) {
        currentStatusText = JV('棚卸', 'Kiểm kê');
        statusSemantic = 'audit';
      }
    }

    var itemIdLabelJa = (key.itemType === 'mold') ? '金型ID' : '刃物ID';
    var itemIdLabelVi = (key.itemType === 'mold') ? 'ID Mold' : 'ID Cutter';

    var itemNameLabelJa = (key.itemType === 'mold') ? '金型' : '刃物';
    var itemNameLabelVi = (key.itemType === 'mold') ? 'Tên khuôn' : 'Tên dao';

    var itemName = '-';
    try {
      if (key.itemType === 'mold') itemName = item.MoldName || item.MoldCode || item.MoldID;
      else if (key.itemType === 'cutter') itemName = item.CutterName || item.CutterCode || item.CutterType || item.CutterNo || item.CutterID;
    } catch (e0) {}

    // Rack info best-effort
    var rackNum = getField(item, ['RackID', 'rackInfo', 'RackNo', 'rackNo'], '-');
    try {
      if (item && item.rackInfo && item.rackInfo.RackNumber) rackNum = item.rackInfo.RackNumber;
    } catch (e1) {}

    var layerNum = '-';
    try {
      if (item && item.rackLayerInfo && item.rackLayerInfo.RackLayerNumber) layerNum = item.rackLayerInfo.RackLayerNumber;
      else layerNum = item.RackLayerID || '-';
    } catch (e2) {}

    var rackLocation = '-';
    try {
      if (racksList && racksList.length && item && item.RackID) {
        var ri = racksList.find(function (r) { return normalizeId(r.RackID) === normalizeId(item.RackID); });
        rackLocation = ri && ri.RackLocation ? ri.RackLocation : '-';
      }
    } catch (e3) {}

    var headerJa = (currentMode === 'check-in') ? 'チェックイン' : 'チェックアウト';
    var headerVi = (currentMode === 'check-in') ? 'Check-in' : 'Check-out';

    var semanticBadge = '<span class="cio-status-badge cio-b-unknown">-</span>';
    if (statusSemantic === 'in') semanticBadge = '<span class="cio-status-badge cio-b-in">IN</span>';
    if (statusSemantic === 'out') semanticBadge = '<span class="cio-status-badge cio-b-out">OUT</span>';
    if (statusSemantic === 'audit') semanticBadge = '<span class="cio-status-badge cio-b-audit">AUDIT</span>';

    var unlocked = isHistoryUnlocked();

    var html = '';
    html += '<div class="cio-panel" id="cio-panel" role="dialog" aria-modal="true">';

    html += '  <div class="cio-header ' + (currentMode === 'check-in' ? 'check-in' : 'check-out') + '">';
    html += '    <div class="cio-title"><div class="ja">' + escapeHtml(headerJa) + '</div><div class="vi">' + escapeHtml(headerVi) + '</div></div>';
    html += '    <div class="cio-header-actions">';
    html += '      <button class="cio-icon-btn" id="cio-refresh" type="button" title="更新 / Làm mới">↻</button>';
    html += '      <button class="cio-icon-btn" id="cio-close" type="button" title="閉じる / Đóng">×</button>';
    html += '    </div>';
    html += '  </div>';

    html += '  <div class="cio-main">';

    // Left: history
    html += '    <section class="cio-card cio-history-card">';
    html += '      <div class="cio-card-head">';
    html += '        <div class="cio-card-title"><div class="ja">履歴</div><div class="vi">Lịch sử</div></div>';
    html += '        <div class="cio-history-controls">';
    html += '          <input id="cio-search" class="cio-search" type="text" placeholder="検索... / Tìm kiếm...">';
    html += '          <button id="cio-lock-toggle" class="cio-lock" type="button" title="Lock/Unlock">';
    html += '            <span class="lock-icon">' + (unlocked ? '🔓' : '🔒') + '</span>';
    html += '            <span class="lock-text">' + (unlocked ? 'Unlock' : 'Lock') + '</span>';
    html += '          </button>';
    html += '        </div>';
    html += '      </div>';
    html += '      <div class="cio-history-wrap">' + renderHistory(historyLogs, empList) + '</div>';
    html += '    </section>';

    // Right: status + inputs
    html += '    <aside class="cio-right">';

    html += '      <section class="cio-card">';
    html += '        <div class="cio-card-head">';
    html += '          <div class="cio-card-title"><div class="ja">状態</div><div class="vi">Trạng thái</div></div>';
    html += '        </div>';
    html += '        <div class="cio-status-box">';
    html += '          <div class="cio-kv"><div class="cio-k">' + escapeHtml(itemIdLabelJa) + '<br>' + escapeHtml(itemIdLabelVi) + '</div><div class="cio-v">' + escapeHtml(key.id) + '</div></div>';
    html += '          <div class="cio-kv"><div class="cio-k">' + escapeHtml(itemNameLabelJa) + '<br>' + escapeHtml(itemNameLabelVi) + '</div><div class="cio-v wrap">' + escapeHtml(itemName) + '</div></div>';
    html += '          <div class="cio-kv"><div class="cio-k">現在<br>Hiện tại</div><div class="cio-v wrap">' + semanticBadge + ' <span style="margin-left:8px">' + escapeHtml(currentStatusText) + '</span></div></div>';
    html += '          <div class="cio-kv"><div class="cio-k">位置<br>Vị trí</div><div class="cio-v">' + escapeHtml(String(rackNum)) + '  -  ' + escapeHtml(String(layerNum)) + '</div></div>';
    html += '          <div class="cio-kv"><div class="cio-k">保管<br>Nơi lưu</div><div class="cio-v wrap">' + escapeHtml(rackLocation) + '</div></div>';
    html += '        </div>';
    html += '      </section>';

    html += '      <section class="cio-card cio-input-card">';
    html += '        <div class="cio-card-head">';
    html += '          <div class="cio-card-title"><div class="ja">入力</div><div class="vi">Nhập liệu</div></div>';
    html += '        </div>';

    html += '        <div class="cio-input-scroll">';

    html += '          <div class="cio-mode-buttons">';
    html += '            <button id="btn-in" class="cio-mode-btn btn-in ' + (currentMode === 'check-in' ? 'active' : '') + '" type="button"><span class="ja">IN（入庫）</span><span class="vi">Nhập kho</span></button>';
    html += '            <button id="btn-out" class="cio-mode-btn btn-out ' + (currentMode === 'check-out' ? 'active' : '') + '" type="button"><span class="ja">OUT（出庫）</span><span class="vi">Xuất kho</span></button>';
    html += '          </div>';

    // Reserve destination space always
    html += '          <div class="dest-group ' + (currentMode === 'check-out' ? '' : 'is-hidden') + '">';
    html += '            <div class="cio-label">行き先 / Điểm đến</div>';
    html += '            <div id="destination-select-container"></div>';
    html += '          </div>';

    html += '          <div>';
    html += '            <div class="cio-label">担当者 / Nhân viên</div>';
    html += '            <div class="cio-row">';
    html += '              <div id="employee-select-container"></div>';
    html += '              <button id="btn-face" class="cio-btn secondary" type="button" title="Face ID">Face ID</button>';
    html += '            </div>';
    html += '            <div id="cio-face-status" style="margin-top:6px;color:var(--cio-muted);font-weight:900;font-size:12px">' + escapeHtml(JV('入力してください', 'Nhập trực tiếp')) + '</div>';
    html += '            <label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-weight:900;color:var(--cio-text)">';
    html += '              <input type="checkbox" id="cio-emp-default"> <span>既定 / Mặc định</span>';
    html += '            </label>';
    html += '          </div>';

    html += '          <div>';
    html += '            <div class="cio-label">メモ / Ghi chú</div>';
    html += '            <textarea id="cio-note" class="cio-control" rows="2" placeholder="メモ... / Ghi chú..."></textarea>';
    html += '          </div>';

    html += '        </div>';

    html += '        <div class="cio-actionbar" role="toolbar" aria-label="Actions">';
    html += '          <button class="cio-act cancel" id="btn-cancel" type="button"><span class="ja">キャンセル</span><span class="vi">Hủy</span></button>';
    html += '          <button class="cio-act relocate" id="btn-relocate" type="button"><span class="ja">位置変更</span><span class="vi">Đổi vị trí</span></button>';
    html += '          <button class="cio-act save" id="btn-save" type="button"><span class="ja">確定</span><span class="vi">Xác nhận</span></button>';
    html += '        </div>';

    html += '      </section>';

    html += '    </aside>';

    html += '  </div>';
    html += '</div>';

    // Backdrop
    var backdrop = document.createElement('div');
    backdrop.id = 'cio-backdrop';
    backdrop.className = 'cio-backdrop';
    backdrop.addEventListener('click', closeModal);
    document.body.appendChild(backdrop);

    // Panel
    document.body.insertAdjacentHTML('beforeend', html);

    // init
    initSearchableSelects(currentMode, destList, empList);
    applyAutoFillLogic(item, currentMode, historyLogs);

    bindModalEvents(item);
    bindLockUI(item);
    refreshHistoryInPlace(item);

    // focus first field
    setTimeout(function () {
      var first = document.querySelector('#cio-panel input, #cio-panel textarea, #cio-panel select');
      if (first) first.focus();
    }, 150);
  }

  // -----------------------------
  // Lock UI
  // -----------------------------
  function bindLockUI(item) {
    var lockBtn = document.getElementById('cio-lock-toggle');
    if (!lockBtn) return;

    function apply() {
      applyHistoryLockState();
      bindDeleteHistoryEvents(item);
    }

    apply();

    if (!lockBtn.dataset.bound) {
      lockBtn.dataset.bound = '1';
      lockBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setHistoryUnlocked(!isHistoryUnlocked());
        refreshHistoryInPlace(item);
        apply();
      });

    }
  }

  // -----------------------------
  // Mode switch
  // -----------------------------
  function switchMode(newMode, item) {
    if (currentMode === newMode) return;
    currentMode = newMode;

    var inBtn = document.getElementById('btn-in');
    var outBtn = document.getElementById('btn-out');
    if (inBtn && outBtn) {
      inBtn.classList.toggle('active', newMode === 'check-in');
      outBtn.classList.toggle('active', newMode === 'check-out');
    }

    var headerEl = document.querySelector('#cio-panel .cio-header');
    if (headerEl) {
      headerEl.classList.remove('check-in', 'check-out');
      headerEl.classList.add(newMode === 'check-in' ? 'check-in' : 'check-out');

      var title = headerEl.querySelector('.cio-title');
      if (title) {
        var ja = title.querySelector('.ja');
        var vi = title.querySelector('.vi');
        if (ja) ja.textContent = newMode === 'check-in' ? 'チェックイン' : 'チェックアウト';
        if (vi) vi.textContent = newMode === 'check-in' ? 'Check-in' : 'Check-out';
      }
    }

    var destGroup = document.querySelector('#cio-panel .dest-group');
    if (destGroup) {
      if (newMode === 'check-out') destGroup.classList.remove('is-hidden');
      else destGroup.classList.add('is-hidden');
    }

    // (Re)create destination select if needed
    if (newMode === 'check-out') {
      var dm = global.DataManager;
      var destList = dm && dm.data ? dm.data.destinations : [];
      var destContainer = document.getElementById('destination-select-container');
      if (destContainer && destContainer.children.length === 0) {
        initSearchableSelects('check-out', destList, (dm && dm.data ? dm.data.employees : []));
      }
    } else {
      // clear value to avoid accidental checkout validation
      var destEl = document.getElementById('cio-dest');
      if (destEl) { destEl.value = ''; destEl.dataset.selectedId = ''; }
    }

    // avoid UI jump: do NOT change layout heights, only show/hide via visibility
  }

  // -----------------------------
  // Face ID (mock)
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

    empSel.value = empId;
    empSel.dataset.selectedId = empId;

    if (faceStat) {
      faceStat.textContent = JV('Face ID 確認', 'Face ID xác nhận');
      faceStat.classList.add('confirmed');
    }

    var defChk = document.getElementById('cio-emp-default');
    if (defChk) defChk.checked = empId === String(getDefaultEmpId() || '');
  }

  // -----------------------------
  // Bind events
  // -----------------------------
  function bindModalEvents(item) {
    var closeBtn = document.getElementById('cio-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    var cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

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

    // Face ID
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
    if (inBtn) inBtn.addEventListener('click', function () { if (currentMode !== 'check-in') switchMode('check-in', item); });
    if (outBtn) outBtn.addEventListener('click', function () { if (currentMode !== 'check-out') switchMode('check-out', item); });

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
          var panel = document.getElementById('cio-panel');
          if (panel) closeModal();
        }
      });
    }
  }

  // -----------------------------
  // SAVE
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
            pending: true,
            localId: 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            createdAt: new Date().toISOString()
          });
          global.DataManager.data.statuslogs.unshift(pending);
        }
      }

      if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e1) {}

    // Keep default emp
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
          if (pending && pending.localId && global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.remove === 'function') {
            global.DataManager.PendingCache.remove(pending.localId);
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
          if (pending && pending.localId && global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.markError === 'function') {
            global.DataManager.PendingCache.markError(pending.localId, err && err.message ? err.message : 'Sync error');
          } else if (pending) {
            pending.syncError = err && err.message ? err.message : 'Sync error';
            pending.syncErrorAt = new Date().toISOString();
          }
          if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
        } catch (e4) {}

        console.warn('[CheckInOut] sync failed', err);
        showBilingualToast('error');
        refreshHistoryInPlace(item);
      });
  }

  // -----------------------------
  // Integration (quick-action)
  // -----------------------------
  function bindQuickActionCapture() {
    if (document.body.dataset.cioQuickBound) return;
    document.body.dataset.cioQuickBound = '1';

    document.addEventListener('quick-action', function (e) {
      try {
        var detail = e && e.detail ? e.detail : {};
        var action = detail.action;
        var item = detail.item;

        if (action === 'checkin' || action === 'checkout') {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();

          if (action === 'checkin') openModal('check-in', item);
          else openModal('check-out', item);
        }
      } catch (err) {}
    }, true);
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
      bindQuickActionCapture();
      console.log('checkin-checkout ' + VERSION + ' loaded');
    }
  };

  global.CheckInOut = CheckInOut;
  global.CheckInOutManager = global.CheckInOut;
  global.CheckInOutModal = global.CheckInOut;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { CheckInOut.init(); }, { once: true });
  } else {
    CheckInOut.init();
  }

})(window);
