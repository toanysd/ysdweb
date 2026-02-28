/* checkin-checkout-v8.4.5-4.js
   MoldCutterSearch - Check-in / Check-out Popup (Hero + Input + History)

   Spec (2026-02-28):
   - Song ngữ Nhật/Việt 2 dòng cho toàn bộ nội dung.
   - Popup gọn theo flow: Hero (thông tin tối thiểu) + Nhập liệu + Lịch sử.
   - Desktop giữ bố cục: trái Lịch sử, phải Hero+Nhập liệu; actionbar bám đáy.
   - Mobile: cho phép cuộn dọc toàn màn hình; nhóm Hero + Nhập liệu phải thấy đầy đủ ngay khi mở.
   - Lịch sử có lock/unlock (mặc định lock). Lock: không cuộn ngang; Unlock: cho cuộn ngang.
   - Badge Giá - Tầng: Giá badge tròn, Tầng badge chữ nhật bo góc.
   - Kích thước nổi bật.
   - Không inline style, không nhúng CSS.

   CSS required: checkin-checkout-v8.4.5-4.css
*/

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5-4';

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

  var hisQuery = '';

  var STORAGEKEY_DEFAULT_EMP = 'ciodefault-employee-id';
  var STORAGEKEY_HIS_UNLOCKED = 'ciohistory-unlocked';
  var SESSIONKEY_LAST_ACTION = 'checkinlastactiontimestamp';

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

  function isHistoryUnlocked() {
    try {
      var v = localStorage.getItem(STORAGEKEY_HIS_UNLOCKED);
      return v === '1';
    } catch (e) {
      return false; // default lock
    }
  }

  function setHistoryUnlocked(v) {
    try { localStorage.setItem(STORAGEKEY_HIS_UNLOCKED, v ? '1' : '0'); } catch (e) {}
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

  function deriveCurrentStatus(logs) {
    var dm = global.DataManager;
    var destList = dm && dm.data ? dm.data.destinations : [];

    var latest = safeArray(logs)[0] || null;
    if (!latest) {
      return { chipClass: 'cio-status-chip is-unknown', label: '-', detail: '-' };
    }

    var raw = String(latest.Status || '').trim();
    var up = raw.toUpperCase();

    if (up === 'IN' || up === 'CHECKIN' || raw.toLowerCase() === 'check-in') {
      var dnIn = getDestinationName(latest.DestinationID || 'AREA-MOLDROOM', destList);
      return { chipClass: 'cio-status-chip is-in', label: 'IN', detail: 'IN - ' + dnIn };
    }

    if (up === 'OUT' || up === 'CHECKOUT' || raw.toLowerCase() === 'check-out') {
      var dnOut = getDestinationName(latest.DestinationID || '', destList);
      return { chipClass: 'cio-status-chip is-out', label: 'OUT', detail: 'OUT - ' + dnOut };
    }

    if (up === 'AUDIT' || latest.AuditType) {
      return { chipClass: 'cio-status-chip is-audit', label: String(latest.AuditType || 'AUDIT'), detail: String(latest.AuditType || 'AUDIT') };
    }

    return { chipClass: 'cio-status-chip is-unknown', label: (up || '-'), detail: (up || '-') };
  }

  function resolveRackLayerBadges(item) {
    var rack = getField(item, ['RackNumber', 'rack_number', 'rackNumber'], '');
    var layer = getField(item, ['RackLayerNumber', 'rack_layer_number', 'rackLayerNumber'], '');

    try {
      if (!rack && item && item.rackInfo && item.rackInfo.RackNumber) rack = item.rackInfo.RackNumber;
    } catch (e0) {}

    try {
      if (!layer && item && item.rackLayerInfo && item.rackLayerInfo.RackLayerNumber) layer = item.rackLayerInfo.RackLayerNumber;
    } catch (e1) {}

    try {
      var dm = global.DataManager;
      var racks = dm && dm.data ? dm.data.racks : [];
      if (!rack && item && item.RackID) {
        var ri = safeArray(racks).find(function (r) { return normalizeId(r.RackID) === normalizeId(item.RackID); });
        if (ri && (ri.RackNumber || ri.RackNo || ri.rackNumber)) rack = (ri.RackNumber || ri.RackNo || ri.rackNumber);
      }
    } catch (e2) {}

    if (!rack) rack = getField(item, ['RackID', 'rack_id', 'rackId'], '-');
    if (!layer) layer = getField(item, ['RackLayerID', 'rack_layer_id', 'rackLayerId'], '-');

    rack = String(rack === null || rack === undefined ? '-' : rack).trim() || '-';
    layer = String(layer === null || layer === undefined ? '-' : layer).trim() || '-';

    return { rack: rack, layer: layer };
  }

  function computeHeroInfo(item) {
    var key = getItemKey(item);
    var isMold = key.itemType === 'mold';

    var typeJp = isMold ? '金型' : (key.itemType === 'cutter' ? '抜型' : '不明');
    var typeVi = isMold ? 'Khuôn' : (key.itemType === 'cutter' ? 'Dao' : 'Không rõ');

    var code = getField(item, ['displayCode', 'MoldCode', 'CutterNo', 'CutterCode', 'Code', 'code'], '-');
    var name = getField(item, ['MoldName', 'CutterName', 'CutterDesignName', 'Name', 'name'], '-');

    var size = getField(item, ['displaySize', 'Size', 'Dimensions', 'dimensions', 'KichThuoc', 'size'], '-');

    var logs = getHistoryLogsForItem(item);
    var status = deriveCurrentStatus(logs);

    var updatedAt = getField(item, ['UpdatedAt', 'updated_at', 'LastUpdated', 'UpdateDate', 'updatedAt', 'updatedAtJst'], '');
    var updatedText = updatedAt ? fmtDateTime(updatedAt) : (logs[0] ? fmtDateTime(logs[0].Timestamp) : '-');

    var rl = resolveRackLayerBadges(item);

    return {
      key: key,
      typeJp: typeJp,
      typeVi: typeVi,
      code: code,
      name: name,
      id: key.id || '-',
      size: size,
      rack: rl.rack,
      layer: rl.layer,
      status: status,
      updatedText: updatedText,
      itemType: key.itemType,
      logs: logs
    };
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
          '<button type="button" class="cio-icon-btn" id="cio-refresh" aria-label="Refresh">' +
            biLabelHtml('更新', 'Làm mới') +
          '</button>' +
          '<button type="button" class="cio-icon-btn" id="cio-close" aria-label="Close">' +
            biLabelHtml('閉じる', 'Đóng') +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderHero(hero) {
    var heroCls = (hero.itemType === 'mold') ? 'cio-hero--mold' : (hero.itemType === 'cutter' ? 'cio-hero--cutter' : 'cio-hero--mold');

    var line1 = (hero.id || '-') + ' . ' + (hero.name || '-');

    return (
      '<div class="cio-hero ' + escapeHtml(heroCls) + '">' +
        '<div class="cio-hero-top">' +
          '<div class="cio-hero-main">' +
            '<div class="cio-hero-line1">' + escapeHtml(line1) + '</div>' +
            '<div class="cio-hero-line2">' +
              '<span>' + escapeHtml(hero.typeJp) + ' / ' + escapeHtml(hero.typeVi) + '</span>' +
              '<span>•</span>' +
              '<span>' + escapeHtml('Code') + ': ' + escapeHtml(hero.code) + '</span>' +
            '</div>' +
            '<div class="cio-hero-size">' +
              '<span class="cio-bi">' +
                '<span class="dp-label-jp">' + escapeHtml('サイズ') + '</span>' +
                '<span class="dp-label-vi">' + escapeHtml('Kích thước') + '</span>' +
              '</span>' +
              '<span>' + escapeHtml(hero.size) + '</span>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<span class="' + escapeHtml(hero.status.chipClass) + '">' + escapeHtml(hero.status.label) + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="cio-hero-meta">' +
          '<div class="cio-hero-kv">' +
            '<div class="cio-hero-k">' + biLabelHtml('棚-段', 'Giá - Tầng') + '</div>' +
            '<div class="cio-hero-v">' +
              '<span class="cio-racklayer">' +
                '<span class="cio-badge-rack" title="Rack">' + escapeHtml(hero.rack) + '</span>' +
                '<span class="cio-badge-layer" title="Layer">' + escapeHtml(hero.layer) + '</span>' +
              '</span>' +
            '</div>' +
          '</div>' +

          '<div class="cio-hero-kv">' +
            '<div class="cio-hero-k">' + biLabelHtml('現在状態', 'Trạng thái hiện tại') + '</div>' +
            '<div class="cio-hero-v">' + escapeHtml(hero.status.detail) + '</div>' +
          '</div>' +

          '<div class="cio-hero-kv">' +
            '<div class="cio-hero-k">' + biLabelHtml('更新日', 'Ngày cập nhật') + '</div>' +
            '<div class="cio-hero-v">' + escapeHtml(hero.updatedText) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderInputCard(mode) {
    var isOut = (mode === 'check-out');

    return (
      '<section class="cio-card cio-input-card">' +
        '<div class="cio-card-head">' +
          '<div class="cio-card-title">' +
            '<div class="ja">' + escapeHtml('入力') + '</div>' +
            '<div class="vi">' + escapeHtml('Nhập liệu') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cio-input-body">' +
          '<div class="cio-field">' +
            '<div class="cio-label">' +
              biLabelHtml('行き先', 'Địa điểm') +
              '<span class="' + (isOut ? '' : 'hidden') + '" id="cio-dest-required"><span class="cio-required-dot"></span></span>' +
            '</div>' +
            '<select id="cio-dest" class="cio-control"></select>' +
          '</div>' +

          '<div class="cio-field">' +
            '<div class="cio-label">' + biLabelHtml('担当者', 'Nhân viên') + '</div>' +
            '<select id="cio-emp" class="cio-control"></select>' +
            '<label class="cio-default-check">' +
              '<input type="checkbox" id="cio-emp-default">' +
              '<span>' + escapeHtml('デフォルト / Mặc định') + '</span>' +
            '</label>' +
          '</div>' +

          '<div class="cio-field">' +
            '<div class="cio-label">' + biLabelHtml('メモ', 'Ghi chú') + '</div>' +
            '<textarea id="cio-note" class="cio-control" rows="3" placeholder="' + escapeHtml('入力 / Nhập') + '"></textarea>' +
          '</div>' +

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
        '</div>' +
      '</section>'
    );
  }

  function renderHistoryCard(hero) {
    var unlocked = isHistoryUnlocked();

    return (
      '<section class="cio-card cio-history-card">' +
        '<div class="cio-card-head">' +
          '<div class="cio-card-title">' +
            '<div class="ja">' + escapeHtml('履歴') + '</div>' +
            '<div class="vi">' + escapeHtml('Lịch sử') + '</div>' +
          '</div>' +
          '<div class="cio-his-tools">' +
            '<input id="cio-search" class="cio-search" type="text" value="' + escapeHtml(hisQuery) + '" placeholder="' + escapeHtml('検索 / Tìm') + '">' +
            '<button type="button" class="cio-tool-btn" id="cio-lock-toggle">' +
              biLabelHtml(unlocked ? '解除' : 'ロック', unlocked ? 'Mở khóa' : 'Khóa') +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="cio-history-wrap ' + (unlocked ? 'unlocked' : 'locked') + '" id="cio-history-wrap">' +
          '<div class="cio-history-scroll">' +
            '<table class="cio-history-table" id="cio-history-table">' +
              '<thead><tr>' +
                '<th><span class="cio-thbi"><span class="dp-label-jp">' + escapeHtml('時間') + '</span><span class="dp-label-vi">' + escapeHtml('Thời gian') + '</span></span></th>' +
                '<th><span class="cio-thbi"><span class="dp-label-jp">' + escapeHtml('状態') + '</span><span class="dp-label-vi">' + escapeHtml('Trạng thái') + '</span></span></th>' +
                '<th><span class="cio-thbi"><span class="dp-label-jp">' + escapeHtml('行き先') + '</span><span class="dp-label-vi">' + escapeHtml('Điểm đến') + '</span></span></th>' +
                '<th><span class="cio-thbi"><span class="dp-label-jp">' + escapeHtml('担当') + '</span><span class="dp-label-vi">' + escapeHtml('Nhân viên') + '</span></span></th>' +
                '<th><span class="cio-thbi"><span class="dp-label-jp">' + escapeHtml('メモ') + '</span><span class="dp-label-vi">' + escapeHtml('Ghi chú') + '</span></span></th>' +
              '</tr></thead>' +
              '<tbody id="cio-history-tbody">' + renderHistoryRows(hero.logs) + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function renderHistoryRows(logs) {
    var dm = global.DataManager;
    var destList = dm && dm.data ? dm.data.destinations : [];
    var empList = dm && dm.data ? dm.data.employees : [];

    var q = String(hisQuery || '').trim().toLowerCase();

    var rows = safeArray(logs);
    if (q) {
      rows = rows.filter(function (l) {
        try {
          var s = '';
          s += String(l.Timestamp || '');
          s += ' ' + String(l.Status || '');
          s += ' ' + String(getDestinationName(l.DestinationID, destList) || '');
          s += ' ' + String(getEmployeeName(l.EmployeeID, empList) || '');
          s += ' ' + String(getField(l, ['Notes', 'notes'], '') || '');
          return s.toLowerCase().indexOf(q) >= 0;
        } catch (e) {
          return false;
        }
      });
    }

    if (!rows.length) {
      return '<tr><td colspan="5">' + escapeHtml('—') + '</td></tr>';
    }

    return rows.map(function (l) {
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

      return (
        '<tr data-time="' + escapeHtml(String(l.Timestamp || '')) + '">' +
          '<td>' + escapeHtml(fmtDateTime(l.Timestamp)) + '</td>' +
          '<td><span class="cio-status-badge ' + escapeHtml(badgeClass) + '">' + escapeHtml(badgeText) + '</span></td>' +
          '<td>' + escapeHtml(dest || '-') + '</td>' +
          '<td>' + escapeHtml(emp || '-') + '</td>' +
          '<td class="cio-note-cell">' + escapeHtml(notes) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderActionbar() {
    return (
      '<div class="cio-actionbar">' +
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
            '<span class="dp-label-jp">' + escapeHtml('確認') + '</span>' +
            '<span class="dp-label-vi">' + escapeHtml('Xác nhận') + '</span>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function buildModalHtml(item, mode) {
    var hero = computeHeroInfo(item);

    return (
      renderHeader(mode) +
      '<div class="cio-main">' +
        '<div class="cio-grid">' +
          '<div class="cio-col cio-col-left">' +
            renderHistoryCard(hero) +
          '</div>' +
          '<div class="cio-col cio-col-right">' +
            renderHero(hero) +
            renderInputCard(mode) +
          '</div>' +
        '</div>' +
        renderActionbar() +
      '</div>'
    );
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
    try { document.body.classList.add('cio-modal-open'); } catch (e) {}
  }

  function unlockBodyScroll() {
    try { document.body.classList.remove('cio-modal-open'); } catch (e) {}
  }

  function populateSelects() {
    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];
    var destList = dm && dm.data ? dm.data.destinations : [];

    var empSel = document.getElementById('cio-emp');
    var destSel = document.getElementById('cio-dest');

    if (destSel) {
      destSel.innerHTML = '';

      var ph2 = document.createElement('option');
      ph2.value = '';
      ph2.textContent = '選択 / Chọn';
      destSel.appendChild(ph2);

      safeArray(destList).forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = String(d.DestinationID);
        opt.textContent = String(d.DestinationName || d.name || d.DestinationID);
        destSel.appendChild(opt);
      });
    }

    if (empSel) {
      empSel.innerHTML = '';

      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '選択 / Chọn';
      empSel.appendChild(ph);

      safeArray(empList).forEach(function (e) {
        var opt2 = document.createElement('option');
        opt2.value = String(e.EmployeeID);
        opt2.textContent = String(e.EmployeeName || e.name || e.EmployeeID);
        empSel.appendChild(opt2);
      });

      var defEmp = getDefaultEmpId();
      empSel.value = String(defEmp);

      var chk = document.getElementById('cio-emp-default');
      if (chk) chk.checked = (String(defEmp) === String(getDefaultEmpId()));
    }
  }

  function applyModeUi(mode) {
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
    if (req) req.classList.toggle('hidden', currentMode !== 'check-out');
  }

  function applyHistoryLockUi() {
    var unlocked = isHistoryUnlocked();

    var wrap = document.getElementById('cio-history-wrap');
    if (wrap) {
      wrap.classList.toggle('unlocked', unlocked);
      wrap.classList.toggle('locked', !unlocked);
    }

    var btn = document.getElementById('cio-lock-toggle');
    if (btn) {
      btn.innerHTML = biLabelHtml(unlocked ? '解除' : 'ロック', unlocked ? 'Mở khóa' : 'Khóa');
      btn.setAttribute('data-state', unlocked ? 'unlocked' : 'locked');
    }
  }

  function toggleHistoryLock() {
    setHistoryUnlocked(!isHistoryUnlocked());
    applyHistoryLockUi();
  }

  function validateInputs(mode) {
    var empSel = document.getElementById('cio-emp');
    var destSel = document.getElementById('cio-dest');

    var empId = empSel ? String(empSel.value || '').trim() : '';
    var destId = destSel ? String(destSel.value || '').trim() : '';

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

    try {
      var rightCol = document.querySelector('#cio-panel .cio-col-right');
      if (rightCol) {
        var hero = computeHeroInfo(item);
        var heroEl = rightCol.querySelector('.cio-hero');
        if (heroEl) {
          var wrap = document.createElement('div');
          wrap.innerHTML = renderHero(hero);
          var newHero = wrap.firstChild;
          heroEl.parentNode.replaceChild(newHero, heroEl);
        }
      }
    } catch (e0) {}
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
    if (inBtn) inBtn.addEventListener('click', function () { applyModeUi('check-in'); });
    if (outBtn) outBtn.addEventListener('click', function () { applyModeUi('check-out'); });

    var chk = document.getElementById('cio-emp-default');
    if (chk) {
      chk.addEventListener('change', function () {
        var empSel = document.getElementById('cio-emp');
        var id = empSel ? String(empSel.value || '').trim() : '';
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

    var lockBtn = document.getElementById('cio-lock-toggle');
    if (lockBtn) lockBtn.addEventListener('click', function () { toggleHistoryLock(); });

    var refreshBtn = document.getElementById('cio-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { refreshAllDataThenRerender(); });

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

    populateSelects();
    applyModeUi(currentMode);
    applyHistoryLockUi();

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
      // CSS must be included separately.
    }
  };

  global.CheckInOut = CheckInOut;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { CheckInOut.init(); }, { once: true });
  } else {
    CheckInOut.init();
  }

})(window);
