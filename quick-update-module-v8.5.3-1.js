/* ============================================================================
   quick-update-module-v8.5.3-1.js
   Module cập nhật nhanh các thông số đơn vị (Phase 16)
   - Lưu trữ qua API /api/csv/upsert
============================================================================ */

(function(global) {
    'use strict';

    var VERSION = 'v8.5.3-1';
    var API_UPSERT = 'https://ysd-moldcutter-backend.onrender.com/api/csv/upsert';

    var MODES = {
        WEIGHT: {
            jp: '重量更新',
            vi: 'Cập nhật Khối lượng',
            icon: 'fas fa-weight-hanging',
            color: '#f59e0b', /* amber */
            fields: [
                { key: 'MoldWeightModified', labelJp: '金型重量', labelVi: 'Khối lượng khuôn', type: 'text', table: 'molds' },
                { key: 'TrayWeight', labelJp: 'トレイ重量', labelVi: 'Khối lượng khay', type: 'text', table: 'trays' } // fallback to molddesign later if tray is empty
            ]
        },
        DESIGN_INFO: {
            jp: '設計情報更新',
            vi: 'Cập nhật Thông tin Thiết kế',
            icon: 'fas fa-ruler-combined',
            color: '#3b82f6', /* blue */
            fields: [
                { key: 'CustomerTrayName', labelJp: 'お客様トレイ名称', labelVi: 'Tên Sản phẩm KH', type: 'text', table: 'molddesign' },
                { key: 'CustomerDrawingNo', labelJp: 'お客様図面番号', labelVi: 'Mã Bản vẽ KH', type: 'text', table: 'molddesign' },
                { key: 'CustomerEquipmentNo', labelJp: 'お客様設備番号', labelVi: 'Mã Thiết bị KH', type: 'text', table: 'molddesign' }
            ]
        },
        LIFECYCLE: {
            jp: '運用状況更新',
            vi: 'Cập nhật Vận hành Lưu trữ',
            icon: 'fas fa-truck-loading',
            color: '#10b981', /* emerald */
            fields: [
                { key: 'MoldReturning', labelJp: '返却先', labelVi: 'Nơi trả khuôn', type: 'text', table: 'molds' },
                { key: 'MoldReturnedDate', labelJp: '返却日', labelVi: 'Ngày trả khuôn', type: 'date', table: 'molds' },
                { key: 'MoldDisposing', labelJp: '廃棄先', labelVi: 'Nơi Hủy khuôn', type: 'text', table: 'molds' },
                { key: 'MoldDisposedDate', labelJp: '廃棄日', labelVi: 'Ngày Hủy khuôn', type: 'date', table: 'molds' }
            ]
        }
    };

    var QuickUpdateModule = {
        isOpen: false,
        currentItem: null,
        currentMode: null,
        modeMeta: null,
        originalData: {}, // Giữ giá trị cũ để so sánh thay đổi

        initDOM: function() {
            if (document.getElementById('qu-backdrop')) return;

            var backdrop = document.createElement('div');
            backdrop.id = 'qu-backdrop';
            backdrop.className = 'qu-backdrop';
            
            var modal = document.createElement('div');
            modal.id = 'qu-modal';
            modal.className = 'qu-modal';

            document.body.appendChild(backdrop);
            document.body.appendChild(modal);

            backdrop.addEventListener('click', function() {
                QuickUpdateModule.close();
            });
        },

        // Resolves ID for table 'molds', 'molddesign', 'trays'
        resolveRecordKey: function(table, item) {
            var dm = global.DataManager && global.DataManager.data ? global.DataManager.data : {};
            if (table === 'molds') {
                if (item.CutterID || item.CutterNo) {
                    var cId = item.CutterID || item.CutterNo;
                    return { idValue: cId, idField: 'CutterID', actualTable: 'cutters', filename: 'webcutters.csv' };
                } else {
                    return { idValue: item.MoldID, idField: 'MoldID', actualTable: 'molds', filename: 'webmolds.csv' };
                }
            }
            if (table === 'molddesign') {
                var dId = item.MoldDesignID || (item.designInfo && item.designInfo.MoldDesignID);
                return { idValue: dId, idField: 'MoldDesignID', actualTable: 'molddesign', filename: 'webmolddesign.csv' };
            }
            if (table === 'trays') {
                var tId = item.TrayID;
                if (!tId && item.designInfo) tId = item.designInfo.TrayID;
                return { idValue: tId, idField: 'TrayID', actualTable: 'trays', filename: 'webtray.csv' };
            }
            return null;
        },

        getTableData: function(actualTable, idField, idValue) {
            var dm = global.DataManager && global.DataManager.data ? global.DataManager.data : {};
            var rows = dm[actualTable] || [];
            for (var i = 0; i < rows.length; i++) {
                if (String(rows[i][idField]).trim() === String(idValue).trim()) {
                    return rows[i];
                }
            }
            return null;
        },

        openModal: function(modeKey, item) {
            if (!MODES[modeKey]) {
                console.error('QuickUpdate: Mode not found', modeKey);
                return;
            }
            if (!item) return;

            this.initDOM();
            this.currentMode = modeKey;
            this.modeMeta = MODES[modeKey];
            this.currentItem = item;
            this.originalData = {};

            this.renderModalContent();

            document.getElementById('qu-backdrop').classList.add('is-visible');
            document.getElementById('qu-modal').classList.add('is-visible');
            this.isOpen = true;
        },

        close: function() {
            var bd = document.getElementById('qu-backdrop');
            var md = document.getElementById('qu-modal');
            if (bd) bd.classList.remove('is-visible');
            if (md) md.classList.remove('is-visible');
            this.isOpen = false;
            this.currentItem = null;
        },

        notify: function(msg, type) {
            var msgStr = String(msg);
            var cls = type || 'info';
            try {
                if (global.notify && typeof global.notify === 'object') {
                    if (cls === 'success') return global.notify.success(msgStr);
                    if (cls === 'error') return global.notify.error(msgStr);
                    if (cls === 'warning') return global.notify.warning(msgStr);
                    return global.notify.info(msgStr);
                }
                if (global.NotificationModule && typeof global.NotificationModule.show === 'function') {
                    return global.NotificationModule.show(msgStr, cls);
                }
            } catch (e) {}
            alert(msgStr);
        },

        renderModalContent: function() {
            var m = this.modeMeta;
            var item = this.currentItem;
            var md = document.getElementById('qu-modal');

            var heroCode = item.MoldCode || item.CutterNo || item.code || '-';
            var heroName = item.MoldName || item.CutterName || item.name || '-';

            var rootHtml = `
                <div class="qu-header">
                    <div class="qu-header-title">
                        <span class="qu-title-jp">${m.jp}</span>
                        <span class="qu-title-vi">${m.vi}</span>
                    </div>
                    <button class="qu-close-btn" id="qu-btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="qu-body">
                    <div class="qu-hero-info">
                        <div class="qu-hero-icon" style="background-color: ${m.color}">
                            <i class="${m.icon}"></i>
                        </div>
                        <div class="qu-hero-text">
                            <div class="qu-hero-code">${heroCode}</div>
                            <div class="qu-hero-name">${heroName}</div>
                        </div>
                    </div>
                    <div id="qu-fields-container"></div>
                </div>
                <div class="qu-footer">
                    <button class="qu-btn qu-btn-cancel" id="qu-btn-cancel">
                        <i class="fas fa-rotate-left"></i> Hủy
                    </button>
                    <button class="qu-btn qu-btn-save" id="qu-btn-save">
                        <i class="fas fa-cloud-upload-alt"></i> Cập nhật
                    </button>
                </div>
            `;
            md.innerHTML = rootHtml;

            var container = document.getElementById('qu-fields-container');
            var fieldsHtml = '';

            for (var i = 0; i < m.fields.length; i++) {
                var f = m.fields[i];
                var tInfo = this.resolveRecordKey(f.table, item);
                var val = '';
                var readonly = false;

                if (!tInfo || !tInfo.idValue) {
                    readonly = true;
                } else {
                    var rowData = this.getTableData(tInfo.actualTable, tInfo.idField, tInfo.idValue);
                    if (rowData && rowData[f.key] !== undefined) {
                        val = String(rowData[f.key]);
                    }
                }
                
                // Keep original value for diff
                this.originalData[f.key] = val;

                // Build input
                var inputTag = '';
                var attrs = readonly ? 'disabled readonly placeholder="Dữ liệu liên quan không tồn tại"' : '';
                
                if (f.type === 'date') {
                    // Safe format for date
                    var dateVal = val ? val.split(' ')[0] : '';
                    if (dateVal.indexOf('/') !== -1) dateVal = dateVal.replace(/\//g, '-');
                    inputTag = `<input type="date" class="qu-input" id="qu-input-${f.key}" data-key="${f.key}" value="${dateVal}" ${attrs}>`;
                } else {
                    inputTag = `<input type="text" class="qu-input" id="qu-input-${f.key}" data-key="${f.key}" value="${val}" ${attrs}>`;
                }

                fieldsHtml += `
                    <div class="qu-field">
                        <div class="qu-label">
                            <span class="qu-label-jp">${f.labelJp}</span>
                            <span class="qu-label-vi">${f.labelVi}</span>
                        </div>
                        ${inputTag}
                    </div>
                `;
            }

            container.innerHTML = fieldsHtml;

            // Bind events
            document.getElementById('qu-btn-close').addEventListener('click', this.close.bind(this));
            document.getElementById('qu-btn-cancel').addEventListener('click', this.close.bind(this));
            
            var saveBtn = document.getElementById('qu-btn-save');
            saveBtn.addEventListener('click', this.handleSave.bind(this));
        },

        handleSave: async function() {
            var saveBtn = document.getElementById('qu-btn-save');
            saveBtn.classList.add('is-loading');
            saveBtn.disabled = true;

            var m = this.modeMeta;
            var changesByTable = {}; // Group by actualTable { filename, idField, key, fields: {} }

            // Extract diff
            for (var i = 0; i < m.fields.length; i++) {
                var f = m.fields[i];
                var el = document.getElementById('qu-input-' + f.key);
                if (!el || el.disabled) continue;

                var newVal = String(el.value).trim();
                var oldVal = String(this.originalData[f.key] || '').trim();

                // Format fallback date handling logic if necessary, here we assume empty stays empty
                if (newVal !== oldVal) {
                    var tInfo = this.resolveRecordKey(f.table, this.currentItem);
                    if (!tInfo) continue;

                    if (!changesByTable[tInfo.actualTable]) {
                        changesByTable[tInfo.actualTable] = {
                            filename: tInfo.filename,
                            idfield: tInfo.idField,
                            key: tInfo.idValue,
                            fields: {}
                        };
                    }
                    changesByTable[tInfo.actualTable].fields[f.key] = newVal;
                }
            }

            var tableKeys = Object.keys(changesByTable);
            if (tableKeys.length === 0) {
                this.notify('Không có sự thay đổi nào để lưu.', 'info');
                saveBtn.classList.remove('is-loading');
                saveBtn.disabled = false;
                this.close();
                return;
            }

            // Execute Sequentially for each table
            try {
                for (var j = 0; j < tableKeys.length; j++) {
                    var reqData = changesByTable[tableKeys[j]];
                    
                    var payload = {
                        filename: reqData.filename,
                        idField: reqData.idfield,
                        idValue: reqData.key,
                        updates: reqData.fields,
                        mode: 'update'
                    };

                    var res = await fetch(API_UPSERT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    var json = await res.json();
                    if (!res.ok || json.success === false) {
                        throw new Error(json.message || 'Lỗi lưu bảng ' + reqData.filename);
                    }
                }

                this.notify('Đã cập nhật dữ liệu thành công!', 'success');
                this.close();
                
                // Trigger reload if datamanager has it
                if (global.DataManager && typeof global.DataManager.forceReload === 'function') {
                    global.DataManager.forceReload();
                } else if (global.App && typeof global.App.loadData === 'function') {
                    global.App.loadData();
                }

            } catch (err) {
                console.error(err);
                this.notify('Lưu thất bại: ' + err.message, 'error');
            } finally {
                if (document.getElementById('qu-btn-save')) {
                    saveBtn.classList.remove('is-loading');
                    saveBtn.disabled = false;
                }
            }
        }
    };

    // Export module
    global.QuickUpdateModule = QuickUpdateModule;

})(window);
