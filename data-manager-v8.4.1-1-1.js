/* ============================================================================
   DATA MANAGER v8.1.0
   MoldCutter Search System - Core Data Loading & Relationship Module
   Created: 2026-01-23 08:10
   Based on: r7.0.9 & v8.0.1 (V4.31 logic, fully tested)

   Features:
   - Loads 17 CSV files from GitHub Raw with local fallback
   - Parses CSV with quotes/CRLF handling
   - Builds V4.31 relationships + computed fields
   - Mold-Cutter relation via MoldDesignID (preferred), fallback to legacy
   - PendingCache for offline queuing (LocalStorage persistence)
   - Exposes window.DataManager for other modules
   - Compatible with v8.0.3 UI modules (App, CardRenderer, TableRenderer)
============================================================================ */

(function() {
    'use strict';

    console.log('💾 Data Manager v8.0.3-1 initializing...');

    // =========================================================================
    // CONFIGURATION
    // =========================================================================
    const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
    const REMOTE_TIMEOUT_MS = 12000;

    // Registry of CSV files (17 files total)
    const CSV_FILES = [
        // Core tables (required)
        { key: 'molds', file: 'molds.csv', required: true },
        { key: 'cutters', file: 'cutters.csv', required: true },

        // Relationship tables (optional)
        { key: 'customers', file: 'customers.csv', required: false },
        { key: 'molddesign', file: 'molddesign.csv', required: false },
        { key: 'moldcutter', file: 'moldcutter.csv', required: false },
        { key: 'racklayers', file: 'racklayers.csv', required: false },
        { key: 'racks', file: 'racks.csv', required: false },
        { key: 'companies', file: 'companies.csv', required: false },

        // History logs (optional)
        { key: 'shiplog', file: 'shiplog.csv', required: false },
        { key: 'locationlog', file: 'locationlog.csv', required: false },
        { key: 'usercomments', file: 'usercomments.csv', required: false },

        // Process tables (optional)
        { key: 'employees', file: 'employees.csv', required: false },
        { key: 'jobs', file: 'jobs.csv', required: false },
        { key: 'processingitems', file: 'processingitems.csv', required: false },

        // New tables
        { key: 'CAV', file: 'CAV.csv', required: false },
        { key: 'destinations', file: 'destinations.csv', required: false },
        { key: 'statuslogs', file: 'statuslogs.csv', required: false },
        { key: 'teflonlog', file: 'teflonlog.csv', required: false },
    ];

    // =========================================================================
    // INTERNAL STATE
    // =========================================================================
    const state = {
        allData: {
            molds: [],
            cutters: [],
            customers: [],
            molddesign: [],
            moldcutter: [],
            racklayers: [],
            racks: [],
            companies: [],
            shiplog: [],
            locationlog: [],
            usercomments: [],
            employees: [],
            jobs: [],
            processingitems: [],
            CAV: [],
            destinations: [],
            statuslogs: [],
            teflonlog: [],
        },
        maps: {},
        loaded: false,
    };

    // =========================================================================
    // PENDING CACHE LAYER (Offline Queuing)
    // =========================================================================
    const PendingCache = {

  // Storage-safe (v8.0.3-1)
  _persistenceEnabled: true,
  _persistWarned: false,
  _lastPersistError: null,

  _isQuotaError: function(e) {
    try {
      if (!e) return false;
      if (e.name === 'QuotaExceededError') return true;
      if (e.code === 22 || e.code === 1014) return true;
      var msg = String(e.message || e).toLowerCase();
      return msg.indexOf('quota') >= 0 || msg.indexOf('exceeded') >= 0 || msg.indexOf('storage') >= 0;
    } catch (_) {
      return false;
    }
  },

  _safeJsonParse: function(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  },

  _normalizeText: function(v, maxLen) {
    var s = '';
    try { s = (v === null || v === undefined) ? '' : String(v); } catch (_) { s = ''; }
    if (!maxLen || maxLen <= 0) return s;
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
  },

  _compactPending: function(list, options) {
    options = options || {};
    var maxNotes = Number.isFinite(options.maxNotes) ? options.maxNotes : 240;
    var arr = Array.isArray(list) ? list : [];
    return arr
      .filter(function(p){ return p && typeof p === 'object'; })
      .map(function(p){
        return {
          StatusLogID: (p.StatusLogID ? String(p.StatusLogID) : ('S' + Date.now())),
          Timestamp: this._normalizeText(p.Timestamp, 40),
          MoldID: this._normalizeText(p.MoldID, 40),
          CutterID: this._normalizeText(p.CutterID, 40),
          ItemType: this._normalizeText(p.ItemType, 16),
          Status: this._normalizeText(p.Status, 16),
          EmployeeID: this._normalizeText(p.EmployeeID, 40),
          DestinationID: this._normalizeText(p.DestinationID, 60),
          Notes: this._normalizeText(p.Notes, maxNotes),
          _pending: true,
          _localId: this._normalizeText(p._localId, 80),
          _createdAt: this._normalizeText(p._createdAt, 40),
          _syncError: this._normalizeText(p._syncError, 180),
          _syncErrorAt: this._normalizeText(p._syncErrorAt, 40)
        };
      }, this);
  },

  _sortPendingNewest: function(list) {
    var arr = Array.isArray(list) ? list.slice() : [];
    arr.sort(function(a, b){
      var ta = Date.parse((a && a.Timestamp) ? a.Timestamp : '') || Date.parse((a && a._createdAt) ? a._createdAt : '') || 0;
      var tb = Date.parse((b && b.Timestamp) ? b.Timestamp : '') || Date.parse((b && b._createdAt) ? b._createdAt : '') || 0;
      return tb - ta;
    });
    return arr;
  },

        /**
         * Add pending log to cache
         */
        add(logData) {
            const pending = {
                ...logData,
                _pending: true,
                _localId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                _createdAt: new Date().toISOString()
            };

            if (!state.allData.statuslogs) {
                state.allData.statuslogs = [];
            }

            state.allData.statuslogs.unshift(pending);
            this.persist();
            console.log('✅ PendingCache: Added', pending._localId);
            return pending;
        },

        /**
         * Remove pending log after sync
         */
        remove(localId) {
            if (!state.allData.statuslogs) return;
            const beforeLen = state.allData.statuslogs.length;
            state.allData.statuslogs = state.allData.statuslogs.filter(log => log._localId !== localId);
            const afterLen = state.allData.statuslogs.length;
            if (beforeLen !== afterLen) {
                this.persist();
                console.log('✅ PendingCache: Removed', localId);
            }
        },

        /**
         * Mark log as error
         */
        markError(localId, errorMsg) {
            const log = state.allData.statuslogs?.find(l => l._localId === localId);
            if (log) {
                log._syncError = errorMsg;
                log._syncErrorAt = new Date().toISOString();
                this.persist();
                console.warn('⚠️ PendingCache: Marked error', localId, errorMsg);
            }
        },

        /**
         * Persist to LocalStorage
         */
/**
   * Persist to LocalStorage (storage-safe)
   */
  persist() {
    if (!this._persistenceEnabled) return;

    try {
      var pendingRaw = (state.allData.statuslogs || []).filter(function (log) { return log && log._pending; });
      var pending = this._compactPending(pendingRaw, { maxNotes: 260 });
      localStorage.setItem('pendingStatusLogs', JSON.stringify(pending));
      this._lastPersistError = null;
      console.log('💾 PendingCache: Persisted', pending.length, 'logs');
    } catch (e) {
      this._lastPersistError = e;

      if (!this._isQuotaError(e)) {
        if (!this._persistWarned) {
          this._persistWarned = true;
          console.warn('Failed to persist pending logs', e);
        }
        return;
      }

      try {
        try { this.cleanup(15 * 60 * 1000); } catch (_) {}

        var pendingRaw2 = (state.allData.statuslogs || []).filter(function (log) { return log && log._pending; });
        var sorted = this._sortPendingNewest(pendingRaw2);

        var keepLevels = [60, 40, 25, 15, 8];
        for (var i = 0; i < keepLevels.length; i++) {
          var keep = keepLevels[i];
          var compact = this._compactPending(sorted.slice(0, keep), { maxNotes: 180 });
          try {
            localStorage.setItem('pendingStatusLogs', JSON.stringify(compact));
            this._lastPersistError = null;
            console.warn('⚠️ PendingCache: Storage quota hit, trimmed to', keep, 'logs');
            return;
          } catch (e2) {
            if (!this._isQuotaError(e2)) break;
          }
        }

        try { localStorage.removeItem('pendingStatusLogs'); } catch (_) {}
        try {
          var compactMin = this._compactPending(sorted.slice(0, 8), { maxNotes: 120 });
          localStorage.setItem('pendingStatusLogs', JSON.stringify(compactMin));
          this._lastPersistError = null;
          console.warn('⚠️ PendingCache: Storage quota hit, reset pendingStatusLogs to minimal');
          return;
        } catch (_) {
          this._persistenceEnabled = false;
          console.warn('⚠️ PendingCache: Persistence disabled due to storage quota. Pending will remain in memory only.');
        }
      } catch (e3) {
        this._persistenceEnabled = false;
        console.warn('⚠️ PendingCache: Persistence disabled due to storage error. Pending will remain in memory only.', e3);
      }
    }
  },


        /**
         * Restore from LocalStorage
         */
/**
   * Restore from LocalStorage (storage-safe)
   */
  restore() {
    try {
      var saved = localStorage.getItem('pendingStatusLogs');
      if (!saved) return;

      var parsed = this._safeJsonParse(saved, null);
      if (!Array.isArray(parsed) || !parsed.length) return;

      var pending = this._compactPending(parsed, { maxNotes: 260 });
      var limited = pending.slice(0, 80);

      console.log('🔄 PendingCache: Restoring', limited.length, 'pending logs');

      if (!state.allData.statuslogs) state.allData.statuslogs = [];

      limited.forEach(function (p) {
        var exists = state.allData.statuslogs.some(function (log) {
          if (!log) return false;
          if (log._localId && p._localId && log._localId === p._localId) return true;
          return (log.Timestamp === p.Timestamp && log.MoldID === p.MoldID && log.CutterID === p.CutterID);
        });
        if (!exists) state.allData.statuslogs.unshift(p);
      });

      this.persist();
      console.log('✅ PendingCache: Restored', limited.length, 'logs');
    } catch (e) {
      console.warn('Failed to restore pending logs', e);
    }
  },


        /**
         * Cleanup old pending logs
         */
/**
   * Cleanup old pending logs (storage-safe)
   */
  cleanup(maxAge = 3600000) {
    if (!state.allData.statuslogs) return;

    var now = Date.now();
    var beforeLen = state.allData.statuslogs.length;

    state.allData.statuslogs = state.allData.statuslogs.filter(function (log) {
      if (!log || !log._pending) return true;
      var t = Date.parse(log._createdAt || '') || Date.parse(log.Timestamp || '') || 0;
      var age = now - t;
      if (!Number.isFinite(age) || age < 0) return true;
      return age < maxAge;
    });

    var afterLen = state.allData.statuslogs.length;
    if (beforeLen !== afterLen) {
      this.persist();
      console.log('🧹 PendingCache: Cleaned up', beforeLen - afterLen, 'old logs');
    }
  },
};

    // =========================================================================
    // DATA LOADING
    // =========================================================================

    /**
     * Main entry: Load all CSV files from GitHub
     */
    async function loadAllData() {
        console.time('[v8.0.3] loadAllData');

        const results = await Promise.all(
            CSV_FILES.map(def =>
                fetchCSVWithFallback(def.file, def.required)
                    .then(text => {
                        const data = text ? parseCSV(text) : [];
                        console.log(`✅ ${def.file}: ${data.length} rows`);
                        state.allData[def.key] = data;
                        return true;
                    })
            )
        );

        if (!results.every(Boolean)) {
            throw new Error('One or more required CSV files failed to load.');
        }

        // Restore pending logs BEFORE processing relationships
        PendingCache.restore();

        // Build relationships
        processDataRelationships();

        state.loaded = true;

        // Expose for debugging
        window.ALL_DATA = state.allData;

        console.timeEnd('[v8.0.3] loadAllData');

        // Cleanup old pending logs
        PendingCache.cleanup();

        // Fire event for other modules
        document.dispatchEvent(new CustomEvent('data-manager:ready'));

        // Also trigger app data update
        if (window.App && window.App.triggerDataUpdate) {
            window.App.triggerDataUpdate();
        }
    }

    /**
     * Fetch CSV with fallback (GitHub → Local)
     */
    async function fetchCSVWithFallback(filename, required) {
        // 1) Try GitHub Raw
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
            const res = await fetch(`${GITHUB_BASE_URL}${filename}?nocache=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(id);
            if (res.ok) {
                console.log(`📥 Loaded from GitHub: ${filename}`);
                return await res.text();
            }
            console.warn(`GitHub fetch not OK for ${filename}: ${res.status}`);
        } catch (e) {
            console.warn(`GitHub fetch failed for ${filename}: ${e.message}`);
        }

        // 2) Fallback to local folder
        try {
            const resLocal = await fetch(`./${filename}?nocache=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store'
            });
            if (resLocal.ok) {
                console.log(`📂 Loaded from local: ${filename}`);
                return await resLocal.text();
            }
            console.warn(`Local fetch not OK for ${filename}: ${resLocal.status}`);
        } catch (e) {
            console.warn(`Local fetch failed for ${filename}: ${e.message}`);
        }

        // 3) Error if required
        if (required) {
            throw new Error(`Required CSV not available: ${filename}`);
        }

        return '';
    }

    // =========================================================================
    // CSV PARSING
    // =========================================================================

    /**
     * Robust CSV parser with quotes/CRLF handling
     */
    function parseCSV(csvText) {
        if (!csvText || !csvText.trim()) return [];

        const lines = csvText
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .filter(l => l.trim() !== '');

        if (lines.length === 0) return [];

        const headers = splitCSVLine(lines[0]).map(h => stripQuotes(h.trim()));
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = splitCSVLine(lines[i]).map(v => stripQuotes(v));
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = parts[idx] !== undefined ? parts[idx] : '';
            });
            rows.push(obj);
        }

        return rows;
    }

    function splitCSVLine(line) {
        const out = [];
        let cur = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"' && line[i - 1] !== '\\') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                out.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out;
    }

    function stripQuotes(s) {
        if (s == null) return '';
        return s.replace(/^"(.*)"$/s, '$1');
    }

    // =========================================================================
    // RELATIONSHIP PROCESSING (V4.31)
    // =========================================================================

    function processDataRelationships() {
        const d = state.allData;

        // Build lookup maps
        const moldDesignMap = mapBy(d.molddesign, 'MoldDesignID');
        const customerMap = mapBy(d.customers, 'CustomerID');
        const companyMap = mapBy(d.companies, 'CompanyID');
        const rackMap = mapBy(d.racks, 'RackID');
        const rackLayerMap = mapBy(d.racklayers, 'RackLayerID');
        const jobByDesignMap = mapBy(d.jobs, 'MoldDesignID');
        const processingItemMap = mapBy(d.processingitems, 'ProcessingItemID');
        const destinationsMap = mapBy(d.destinations, 'DestinationID');
        // Latest Teflon log map (by MoldID)
        const teflonLatestByMoldId = new Map();

        function getRowTimeMs(row) {
        const keys = ['UpdatedDate', 'CreatedDate', 'ReceivedDate', 'SentDate', 'RequestedDate'];
        for (const k of keys) {
            const t = Date.parse(row?.[k] || '');
            if (!isNaN(t)) return t;
        }
        const idNum = parseInt(row?.TeflonLogID, 10);
        if (!isNaN(idNum)) return idNum;
        return 0;
        }

        if (Array.isArray(d.teflonlog)) {
        d.teflonlog.forEach((row) => {
            const moldId = (row?.MoldID ?? '').toString().trim();
            if (!moldId) return;

            const current = teflonLatestByMoldId.get(moldId);
            if (!current || getRowTimeMs(row) > getRowTimeMs(current)) {
            teflonLatestByMoldId.set(moldId, row);
            }
        });
        }

        // Build Mold-Cutter relationship
        const cuttersByDesign = new Map();
        const moldsByDesign = new Map();

        if (Array.isArray(d.moldcutter) && d.moldcutter.length > 0) {
            const hasDesignKey = d.moldcutter.some(mc => 'MoldDesignID' in mc && mc.MoldDesignID);

            if (hasDesignKey) {
                d.moldcutter.forEach(mc => {
                    const desId = mc.MoldDesignID;
                    if (!desId) return;

                    if (mc.CutterID) {
                        const list = cuttersByDesign.get(desId) || [];
                        list.push(mc.CutterID);
                        cuttersByDesign.set(desId, list);
                    }
                    if (mc.MoldID) {
                        const listM = moldsByDesign.get(desId) || [];
                        listM.push(mc.MoldID);
                        moldsByDesign.set(desId, listM);
                    }
                });
            } else {
                // Fallback: legacy mapping
                d.moldcutter.forEach(mc => {
                    if (mc.MoldID && mc.CutterID) {
                        const mold = d.molds.find(m => m.MoldID === mc.MoldID);
                        const designId = mold?.MoldDesignID;
                        if (designId) {
                            const list = cuttersByDesign.get(designId) || [];
                            list.push(mc.CutterID);
                            cuttersByDesign.set(designId, list);
                        }
                    }
                });
            }
        }

        // Helper to get latest status log
        function getLatestStatusLog(kind, id) {
            const logs = d.statuslogs.filter(log => {
                if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(id || '').trim();
                if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(id || '').trim();
                return false;
            });
            if (logs.length === 0) return null;

            logs.sort((a, b) => {
                const ta = Date.parse(a.Timestamp || '') || 0;
                const tb = Date.parse(b.Timestamp || '') || 0;
                return tb - ta;
            });

            const latest = logs[0];
            return {
                ...latest,
                destinationInfo: destinationsMap.get(latest.DestinationID) || null,
            };
        }

        // Process molds
        d.molds = d.molds.map(mold => {
            const design = moldDesignMap.get(mold.MoldDesignID) || {};
            const customer = customerMap.get(mold.CustomerID) || {};
            const company = companyMap.get(customer.CompanyID) || {};
            const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};
            const rack = rackLayer.RackID ? (rackMap.get(rackLayer.RackID) || {}) : {};
            const storageCompany = companyMap.get(mold.storage_company) || {};
            const job = jobByDesignMap.get(mold.MoldDesignID) || {};
            const processingItem = processingItemMap.get(job.ProcessingItemID) || {};

            // Related cutters
            const relatedCutterIDs = cuttersByDesign.get(mold.MoldDesignID) || [];
            const relatedCutters = relatedCutterIDs
                .map(cid => d.cutters.find(c => c.CutterID === cid))
                .filter(Boolean);

            // Cutline size
            let cutlineSize = '';
            if (design.CutlineX && design.CutlineY) {
                cutlineSize = `${design.CutlineX}x${design.CutlineY}`;
            }
            if (!cutlineSize && d.CAV?.length) {
                const key = (design.Serial || design.CAV || '').trim();
                if (key) {
                    const cavRow = d.CAV.find(r => (r.Serial || r.CAV || '').trim() === key);
                    if (cavRow && cavRow.CAVlength && cavRow.CAVwidth) {
                        cutlineSize = `${cavRow.CAVlength}x${cavRow.CAVwidth}`;
                    }
                }
            }

            const displayDimensions = createMoldDimensionString(mold, design);
            const displayCustomer = getCustomerDisplayName(customer, company);
            const storageBadge = getStorageCompanyDisplay(mold.storage_company, companyMap);
            const v431Status = getCurrentStatus(mold);
            const latestLog = getLatestStatusLog('MOLD', mold.MoldID);
            const latestTeflon = teflonLatestByMoldId.get(String(mold.MoldID).trim()) || null;

            return {
                ...mold,
                designInfo: design,
                customerInfo: customer,
                companyInfo: company,
                rackLayerInfo: rackLayer,
                rackInfo: rack,
                storageCompanyInfo: storageCompany,
                jobInfo: job,
                processingItemInfo: processingItem,
                relatedCutters,

                // For v8.0.3 UI compatibility
                code: mold.MoldCode || '',
                name: mold.MoldName || mold.MoldCode || '',
                type: 'mold',
                dimensions: displayDimensions,
                location: mold.RackLayerID || '',
                rackNo: mold.RackLayerID || '',
                company: displayCustomer,
                productionDate: job.DeliveryDeadline || '',
                lastStatus: latestLog?.Status || v431Status?.text || '',
                lastDate: latestLog?.Timestamp || '',

                // Legacy fields
                displayCode: mold.MoldCode || '',
                displayName: mold.MoldName || mold.MoldCode || '',
                displayDimensions,
                displayLocation: mold.RackLayerID || '',
                displayCustomer,
                displayStorageCompany: (storageBadge && storageBadge.text) ? storageBadge.text : 'N/A',
                displayStorageCompanyBadge: storageBadge,
                displayStorageCompanyClass: (storageBadge && storageBadge.class) ? storageBadge.class : 'unknown',
                displayRackLocation: rack.RackLocation || '',
                displayDate: job.DeliveryDeadline || '',
                itemType: 'mold',
                currentStatus: v431Status,
                latestStatusLog: latestLog,

                latestTeflonLog: latestTeflon,
                teflonStatus:
                latestTeflon?.TeflonStatus ||
                latestTeflon?.Status ||
                null,

            };
        });

        // Index molds by design
        const moldIdsByDesign = new Map();
        state.allData.molds.forEach(m => {
            const list = moldIdsByDesign.get(m.MoldDesignID) || [];
            list.push(m.MoldID);
            moldIdsByDesign.set(m.MoldDesignID, list);
        });

        // Process cutters
        d.cutters = d.cutters.map(cutter => {
            const customer = customerMap.get(cutter.CustomerID) || {};
            const company = companyMap.get(customer.CompanyID) || {};
            const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};
            const rack = rackLayer.RackID ? (rackMap.get(rackLayer.RackID) || {}) : {};
            const storageCompany = companyMap.get(cutter.storage_company) || {};
            const storageBadge2 = getStorageCompanyDisplay(cutter.storage_company, companyMap);

            let cutlineSize = '';
            if (cutter.CutlineLength && cutter.CutlineWidth) {
                cutlineSize = `${cutter.CutlineLength}x${cutter.CutlineWidth}`;
                if (cutter.CutterCorner) cutlineSize += `-${cutter.CutterCorner}`;
                if (cutter.CutterChamfer) cutlineSize += `-${cutter.CutterChamfer}`;
            }

            let relatedMolds = [];
            if (cutter.MoldDesignID && moldIdsByDesign.has(cutter.MoldDesignID)) {
                const moldIds = moldIdsByDesign.get(cutter.MoldDesignID) || [];
                relatedMolds = moldIds.map(mid => d.molds.find(mm => mm.MoldID === mid)).filter(Boolean);
            }

            const v431Status = getCurrentStatus(cutter);
            const latestLog = getLatestStatusLog('CUTTER', cutter.CutterID);
            const displayName = cutter.CutterName || cutter.CutterDesignName || '';

            return {
                ...cutter,
                customerInfo: customer,
                companyInfo: company,
                rackLayerInfo: rackLayer,
                rackInfo: rack,
                storageCompanyInfo: storageCompany,
                relatedMolds,

                // For v8.0.3 UI compatibility
                code: cutter.CutterNo || '',
                name: displayName,
                type: 'cutter',
                dimensions: cutlineSize,
                location: cutter.RackLayerID || '',
                rackNo: cutter.RackLayerID || '',
                company: getCustomerDisplayName(customer, company),
                productionDate: '',
                lastStatus: latestLog?.Status || v431Status?.text || '',
                lastDate: latestLog?.Timestamp || '',

                // Legacy fields
                displayCode: cutter.CutterNo || '',
                displayName,
                displayDimensions: cutlineSize,
                displayLocation: cutter.RackLayerID || '',
                displayCustomer: getCustomerDisplayName(customer, company),
                displayStorageCompany: (storageBadge2 && storageBadge2.text) ? storageBadge2.text : 'N/A',
                displayStorageCompanyBadge: storageBadge2,
                displayStorageCompanyClass: (storageBadge2 && storageBadge2.class) ? storageBadge2.class : 'unknown',
                displayRackLocation: rack.RackLocation || '',
                itemType: 'cutter',
                currentStatus: v431Status,
                latestStatusLog: latestLog,
            };
        });

        state.maps = {
            moldDesignMap,
            customerMap,
            companyMap,
            rackMap,
            rackLayerMap,
            jobByDesignMap,
            processingItemMap,
            destinationsMap,
        };

        console.log(`🔗 Processed ${state.allData.molds.length} molds & ${state.allData.cutters.length} cutters`);
    }

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

    function mapBy(arr, key) {
        const m = new Map();
        (arr || []).forEach(row => {
            if (row && row[key] != null && row[key] !== '') m.set(row[key], row);
        });
        return m;
    }

    function createMoldDimensionString(mold, design) {
        if (design?.MoldDesignLength && design?.MoldDesignWidth && design?.MoldDesignHeight) {
            return `${design.MoldDesignLength}x${design.MoldDesignWidth}x${design.MoldDesignHeight}`;
        }
        if (design?.MoldDesignDim) return design.MoldDesignDim;
        if (mold?.MoldLength && mold?.MoldWidth && mold?.MoldHeight) {
            return `${mold.MoldLength}x${mold.MoldWidth}x${mold.MoldHeight}`;
        }
        return '';
    }

    function getCustomerDisplayName(customer, company) {
        if (!customer || !customer.CustomerID) return '';
        let name = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
        if (company && company.CompanyShortName) {
            name = `${company.CompanyShortName} - ${name}`;
        }
        return name;
    }

    function getStorageCompanyDisplay(storageCompanyId, companyMap) {
        if (!storageCompanyId) return { text: 'N/A', class: 'unknown' };
        const company = companyMap.get(storageCompanyId);
        if (!company) return { text: 'N/A', class: 'unknown' };
        const companyName = company.CompanyShortName || company.CompanyName || storageCompanyId;
        if (String(storageCompanyId) === '2') {
            return { text: companyName, class: 'ysd' };
        }
        return { text: companyName, class: 'external' };
    }

    function getCurrentStatus(item) {
        if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
            return { status: 'returned', text: '返却済み', class: 'status-returned' };
        }
        if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
            return { status: 'disposed', text: '廃棄済み', class: 'status-disposed' };
        }
        return { status: 'available', text: '利用可能', class: 'status-available' };
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    const DataManager = {
        get data() {
            return state.allData;
        },

        get loaded() {
            return state.loaded;
        },

        PendingCache,

        loadAllData,

        getAllItems() {
            return [...state.allData.molds, ...state.allData.cutters];
        },

        getItemByCode(code) {
            const allItems = this.getAllItems();
            return allItems.find(item => 
                item.code === code || 
                item.MoldCode === code || 
                item.CutterNo === code ||
                item.MoldID === code ||
                item.CutterID === code
            );
        },

        getItemHistory(code) {
            const item = this.getItemByCode(code);
            if (!item) return [];

            const itemId = item.MoldID || item.CutterID;
            const itemType = item.type === 'mold' ? 'MOLD' : 'CUTTER';

            return state.allData.statuslogs.filter(log => {
                if (itemType === 'MOLD') return log.MoldID === itemId;
                return log.CutterID === itemId;
            }).sort((a, b) => {
                const ta = Date.parse(a.Timestamp || '') || 0;
                const tb = Date.parse(b.Timestamp || '') || 0;
                return tb - ta;
            });
        },

        getMaps() {
            return state.maps;
        },

        recompute() {
            processDataRelationships();
            document.dispatchEvent(new CustomEvent('data-manager:updated'));
        },
    };

    // =========================================================================
    // EXPOSE TO WINDOW & AUTO-INIT
    // =========================================================================
    window.DataManager = DataManager;

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            loadAllData().catch(err => {
                console.error('❌ Failed to load data:', err);
            });
        });
    } else {
        loadAllData().catch(err => {
            console.error('❌ Failed to load data:', err);
        });
    }

    console.log('✅ Data Manager v8.0.3-1 loaded and ready');

})();
