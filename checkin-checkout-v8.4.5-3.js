/* checkin-checkout-v8.4.5-3.js
   MoldCutterSearch - Check-in / Check-out modal (Mobile one-hand + bilingual)

   Requirements (2026-02-28):
   - Bắt buộc song ngữ Nhật/Việt (2 dòng) cho toàn bộ nội dung UI.
   - Mobile: 1) Thông tin đối tượng (top) 2) Lịch sử (scroll) 3) Nhập thông tin (dock cố định dưới, không cuộn).
   - Không inline style, không nhúng CSS trong JS.
   - Dock: cố định vị trí trường, không nháy khi đổi mode; Destination ở Check-in không bắt buộc.
   - Default employee: EmployeeID = 1 (nếu chưa có mặc định lưu).
   - Vuốt xuống để đóng modal khi vuốt ở khu vực nhập liệu (grabber trong dock).

   CSS: checkin-checkout-v8.4.5-3.css (phải được nhúng riêng trong HTML).
*/

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5-3';

  var DEFAULT_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
  var DEFAULT_DELETE_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/deletelog';

  function getCfg() {
    var c = (global.CIOCONFIG && typeof global.CIOCONFIG === 'object') ? global.CIOCONFIG : {};
    return {
      apiUrl: c.apiUrl || DEFAULT_API_URL,
      deleteApiUrl: c.deleteApiUrl || DEFAULT_DELETE_API_URL
    };
  }

  var currentItem = null;
  var currentMode = 'check-in';
  var opened = false;

  var STORAGEKEY_DEFAULT_EMP = 'ciodefault-employee-id';
  var SESSIONKEY_LAST_ACTION = 'checkinlastactiontimestamp';

  var hisQuery = '';

  function safeArray(x) { return Array.isArray(x) ? x : []; }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
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

  function fmtDateTime(dateStr) {
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
    try { sessionStorage.setItem(SESSIONKEY_LAST_ACTION, String(Date.now())); } catch (e) {}
  }

  function getDefaultEmpId() {
    try {
      var v = localStorage.getItem(STORAGEKEY_DEFAULT_EMP);
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    } catch (e) {}
    return '1';
  }

  function setDefaultEmpId(id) {
    try {
      if (id) localStorage.setItem(STORAGEKEY_DEFAULT_EMP, String(id));
    } catch (e) {}
  }

  function clearDefaultEmpId() {
    try { localStorage.removeItem(STORAGEKEY_DEFAULT_EMP); } catch (e) {}
  }

  function notifyBi(type, msgJp, msgVi) {
    var vi = String(msgVi || '');
    var jp = String(msgJp || '');

    try {
      if (global.notify && typeof global.notify === 'object') {
        var msg = vi || jp;
        if (type === 'success' && typeof global.notify.success === 'function') return global.notify.success(msg);
        if (type === 'warning' && typeof global.notify.warning === 'function') return global.notify.warning(msg);
        if (type === 'error' && typeof global.notify.error === 'function') return global.notify.error(msg);
        if (typeof global.notify.info === 'function') return global.notify.info(msg);
      }
    } catch (e0) {}

    try {
      if (global.NotificationModule && typeof global.NotificationModule.show === 'function') {
        return global.NotificationModule.show(vi || jp, jp || vi, type || 'info');
      }
    } catch (e1) {}

    alert((vi ? (vi + '\n') : '') + (jp || ''));
  }

  function biLabelHtml(jp, vi, wrapClass) {
    var cls = wrapClass || 'cio-bi';
    return '<span class="' + cls + '">' +
      '<span class="dp-label-jp">' + escapeHtml(jp) + '</span>' +
      '<span class="dp-label-vi">' + escapeHtml(vi) + '</span>' +
    '</span>';
  }

  function getItemKey(item) {
    if (item && item.MoldID !== undefined && item.MoldID !== null && String(item.MoldID).trim() !== '') {
      return { itemType: 'mold', id: normalizeId(item.MoldID), idField: 'MoldID' };
    }
    if (item && item.CutterID !== undefined && item.CutterID !== null && String(item.CutterID).trim() !== '') {
      return { itemType: 'cutter', id: normalizeId(item.CutterID), idField: 'CutterID' };
    }
    return { itemType: (item && item.type ? String(item.type) : 'unknown'), id: '', idField: '' };
  }

  function getDestinationName(destId, destList) {
    if (!destId) return '-';
    var list = safeArray(destList);
    var found = list.find(function (d) {
      return normalizeId(d.DestinationID) === normalizeId(destId);
    });
    return found ? String(found.DestinationName || found.name || destId) : String(destId);
  }

  function getEmployeeName(empId, empList) {
    if (!empId) return '-';
    var list = safeArray(empList);
    var found = list.find(function (e) {
      return normalizeId(e.EmployeeID) === normalizeId(empId);
    });
    return found ? String(found.EmployeeName || found.name || empId) : String(empId);
  }

  function normalizeLogPendingFlag(log) {
    if (!log) return { pending: false, error: false, localId: '' };
    var pending = !!(log.pending || log.Pending);
    var localId = String(log.localId || log.LocalId || '').trim();
    var error = !!(log.syncError || log.SyncError);
    return { pending: pending, error: error, localId: localId };
  }

  function parseSelectedIdFromInput(inputEl) {
    if (!inputEl) return '';

    if (inputEl.dataset && inputEl.dataset.selectedId) {
      return String(inputEl.dataset.selectedId).trim();
    }

    if (inputEl.tagName && String(inputEl.tagName).toLowerCase() === 'select') {
      return String(inputEl.value || '').trim();
    }

    var raw = String(inputEl.value || '').trim();
    if (!raw) return '';

    var m = raw.match(/\(([A-Za-z0-9._-]+)\)\s*$/);
    if (m) return String(m[1]).trim();

    m = raw.match(/\b([A-Za-z0-9._-]{1,})\b/);
    if (m) return String(m[1]).trim();

    return raw;
  }

  function ensureModalElements() {
    var bd = document.getElementById('cio-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'cio-backdrop';
      document.body.appendChild(bd);
    }

    var panel = document.getElementById('cio-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cio-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Check-in / Check-out');
      document.body.appendChild(panel);
    }

    return { backdrop: bd, panel: panel };
  }

  function removeModalElements() {
    var bd = document.getElementById('cio-backdrop');
    var panel = document.getElementById('cio-panel');

    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
  }

  function lockBodyScroll() {
    try {
      document.body.classList.add('modal-open');
    } catch (e) {}
  }

  function unlockBodyScroll() {
    try {
      var anyOther = document.getElementById('loc-panel') || document.getElementById('ship-panel');
      if (!anyOther) document.body.classList.remove('modal-open');
    } catch (e) {}
  }

  function computeObjectInfo(item) {
    var key = getItemKey(item);

    var isMold = key.itemType === 'mold';
    var typeJp = isMold ? '金型' : (key.itemType === 'cutter' ? '抜型' : '不明');
    var typeVi = isMold ? 'Khuôn' : (key.itemType === 'cutter' ? 'Dao' : 'Không rõ');

    var code = getField(item, ['displayCode', 'MoldCode', 'CutterNo', 'CutterCode', 'Code', 'code'], '-');
    var name = getField(item, ['MoldName', 'CutterName', 'CutterDesignName', 'Name', 'name'], '-');
    var size = getField(item, ['displaySize', 'Size', 'Dimensions', 'dimensions', 'KichThuoc', 'size'], '-');

    var dm = global.DataManager;
    var racksList = dm && dm.data ? dm.data.racks : null;

    var rackNum = getField(item, ['RackID', 'rackId', 'rack_id', 'rackNo', 'RackNo', 'rack_no'], '-');
    try {
      if (item && item.rackInfo && item.rackInfo.RackNumber) rackNum = item.rackInfo.RackNumber;
    } catch (e0) {}

    var layerNum = '-';
    try {
      if (item && item.rackLayerInfo && item.rackLayerInfo.RackLayerNumber) layerNum = item.rackLayerInfo.RackLayerNumber;
      else layerNum = getField(item, ['RackLayerID', 'rackLayerId', 'rack_layer_id', 'RackLayerNo', 'rackLayerNo'], '-');
    } catch (e1) {}

    var rackLayerText = (String(rackNum || '-').trim() || '-') + ' - ' + (String(layerNum || '-').trim() || '-');

    var rackLocation = getField(item, ['displayRackLocation', 'displayLocation', 'RackLocation', 'rackLocation', 'location'], '-');
    try {
      if (safeArray(racksList).length && item && item.RackID) {
        var ri = safeArray(racksList).find(function (r) { return normalizeId(r.RackID) === normalizeId(item.RackID); });
        if (ri && ri.RackLocation) rackLocation = ri.RackLocation;
      }
    } catch (e2) {}

    var storageCompany = getField(item, ['displayStorageCompany', 'storageCompany', 'StorageCompany', 'company', 'Company'], '-');

    var note = getField(item, ['Note', 'Notes', 'memo', 'Memo', 'MoldNote', 'CutterNote', 'GhiChu', 'ghi_chu'], '-');

    var updatedAt = getField(item, ['UpdatedAt', 'updated_at', 'LastUpdated', 'UpdateDate', 'updatedAt', 'updatedAtJst'], '');

    return {
      key: key,
      typeJp: typeJp,
      typeVi: typeVi,
      code: code,
      name: name,
      size: size,
      rackLayerText: rackLayerText,
      storageCompany: storageCompany,
      rackLocation: rackLocation,
      note: note,
      updatedAt: updatedAt
    };
  }

  function getPendingLogs() {
    try {
      var dm = global.DataManager;
      if (!dm) return [];
      if (dm.PendingCache && Array.isArray(dm.PendingCache.logs)) return dm.PendingCache.logs;
      var logs = (dm.data && dm.data.statuslogs) ? dm.data.statuslogs : [];
      return safeArray(logs).filter(function (l) { return l && (l.pending === true); });
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
    if (!key.id || (key.itemType !== 'mold' && key.itemType !== 'cutter')) return [];

    var allLogs = getAllStatusLogs();
    var pendingLogs = getPendingLogs();

    function isMatch(l) {
      if (!l) return false;
      if (key.itemType === 'mold') return normalizeId(l.MoldID) === key.id;
      if (key.itemType === 'cutter') return normalizeId(l.CutterID) === key.id;
      return false;
    }

    var pending = safeArray(pendingLogs).filter(function (p) {
      return p && (p.pending === true) && isMatch(p);
    });

    var real = safeArray(allLogs).filter(function (l) {
      return l && !(l.pending === true) && isMatch(l);
    });

    var merged = pending.concat(real);
    merged.sort(function (a, b) {
      var ta = Date.parse(a.Timestamp || a.createdAt || a.DateEntry || 0) || 0;
      var tb = Date.parse(b.Timestamp || b.createdAt || b.DateEntry || 0) || 0;
      return tb - ta;
    });

    return merged;
  }

  function deriveCurrentStatus(item, logs) {
    var dm = global.DataManager;
    var destList = dm && dm.data ? dm.data.destinations : [];

    var latest = safeArray(logs)[0] || null;
    if (!latest) {
      return {
        statusChipClass: 'cio-kchip',
        statusShort: '-',
        statusText: '-'
      };
    }

    var s = String(latest.Status || '').trim();
    var up = s.toUpperCase();

    if (up === 'IN' || up === 'CHECKIN' || s.toLowerCase() === 'check-in') {
      var dnIn = getDestinationName(latest.DestinationID || 'AREA-MOLDROOM', destList);
      return {
        statusChipClass: 'cio-kchip ok',
        statusShort: 'IN',
        statusText: 'IN - ' + dnIn
      };
    }

    if (up === 'OUT' || up === 'CHECKOUT' || s.toLowerCase() === 'check-out') {
      var dnOut = getDestinationName(latest.DestinationID || '', destList);
      return {
        statusChipClass: 'cio-kchip bad',
        statusShort: 'OUT',
        statusText: 'OUT - ' + dnOut
      };
    }

    if (up === 'AUDIT' || latest.AuditType) {
      return {
        statusChipClass: 'cio-kchip warn',
        statusShort: String(latest.AuditType || 'AUDIT'),
        statusText: String(latest.AuditType || 'AUDIT')
      };
    }

    return {
      statusChipClass: 'cio-kchip',
      statusShort: up || '-',
      statusText: up || '-'
    };
  }

  function renderObjectCard(info, statusInfo, logs) {
    var updatedText = info.updatedAt ? fmtDateTime(info.updatedAt) : (logs && logs[0] ? fmtDateTime(logs[0].Timestamp) : '-');

    return (
      '<section class="cio-card cio-object-card">' +
        '<div class="cio-card-head">' +
          '<div class="cio-card-title">' +
            '<div class="ja">' + escapeHtml('対象情報') + '</div>' +
            '<div class="vi">' + escapeHtml('Đối tượng') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cio-object-body">' +
          '<div class="cio-info-grid">' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('種類', 'Loại thiết bị') + '</div>' +
              '<div class="cio-info-value">' +
                '<div class="cio-bi">' +
                  '<span class="dp-label-jp">' + escapeHtml(info.typeJp) + '</span>' +
                  '<span class="dp-label-vi">' + escapeHtml(info.typeVi) + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('コード', 'Mã thiết bị') + '</div>' +
              '<div class="cio-info-value">' + escapeHtml(info.code) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('ID', 'ID') + '</div>' +
              '<div class="cio-info-value">' + escapeHtml(info.key.id || '-') + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('名称', 'Tên thiết bị') + '</div>' +
              '<div class="cio-info-value clamp2">' + escapeHtml(info.name) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('サイズ', 'Kích thước') + '</div>' +
              '<div class="cio-info-value">' + escapeHtml(info.size) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('棚-段', 'Giá - Tầng') + '</div>' +
              '<div class="cio-info-value">' + escapeHtml(info.rackLayerText) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('保管会社', 'Công ty lưu trữ') + '</div>' +
              '<div class="cio-info-value">' + escapeHtml(info.storageCompany) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('棚位置', 'Vị trí giá') + '</div>' +
              '<div class="cio-info-value clamp2">' + escapeHtml(info.rackLocation) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('メモ', 'Ghi chú') + '</div>' +
              '<div class="cio-info-value clamp2">' + escapeHtml(info.note) + '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('現在状態', 'Trạng thái hiện tại') + '</div>' +
              '<div class="cio-info-value">' +
                '<span class="' + escapeHtml(statusInfo.statusChipClass) + '">' + escapeHtml(statusInfo.statusShort) + '</span>' +
                ' ' + escapeHtml(statusInfo.statusText) +
              '</div>' +
            '</div>' +

            '<div class="cio-info-item">' +
              '<div class="cio-info-label">' + biLabelHtml('更新日', 'Ngày cập nhật') + '</div>' +
              '<div class="cio-info-value">' + escapeHtml(updatedText) + '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function renderHistoryCard(logs) {
    return (
      '<section class="cio-card cio-history-card">' +
        '<div class="cio-card-head">' +
          '<div class="cio-card-title">' +
            '<div class="ja">' + escapeHtml('履歴') + '</div>' +
            '<div class="vi">' + escapeHtml('Lịch sử') + '</div>' +
          '</div>' +
          '<div class="cio-history-controls">' +
            '<input id="cio-search" class="cio-search" type="text" value="' + escapeHtml(hisQuery) + '" ' +
              'placeholder="' + escapeHtml('検索 / Tìm') + '">' +
            '<button type="button" class="cio-lock" id="cio-refresh">' +
              biLabelHtml('更新', 'Làm mới', 'cio-bi') +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="cio-history-wrap">' +
          '<table class="cio-history-table" id="cio-history-table">' +
            '<thead><tr>' +
              '<th data-sort="Timestamp">' +
                '<span class="cio-thbi">' +
                  '<span class="dp-label-jp">' + escapeHtml('時間') + '</span>' +
                  '<span class="dp-label-vi">' + escapeHtml('Thời gian') + '</span>' +
                '</span>' +
              '</th>' +
              '<th data-sort="Status">' +
                '<span class="cio-thbi">' +
                  '<span class="dp-label-jp">' + escapeHtml('状態') + '</span>' +
                  '<span class="dp-label-vi">' + escapeHtml('Trạng thái') + '</span>' +
                '</span>' +
              '</th>' +
              '<th data-sort="DestinationID">' +
                '<span class="cio-thbi">' +
                  '<span class="dp-label-jp">' + escapeHtml('行き先') + '</span>' +
                  '<span class="dp-label-vi">' + escapeHtml('Điểm đến') + '</span>' +
                '</span>' +
              '</th>' +
              '<th data-sort="EmployeeID">' +
                '<span class="cio-thbi">' +
                  '<span class="dp-label-jp">' + escapeHtml('担当') + '</span>' +
                  '<span class="dp-label-vi">' + escapeHtml('Nhân viên') + '</span>' +
                '</span>' +
              '</th>' +
              '<th data-sort="Notes">' +
                '<span class="cio-thbi">' +
                  '<span class="dp-label-jp">' + escapeHtml('メモ') + '</span>' +
                  '<span class="dp-label-vi">' + escapeHtml('Ghi chú') + '</span>' +
                '</span>' +
              '</th>' +
            '</tr></thead>' +
            '<tbody id="cio-history-tbody">' +
              renderHistoryRows(logs) +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>'
    );
  }

  function renderHistoryRows(logs) {
    var dm = global.DataManager;
    var destList = dm && dm.data ? dm.data.destinations : [];
    var empList = dm && dm.data ? dm.data.employees : [];

    var q = String(hisQuery || '').trim().toLowerCase();

    var filtered = safeArray(logs);
    if (q) {
      filtered = filtered.filter(function (l) {
        try {
          var s = '';
          s += String(l.Timestamp || '');
          s += ' ' + String(l.Status || '');
          s += ' ' + String(getDestinationName(l.DestinationID, destList) || '');
          s += ' ' + String(getEmployeeName(l.EmployeeID, empList) || '');
          s += ' ' + String(l.Notes || l.notes || '');
          return s.toLowerCase().indexOf(q) >= 0;
        } catch (e) {
          return false;
        }
      });
    }

    if (!filtered.length) {
      return '<tr><td colspan="5">' + escapeHtml('—') + '</td></tr>';
    }

    return filtered.map(function (l) {
      var statusRaw = String(l.Status || '').trim();
      var up = statusRaw.toUpperCase();
      var badgeClass = 'cio-b-unknown';
      var badgeText = statusRaw || '-';

      if (up === 'IN' || up === 'CHECKIN' || statusRaw.toLowerCase() === 'check-in') { badgeClass = 'cio-b-in'; badgeText = 'IN'; }
      else if (up === 'OUT' || up === 'CHECKOUT' || statusRaw.toLowerCase() === 'check-out') { badgeClass = 'cio-b-out'; badgeText = 'OUT'; }
      else if (up === 'AUDIT' || l.AuditType) { badgeClass = 'cio-b-audit'; badgeText = String(l.AuditType || 'AUDIT'); }

      var dest = getDestinationName(l.DestinationID, destList);
      var emp = getEmployeeName(l.EmployeeID, empList);
      var notes = getField(l, ['Notes', 'notes'], '-');

      var pf = normalizeLogPendingFlag(l);
      var pendingSuffix = pf.pending ? (' ' + escapeHtml('(*)')) : '';

      return (
        '<tr data-time="' + escapeHtml(String(l.Timestamp || '')) + '">' +
          '<td>' + escapeHtml(fmtDateTime(l.Timestamp)) + pendingSuffix + '</td>' +
          '<td><span class="cio-status-badge ' + escapeHtml(badgeClass) + '">' + escapeHtml(badgeText) + '</span></td>' +
          '<td>' + escapeHtml(dest || '-') + '</td>' +
          '<td>' + escapeHtml(emp || '-') + '</td>' +
          '<td class="cio-note-cell">' + escapeHtml(notes) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderDock(mode) {
    var isOut = (mode === 'check-out');

    var reqDot = '<span class="cio-required-dot" id="cio-dest-required"></span>';

    return (
      '<section class="cio-dock" id="cio-dock">' +
        '<div class="cio-grabber" id="cio-dock-grabber" aria-label="Swipe down to close"></div>' +
        '<div class="cio-dock-inner">' +

          '<div class="cio-mode-toggle">' +
            '<button type="button" class="cio-mode-btn btn-in" id="btn-in">' +
              '<span class="dp-label-jp">' + escapeHtml('入庫') + '</span>' +
              '<span class="dp-label-vi">' + escapeHtml('Check-in') + '</span>' +
            '</button>' +
            '<button type="button" class="cio-mode-btn btn-out" id="btn-out">' +
              '<span class="dp-label-jp">' + escapeHtml('出庫') + '</span>' +
              '<span class="dp-label-vi">' + escapeHtml('Check-out') + '</span>' +
            '</button>' +
          '</div>' +

          '<div class="cio-form-grid">' +

            '<div class="cio-field">' +
              '<div class="cio-label">' +
                biLabelHtml('行き先', 'Chọn địa điểm', 'cio-bi') +
                (isOut ? reqDot : '<span class="hidden" id="cio-dest-required"></span>') +
              '</div>' +
              '<div id="destination-select-container"></div>' +
            '</div>' +

            '<div class="cio-field">' +
              '<div class="cio-label">' + biLabelHtml('担当者', 'Chọn nhân viên', 'cio-bi') + '</div>' +
              '<div class="cio-default-row">' +
                '<div id="employee-select-container" style="width:100%"></div>' +
              '</div>' +
              '<label class="cio-default-check">' +
                '<input type="checkbox" id="cio-emp-default">' +
                '<span>' + escapeHtml('デフォルト / Mặc định') + '</span>' +
              '</label>' +
            '</div>' +

            '<div class="cio-field full">' +
              '<div class="cio-label">' + biLabelHtml('メモ', 'Ghi chú', 'cio-bi') + '</div>' +
              '<textarea id="cio-note" class="cio-control" rows="2" placeholder="' + escapeHtml('入力 / Nhập') + '"></textarea>' +
            '</div>' +

          '</div>' +

          '<div class="cio-actions">' +
            '<button type="button" class="cio-act cancel" id="btn-cancel">' +
              '<span class="dp-label-jp">' + escapeHtml('戻る') + '</span>' +
              '<span class="dp-label-vi">' + escapeHtml('Hủy') + '</span>' +
            '</button>' +
            '<button type="button" class="cio-act relocate" id="btn-relocate">' +
              '<span class="dp-label-jp">' + escapeHtml('移動') + '</span>' +
              '<span class="dp-label-vi">' + escapeHtml('Đổi vị trí') + '</span>' +
            '</button>' +
            '<button type="button" class="cio-act save" id="btn-save">' +
              '<span class="dp-label-jp">' + escapeHtml('保存') + '</span>' +
              '<span class="dp-label-vi">' + escapeHtml('Lưu') + '</span>' +
            '</button>' +
          '</div>' +

        '</div>' +
      '</section>'
    );
  }

  function setModeUi(mode) {
    currentMode = (mode === 'check-out') ? 'check-out' : 'check-in';

    var header = document.querySelector('#cio-panel .cio-header');
    if (header) {
      header.classList.toggle('check-in', currentMode === 'check-in');
      header.classList.toggle('check-out', currentMode === 'check-out');

      var titleJ = header.querySelector('.cio-title .ja');
      var titleV = header.querySelector('.cio-title .vi');
      if (titleJ) titleJ.textContent = (currentMode === 'check-in') ? '入庫（IN）' : '出庫（OUT）';
      if (titleV) titleV.textContent = (currentMode === 'check-in') ? 'Check-in (IN)' : 'Check-out (OUT)';
    }

    var inBtn = document.getElementById('btn-in');
    var outBtn = document.getElementById('btn-out');
    if (inBtn) inBtn.classList.toggle('active', currentMode === 'check-in');
    if (outBtn) outBtn.classList.toggle('active', currentMode === 'check-out');

    var req = document.getElementById('cio-dest-required');
    if (req) {
      req.classList.toggle('hidden', currentMode !== 'check-out');
    }
  }

  function renderHeader(mode) {
    var titleJ = (mode === 'check-out') ? '出庫（OUT）' : '入庫（IN）';
    var titleV = (mode === 'check-out') ? 'Check-out (OUT)' : 'Check-in (IN)';

    return (
      '<div class="cio-header ' + (mode === 'check-out' ? 'check-out' : 'check-in') + '">' +
        '<div class="cio-title">' +
          '<div class="ja">' + escapeHtml(titleJ) + '</div>' +
          '<div class="vi">' + escapeHtml(titleV) + '</div>' +
        '</div>' +
        '<div class="cio-header-actions">' +
          '<button type="button" class="cio-icon-btn" id="cio-close" aria-label="Close">' +
            biLabelHtml('閉じる', 'Đóng', 'cio-bi') +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildModalHtml(item, mode) {
    var info = computeObjectInfo(item);
    var logs = getHistoryLogsForItem(item);
    var statusInfo = deriveCurrentStatus(item, logs);

    return (
      renderHeader(mode) +
      '<div class="cio-body">' +
        '<div class="cio-left">' +
          renderObjectCard(info, statusInfo, logs) +
          renderHistoryCard(logs) +
        '</div>' +
        '<div class="cio-right">' +
          renderDock(mode) +
        '</div>' +
      '</div>'
    );
  }

  function initSelects() {
    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];
    var destList = dm && dm.data ? dm.data.destinations : [];

    var empContainer = document.getElementById('employee-select-container');
    var destContainer = document.getElementById('destination-select-container');

    if (empContainer) empContainer.innerHTML = '';
    if (destContainer) destContainer.innerHTML = '';

    var empOptions = safeArray(empList).map(function (e) {
      return { id: String(e.EmployeeID), name: String(e.EmployeeName || e.name || e.EmployeeID) };
    });

    var destOptions = safeArray(destList).map(function (d) {
      return { id: String(d.DestinationID), name: String(d.DestinationName || d.name || d.DestinationID) };
    });

    var defEmpId = getDefaultEmpId();

    if (empContainer) {
      var empEl = null;

      if (typeof global.createSearchableSelect === 'function') {
        try {
          empEl = global.createSearchableSelect('cio-emp', empOptions);
          empContainer.appendChild(empEl);
        } catch (e0) {
          empEl = null;
        }
      }

      if (!empEl) {
        var sel = document.createElement('select');
        sel.id = 'cio-emp';
        sel.className = 'cio-control';

        var ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '選択 / Chọn';
        sel.appendChild(ph);

        empOptions.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = o.name;
          sel.appendChild(opt);
        });

        empContainer.appendChild(sel);
      }

      setTimeout(function () {
        try {
          var empInput = document.getElementById('cio-emp');
          if (!empInput) return;

          if (empInput && typeof empInput.setValue === 'function') {
            empInput.setValue(String(defEmpId));
          } else {
            empInput.value = String(defEmpId);
            if (empInput.dataset) empInput.dataset.selectedId = String(defEmpId);
          }

          var chk = document.getElementById('cio-emp-default');
          if (chk) chk.checked = (String(getDefaultEmpId()) === String(defEmpId));
        } catch (e1) {}
      }, 0);
    }

    if (destContainer) {
      var destEl = null;

      if (typeof global.createSearchableSelect === 'function') {
        try {
          destEl = global.createSearchableSelect('cio-dest', destOptions);
          destContainer.appendChild(destEl);
        } catch (e2) {
          destEl = null;
        }
      }

      if (!destEl) {
        var sel2 = document.createElement('select');
        sel2.id = 'cio-dest';
        sel2.className = 'cio-control';

        var ph2 = document.createElement('option');
        ph2.value = '';
        ph2.textContent = '選択 / Chọn';
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

  function validateInputs(mode) {
    var empInput = document.getElementById('cio-emp');
    var destInput = document.getElementById('cio-dest');

    var empId = parseSelectedIdFromInput(empInput);
    var destId = parseSelectedIdFromInput(destInput);

    if (!empId) {
      notifyBi('warning', '担当者を選択してください。', 'Vui lòng chọn nhân viên.');
      return null;
    }

    if (mode === 'check-out' && !destId) {
      notifyBi('warning', '出庫は行き先が必要です。', 'Check-out cần chọn địa điểm.');
      return null;
    }

    return { empId: empId, destId: destId };
  }

  function addPendingLog(item, logData) {
    var dm = global.DataManager;
    var pending = null;

    try {
      if (dm && dm.PendingCache && typeof dm.PendingCache.add === 'function') {
        pending = dm.PendingCache.add(logData);
      } else if (dm && dm.data) {
        if (!Array.isArray(dm.data.statuslogs)) dm.data.statuslogs = [];
        pending = Object.assign({}, logData, {
          pending: true,
          localId: 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
          createdAt: new Date().toISOString()
        });
        dm.data.statuslogs.unshift(pending);
      }

      if (dm && typeof dm.recompute === 'function') dm.recompute();
    } catch (e) {}

    return pending;
  }

  function syncLogToServer(key, logData, pendingObj) {
    var cfg = getCfg();

    return fetch(cfg.apiUrl, {
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
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (rj) {
      if (!rj || !rj.success) throw new Error((rj && rj.message) ? rj.message : 'Sync failed');

      try {
        var dm = global.DataManager;
        var localId = pendingObj ? String(pendingObj.localId || '') : '';

        if (localId && dm && dm.PendingCache && typeof dm.PendingCache.remove === 'function') {
          dm.PendingCache.remove(localId);
        }

        if (rj.newStatusLog && dm && dm.data) {
          if (!Array.isArray(dm.data.statuslogs)) dm.data.statuslogs = [];
          dm.data.statuslogs.unshift(rj.newStatusLog);
        }

        if (dm && typeof dm.recompute === 'function') dm.recompute();
      } catch (e2) {}

      notifyBi('success', '保存しました。', 'Đã lưu.');
      refreshHistoryInPlace(currentItem);

      try {
        var k2 = getItemKey(currentItem);
        document.dispatchEvent(new CustomEvent('detailchanged', {
          detail: { item: currentItem, itemType: k2.itemType, itemId: k2.id, source: 'checkin-save' }
        }));
      } catch (e3) {}

      return rj;
    }).catch(function (err) {
      try {
        var dm2 = global.DataManager;
        var localId2 = pendingObj ? String(pendingObj.localId || '') : '';

        if (localId2 && dm2 && dm2.PendingCache && typeof dm2.PendingCache.markError === 'function') {
          dm2.PendingCache.markError(localId2, err && err.message ? err.message : 'Sync error');
        } else if (pendingObj) {
          pendingObj.syncError = (err && err.message) ? err.message : 'Sync error';
          pendingObj.syncErrorAt = new Date().toISOString();
          if (dm2 && typeof dm2.recompute === 'function') dm2.recompute();
        }
      } catch (e4) {}

      notifyBi('error', '同期に失敗しました。', 'Đồng bộ thất bại.');
      refreshHistoryInPlace(currentItem);

      throw err;
    });
  }

  function saveRecord(item) {
    if (!item) return;

    var key = getItemKey(item);
    if (!key.id) {
      notifyBi('error', 'IDが見つかりません。', 'Không tìm thấy ID.');
      return;
    }

    var input = validateInputs(currentMode);
    if (!input) return;

    var empId = input.empId;
    var destId = input.destId;

    var noteEl = document.getElementById('cio-note');
    var notes = String(noteEl ? noteEl.value : '').trim();

    var ts = new Date().toISOString();
    var status = (currentMode === 'check-in') ? 'IN' : 'OUT';

    var finalDest = destId;
    if (currentMode === 'check-in') {
      finalDest = finalDest || 'AREA-MOLDROOM';
    }

    var logData = {
      StatusLogID: 'S' + Date.now(),
      Timestamp: ts,
      MoldID: (key.itemType === 'mold') ? key.id : null,
      CutterID: (key.itemType === 'cutter') ? key.id : null,
      Status: status,
      DestinationID: finalDest,
      EmployeeID: empId,
      Notes: notes
    };

    var pendingObj = addPendingLog(item, logData);

    var defChk = document.getElementById('cio-emp-default');
    if (defChk && defChk.checked) setDefaultEmpId(empId);

    notifyBi('info', '保存中…', 'Đang lưu…');
    setLastActionTime();

    syncLogToServer(key, logData, pendingObj);
  }

  function refreshHistoryInPlace(item) {
    if (!item) item = currentItem;
    if (!item) return;

    var logs = getHistoryLogsForItem(item);
    var tbody = document.getElementById('cio-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = renderHistoryRows(logs);
  }

  function refreshAllDataThenRerender() {
    var btn = document.getElementById('cio-refresh');
    if (btn) btn.disabled = true;

    var p = Promise.resolve();
    try {
      if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
        p = global.DataManager.loadAllData();
      }
    } catch (e0) {}

    return p.then(function () {
      refreshHistoryInPlace(currentItem);
      notifyBi('success', '更新しました。', 'Đã làm mới.');
    }).catch(function () {
      notifyBi('error', '更新に失敗しました。', 'Làm mới thất bại.');
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  function bindDockSwipeToClose() {
    var grab = document.getElementById('cio-dock-grabber');
    if (!grab || grab.dataset.bound === '1') return;
    grab.dataset.bound = '1';

    var startX = 0;
    var startY = 0;
    var tracking = false;

    function onDown(ev) {
      try {
        tracking = true;
        startX = ev.clientX;
        startY = ev.clientY;
        if (grab.setPointerCapture) grab.setPointerCapture(ev.pointerId);
      } catch (e0) {}
    }

    function onMove(ev) {
      if (!tracking) return;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        tracking = false;
        return;
      }
      if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
        closeModal();
      }
    }

    function onUp() { tracking = false; }

    grab.addEventListener('pointerdown', onDown, { passive: true });
    grab.addEventListener('pointermove', onMove, { passive: true });
    grab.addEventListener('pointerup', onUp, { passive: true });
    grab.addEventListener('pointercancel', onUp, { passive: true });
  }

  function bindEvents() {
    var bd = document.getElementById('cio-backdrop');
    if (bd && bd.dataset.bound !== '1') {
      bd.dataset.bound = '1';
      bd.addEventListener('click', function () { closeModal(); });
    }

    var closeBtn = document.getElementById('cio-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeModal(); });

    var cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { closeModal(); });

    var relocateBtn = document.getElementById('btn-relocate');
    if (relocateBtn) {
      relocateBtn.addEventListener('click', function () {
        var it = currentItem;
        closeModal();
        try {
          if (global.LocationManager && typeof global.LocationManager.openModal === 'function') {
            global.LocationManager.openModal(it);
          } else {
            notifyBi('warning', 'LocationManagerが見つかりません。', 'Không tìm thấy LocationManager.');
          }
        } catch (e0) {
          notifyBi('error', 'エラー。', 'Lỗi.');
        }
      });
    }

    var saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveRecord(currentItem); });

    var inBtn = document.getElementById('btn-in');
    var outBtn = document.getElementById('btn-out');
    if (inBtn) inBtn.addEventListener('click', function () { setModeUi('check-in'); });
    if (outBtn) outBtn.addEventListener('click', function () { setModeUi('check-out'); });

    var chk = document.getElementById('cio-emp-default');
    if (chk) {
      chk.addEventListener('change', function () {
        var empInput = document.getElementById('cio-emp');
        var id = parseSelectedIdFromInput(empInput);
        if (chk.checked) {
          if (id) setDefaultEmpId(id);
        } else {
          clearDefaultEmpId();
        }
      });
    }

    var search = document.getElementById('cio-search');
    if (search && search.dataset.bound !== '1') {
      search.dataset.bound = '1';
      search.addEventListener('input', function () {
        hisQuery = String(search.value || '');
        refreshHistoryInPlace(currentItem);
      });
    }

    var refreshBtn = document.getElementById('cio-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { refreshAllDataThenRerender(); });

    bindDockSwipeToClose();

    if (!document.body.dataset.cioEscBound) {
      document.body.dataset.cioEscBound = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          var p = document.getElementById('cio-panel');
          if (p) closeModal();
        }
      });
    }
  }

  function openModal(mode, item) {
    if (!item) {
      notifyBi('warning', '対象を選択してください。', 'Vui lòng chọn đối tượng.');
      return;
    }

    var key = getItemKey(item);
    if (!key.id) {
      notifyBi('error', 'IDが見つかりません。', 'Không tìm thấy ID (MoldID/CutterID).');
      return;
    }

    currentItem = item;
    currentMode = (mode === 'check-out') ? 'check-out' : 'check-in';
    opened = true;

    removeModalElements();

    var els = ensureModalElements();
    els.panel.innerHTML = buildModalHtml(currentItem, currentMode);

    lockBodyScroll();

    initSelects();
    setModeUi(currentMode);
    bindEvents();

    try {
      var search = document.getElementById('cio-search');
      if (search && global.innerWidth > 900) search.focus();
    } catch (e0) {}
  }

  function closeModal() {
    if (!opened) {
      removeModalElements();
      unlockBodyScroll();
      currentItem = null;
      return;
    }

    opened = false;
    currentItem = null;

    removeModalElements();
    unlockBodyScroll();
  }

  var CheckInOut = {
    version: VERSION,
    openModal: openModal,
    close: closeModal,
    refreshHistoryInPlace: refreshHistoryInPlace,
    init: function () {
      // no-op (CSS must be included separately)
    }
  };

  global.CheckInOut = CheckInOut;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { CheckInOut.init(); }, { once: true });
  } else {
    CheckInOut.init();
  }

})(window);
