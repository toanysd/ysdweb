/*
  checkin-checkout-v8.4.5-2-1.js
  MoldCutterSearch - Check-in / Check-out modal (PA1 2 cột)

  Mục tiêu bản -2-1:
  - JS KHÔNG nhúng CSS (không tạo <style> inline, không chứa chuỗi CSS).
  - Tối ưu hiển thị mobile: luôn thấy đủ trường nhập (đặc biệt: Nhân viên).
  - API giữ nguyên:
      window.CheckInOut.openModal(mode, item)  // mode: 'check-in' | 'check-out'
      window.CheckInOut.close()
      window.CheckInOut.refreshHistoryInPlace(item?)
  - Không tự bắt event 'quick-action' (App là nơi gọi).

  Yêu cầu môi trường:
  - HTML đã nhúng CSS riêng: checkin-checkout-v8.4.5-2.css (hoặc bản tương đương).
  - window.DataManager (data-manager-v8.4.x) nếu muốn có lịch sử/nhân viên/điểm đến.
  - Tuỳ chọn: window.createSearchableSelect(id, options, onChange)
  - Tuỳ chọn: window.LocationManager.openModal(item)
*/

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5-2-1';

  // ----------------------------- CONFIG -----------------------------
  var DEFAULT_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
  var DEFAULT_DELETE_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/deletelog';

  function getCfg() {
    var c = (global.CIOCONFIG && typeof global.CIOCONFIG === 'object') ? global.CIOCONFIG : {};
    return {
      apiUrl: c.apiUrl || DEFAULT_API_URL,
      deleteApiUrl: c.deleteApiUrl || DEFAULT_DELETE_API_URL
    };
  }

  // ----------------------------- STATE -----------------------------
  var currentItem = null;
  var currentMode = 'check-in';
  var opened = false;

  var bodyPrevOverflow = null;
  var bodyPrevTouchAction = null;

  var hisQuery = '';
  var hisSortKey = 'Timestamp';
  var hisSortDir = 'desc';

  var SESSIONKEY_LAST_ACTION = 'checkin_last_action_timestamp';
  var STORAGEKEY_DEFAULT_EMP = 'cio_default_employee_id';
  var STORAGEKEY_HIS_UNLOCK = 'cio_history_unlocked';
  var STORAGEKEY_HIS_INITED = 'cio_history_unlock_inited';

  // ----------------------------- Storage safe fallback -----------------------------
  var cioStorageOkCached = null;
  var memHisUnlocked = false;
  var memHisInited = false;

  function cioStorageOk() {
    if (cioStorageOkCached !== null) return cioStorageOkCached;
    try {
      var k = '__cio_ls_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      cioStorageOkCached = true;
    } catch (e) {
      cioStorageOkCached = false;
    }
    return cioStorageOkCached;
  }

  // ----------------------------- I18N -----------------------------
  function JV(ja, vi) {
    return String(ja) + '\n' + String(vi);
  }

  // ----------------------------- UTILS -----------------------------
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
    try {
      return (global.innerWidth || 0) < 900;
    } catch (e) {
      return false;
    }
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
    try {
      sessionStorage.setItem(SESSIONKEY_LAST_ACTION, String(Date.now()));
    } catch (e) {}
  }

  function getDefaultEmpId() {
    try {
      return localStorage.getItem(STORAGEKEY_DEFAULT_EMP);
    } catch (e) {
      return null;
    }
  }

  function setDefaultEmpId(id) {
    try {
      if (id) localStorage.setItem(STORAGEKEY_DEFAULT_EMP, String(id));
    } catch (e) {}
  }

  function clearDefaultEmpId() {
    try {
      localStorage.removeItem(STORAGEKEY_DEFAULT_EMP);
    } catch (e) {}
  }

  function isHistoryUnlocked() {
    if (cioStorageOk()) {
      try {
        var v = localStorage.getItem(STORAGEKEY_HIS_UNLOCK);
        memHisUnlocked = (v === '1');
        return memHisUnlocked;
      } catch (e) {
        return memHisUnlocked;
      }
    }
    return memHisUnlocked;
  }

  function setHistoryUnlocked(v) {
    memHisUnlocked = !!v;
    if (cioStorageOk()) {
      try {
        localStorage.setItem(STORAGEKEY_HIS_UNLOCK, memHisUnlocked ? '1' : '0');
      } catch (e) {}
    }
  }

  function ensureHistoryUnlockDefault() {
    if (cioStorageOk()) {
      try {
        if (localStorage.getItem(STORAGEKEY_HIS_INITED) === '1') return;
        // Desktop: UNLOCK, Mobile: LOCK
        setHistoryUnlocked(!isMobile());
        localStorage.setItem(STORAGEKEY_HIS_INITED, '1');
        return;
      } catch (e) {}
    }

    if (memHisInited) return;
    setHistoryUnlocked(!isMobile());
    memHisInited = true;
  }

  function parseSelectedIdFromInput(inputEl) {
    if (!inputEl) return '';
    try {
      if (inputEl.dataset && inputEl.dataset.selectedId) return String(inputEl.dataset.selectedId).trim();
    } catch (e) {}
    var raw = String(inputEl.value || '').trim();
    if (!raw) return '';
    var m = raw.match(/\(([^)]+)\)\s*$/);
    if (m) return String(m[1]).trim();
    m = raw.match(/([A-Za-z0-9._-]+)$/);
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
    if (!empId) return '';
    empList = safeArray(empList);
    var found = empList.find(function (e) { return normalizeId(e.EmployeeID) === normalizeId(empId); });
    if (!found) return String(empId);
    return String(found.EmployeeName || found.name || empId);
  }

  function normalizeLogPendingFlag(log) {
    if (!log) return { pending: false, error: false, localId: '' };
    var pending = !!(log.pending || log.Pending);
    var localId = String(log.localId || log.LocalId || '');
    var error = !!(log.syncError || log.SyncError);
    return { pending: pending, error: error, localId: localId };
  }

  // ----------------------------- FEEDBACK -----------------------------
  function showBilingualToast(type) {
    var msgJa = '';
    var msgVi = '';
    var cls = 'info';

    if (type === 'saved') {
      msgJa = '保存しました';
      msgVi = 'Đã lưu';
      cls = 'success';
    } else if (type === 'pending') {
      msgJa = '一時保存（同期待ち）';
      msgVi = 'Đã lưu tạm (chờ đồng bộ)';
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

    // Prefer notify / NotificationModule
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
        global.NotificationModule.show(msgVi, msgJa, cls);
        return;
      }
    } catch (e1) {}

    // Fallback: alert (không dùng inline style)
    try {
      alert(msgVi + '\n' + msgJa);
    } catch (e2) {}
  }

  // ----------------------------- DOM -----------------------------
  function ensureModalSkeleton() {
    var backdrop = document.getElementById('cio-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'cio-backdrop';
      backdrop.className = 'cio-backdrop hidden';
      document.body.appendChild(backdrop);
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

    var titleJa = (mode === 'check-in') ? '入庫 (IN)' : '出庫 (OUT)';
    var titleVi = (mode === 'check-in') ? 'Check-in (IN)' : 'Check-out (OUT)';

    var destHiddenClass = (mode === 'check-out') ? '' : 'is-hidden';

    return (
      '' +
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
              '<input id="cio-history-search" class="cio-search" placeholder="Search / Tìm" value="' + escapeHtml(hisQuery) + '" />' +
              '<button type="button" class="cio-lock" id="cio-lock-btn"></button>' +
            '</div>' +
          '</div>' +
          '<div class="cio-history-wrap" id="cio-history-wrap">' +
            '<table class="cio-history-table" id="cio-history-table">' +
              '<thead>' +
                '<tr>' +
                  '<th data-sort="Timestamp">' + escapeHtml(JV('時間', 'Thời gian')) + '</th>' +
                  '<th data-sort="Status">' + escapeHtml(JV('状態', 'Trạng thái')) + '</th>' +
                  '<th data-sort="DestinationID">' + escapeHtml(JV('行き先', 'Điểm đến')) + '</th>' +
                  '<th data-sort="EmployeeID">' + escapeHtml(JV('担当', 'Nhân viên')) + '</th>' +
                  '<th data-sort="Notes">' + escapeHtml(JV('メモ', 'Ghi chú')) + '</th>' +
                  '<th class="col-sync" data-sort="sync">' + escapeHtml(JV('同期', 'Sync')) + '</th>' +
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
                '<div class="ja">対象情報</div>' +
                '<div class="vi">Đối tượng</div>' +
              '</div>' +
            '</div>' +
            '<div class="cio-status-box">' +
              '<div class="cio-kv"><div class="cio-k">Type</div><div class="cio-v">' + escapeHtml(String(key.itemType)) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Code</div><div class="cio-v">' + escapeHtml(String(code || '-')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Name</div><div class="cio-v wrap">' + escapeHtml(String(name || '-')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Size</div><div class="cio-v">' + escapeHtml(String(size || '-')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Location</div><div class="cio-v">' + escapeHtml(String(location || '-')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Company</div><div class="cio-v">' + escapeHtml(String(company || '-')) + '</div></div>' +
              '<div class="cio-kv"><div class="cio-k">Date</div><div class="cio-v">' + escapeHtml(String(date || '-')) + '</div></div>' +
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

              '<div class="cio-label">' + escapeHtml(JV('担当者', 'Nhân viên')) + '</div>' +
              '<div id="employee-select-container"></div>' +
              '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:900;font-size:12px">' +
                '<input type="checkbox" id="cio-emp-default" /> ' + escapeHtml(JV('既定にする', 'Đặt mặc định')) +
              '</label>' +

              '<div class="cio-row">' +
                '<div id="cio-face-status" class="cio-face-status">' + escapeHtml(JV('入力前の確認', 'Xác nhận trước khi nhập')) + '</div>' +
                '<button type="button" class="cio-btn secondary" id="btn-face">' + escapeHtml(JV('FaceID', 'FaceID')) + '</button>' +
              '</div>' +

              '<div class="dest-group ' + destHiddenClass + '">' +
                '<div class="cio-label">' + escapeHtml(JV('行き先', 'Điểm đến')) + '</div>' +
                '<div id="destination-select-container"></div>' +
              '</div>' +

              '<div class="cio-label">' + escapeHtml(JV('メモ', 'Ghi chú')) + '</div>' +
              '<textarea id="cio-note" class="cio-control" rows="4" placeholder="..." ></textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="cio-actionbar">' +
        '<button type="button" class="cio-act cancel" id="btn-cancel"><div class="ja">戻る</div><div class="vi">Hủy</div></button>' +
        '<button type="button" class="cio-act relocate" id="btn-relocate"><div class="ja">移動</div><div class="vi">Đổi vị trí</div></button>' +
        '<button type="button" class="cio-act save" id="btn-save"><div class="ja">保存</div><div class="vi">Lưu</div></button>' +
      '</div>'
    );
  }

  function lockBodyScroll() {
    try {
      if (bodyPrevOverflow === null) bodyPrevOverflow = document.body.style.overflow;
      if (bodyPrevTouchAction === null) bodyPrevTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } catch (e) {}
  }

  function unlockBodyScroll() {
    try {
      document.body.style.overflow = (bodyPrevOverflow !== null) ? bodyPrevOverflow : '';
      document.body.style.touchAction = (bodyPrevTouchAction !== null) ? bodyPrevTouchAction : '';
    } catch (e) {}
    bodyPrevOverflow = null;
    bodyPrevTouchAction = null;
  }

  // ----------------------------- UI helpers -----------------------------
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
        if (ja) ja.textContent = (currentMode === 'check-in') ? '入庫 (IN)' : '出庫 (OUT)';
        if (vi) vi.textContent = (currentMode === 'check-in') ? 'Check-in (IN)' : 'Check-out (OUT)';
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

    // Ensure destination select exists when switching to checkout
    if (currentMode === 'check-out') {
      var destContainer = document.getElementById('destination-select-container');
      if (destContainer && destContainer.children.length === 0) initSelectsForMode('check-out');
    } else {
      // clear destination
      try {
        var destEl = document.getElementById('cio-dest');
        if (destEl) {
          destEl.value = '';
          if (destEl.dataset) destEl.dataset.selectedId = '';
        }
      } catch (e) {}
    }
  }

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
      btn.textContent = unlocked ? 'UNLOCK' : 'LOCK';
      btn.setAttribute('aria-label', unlocked ? 'Unlock' : 'Lock');
      btn.title = unlocked ? JV('ON（横スクロール可）', 'ON (cho cuộn ngang)') : JV('OFF（横スクロール不可）', 'OFF (khóa cuộn ngang)');
    }
  }

  function toggleHistoryLock() {
    setHistoryUnlocked(!isHistoryUnlocked());
    applyHistoryLockState();
    refreshHistoryInPlace(currentItem);
  }

  // ----------------------------- Selects -----------------------------
  function renderNativeEmployeeSelect(container, empOptions) {
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
    if (defEmp) {
      sel.value = String(defEmp);
      var chk = document.getElementById('cio-emp-default');
      if (chk) chk.checked = true;
    }

    sel.addEventListener('change', function () {
      var faceStat = document.getElementById('cio-face-status');
      if (faceStat) {
        faceStat.textContent = JV('入力前の確認', 'Xác nhận trước khi nhập');
        faceStat.classList.remove('confirmed');
      }
    });
  }

  function renderNativeDestinationSelect(container, destOptions) {
    var sel = document.createElement('select');
    sel.id = 'cio-dest';
    sel.className = 'cio-control';

    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = JV('行き先を選択', 'Chọn điểm đến');
    sel.appendChild(ph);

    destOptions.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      sel.appendChild(opt);
    });

    container.appendChild(sel);
  }

  function initSelectsForMode(mode) {
    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];
    var destList = dm && dm.data ? dm.data.destinations : [];

    var empContainer = document.getElementById('employee-select-container');
    if (empContainer) {
      empContainer.innerHTML = '';

      var empOptions = safeArray(empList).map(function (e) {
        return {
          id: String(e.EmployeeID),
          name: String(e.EmployeeName || e.name || e.EmployeeID)
        };
      });

      if (typeof global.createSearchableSelect === 'function') {
        try {
          var empSelect = global.createSearchableSelect('cio-emp', empOptions, function () {
            var faceStat = document.getElementById('cio-face-status');
            if (faceStat) {
              faceStat.textContent = JV('入力前の確認', 'Xác nhận trước khi nhập');
              faceStat.classList.remove('confirmed');
            }
          });
          empContainer.appendChild(empSelect);

          var defEmpId = getDefaultEmpId();
          if (defEmpId) {
            setTimeout(function () {
              try {
                if (empSelect && typeof empSelect.setValue === 'function') empSelect.setValue(String(defEmpId));
                var chk = document.getElementById('cio-emp-default');
                if (chk) chk.checked = true;
              } catch (e0) {}
            }, 0);
          }
        } catch (e1) {
          renderNativeEmployeeSelect(empContainer, empOptions);
        }
      } else {
        renderNativeEmployeeSelect(empContainer, empOptions);
      }
    }

    var destContainer = document.getElementById('destination-select-container');
    if (destContainer) {
      destContainer.innerHTML = '';
      if (mode === 'check-out') {
        var destOptions = safeArray(destList).map(function (d) {
          return {
            id: String(d.DestinationID),
            name: String(d.DestinationName || d.DestinationID)
          };
        });

        if (typeof global.createSearchableSelect === 'function') {
          try {
            var destSelect = global.createSearchableSelect('cio-dest', destOptions);
            destContainer.appendChild(destSelect);
          } catch (e2) {
            renderNativeDestinationSelect(destContainer, destOptions);
          }
        } else {
          renderNativeDestinationSelect(destContainer, destOptions);
        }
      }
    }
  }

  // ----------------------------- History -----------------------------
  function getLogsForItem(item) {
    var dm = global.DataManager;
    var logs = dm && dm.data ? dm.data.statuslogs : [];
    logs = safeArray(logs);

    var k = getItemKey(item);
    var id = normalizeId(k.id);
    if (!id) return [];

    return logs.filter(function (l) {
      if (!l) return false;
      if (k.itemType === 'mold') return normalizeId(l.MoldID) === id;
      if (k.itemType === 'cutter') return normalizeId(l.CutterID) === id;
      return (normalizeId(l.MoldID) === id) || (normalizeId(l.CutterID) === id);
    });
  }

  function sortLogs(logs, destList, empList) {
    var key = hisSortKey;
    var dir = hisSortDir;
    var mul = (dir === 'asc') ? 1 : -1;

    function val(l) {
      if (!l) return '';
      if (key === 'sync') {
        var pf = normalizeLogPendingFlag(l);
        if (pf.error) return 2;
        if (pf.pending) return 1;
        return 0;
      }
      if (key === 'EmployeeID') return getEmployeeName(l.EmployeeID, empList);
      if (key === 'DestinationID') return getDestinationName(l.DestinationID, destList);
      return (l[key] !== undefined && l[key] !== null) ? l[key] : '';
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
        return mul * (Number(av) - Number(bv));
      }

      return mul * String(av).localeCompare(String(bv), 'ja');
    });
  }

  function renderHistory(item) {
    var dm = global.DataManager;
    var destList = dm && dm.data ? dm.data.destinations : [];
    var empList = dm && dm.data ? dm.data.employees : [];

    var logs = getLogsForItem(item);

    var q = String(hisQuery || '').trim().toLowerCase();
    if (q) {
      logs = logs.filter(function (l) {
        var s = '';
        try {
          s += ' ' + String(l.Timestamp || '');
          s += ' ' + String(l.Status || '');
          s += ' ' + String(getDestinationName(l.DestinationID, destList) || '');
          s += ' ' + String(getEmployeeName(l.EmployeeID, empList) || '');
          s += ' ' + String(l.Notes || '');
        } catch (e) {}
        return s.toLowerCase().indexOf(q) >= 0;
      });
    }

    logs = sortLogs(logs, destList, empList);

    var tbody = document.getElementById('cio-history-tbody');
    if (!tbody) return;

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:12px;opacity:.8;font-weight:900">' + escapeHtml(JV('履歴なし', 'Chưa có lịch sử')) + '</td></tr>';
      return;
    }

    var unlocked = isHistoryUnlocked();

    var html = '';
    logs.forEach(function (l) {
      var status = String(l.Status || '').toUpperCase();
      var badgeCls = (status === 'IN') ? 'cio-b-in' : (status === 'OUT') ? 'cio-b-out' : 'cio-b-unknown';
      var destName = getDestinationName(l.DestinationID, destList);
      var empName = getEmployeeName(l.EmployeeID, empList);

      var pf = normalizeLogPendingFlag(l);
      var syncDot = '<span class="cio-sync-dot synced">●</span>';
      if (pf.error) syncDot = '<span class="cio-sync-dot error" title="error">●</span>';
      else if (pf.pending) syncDot = '<span class="cio-sync-dot pending" title="pending">●</span>';

      var delBtn = '<span style="opacity:.25">-</span>';
      if (unlocked) {
        delBtn = '<button type="button" class="cio-delete-btn" data-del-ts="' + escapeHtml(String(l.Timestamp || '')) + '" data-del-local="' + escapeHtml(String(pf.localId || '')) + '">×</button>';
      }

      html += (
        '<tr>' +
          '<td>' + escapeHtml(fmt(l.Timestamp)) + '</td>' +
          '<td><span class="cio-status-badge ' + badgeCls + '">' + escapeHtml(status || '-') + '</span></td>' +
          '<td>' + escapeHtml(destName || '-') + '</td>' +
          '<td>' + escapeHtml(empName || '-') + '</td>' +
          '<td class="cio-note-cell">' + escapeHtml(String(l.Notes || '')) + '</td>' +
          '<td class="col-sync">' + syncDot + '</td>' +
          '<td class="col-del">' + delBtn + '</td>' +
        '</tr>'
      );
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

    var ths = table.querySelectorAll('thead th[data-sort]');
    ths.forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (!k) return;
        if (hisSortKey === k) hisSortDir = (hisSortDir === 'asc') ? 'desc' : 'asc';
        else {
          hisSortKey = k;
          hisSortDir = 'desc';
        }
        if (currentItem) renderHistory(currentItem);
      });
    });
  }

  function bindHistoryDeleteButtons(item) {
    var tbody = document.getElementById('cio-history-tbody');
    if (!tbody) return;
    if (tbody.dataset.delBound === '1') return;
    tbody.dataset.delBound = '1';

    tbody.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.closest) t = t.closest('button[data-del-ts]') || t;
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

  // ----------------------------- Delete log -----------------------------
  function removeLogFromLocal(timestamp, localId) {
    try {
      if (global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.remove === 'function') {
        if (localId) global.DataManager.PendingCache.remove(localId);
      }
    } catch (e0) {}

    try {
      if (global.DataManager && global.DataManager.data && Array.isArray(global.DataManager.data.statuslogs)) {
        global.DataManager.data.statuslogs = global.DataManager.data.statuslogs.filter(function (l) {
          if (!l) return false;
          var lid = String(l.localId || l.LocalId || '');
          if (localId && lid && String(localId) === lid) return false;
          return String(l.Timestamp || '') !== String(timestamp || '');
        });
      }
      if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e1) {}
  }

  function deleteLog(item, timestamp, localId) {
    if (!item) return;

    // If pending local -> remove locally
    if (localId) {
      removeLogFromLocal(timestamp, localId);
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
        if (!rj || !rj.success) throw new Error((rj && rj.message) ? rj.message : 'Delete failed');
        removeLogFromLocal(timestamp, '');
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

  // ----------------------------- FaceID mock -----------------------------
  function mockFaceID() {
    var dm = global.DataManager;
    var empList = dm && dm.data ? dm.data.employees : [];
    empList = safeArray(empList);

    var empInput = document.getElementById('cio-emp');
    var faceStat = document.getElementById('cio-face-status');

    if (!empInput || !empList.length) {
      alert(JV('担当者リストがありません', 'Danh sách nhân viên trống'));
      return;
    }

    var rnd = Math.floor(Math.random() * empList.length);
    var emp = empList[rnd];
    var empId = String(emp.EmployeeID || '').trim();
    if (!empId) return;

    try {
      empInput.value = empId;
      if (empInput.dataset) empInput.dataset.selectedId = empId;
    } catch (e0) {}

    if (faceStat) {
      faceStat.textContent = JV('Face ID 確認済み', 'Face ID xác nhận');
      faceStat.classList.add('confirmed');
    }

    var chk = document.getElementById('cio-emp-default');
    if (chk) chk.checked = true;
  }

  // ----------------------------- Save -----------------------------
  function validateInputs(mode) {
    var empInput = document.getElementById('cio-emp');
    var destInput = document.getElementById('cio-dest');

    var empId = parseSelectedIdFromInput(empInput);
    var destId = (mode === 'check-out') ? parseSelectedIdFromInput(destInput) : '';

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

  function addPendingLog(logData) {
    var pending = null;

    try {
      if (global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.add === 'function') {
        pending = global.DataManager.PendingCache.add(logData);
        return pending;
      }
    } catch (e0) {}

    try {
      if (global.DataManager && global.DataManager.data) {
        if (!Array.isArray(global.DataManager.data.statuslogs)) global.DataManager.data.statuslogs = [];
        pending = Object.assign({}, logData, {
          pending: true,
          localId: 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
          createdAt: new Date().toISOString()
        });
        global.DataManager.data.statuslogs.unshift(pending);
        if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
      }
    } catch (e1) {}

    return pending;
  }

  function removePendingByLocalId(localId) {
    if (!localId) return;
    try {
      if (global.DataManager && global.DataManager.PendingCache && typeof global.DataManager.PendingCache.remove === 'function') {
        global.DataManager.PendingCache.remove(localId);
      }
    } catch (e0) {}

    try {
      if (global.DataManager && global.DataManager.data && Array.isArray(global.DataManager.data.statuslogs)) {
        global.DataManager.data.statuslogs = global.DataManager.data.statuslogs.filter(function (l) {
          var lid = String(l && (l.localId || l.LocalId) || '');
          return lid !== String(localId);
        });
      }
      if (global.DataManager && typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
    } catch (e1) {}
  }

  function mergeServerLog(localPendingLocalId, serverLog) {
    if (!serverLog) return;
    removePendingByLocalId(localPendingLocalId);

    try {
      if (global.DataManager && global.DataManager.data) {
        if (!Array.isArray(global.DataManager.data.statuslogs)) global.DataManager.data.statuslogs = [];
        global.DataManager.data.statuslogs.unshift(serverLog);
        if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
      }
    } catch (e0) {}
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

    // Default employee checkbox
    try {
      var defChk = document.getElementById('cio-emp-default');
      if (defChk && defChk.checked) setDefaultEmpId(empId);
      else clearDefaultEmpId();
    } catch (e0) {}

    // 1) add pending local
    var pending = addPendingLog(logData);
    showBilingualToast('pending');
    setLastActionTime();
    refreshHistoryInPlace(item);

    // 2) sync to server
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
        if (!rj || !rj.success) throw new Error((rj && rj.message) ? rj.message : 'Sync failed');

        var localId = pending ? String(pending.localId || pending.LocalId || '') : '';
        if (rj.newStatusLog) {
          mergeServerLog(localId, rj.newStatusLog);
        } else {
          // Server không trả log mới -> xoá pending và giữ logData như synced
          removePendingByLocalId(localId);
          try {
            if (global.DataManager && global.DataManager.data && Array.isArray(global.DataManager.data.statuslogs)) {
              global.DataManager.data.statuslogs.unshift(logData);
              if (typeof global.DataManager.recompute === 'function') global.DataManager.recompute();
            }
          } catch (e0) {}
        }

        showBilingualToast('saved');
        refreshHistoryInPlace(item);

        try {
          document.dispatchEvent(new CustomEvent('detailchanged', { detail: { item: item, itemType: key.itemType, itemId: key.id, source: 'checkin-save' } }));
        } catch (e1) {}
      })
      .catch(function (err) {
        console.warn('[CheckInOut] sync failed', err);

        // Mark pending as error (best-effort)
        try {
          if (pending) pending.syncError = true;
        } catch (e2) {}

        showBilingualToast('error');
        refreshHistoryInPlace(item);
      });
  }

  // ----------------------------- Events -----------------------------
  function bindModalEvents(item) {
    var panel = document.getElementById('cio-panel');
    var backdrop = document.getElementById('cio-backdrop');

    var btnClose = document.getElementById('cio-close');
    var btnRefresh = document.getElementById('cio-refresh');
    var btnLock = document.getElementById('cio-lock-btn');

    var btnIn = document.getElementById('btn-in');
    var btnOut = document.getElementById('btn-out');

    var btnFace = document.getElementById('btn-face');
    var btnCancel = document.getElementById('btn-cancel');
    var btnRelocate = document.getElementById('btn-relocate');
    var btnSave = document.getElementById('btn-save');

    var hisSearch = document.getElementById('cio-history-search');

    if (btnClose) btnClose.onclick = function () { closeModal(); };
    if (btnCancel) btnCancel.onclick = function () { closeModal(); };

    if (backdrop) {
      backdrop.onclick = function (e) {
        if (e && e.target === backdrop) closeModal();
      };
    }

    if (btnRefresh) {
      btnRefresh.onclick = function () {
        refreshHistoryInPlace(item);
        showBilingualToast('refreshed');
      };
    }

    if (btnLock) btnLock.onclick = function () { toggleHistoryLock(); };

    if (btnIn) btnIn.onclick = function () { switchMode('check-in'); };
    if (btnOut) btnOut.onclick = function () { switchMode('check-out'); };

    if (btnFace) btnFace.onclick = function () { mockFaceID(); };

    if (btnRelocate) {
      btnRelocate.onclick = function () {
        try {
          if (global.LocationManager && typeof global.LocationManager.openModal === 'function') {
            global.LocationManager.openModal(item);
            return;
          }
        } catch (e0) {}

        alert(JV('LocationManagerがありません', 'Chưa có LocationManager'));
      };
    }

    if (btnSave) btnSave.onclick = function () { saveRecord(item); };

    if (hisSearch) {
      hisSearch.oninput = function () {
        hisQuery = String(hisSearch.value || '');
        refreshHistoryInPlace(item);
      };
    }

    // Escape closes
    try {
      panel.onkeydown = function (e) {
        if (e && e.key === 'Escape') closeModal();
      };
      panel.setAttribute('tabindex', '-1');
      panel.focus();
    } catch (e2) {}
  }

  // ----------------------------- Public API -----------------------------
  function openModal(mode, item) {
    if (!item) {
      alert(JV('対象がありません', 'Không có đối tượng'));
      return;
    }

    ensureHistoryUnlockDefault();

    currentItem = item;
    currentMode = (mode === 'check-out') ? 'check-out' : 'check-in';
    opened = true;

    var panel = ensureModalSkeleton();
    panel.innerHTML = buildModalHtml(currentMode, currentItem);

    var bd = document.getElementById('cio-backdrop');
    if (bd) bd.classList.remove('hidden');
    panel.classList.remove('hidden');

    lockBodyScroll();

    applyModeButtons();
    initSelectsForMode(currentMode);
    applyHistoryLockState();
    renderHistory(currentItem);
    bindModalEvents(currentItem);

    // Focus search on desktop
    setTimeout(function () {
      try {
        var el = document.getElementById('cio-history-search');
        if (el && !isMobile()) el.focus();
      } catch (e0) {}
    }, 0);
  }

  function closeModal() {
    opened = false;

    var bd = document.getElementById('cio-backdrop');
    var panel = document.getElementById('cio-panel');

    if (bd) bd.classList.add('hidden');
    if (panel) panel.classList.add('hidden');

    unlockBodyScroll();

    currentItem = null;
  }

  function init() {
    // Không tự bind event ngoài (để App làm trung tâm)
    try {
      console.log('[CheckInOut] ' + VERSION + ' loaded');
    } catch (e) {}
  }

  var CheckInOut = {
    version: VERSION,
    init: init,
    openModal: openModal,
    close: closeModal,
    refreshHistoryInPlace: refreshHistoryInPlace
  };

  global.CheckInOut = CheckInOut;

  // Optional auto-init
  try {
    if (typeof global.CheckInOut.init === 'function') global.CheckInOut.init();
  } catch (e0) {}

})(window);
