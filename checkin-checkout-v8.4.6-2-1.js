/* ============================================================================
checkin-checkout-v8.4.6.js
MoldCutterSearch - Check-in / Check-out (flow kiểu máy chấm công)

Mục tiêu UI/Flow (2026-03-01 update theo yêu cầu):
- Mobile: lịch sử nằm dưới khu vực thao tác (không cần mục “Gần nhất” trong panel).
- Desktop + Mobile: nhóm nhập liệu theo thứ tự: Chọn nhân viên -> Chọn điểm đến -> Ghi chú.
- Nút IN/OUT nằm phía dưới nhóm nhập liệu.
- Bảng lịch sử: hiển thị IN/OUT có màu dễ nhận biết (dùng class badge).
- Sau khi bấm IN/OUT và ghi (tạm + đồng bộ), panel tự đóng.
- Chọn nhân viên/điểm đến là dạng nút bấm; bấm sẽ mở popup ở giữa màn hình.
- Nếu thiếu dữ liệu khi bấm IN/OUT: tự mở popup chọn và tiếp tục flow.

Public API:
- window.CheckInOut.openStamp(item)
- window.CheckInOut.openSmart(item)
- window.CheckInOut.openModal(mode, item) // 'check-in' | 'check-out'
- window.CheckInOut.close()

Dependencies (optional):
- window.DataManager (data-manager-v8.4.x)
- window.LocationManager.openModal(item)
- window.notify / window.NotificationModule.show

Ghi chú:
- File này KHÔNG inject CSS, KHÔNG tự load CSS.
- CSS sẽ được cập nhật/viết lại ở bước kế tiếp theo yêu cầu của bạn.
============================================================================ */

(function (global) {
  'use strict';

  var VERSION = 'v8.4.6-2-1';

  // ----------------------------- CONFIG -----------------------------
  var DEFAULT_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
  var DEFAULT_DELETE_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/delete-log';

  function removeStatusLogFromCacheById(delId) {
    try {
      if (!global.DataManager || !global.DataManager.data || !Array.isArray(global.DataManager.data.statuslogs)) return null;

      var arr = global.DataManager.data.statuslogs;
      var idx = arr.findIndex(function (x) {
        return String((x && (x.StatusLogID || x.localId)) || '').trim() === String(delId).trim();
      });
      if (idx < 0) return null;

      var removed = arr[idx];
      arr.splice(idx, 1);

      if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
      return removed;
    } catch (e0) {
      return null;
    }
  }

  function restoreStatusLogToCache(obj) {
    try {
      if (!obj) return;
      if (!global.DataManager || !global.DataManager.data) return;
      if (!Array.isArray(global.DataManager.data.statuslogs)) global.DataManager.data.statuslogs = [];
      global.DataManager.data.statuslogs.unshift(obj);
      if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e0) {}
  }

  function runDeleteQueue() {
    if (deleteBusy) return;
    if (!deleteQueue.length) return;

    deleteBusy = true;
    var job = deleteQueue.shift();
    var delId = job && job.delId ? job.delId : '';

    apiDeleteStatusLog(delId).then(function (ret) {
      if (ret && ret.ok && ret.json && ret.json.success) {
        showToast('success', '', JV('削除しました', 'Đã xóa trên server'));
        deleteSnapshots[delId] = null;
      } else {
        var msg = (ret && ret.json && ret.json.message) ? String(ret.json.message) : ('HTTP ' + (ret ? ret.status : 'ERR'));
        showToast('error', '', JV('削除失敗: ', 'Xóa thất bại: ') + msg);

        // rollback
        if (deleteSnapshots[delId]) {
          restoreStatusLogToCache(deleteSnapshots[delId]);
          deleteSnapshots[delId] = null;
          renderHistoryNow();
        }
      }
    }).catch(function () {
      showToast('error', '', JV('通信エラー', 'Lỗi kết nối'));

      if (deleteSnapshots[delId]) {
        restoreStatusLogToCache(deleteSnapshots[delId]);
        deleteSnapshots[delId] = null;
        renderHistoryNow();
      }
    }).finally(function () {
      deleteBusy = false;
      setTimeout(runDeleteQueue, 0);
    });
  }

  function apiDeleteStatusLog(logId) {
    var cfg = getCfg();
    var url = (cfg && cfg.deleteApiUrl) ? String(cfg.deleteApiUrl) : (typeof deleteApiUrl !== 'undefined' ? String(deleteApiUrl) : '');
    if (!url) url = DEFAULT_DELETE_API_URL;

    try {
      if (url && url.indexOf('/api/deletelog') >= 0) url = url.replace('/api/deletelog', '/api/delete-log');
    } catch (e0) {}

    var payload = { filename: 'statuslogs.csv', logId: String(logId || '').trim() };

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        return { ok: res.ok, status: res.status, json: json };
      });
    });
  }

  function getCfg() {
    var c = (global.CIOCONFIG && typeof global.CIOCONFIG === 'object') ? global.CIOCONFIG : {};
    return {
      apiUrl: c.apiUrl || DEFAULT_API_URL,
      deleteApiUrl: c.deleteApiUrl || DEFAULT_DELETE_API_URL,
      defaultCheckinDestinationId: (c.defaultCheckinDestinationId != null) ? String(c.defaultCheckinDestinationId) : 'AREA-MOLDROOM',
      quickEmpLimit: (c.quickEmpLimit != null) ? Number(c.quickEmpLimit) : 12,
      quickDestLimit: (c.quickDestLimit != null) ? Number(c.quickDestLimit) : 12
    };
  }

  // ----------------------------- STORAGE (safe) -----------------------------
  var STORAGEKEY_DEFAULT_EMP = 'cio_default_employee_id';
  var STORAGEKEY_DEFAULT_DEST = 'cio_default_destination_id';
  var _storageOk = null;
  var _mem = { defaultEmpId: '', defaultDestId: '' };


  function storageOk() {
    if (_storageOk !== null) return _storageOk;
    try {
      var k = '__cio_ls_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      _storageOk = true;
    } catch (e) {
      _storageOk = false;
    }
    return _storageOk;
  }

  function storageGet(key) {
    if (!storageOk()) return null;
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    if (!storageOk()) return;
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }
  function storageRemove(key) {
    if (!storageOk()) return;
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function getDefaultEmpId() {
    var v = storageGet(STORAGEKEY_DEFAULT_EMP);
    if (v && String(v).trim()) return String(v).trim();
    return _mem.defaultEmpId ? String(_mem.defaultEmpId).trim() : '';
  }

  function setDefaultEmpId(id) {
    if (!id) return;
    _mem.defaultEmpId = String(id).trim();
    storageSet(STORAGEKEY_DEFAULT_EMP, _mem.defaultEmpId);
  }

  function clearDefaultEmpId() {
    _mem.defaultEmpId = '';
    storageRemove(STORAGEKEY_DEFAULT_EMP);
  }

  function getDefaultDestId() {
    var v = storageGet(STORAGEKEY_DEFAULT_DEST);
    if (v && String(v).trim()) return String(v).trim();
    return _mem.defaultDestId ? String(_mem.defaultDestId).trim() : '';
  }

  function setDefaultDestId(id) {
    if (!id) return;
    _mem.defaultDestId = String(id).trim();
    storageSet(STORAGEKEY_DEFAULT_DEST, _mem.defaultDestId);
  }

  function clearDefaultDestId() {
    _mem.defaultDestId = '';
    storageRemove(STORAGEKEY_DEFAULT_DEST);
  }

  // ----------------------------- UTILS -----------------------------
  function JV(ja, vi) { return String(ja) + ' / ' + String(vi); }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function safeArray(x) { return Array.isArray(x) ? x : []; }

  function normalizeId(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  function isMobile() { return (window.innerWidth || 0) <= 900; }

  function fmtTime(dateStr) {
    if (!dateStr) return '-';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  function fmtDateTime2LineHtml(dateStr) {
    if (!dateStr) return '<div class="cio-time-2l"><div class="d">-</div><div class="t">-</div></div>';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return '<div class="cio-time-2l"><div class="d">-</div><div class="t">' + escapeHtml(String(dateStr)) + '</div></div>';
    }

    var yyyy = String(d.getFullYear());
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');

    var dateLine = yyyy + '-' + mm + '-' + dd;
    var timeLine = hh + ':' + mi;

    return '<div class="cio-time-2l"><div class="d">' + escapeHtml(dateLine) + '</div><div class="t">' + escapeHtml(timeLine) + '</div></div>';
  }

  function getField(obj, keys, fallback) {
    if (!obj) return fallback;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (obj[k] !== null && obj[k] !== undefined && String(obj[k]).trim() !== '') return obj[k];
    }
    return fallback;
  }

  function getItemKey(item) {
    if (item && item.MoldID != null && String(item.MoldID).trim() !== '') {
      return { itemType: 'mold', id: normalizeId(item.MoldID) };
    }
    if (item && item.CutterID != null && String(item.CutterID).trim() !== '') {
      return { itemType: 'cutter', id: normalizeId(item.CutterID) };
    }
    return { itemType: 'unknown', id: '' };
  }

  function getDeviceCode(item) { return getField(item, ['MoldCode', 'CutterNo', 'code'], '-'); }
  function getDeviceName(item) { return getField(item, ['MoldName', 'CutterName', 'name'], ''); }

  function raiseGlobalToastZIndex() {
    try {
      var el = document.getElementById('notification-toast-container');
      if (el) el.style.zIndex = '900000';
    } catch (e0) {}
  }

  function showToast(type, msgJa, msgVi) {
    raiseGlobalToastZIndex();
    var cls = type || 'info';
    var msg = String(msgVi || msgJa || '');

    try {
      if (global.notify && typeof global.notify === 'object') {
        if (cls === 'success' && typeof global.notify.success === 'function') return global.notify.success(msg);
        if (cls === 'warning' && typeof global.notify.warning === 'function') return global.notify.warning(msg);
        if (cls === 'error' && typeof global.notify.error === 'function') return global.notify.error(msg);
        if (typeof global.notify.info === 'function') return global.notify.info(msg);
      }
    } catch (e0) {}

    try {
      if (global.NotificationModule && typeof global.NotificationModule.show === 'function') {
        global.NotificationModule.show(msg, cls);
        return;
      }
    } catch (e1) {}

    // Fallback DOM toast (z-index sẽ chỉnh bằng CSS ở bước sau)
    var id = 'cio-toast';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'cio-toast';
      document.body.appendChild(el);
    }

    el.innerHTML = '<div class="cio-toast-vi">' + escapeHtml(msg) + '</div>' + (msgJa ? ('<div class="cio-toast-ja">' + escapeHtml(msgJa) + '</div>') : '');
    el.classList.remove('hidden');

    clearTimeout(el._t);
    el._t = setTimeout(function () {
      try { el.classList.add('hidden'); } catch (e2) {}
    }, 1600);
  }

  // ----------------------------- STATE -----------------------------
  var opened = false;
  var currentItem = null;
  var currentPreferredMode = 'stamp'; // 'stamp' | 'check-in' | 'check-out'

  var selectedEmpId = '';
  var selectedDestId = '';
  var historyUnlocked = false;

  var picker = {
    open: false,
    kind: '', // 'emp' | 'dest'
    fromAction: '', // 'in' | 'out' | ''
    onSelected: null,
    onCancel: null
  };

  var deleteQueue = [];
  var deleteBusy = false;
  var deleteSnapshots = {};

  // ----------------------------- DOM skeleton -----------------------------
  function ensureSkeleton() {
    if (!document.getElementById('cio-backdrop')) {
      var bd = document.createElement('div');
      bd.id = 'cio-backdrop';
      bd.className = 'cio-backdrop hidden';
      document.body.appendChild(bd);
    }

    if (!document.getElementById('cio-panel')) {
      var panel = document.createElement('div');
      panel.id = 'cio-panel';
      panel.className = 'cio-panel hidden';
      document.body.appendChild(panel);
    }

    if (!document.getElementById('cio-picker')) {
      var pk = document.createElement('div');
      pk.id = 'cio-picker';
      pk.className = 'cio-dest-sheet hidden';
      document.body.appendChild(pk);
    }

    if (!document.getElementById('cio-confirm')) {
      var cf = document.createElement('div');
      cf.id = 'cio-confirm';
      cf.className = 'cio-dest-sheet hidden';
      document.body.appendChild(cf);
    }

    if (!document.getElementById('cio-toast')) {
      var t = document.createElement('div');
      t.id = 'cio-toast';
      t.className = 'cio-toast hidden';
      document.body.appendChild(t);
    }
  }

  function lockBody() {
    try {
      document.body.classList.add('cio-modal-open');
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } catch (e) {}
  }

  function unlockBody() {
    try {
      document.body.classList.remove('cio-modal-open');
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    } catch (e) {}
  }

  // ----------------------------- Data helpers -----------------------------
  function getDm() {
    return (global.DataManager && global.DataManager.data) ? global.DataManager : null;
  }

  function getEmployees() {
    var dm = getDm();
    return dm ? safeArray(dm.data.employees) : [];
  }

  function getDestinations() {
    var dm = getDm();
    return dm ? safeArray(dm.data.destinations) : [];
  }

  function getStatusLogs() {
    var dm = getDm();
    return dm ? safeArray(dm.data.statuslogs) : [];
  }

  function getEmployeeName(empId) {
    if (!empId) return '';
    var list = getEmployees();
    var found = list.find(function (e) {
      return normalizeId(e.EmployeeID) === normalizeId(empId);
    });
    return found ? String(found.EmployeeName || found.name || found.EmployeeID || empId) : String(empId);
  }

  function getDestinationName(destId) {
    if (!destId) return '';
    var list = getDestinations();
    var found = list.find(function (d) {
      return normalizeId(d.DestinationID) === normalizeId(destId);
    });
    return found ? String(found.DestinationName || found.DestinationID || destId) : String(destId);
  }

  function getLogsForItem(item) {
    var key = getItemKey(item);
    var key = getItemKey(item);
    var heroTypeCls = (key && key.itemType === 'cutter') ? 'cio-hero-cutter' : 'cio-hero-mold';

    if (!key.id) return [];
    var logs = getStatusLogs();
    return logs.filter(function (l) {
      if (!l) return false;
      if (key.itemType === 'mold') return normalizeId(l.MoldID) === key.id;
      if (key.itemType === 'cutter') return normalizeId(l.CutterID) === key.id;
      return normalizeId(l.MoldID) === key.id || normalizeId(l.CutterID) === key.id;
    });
  }

  function sortLogsNewestFirst(logs) {
    return safeArray(logs).slice().sort(function (a, b) {
      var at = new Date((a && (a.Timestamp || a.createdAt || a.DateEntry)) || 0).getTime();
      var bt = new Date((b && (b.Timestamp || b.createdAt || b.DateEntry)) || 0).getTime();
      if (isNaN(at)) at = 0;
      if (isNaN(bt)) bt = 0;
      return bt - at;
    });
  }

  function getLastKnownDestinationId(item) {
    var logs = sortLogsNewestFirst(getLogsForItem(item));
    for (var i = 0; i < logs.length; i++) {
      var d = normalizeId(logs[i] && logs[i].DestinationID);
      if (d) return d;
    }
    return '';
  }

  function getLastKnownStatus(item) {
    var logs = sortLogsNewestFirst(getLogsForItem(item));
    if (!logs.length) return '';
    var st = String(logs[0].Status || '').toUpperCase();
    if (st === 'IN' || st === 'OUT') return st;
    return '';
  }

  function getEmployeeShortName(empId) {
    if (!empId) return '';
    var list = getEmployees();
    var found = list.find(function (e) {
      return normalizeId(e.EmployeeID) === normalizeId(empId);
    });
    if (!found) return String(empId);
    return String(found.EmployeeNameShort || found.EmployeeName || found.name || found.EmployeeID || empId);
  }

  function buildFreqTop(list, idKey, nameFn, limit) {
    var logs = getStatusLogs();
    var freq = {};
    safeArray(logs).forEach(function (l) {
      var id = normalizeId(l && l[idKey]);
      if (!id) return;
      freq[id] = (freq[id] || 0) + 1;
    });

    var used = Object.keys(freq).map(function (id) {
      var nm = nameFn(id);
      // nm có thể là string hoặc object {short, full}
      if (nm && typeof nm === 'object') {
        return { id: id, nameShort: String(nm.short || ''), nameFull: String(nm.full || ''), count: freq[id] };
      }
      return { id: id, name: String(nm || id), nameFull: String(nm || id), count: freq[id] };
    });

    used.sort(function (a, b) { return (b.count || 0) - (a.count || 0); });

    // Bổ sung thêm từ danh sách gốc để luôn đủ limit (nếu có)
    var picked = [];
    var seen = {};
    used.forEach(function (x) {
      if (!x || !x.id) return;
      if (picked.length >= limit) return;
      if (seen[x.id]) return;
      seen[x.id] = true;
      picked.push(x);
    });

    safeArray(list).forEach(function (x) {
      if (picked.length >= limit) return;
      var id0 = normalizeId(x && x[idKey]);
      if (!id0) return;
      if (seen[id0]) return;
      seen[id0] = true;
      var nm0 = nameFn(id0);
      if (nm0 && typeof nm0 === 'object') {
        picked.push({ id: id0, nameShort: String(nm0.short || ''), nameFull: String(nm0.full || ''), count: 0 });
      } else {
        picked.push({ id: id0, name: String(nm0 || id0), nameFull: String(nm0 || id0), count: 0 });
      }
    });

    return picked;
  }

  function getQuickEmployees(limit) {
    var emps = getEmployees();
    return buildFreqTop(emps, 'EmployeeID', function (id) {
      return { short: getEmployeeShortName(id), full: getEmployeeName(id) }; // short = EmployeeNameShort
    }, limit);
  }

  function getQuickDestinations(limit) {
    var dests = getDestinations();
    return buildFreqTop(dests, 'DestinationID', function (id) {
      return String(getDestinationName(id) || id);
    }, limit);
  }

  // ----------------------------- UI: panel HTML -----------------------------
  function buildHistoryRowsHtml(item) {
    var logs = sortLogsNewestFirst(getLogsForItem(item)).slice(0, 200);
    if (!logs.length) return '';

    var html = '';
    logs.forEach(function (l) {
      var st = String(l.Status || '').toUpperCase();
      var badgeCls = (st === 'IN') ? 'in' : ((st === 'OUT') ? 'out' : '');
      var badge = '<span class="cio-recent-st ' + escapeHtml(badgeCls) + '">' + escapeHtml(st || '-') + '</span>';

      var dest = getDestinationName(l.DestinationID) || '-';
      var emp = getEmployeeName(l.EmployeeID) || '-';
      var note = String(l.Notes || '');

      var syncText = '-';
      var syncCls = '';
      if (l && l.pending === true) { syncText = JV('未同期', 'Chưa đồng bộ'); syncCls = 'pending'; }
      else if (l && l.syncError) { syncText = JV('エラー', 'Lỗi'); syncCls = 'error'; }
      else { syncText = JV('同期済', 'Đã đồng bộ'); syncCls = 'ok'; }

      var delId = String(l.StatusLogID || l.localId || '');
      var canDelete = !!delId;

      html += '<tr>' +
        '<td class="cio-td-time">' + fmtDateTime2LineHtml(l.Timestamp) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + escapeHtml(dest) + '</td>' +
        '<td>' + escapeHtml(emp) + '</td>' +
        '<td class="cio-td-note">' + escapeHtml(note) + '</td>' +
        '<td class="cio-col-extra"><span class="cio-sync-pill ' + escapeHtml(syncCls) + '">' + escapeHtml(syncText) + '</span></td>' +
        '<td class="cio-col-extra">' +
          (canDelete
            ? ('<button type="button" class="cio-del-btn" data-del-id="' + escapeHtml(delId) + '"><div class="ja">削除</div><div class="vi">Xóa</div></button>')
            : '-') +
        '</td>' +
      '</tr>';
    });

    return html;
  }


  function helpHtmlJV(ja, vi, attn) {
    var cls = attn ? 'cio-picker-help-line cio-attn' : 'cio-picker-help-line';
    return '<div class="' + cls + '"><div class="ja">' + escapeHtml(ja) + '</div><div class="vi">' + escapeHtml(vi) + '</div></div>';
  }

  function buildHtml(item) {
    var code = getDeviceCode(item);
    var name = getDeviceName(item);
    var key = getItemKey(item);
    var idText = key && key.id ? String(key.id) : '';
    var nameText = getDeviceName(item) || '';
    var idNameLine = idText ? (idText + '. ' + nameText) : nameText;

    return (
      '<div class="cio-topbar">' +
        '<div class="cio-top-title">' +
          '<div class="ja">' + escapeHtml(code) + '</div>' +
          '<div class="vi">' + escapeHtml(JV('入出庫', 'Xuất nhập kho')) + '</div>' +
        '</div>' +
        '<div class="cio-top-actions">' +
          '<button type="button" class="cio-top-btn" id="cio-relocate"><span class="ja">↔</span><span class="vi">Đổi vị trí</span></button>' +
          '<button type="button" class="cio-top-btn" id="cio-close"><span class="ja">×</span><span class="vi">Đóng</span></button>' +
        '</div>' +
      '</div>' +

      '<div class="cio-body">' +
        '<div class="cio-desktop">' +

          // Controls first in DOM (mobile: controls on top)
          '<div class="cio-col cio-col-controls">' +
            '<div class="cio-card">' +
              '<div class="cio-card-head">' +
                '<div class="cio-card-title"><div class="ja">端末</div><div class="vi">Thiết bị</div></div>' +
                '<div class="cio-status-pill" id="cio-status"></div>' +
              '</div>' +
              '<div class="cio-card-body">' +
                '<div class="cio-hero">' +
                  '<div class="cio-hero-code">' + escapeHtml(JV('入出庫', 'Xuất nhập kho') + ': ' + code) + '</div>' +
                  (idNameLine ? ('<div class="cio-hero-name">' + escapeHtml(idNameLine) + '</div>') : '') +
                '</div>' +

                // Fields (order: Emp -> Dest -> Note)
                '<div class="cio-fields cio-fields-v846">' +
                  '<div class="cio-field">' +
                    '<label class="cio-label">' + escapeHtml(JV('社員', 'Nhân viên')) + '</label>' +
                    '<button type="button" class="cio-picker-btn" id="cio-emp-btn">' +
                      '<span class="cio-picker-btn-text" id="cio-emp-text">' + escapeHtml(JV('選択', 'Chọn nhân viên')) + '</span>' +
                      '<span class="cio-picker-btn-sub" id="cio-emp-sub"></span>' +
                    '</button>' +
                    '<label class="cio-default-row"><input type="checkbox" id="cio-emp-default" /> <span>' + escapeHtml(JV('既定', 'Đặt làm mặc định')) + '</span></label>' +
                  '</div>' +

                  '<div class="cio-field">' +
                    '<label class="cio-label">' + escapeHtml(JV('行先', 'Điểm đến')) + '</label>' +
                    '<button type="button" class="cio-picker-btn" id="cio-dest-btn">' +
                      '<span class="cio-picker-btn-text" id="cio-dest-text">' + escapeHtml(JV('選択', 'Chọn điểm đến')) + '</span>' +
                      '<span class="cio-picker-btn-sub" id="cio-dest-sub"></span>' +
                    '</button>' +
                    '<label class="cio-default-row"><input type="checkbox" id="cio-dest-default" /> <span>' + escapeHtml(JV('既定', 'Đặt làm mặc định')) + '</span></label>' +
                  '</div>' +

                  '<div class="cio-field">' +
                    '<label class="cio-label">' + escapeHtml(JV('メモ', 'Ghi chú')) + '</label>' +
                    '<input id="cio-note" class="cio-control" type="text" placeholder="..." />' +
                  '</div>' +
                '</div>' +

                // Stamp buttons moved below fields
                '<div class="cio-stamp cio-stamp-v846">' +
                  '<button type="button" class="cio-stamp-btn in" id="cio-stamp-in"><div class="ja">IN</div><div class="vi">Nhập kho</div></button>' +
                  '<button type="button" class="cio-stamp-btn out" id="cio-stamp-out"><div class="ja">OUT</div><div class="vi">Xuất kho</div></button>' +
                '</div>' +

              '</div>' +
            '</div>' +
          '</div>' +

          // History second in DOM (mobile: below controls)
          '<div class="cio-col cio-col-history">' +
            '<div class="cio-card cio-history-card">' +
              '<div class="cio-card-head">' +
                '<div class="cio-card-title"><div class="ja">履歴</div><div class="vi">Lịch sử</div></div>' +
                  '<div class="cio-card-right">' +
                    '<button type="button" class="cio-mini-btn" id="cio-history-unlock">' +
                      '<span class="ja">解除</span><span class="vi">Unlock</span>' +
                    '</button>' +
                  '<input id="cio-history-search" class="cio-search" type="text" placeholder="Search..." autocomplete="off" />' +
                '</div>' +
              '</div>' +
              '<div class="cio-history-scroll">' +
                '<table class="cio-history-table" id="cio-history-table">' +
                  '<thead><tr>' +
                    '<th><div class="ja">時刻</div><div class="vi">Thời gian</div></th>' +
                    '<th><div class="ja">入出</div><div class="vi">IN/OUT</div></th>' +
                    '<th><div class="ja">行先</div><div class="vi">Điểm đến</div></th>' +
                    '<th><div class="ja">社員</div><div class="vi">Nhân viên</div></th>' +
                    '<th><div class="ja">メモ</div><div class="vi">Ghi chú</div></th>' +
                    '<th class="cio-col-extra"><div class="ja">同期</div><div class="vi">Đồng bộ</div></th>' +
                    '<th class="cio-col-extra"><div class="ja">操作</div><div class="vi">Xóa</div></th>' +
                  '</tr></thead>'+
                  '<tbody id="cio-history-tbody">' + (buildHistoryRowsHtml(item) || '') + '</tbody>' +
                '</table>' +
                '<div class="cio-empty hidden" id="cio-history-empty">' + escapeHtml(JV('履歴なし', 'Chưa có lịch sử')) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>'
    );
  }

  function updateStatusPill(item) {
    var el = document.getElementById('cio-status');
    if (!el) return;

    var st = getLastKnownStatus(item);
    if (!st) {
      el.textContent = 'NO-HIS';
      el.className = 'cio-status-pill unknown';
      return;
    }

    el.textContent = st;
    el.className = 'cio-status-pill ' + (st === 'IN' ? 'in' : 'out');
  }

  function updateEmpButton() {
    var t = document.getElementById('cio-emp-text');
    var sub = document.getElementById('cio-emp-sub');
    if (!t) return;

    var id = selectedEmpId || getDefaultEmpId();
    if (!id) {
      t.textContent = JV('選択', 'Chọn nhân viên');
      if (sub) sub.textContent = '';
      return;
    }

    t.textContent = getEmployeeName(id) || id;
    if (sub) sub.textContent = id;
  }

  function updateDestButton() {
    var t = document.getElementById('cio-dest-text');
    var sub = document.getElementById('cio-dest-sub');
    if (!t) return;

    var id = selectedDestId || getDefaultDestId();
    if (!id) {
      t.textContent = JV('選択', 'Chọn điểm đến');
      if (sub) sub.textContent = '';
      return;
    }

    t.textContent = getDestinationName(id) || id;
    if (sub) sub.textContent = id;
  }

  
  // ----------------------------- Confirm dialog -----------------------------

  var confirmDialog = { open: false, onOk: null, onCancel: null };

  function closeConfirmDialog() {
    confirmDialog.open = false;
    confirmDialog.onOk = null;
    confirmDialog.onCancel = null;
    var cf = document.getElementById('cio-confirm');
    if (!cf) return;
    cf.classList.add('hidden');
    cf.innerHTML = '';
  }

  function openConfirmDialog(opts) {
    var o = (opts && typeof opts === 'object') ? opts : {};

    confirmDialog.open = true;
    confirmDialog.onOk = (typeof o.onOk === 'function') ? o.onOk : null;
    confirmDialog.onCancel = (typeof o.onCancel === 'function') ? o.onCancel : null;

    var titleJa = String(o.titleJa || '確認');
    var titleVi = String(o.titleVi || 'Xác nhận');
    var msgJa = String(o.msgJa || '');
    var msgVi = String(o.msgVi || '');
    var okJa = String(o.okJa || '削除');
    var okVi = String(o.okVi || 'Xóa');
    var cancelJa = String(o.cancelJa || 'キャンセル');
    var cancelVi = String(o.cancelVi || 'Hủy');

    var cf = document.getElementById('cio-confirm');
    if (!cf) return;

    var html = '';
    html += '<div class="cio-dest-sheet-card cio-picker-card" role="dialog" aria-modal="true">';
    html +=   '<div class="cio-dest-sheet-head">';
    html +=     '<div class="cio-dest-sheet-title">';
    html +=       '<div class="ja">' + escapeHtml(titleJa) + '</div>';
    html +=       '<div class="vi">' + escapeHtml(titleVi) + '</div>';
    html +=     '</div>';
    html +=     '<button type="button" class="cio-mini-btn" id="cio-confirm-close">';
    html +=       '<span class="ja">閉じる</span><span class="vi">Đóng</span>';
    html +=     '</button>';
    html +=   '</div>';

    html +=   '<div class="cio-dest-sheet-body">';
    html +=     '<div class="cio-picker-help">';
    if (msgJa) html += '<div class="cio-picker-help-line"><div class="ja">' + escapeHtml(msgJa) + '</div></div>';
    if (msgVi) html += '<div class="cio-picker-help-line cio-attn"><div class="vi">' + escapeHtml(msgVi) + '</div></div>';
    html +=     '</div>';

    html += '<div class="cio-confirm-actions">';
    html +=   '<button type="button" class="cio-confirm-btn cio-confirm-cancel" id="cio-confirm-cancel">' +
                '<div class="ja">' + escapeHtml(cancelJa) + '</div>' +
                '<div class="vi">' + escapeHtml(cancelVi) + '</div>' +
              '</button>';
    html +=   '<button type="button" class="cio-confirm-btn cio-confirm-danger" id="cio-confirm-ok">' +
                '<div class="ja">' + escapeHtml(okJa) + '</div>' +
                '<div class="vi">' + escapeHtml(okVi) + '</div>' +
              '</button>';
    html += '</div>';


    html +=   '</div>';
    html += '</div>';

    cf.innerHTML = html;
    cf.classList.remove('hidden');

    function cancel() {
      try { if (confirmDialog.onCancel) confirmDialog.onCancel(); } catch (e0) {}
      closeConfirmDialog();
    }

    function ok() {
      try { if (confirmDialog.onOk) confirmDialog.onOk(); } catch (e1) {}
      closeConfirmDialog();
    }

    cf.addEventListener('click', function (e) {
      if (e.target === cf) cancel();
    }, { once: true });

    var btnClose = document.getElementById('cio-confirm-close');
    if (btnClose) btnClose.addEventListener('click', cancel, { once: true });

    var btnCancel = document.getElementById('cio-confirm-cancel');
    if (btnCancel) btnCancel.addEventListener('click', cancel, { once: true });

    var btnOk = document.getElementById('cio-confirm-ok');
    if (btnOk) btnOk.addEventListener('click', ok, { once: true });

    document.addEventListener('keydown', function escOnce(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        document.removeEventListener('keydown', escOnce);
        cancel();
      }
    });
  }

// ----------------------------- Picker -----------------------------
  function closePicker() {
    picker.open = false;
    picker.kind = '';
    picker.fromAction = '';
    picker.onSelected = null;
    picker.onCancel = null;

    var pk = document.getElementById('cio-picker');
    if (!pk) return;
    pk.classList.add('hidden');
    pk.innerHTML = '';
  }

  function buildPickerHtml(kind, helpHtml) {
    var cfg = getCfg();

    var titleJa = (kind === 'emp') ? '社員' : '行先';
    var titleVi = (kind === 'emp') ? 'Chọn nhân viên' : 'Chọn điểm đến';

    var quick = (kind === 'emp') ? getQuickEmployees(cfg.quickEmpLimit) : getQuickDestinations(cfg.quickDestLimit);

    var quickHtml = '';
    quick.forEach(function (d, i) {
      var display = (kind === 'emp') ? (d.nameShort || d.nameFull || d.name || d.id) : (d.name || d.id);
      var full = (kind === 'emp') ? (d.nameFull || d.name || d.id) : (d.name || d.id);

      quickHtml += (
        '<button type="button" class="cio-quick-dest" data-pick-id="' + escapeHtml(d.id) + '" title="' + escapeHtml(full) + '">' +
          '<span class="cio-quick-no">' + escapeHtml(String(i + 1)) + '</span>' +
          '<span class="cio-quick-name">' + escapeHtml(display) + '</span>' +
          ((kind === 'emp') ? ('<span class="cio-quick-tooltip">' + escapeHtml(full) + '</span>') : '') +
        '</button>'
      );
    });

    var allLabel = (kind === 'emp') ? JV('全て', 'Tất cả nhân viên') : JV('全て', 'Tất cả địa điểm');

    return (
      '<div class="cio-dest-sheet-card cio-picker-card" role="dialog" aria-modal="true">' +
        '<div class="cio-dest-sheet-head">' +
          '<div class="cio-dest-sheet-title">' +
            '<div class="ja">' + escapeHtml(titleJa) + '</div>' +
            '<div class="vi">' + escapeHtml(titleVi) + '</div>' +
          '</div>' +
          '<button type="button" class="cio-mini-btn" id="cio-picker-close"><span class="ja">×</span><span class="vi">Đóng</span></button>' +
        '</div>' +

        '<div class="cio-dest-sheet-body">' +
          (helpHtml ? ('<div class="cio-picker-help">' + helpHtml + '</div>') : '') +
          '<div class="cio-dest-quick" id="cio-pick-quick">' + quickHtml + '</div>' +
          '<div class="cio-dest-all">' +
            '<label class="cio-label">' + escapeHtml(allLabel) + '</label>' +
            '<div id="cio-pick-all"></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPickerDropdown(kind) {
    var host = document.getElementById('cio-pick-all');
    if (!host) return;

    var list = (kind === 'emp') ? getEmployees() : getDestinations();
    var idKey = (kind === 'emp') ? 'EmployeeID' : 'DestinationID';
    var nameKey = (kind === 'emp') ? 'EmployeeName' : 'DestinationName';

    var sel = document.createElement('select');
    sel.id = 'cio-pick-select';
    sel.className = 'cio-control';

    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = JV('選択してください', '— Chọn —');
    sel.appendChild(opt0);

    safeArray(list).forEach(function (x) {
      var id = normalizeId(x && x[idKey]);
      if (!id) return;
      var nm = String((x && (x[nameKey] || x.name)) || id);
      var op = document.createElement('option');
      op.value = id;
      op.textContent = nm;
      sel.appendChild(op);
    });

    host.innerHTML = '';
    host.appendChild(sel);

    sel.addEventListener('change', function () {
      var id2 = String(sel.value || '').trim();
      // Cho phép reset về trống (không auto đóng nếu reset)
      if (!id2) {
        if (kind === 'emp') { selectedEmpId = ''; updateEmpButton(); }
        else {
          selectedDestId = '';
          updateDestButton();

          var chkD = document.getElementById('cio-dest-default');
          if (chkD) chkD.checked = false;
          clearDefaultDestId();
        }

      }

      onPickerSelected(id2);
    });
  }

  function openPicker(kind, opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};

    picker.open = true;
    picker.kind = kind;
    picker.fromAction = options.fromAction || '';
    picker.onSelected = (typeof options.onSelected === 'function') ? options.onSelected : null;
    picker.onCancel = (typeof options.onCancel === 'function') ? options.onCancel : null;

    var pk = document.getElementById('cio-picker');
    if (!pk) return;

    var helpHtml = options.helpHtml || '';
    pk.innerHTML = buildPickerHtml(kind, helpHtml);
    pk.classList.remove('hidden');

    // close by click outside
    pk.addEventListener('click', function (e) {
      if (e.target === pk) {
        try { if (picker.onCancel) picker.onCancel(); } catch (e0) {}
        closePicker();
      }
    }, { once: true });

    // close button
    var closeBtn = document.getElementById('cio-picker-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        try { if (picker.onCancel) picker.onCancel(); } catch (e1) {}
        closePicker();
      });
    }

    // back button (only when needed)
    if (options.showBack && typeof options.onBack === 'function') {
      try {
        var head = pk.querySelector('.cio-dest-sheet-head');
        if (head && !head.querySelector('#cio-picker-back')) {
          head.insertAdjacentHTML(
            'afterbegin',
            '<button type="button" class="cio-mini-btn" id="cio-picker-back"><span class="ja">←</span><span class="vi">Quay lại</span></button>'
          );

          var backBtn = document.getElementById('cio-picker-back');
          if (backBtn) {
            backBtn.addEventListener('click', function () {
              closePicker();
              try { options.onBack(); } catch (e0) {}
            });
          }
        }
      } catch (e4) {}
    }

    // esc
    document.addEventListener('keydown', function escOnce(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        document.removeEventListener('keydown', escOnce);
        try { if (picker.onCancel) picker.onCancel(); } catch (e2) {}
        closePicker();
      }
    });

    // quick picks
    try {
      pk.querySelectorAll('[data-pick-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = String(btn.getAttribute('data-pick-id') || '').trim();
          if (!id) return;
          onPickerSelected(id);
        });
      });
    } catch (e3) {}

    renderPickerDropdown(kind);
    bindLongPressTooltip(pk);
  }

  function bindLongPressTooltip(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.cio-quick-dest').forEach(function (btn) {
      var t = null;

      btn.addEventListener('touchstart', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          btn.classList.add('show-tooltip');
        }, 420);
      }, { passive: true });

      function clearTip() {
        clearTimeout(t);
        btn.classList.remove('show-tooltip');
      }

      btn.addEventListener('touchend', clearTip, { passive: true });
      btn.addEventListener('touchcancel', clearTip, { passive: true });
      btn.addEventListener('touchmove', clearTip, { passive: true });
    });
  }

  function onPickerSelected(id) {
    if (!picker.open) return;

    var pickedId = String(id).trim();
    var cb = picker.onSelected;

    if (picker.kind === 'emp') {
      selectedEmpId = pickedId;
      updateEmpButton();

      var chk = document.getElementById('cio-emp-default');
      if (chk && chk.checked) setDefaultEmpId(selectedEmpId);
    } else if (picker.kind === 'dest') {
      selectedDestId = pickedId;
      updateDestButton();

      var chkD = document.getElementById('cio-dest-default');
      if (chkD && chkD.checked) setDefaultDestId(selectedDestId);
    }

    closePicker();

    try {
      if (cb) cb(pickedId);
    } catch (e0) {}
  }


  // ----------------------------- Save sync -----------------------------
  function addPendingLocal(logData) {
    try {
      if (global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.add === 'function') {
        return global.DataManager.PendingCache.add(logData);
      }
    } catch (e0) {}

    try {
      if (global.DataManager && global.DataManager.data) {
        if (!Array.isArray(global.DataManager.data.statuslogs)) global.DataManager.data.statuslogs = [];
        var pending = Object.assign({}, logData, {
          pending: true,
          localId: 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
          createdAt: new Date().toISOString()
        });
        global.DataManager.data.statuslogs.unshift(pending);
        if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
        return pending;
      }
    } catch (e1) {}

    return null;
  }

  function removePendingLocal(pendingObj, serverObj) {
    try {
      var localId = pendingObj && (pendingObj.localId || pendingObj.LocalId);
      if (localId && global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.remove === 'function') {
        global.DataManager.PendingCache.remove(String(localId));
      }
    } catch (e0) {}

    try {
      if (global.DataManager && global.DataManager.data && Array.isArray(global.DataManager.data.statuslogs)) {
        var ts = String((pendingObj && pendingObj.Timestamp) || '');
        var lid = String((pendingObj && pendingObj.localId) || '');

        global.DataManager.data.statuslogs = global.DataManager.data.statuslogs.filter(function (l) {
          if (!l) return false;
          if (lid && String(l.localId || '') === lid) return false;
          if (ts && String(l.Timestamp || '') === ts && l.pending === true) return false;
          return true;
        });

        if (serverObj) global.DataManager.data.statuslogs.unshift(serverObj);
        if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
      }
    } catch (e1) {}
  }

  function markPendingError(pendingObj, errMsg) {
    try {
      if (pendingObj) {
        pendingObj.syncError = String(errMsg || 'Sync error');
        pendingObj.syncErrorAt = new Date().toISOString();
      }
      if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e0) {}
  }

  var backendWarmed = false;

  function warmupBackendOnce() {
    if (backendWarmed) return;
    backendWarmed = true;

    try {
      var cfg = getCfg();
      var api = String(cfg.apiUrl || '');
      var healthUrl = api.replace('/api/checklog', '/api/health');
      if (healthUrl.indexOf('/api/health') >= 0) {
        fetch(healthUrl, { method: 'GET' }).catch(function () {});
      }
    } catch (e0) {}
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function syncLog(mode, item, logData, pendingObj) {
    warmupBackendOnce();

    var cfg = getCfg();
    var key = getItemKey(item);

    function attempt(n) {
      return fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        keepalive: true,
        body: JSON.stringify({
          mode: mode,
          itemType: key.itemType,
          MoldID: logData.MoldID,
          CutterID: logData.CutterID,
          Timestamp: logData.Timestamp,
          Status: logData.Status,
          DestinationID: logData.DestinationID,
          EmployeeID: logData.EmployeeID,
          Notes: logData.Notes
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (rj) {
        if (!rj || !rj.success) throw new Error((rj && rj.message) ? rj.message : 'Sync failed');
        removePendingLocal(pendingObj, rj.newStatusLog || null);
        return rj;
      }).catch(function (err) {
        if (n < 2) {
          return sleep(900).then(function () { return attempt(n + 1); });
        }
        markPendingError(pendingObj, err && err.message ? err.message : 'Sync error');
        throw err;
      });
    }

    return attempt(0);
  }


  function createLogData(mode, item, empId, destId) {
    var key = getItemKey(item);
    var noteEl = document.getElementById('cio-note');
    var notes = String(noteEl ? (noteEl.value || '') : '').trim();

    var ts = new Date().toISOString();
    var status = (mode === 'check-in') ? 'IN' : 'OUT';

    return {
      StatusLogID: 'S' + Date.now(),
      Timestamp: ts,
      MoldID: (key.itemType === 'mold') ? key.id : null,
      CutterID: (key.itemType === 'cutter') ? key.id : null,
      Status: status,
      DestinationID: destId || null,
      EmployeeID: empId || null,
      Notes: notes
    };
  }

  function fireDetailChanged(source) {
    try {
      var k = getItemKey(currentItem);
      document.dispatchEvent(new CustomEvent('detailchanged', {
        detail: { item: currentItem, itemType: k.itemType, itemId: k.id, source: source || 'checkin-stamp' }
      }));
    } catch (e0) {}
  }

  // ----------------------------- Actions -----------------------------
  function ensureEmpThen(next, onCancel, opts) {
    var o = (opts && typeof opts === 'object') ? opts : {};
    var id = selectedEmpId || getDefaultEmpId();
    if (id) {
      selectedEmpId = id;
      updateEmpButton();
      next(id);
      return;
    }

    var help;
      if (o.fromAction === 'out') {
        help = helpHtmlJV(
          '社員を選んで続行します。その後、行先を選択します。閉じる/キャンセルで戻ります',
          'Chọn nhân viên để tiếp tục, sau đó sẽ chọn nơi đến, bấm đóng/hủy để quay lại',
          true
        );
      } else {
        help = helpHtmlJV(
          '社員を選ぶとすぐ実行します。閉じる/キャンセルで戻ります',
          'Chọn nhân viên để thực hiện ngay, bấm đóng/hủy để quay lại',
          true
        );
      }

    openPicker('emp', {
      fromAction: (o.fromAction || ''),
      helpHtml: help,
      onSelected: function (empId) { next(empId); },
      onCancel: function () { if (typeof onCancel === 'function') onCancel(); }
    });
  }

  function ensureOutFieldsThen(next, onCancel) {
    ensureEmpThen(function () {
      var dest = selectedDestId || getDefaultDestId();
      if (dest) {
        selectedDestId = dest;
        updateDestButton();
        next();
        return;
      }

      var help = '';
      help += helpHtmlJV('OUTを完了するため、行先を選択してください', 'Chọn điểm đến để hoàn tất OUT', true);

      function openDestPickerForOut() {
        var help = '';
        help += helpHtmlJV('OUTを完了するため、行先を選択してください', 'Chọn điểm đến để hoàn tất OUT', true);

        openPicker('dest', {
          fromAction: 'out',
          helpHtml: help,
          showBack: true,
          onBack: function () {
            openEmpPickerForOutChange();
          },
          onSelected: function () { next(); },
          onCancel: function () { if (typeof onCancel === 'function') onCancel(); }
        });
      }

      function openEmpPickerForOutChange() {
        var helpEmp = helpHtmlJV(
          '社員を選んで続行します。その後、行先を選択します。閉じる/キャンセルで戻ります',
          'Chọn nhân viên để tiếp tục, sau đó sẽ chọn nơi đến, bấm đóng/hủy để quay lại',
          true
        );

        openPicker('emp', {
          fromAction: 'out',
          helpHtml: helpEmp,
          onSelected: function (empId) {
            selectedEmpId = empId;
            updateEmpButton();
            openDestPickerForOut();
          },
          onCancel: function () {
            openDestPickerForOut();
          }
        });
      }

      openDestPickerForOut();


    }, onCancel, { fromAction: 'out' });
  }

  function doStampIn() {
    if (!currentItem) return;

    ensureEmpThen(function (empId) {
      var cfg = getCfg();

      // IN: dest optional, ưu tiên dùng selectedDestId nếu người dùng đã chọn
      var destId = selectedDestId || cfg.defaultCheckinDestinationId;

      var logData = createLogData('check-in', currentItem, empId, destId);
      var pending = addPendingLocal(logData);

      showToast('warning', '', 'Đã ghi tạm, đang đồng bộ');
      fireDetailChanged('checkin-in');

      // Auto close panel ngay
      close();

      syncLog('check-in', currentItem, logData, pending)
        .then(function () { showToast('success', '', 'Đã IN'); })
        .catch(function () { showToast('error', '', 'Lỗi đồng bộ (đã lưu tạm)'); });
      try {
        document.dispatchEvent(new CustomEvent('data-manager-updated', { detail: { source: 'checkinout', table: 'statuslogs' } }));
      } catch (e0) {}

    }, function () {
      // cancel
    });
  }

  function doStampOut() {
    if (!currentItem) return;

    ensureOutFieldsThen(function () {
      var empId = selectedEmpId || getDefaultEmpId();
      if (!empId) return;

      var destId = selectedDestId || (currentItem ? getLastKnownDestinationId(currentItem) : '');
      if (!destId) return;

      var logData = createLogData('check-out', currentItem, empId, destId);
      var pending = addPendingLocal(logData);

      showToast('warning', '', 'Đã ghi tạm, đang đồng bộ');
      fireDetailChanged('checkin-out');

      // Auto close panel ngay
      close();

      syncLog('check-out', currentItem, logData, pending)
        .then(function () { showToast('success', '', 'Đã OUT'); })
        .catch(function () { showToast('error', '', 'Lỗi đồng bộ (đã lưu tạm)'); });
      try {
        document.dispatchEvent(new CustomEvent('data-manager-updated', { detail: { source: 'checkinout', table: 'statuslogs' } }));
      } catch (e0) {}

    }, function () {
      // cancel
    });
  }

  // ----------------------------- Bind events -----------------------------
  function renderHistoryNow() {
    var tbody = document.getElementById('cio-history-tbody');
    var empty = document.getElementById('cio-history-empty');
    if (!tbody) return;

    var qEl = document.getElementById('cio-history-search');
    var q = String(qEl ? qEl.value : '').trim().toLowerCase();

    var logs = sortLogsNewestFirst(getLogsForItem(currentItem)).slice(0, 200);

    if (q) {
      logs = logs.filter(function (l) {
        try {
          var s = '';
          s += String(l.Timestamp || '');
          s += ' ' + String(l.Status || '');
          s += ' ' + String(getDestinationName(l.DestinationID) || '');
          s += ' ' + String(getEmployeeName(l.EmployeeID) || '');
          s += ' ' + String(l.Notes || '');
          return s.toLowerCase().indexOf(q) >= 0;
        } catch (e0) {
          return false;
        }
      });
    }

    if (!logs.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    var html = '';
    logs.forEach(function (l) {
      var st = String(l.Status || '').toUpperCase();
      var badgeCls = (st === 'IN') ? 'in' : ((st === 'OUT') ? 'out' : '');
      var badge = '<span class="cio-recent-st ' + escapeHtml(badgeCls) + '">' + escapeHtml(st || '-') + '</span>';

      var syncText = '-';
      var syncCls = '';
      if (l && l.pending === true) { syncText = JV('未同期', 'Chưa đồng bộ'); syncCls = 'pending'; }
      else if (l && l.syncError) { syncText = JV('エラー', 'Lỗi'); syncCls = 'error'; }
      else { syncText = JV('同期済', 'Đã đồng bộ'); syncCls = 'ok'; }

      var delId = String(l.StatusLogID || l.localId || '');
      var canDelete = !!delId;

      html += '<tr>' +
        '<td class="cio-td-time">' + fmtDateTime2LineHtml(l.Timestamp) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + escapeHtml(getDestinationName(l.DestinationID) || '-') + '</td>' +
        '<td>' + escapeHtml(getEmployeeName(l.EmployeeID) || '-') + '</td>' +
        '<td class="cio-td-note">' + escapeHtml(String(l.Notes || '')) + '</td>' +
        '<td class="cio-col-extra"><span class="cio-sync-pill ' + escapeHtml(syncCls) + '">' + escapeHtml(syncText) + '</span></td>' +
        '<td class="cio-col-extra">' +
          (canDelete
            ? ('<button type="button" class="cio-del-btn" data-del-id="' + escapeHtml(delId) + '"><div class="ja">削除</div><div class="vi">Xóa</div></button>')
            : '-') +
        '</td>' +
      '</tr>';
    });

    tbody.innerHTML = html;
  }


  function bindDefaultEmpCheckbox() {
    var chk = document.getElementById('cio-emp-default');
    if (!chk) return;

    chk.checked = !!getDefaultEmpId();

    chk.addEventListener('change', function () {
      if (chk.checked) {
        var empId = selectedEmpId;
        if (!empId) {
          showToast('warning', '', 'Bạn cần chọn nhân viên trước');
          chk.checked = false;
          return;
        }
        setDefaultEmpId(empId);
        showToast('success', '', 'Đặt nhân viên mặc định');
      } else {
        clearDefaultEmpId();
        showToast('success', '', 'Bỏ nhân viên mặc định');
      }
    });
  }

  function bindDefaultDestCheckbox() {
    var chk = document.getElementById('cio-dest-default');
    if (!chk) return;

    chk.checked = !!getDefaultDestId();

    chk.addEventListener('change', function () {
      if (chk.checked) {
        var id = selectedDestId;
        if (!id) {
          showToast('warning', '', 'Bạn cần chọn điểm đến trước');
          chk.checked = false;
          return;
        }
        setDefaultDestId(id);
        showToast('success', '', 'Đặt điểm đến mặc định');
      } else {
        clearDefaultDestId();
        showToast('success', '', 'Bỏ điểm đến mặc định');
      }
    });
  }

  function bindEvents() {
    var bd = document.getElementById('cio-backdrop');
    if (bd && bd.dataset.bound !== '1') {
      bd.dataset.bound = '1';
      bd.addEventListener('click', close);
    }

    var closeBtn = document.getElementById('cio-close');
    if (closeBtn && closeBtn.dataset.bound !== '1') {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', close);
    }

    var relocate = document.getElementById('cio-relocate');
    if (relocate && relocate.dataset.bound !== '1') {
      relocate.dataset.bound = '1';
      relocate.addEventListener('click', function () {
        try {
          if (global.LocationManager && typeof global.LocationManager.openModal === 'function') {
            close();
            global.LocationManager.openModal(currentItem);
            return;
          }
        } catch (e0) {}
        showToast('warning', 'LocationManager', 'Không tìm thấy module đổi vị trí');
      });
    }

    var stampIn = document.getElementById('cio-stamp-in');
    var stampOut = document.getElementById('cio-stamp-out');
    if (stampIn && stampIn.dataset.bound !== '1') {
      stampIn.dataset.bound = '1';
      stampIn.addEventListener('click', doStampIn);
    }
    if (stampOut && stampOut.dataset.bound !== '1') {
      stampOut.dataset.bound = '1';
      stampOut.addEventListener('click', doStampOut);
    }

    var empBtn = document.getElementById('cio-emp-btn');
    if (empBtn && empBtn.dataset.bound !== '1') {
      empBtn.dataset.bound = '1';
      empBtn.addEventListener('click', function () {
        openPicker('emp', {
          helpHtml: helpHtmlJV('社員を選択、選択後は自動で閉じます', 'Chọn nhân viên, chọn xong sẽ tự đóng', false)
        });
      });
    }

    var destBtn = document.getElementById('cio-dest-btn');
    if (destBtn && destBtn.dataset.bound !== '1') {
      destBtn.dataset.bound = '1';
      destBtn.addEventListener('click', function () {
        openPicker('dest', {
          helpHtml: helpHtmlJV('行先を選択、選択後は自動で閉じます', 'Chọn điểm đến, chọn xong sẽ tự đóng', false)
        });
      });
    }

    var search = document.getElementById('cio-history-search');
    if (search && search.dataset.bound !== '1') {
      search.dataset.bound = '1';
      search.addEventListener('input', function () {
        if (currentItem) renderHistoryNow();
      });
    }

    if (!document.body.dataset.cioEscBound) {
      document.body.dataset.cioEscBound = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          var p = document.getElementById('cio-panel');
          if (p && !p.classList.contains('hidden')) close();
        }
      });
    }

    var unlockBtn = document.getElementById('cio-history-unlock');
      if (unlockBtn && unlockBtn.dataset.bound !== '1') {
        unlockBtn.dataset.bound = '1';
        unlockBtn.addEventListener('click', function () {
          historyUnlocked = !historyUnlocked;

          var panel = document.getElementById('cio-panel');
          if (panel) panel.classList.toggle('cio-history-unlocked', historyUnlocked);

          unlockBtn.innerHTML = historyUnlocked
            ? '<span class="ja">施錠</span><span class="vi">Lock</span>'
            : '<span class="ja">解除</span><span class="vi">Unlock</span>';
        });
      }

    
    var tbody = document.getElementById('cio-history-tbody');
    if (tbody && tbody.dataset.boundDel !== '1') {
      tbody.dataset.boundDel = '1';

      tbody.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.cio-del-btn') : null;
        if (!btn) return;

        if (typeof historyUnlocked !== 'undefined' && !historyUnlocked) {
          showToast('warning', '', JV('解除してから削除できます', 'Cần Unlock trước khi xóa'));
          return;
        }

        var delId = String(btn.getAttribute('data-del-id') || '').trim();
        if (!delId) {
          showToast('error', '', JV('IDがありません', 'Không có ID để xóa'));
          return;
        }

        openConfirmDialog({
          titleJa: '削除確認',
          titleVi: 'Xác nhận xóa',
          msgJa: 'この履歴を削除します。よろしいですか？',
          msgVi: 'Bạn có chắc muốn xóa dòng này không?',
          okJa: '削除',
          okVi: 'Xóa',
          cancelJa: 'キャンセル',
          cancelVi: 'Hủy',
          onOk: function () {
            var snap = removeStatusLogFromCacheById(delId);
            deleteSnapshots[delId] = snap;

            renderHistoryNow();
            showToast('warning', '', JV('サーバー削除中...', 'Đã xóa khỏi bảng, đang xóa trên server...'));

            deleteQueue.push({ delId: delId });
            runDeleteQueue();

          },
          onCancel: function () {}
        });
      });
    }

bindDefaultEmpCheckbox();
    bindDefaultDestCheckbox();
  }

  // ----------------------------- Open / Close -----------------------------
  function openInternal(preferredMode, item) {
    if (!item) {
      alert(JV('対象がありません', 'Không có đối tượng'));
      return;
    }

    ensureSkeleton();

    currentItem = item;
    currentPreferredMode = preferredMode || 'stamp';
    opened = true;

    var panel = document.getElementById('cio-panel');
    var bd = document.getElementById('cio-backdrop');

    panel.innerHTML = buildHtml(item);

    if (bd) bd.classList.remove('hidden');
    if (panel) panel.classList.remove('hidden');

    lockBody();

    // init state
    selectedEmpId = '';
    selectedDestId = '';

    updateStatusPill(item);
    updateEmpButton();
    updateDestButton();

    // highlight preferred button
    try {
      if (currentPreferredMode === 'check-in') {
        var inBtn = document.getElementById('cio-stamp-in');
        if (inBtn) inBtn.classList.add('pulse');
      }
      if (currentPreferredMode === 'check-out') {
        var outBtn = document.getElementById('cio-stamp-out');
        if (outBtn) outBtn.classList.add('pulse');
      }
    } catch (e0) {}

    // history empty state
    try {
      var tbody = document.getElementById('cio-history-tbody');
      var empty = document.getElementById('cio-history-empty');
      if (tbody && (!tbody.innerHTML || !tbody.innerHTML.trim())) {
        if (empty) empty.classList.remove('hidden');
      }
    } catch (e1) {}

    bindEvents();

    setTimeout(function () {
      try {
        var s = document.getElementById('cio-history-search');
        if (s && !isMobile()) s.focus();
      } catch (e2) {}
    }, 0);
  }

  function openStamp(item) { openInternal('stamp', item); }

  function openModal(mode, item) {
    var m = String(mode || '').toLowerCase();
    if (m === 'check-out' || m === 'checkout' || m === 'out') return openInternal('check-out', item);
    if (m === 'check-in' || m === 'checkin' || m === 'in') return openInternal('check-in', item);
    return openInternal('stamp', item);
  }

  function openSmart(item) {
    var st = '';
    try { st = getLastKnownStatus(item); } catch (e0) { st = ''; }

    if (String(st).toUpperCase() === 'IN') return openInternal('check-out', item);
    if (String(st).toUpperCase() === 'OUT') return openInternal('check-in', item);

    return openInternal('stamp', item);
  }

  function close() {
    closePicker();

    opened = false;
    currentItem = null;
    currentPreferredMode = 'stamp';

    var bd = document.getElementById('cio-backdrop');
    var panel = document.getElementById('cio-panel');

    if (bd) bd.classList.add('hidden');
    if (panel) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
    }

    unlockBody();
  }

  // ----------------------------- Integration: quick-action -----------------------------
  function bindQuickActionCapture() {
    try {
      if (document.body && document.body.dataset && document.body.dataset.cioQuickBound) return;
      if (document.body && document.body.dataset) document.body.dataset.cioQuickBound = '1';
    } catch (e0) {}

    document.addEventListener('quick-action', function (e) {
      try {
        var d = (e && e.detail) ? e.detail : {};
        var action = d.action;
        var item = d.item;
        if (!action) return;

        var a = String(action).toLowerCase().trim();

        if (a === 'inout' || a === 'stamp') {
          try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch (e1) {}
          openSmart(item);
          return;
        }

        if (a === 'checkin' || a === 'check-in' || a === 'in') {
          try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch (e2) {}
          openModal('check-in', item);
          return;
        }

        if (a === 'checkout' || a === 'check-out' || a === 'out') {
          try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch (e3) {}
          openModal('check-out', item);
          return;
        }
      } catch (err) {
        // ignore
      }
    }, true);
  }

  // ----------------------------- Public API -----------------------------
  var CheckInOut = {
    version: VERSION,
    openStamp: openStamp,
    openSmart: openSmart,
    openModal: openModal,
    close: close
  };

  try { bindQuickActionCapture(); } catch (e0) {}
  global.CheckInOut = CheckInOut;

  try { console.log('[CheckInOut]', VERSION, 'loaded'); } catch (e1) {}

})(window);
