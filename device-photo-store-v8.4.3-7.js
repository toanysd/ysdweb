(function (global) {

'use strict';

// DevicePhotoStore - add real small thumbnail file (upload + DB columns)
// VERSION bump: new feature -> v8.4.3-7
var VERSION = 'v8.4.3-7';

function log()  { var a = [].slice.call(arguments); try { console.log.apply(console, ['[DevicePhotoStore] ' + VERSION].concat(a)); } catch(e) {} }
function warn() { var a = [].slice.call(arguments); try { console.warn.apply(console, ['[DevicePhotoStore] ' + VERSION].concat(a)); } catch(e) {} }
function err()  { var a = [].slice.call(arguments); try { console.error.apply(console, ['[DevicePhotoStore] ' + VERSION].concat(a)); } catch(e) {} }

function nowIso() { return new Date().toISOString(); }

function createBatchId() {
  return 'bp' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function emitEvent(name, detail) {
  try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch(e) {}
}

function safeStr(v) { return (v === null || v === undefined) ? '' : String(v); }

function getFileExt(name) {
  if (!name) return '.jpg';
  var idx = name.lastIndexOf('.');
  return idx === -1 ? '.jpg' : name.substring(idx).toLowerCase();
}

function dirname(path) {
  var p = safeStr(path);
  var i = p.lastIndexOf('/');
  return i === -1 ? '' : p.substring(0, i);
}

function basename(path) {
  var p = safeStr(path);
  var i = p.lastIndexOf('/');
  return i === -1 ? p : p.substring(i + 1);
}

function removeExt(fileName) {
  var s = safeStr(fileName);
  var i = s.lastIndexOf('.');
  return i === -1 ? s : s.substring(0, i);
}

function sumSizes(arr) {
  var total = 0;
  (arr || []).forEach(function(x) {
    var n = Number(x || 0);
    if (!isNaN(n) && isFinite(n) && n > 0) total += n;
  });
  return total;
}

function buildStoragePath(opts) {
  var now = opts.now || new Date();
  var base = (opts.devicetype === 'cutter') ? 'cutters' : (opts.devicetype === 'mold' ? 'molds' : 'devices');
  var safeId = (opts.deviceid || 'unknown').toString().replace(/-/g, '_');
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var uid = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  return base + '/' + safeId + '/' + y + m + d + '/' + uid + getFileExt(opts.originalfilename);
}

function buildThumbStoragePath(originalStoragePath) {
  var sp = safeStr(originalStoragePath);
  if (!sp) return '';
  var dir = dirname(sp);
  var base = basename(sp);
  if (!dir || !base) return '';
  // thumb_ + original basename but always end with .jpg
  var core = removeExt(base);
  return dir + '/thumb_' + core + '.jpg';
}

// -------------------- Image -> small JPEG thumbnail --------------------

function clampNumber(n, min, max, fallback) {
  var x = Number(n);
  if (!isFinite(x) || isNaN(x)) return fallback;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function getCanvasToBlob(canvas, type, quality) {
  return new Promise(function(resolve, reject) {
    try {
      if (!canvas || typeof canvas.toBlob !== 'function') return reject(new Error('Canvas.toBlob not supported'));
      canvas.toBlob(function(blob) {
        if (!blob) return reject(new Error('Failed to create thumbnail blob'));
        resolve(blob);
      }, type, quality);
    } catch(e) { reject(e); }
  });
}

function drawImageToCanvas(imgOrBitmap, targetW, targetH) {
  var canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  var ctx = canvas.getContext('2d');
  // background white to avoid black when input has transparency
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imgOrBitmap, 0, 0, targetW, targetH);
  return canvas;
}

async function loadBitmapFromBlob(blob) {
  // Prefer createImageBitmap if available
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }

  // Fallback: HTMLImageElement
  return await new Promise(function(resolve, reject) {
    try {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function() {
        try { URL.revokeObjectURL(url); } catch(e) {}
        resolve(img);
      };
      img.onerror = function() {
        try { URL.revokeObjectURL(url); } catch(e) {}
        reject(new Error('Cannot decode image for thumbnail'));
      };
      img.src = url;
    } catch(e) { reject(e); }
  });
}

async function makeSmallThumbnailJpeg(blob, opts) {
  var o = opts || {};
  var maxW = clampNumber(o.maxW, 64, 1024, 240);
  var maxH = clampNumber(o.maxH, 64, 1024, 240);
  var quality = clampNumber(o.quality, 0.2, 0.95, 0.72);

  if (!blob) throw new Error('makeSmallThumbnailJpeg requires a blob');

  var bitmap = await loadBitmapFromBlob(blob);
  var srcW = bitmap.width || bitmap.naturalWidth || 0;
  var srcH = bitmap.height || bitmap.naturalHeight || 0;

  if (!srcW || !srcH) {
    try { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); } catch(e) {}
    throw new Error('Cannot read image size');
  }

  // Keep aspect ratio
  var scale = Math.min(maxW / srcW, maxH / srcH, 1);
  var targetW = Math.max(1, Math.round(srcW * scale));
  var targetH = Math.max(1, Math.round(srcH * scale));

  var canvas = drawImageToCanvas(bitmap, targetW, targetH);

  try { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); } catch(e) {}

  var outBlob = await getCanvasToBlob(canvas, 'image/jpeg', quality);

  return {
    blob: outBlob,
    width: targetW,
    height: targetH,
    bytes: outBlob.size || null,
    mime: 'image/jpeg'
  };
}

// -------------------- Storage helpers: folder size map --------------------

async function listFolderSizeMap(client, bucketId, folderPath) {
  if (!folderPath) return {};
  var map = {};
  try {
    var resp = await client.storage.from(bucketId).list(folderPath, { limit: 1000, offset: 0 });
    if (resp && resp.data && Array.isArray(resp.data)) {
      resp.data.forEach(function(obj) {
        if (!obj || !obj.name) return;
        var sz = 0;
        if (obj.metadata && obj.metadata.size !== undefined) sz = Number(obj.metadata.size) || 0;
        else if (obj.size !== undefined) sz = Number(obj.size) || 0;
        map[obj.name] = sz;
      });
    }
  } catch(e) { /* ignore */ }
  return map;
}

async function attachFileSizes(store, rows) {
  var list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;

  var client = store._getClient();
  var bucketId = store.bucketId;

  var groups = {};
  list.forEach(function(r) {
    if (!r) return;
    var sp = r.storage_path || r.storagepath || r.storagePath || '';
    if (!sp) return;
    var dir = dirname(sp);
    if (!dir) return;
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(r);
  });

  var dirs = Object.keys(groups);
  if (!dirs.length) return list;

  // Limit folders to avoid too many requests
  if (dirs.length > 30) {
    dirs.sort();
    dirs = dirs.slice(-30);
  }

  for (var i = 0; i < dirs.length; i++) {
    var d = dirs[i];
    var sizeMap = await listFolderSizeMap(client, bucketId, d);
    (groups[d] || []).forEach(function(r) {
      var sp = r.storage_path || r.storagepath || r.storagePath || '';
      var name = basename(sp);
      if (!name) return;
      if (sizeMap[name] === undefined) return;
      var sz = Number(sizeMap[name]) || 0;
      r.filesize = sz;
      r.file_size = sz;
      r.fileSize = sz;
    });
  }

  return list;
}

// -------------------- Row normalizer --------------------

function normalizeRow(r) {
  if (!r || typeof r !== 'object') return r;
  var out = Object.assign({}, r);

  function pick(a, b, c) { return a !== undefined ? a : (b !== undefined ? b : (c !== undefined ? c : null)); }

  // Main
  var pub = pick(r.public_url, r.publicurl, r.publicUrl);
  var orig = pick(r.original_filename, r.originalfilename, r.originalFileName);
  var crat = pick(r.created_at, r.createdat, r.createdAt);
  var isth = (r.is_thumbnail !== undefined) ? r.is_thumbnail : ((r.isthumbnail !== undefined) ? r.isthumbnail : (r.isThumbnail || false));
  var spath = pick(r.storage_path, r.storagepath, r.storagePath);
  var dtype = pick(r.device_type, r.devicetype, r.deviceType);
  var did = pick(r.device_id, r.deviceid, r.deviceId);

  // Thumb (NEW)
  var tpath = pick(r.thumb_storage_path, r.thumb_storagepath, r.thumbStoragePath);
  var turl  = pick(r.thumb_public_url, r.thumb_publicurl, r.thumbPublicUrl);
  var tw    = pick(r.thumb_width, r.thumbwidth, r.thumbWidth);
  var th    = pick(r.thumb_height, r.thumbheight, r.thumbHeight);
  var tbytes= pick(r.thumb_bytes, r.thumbbytes, r.thumbBytes);

  // snake_case (DB)
  out.public_url = pub; out.original_filename = orig; out.created_at = crat;
  out.is_thumbnail = isth; out.storage_path = spath; out.device_type = dtype; out.device_id = did;
  out.thumb_storage_path = tpath; out.thumb_public_url = turl; out.thumb_width = tw; out.thumb_height = th; out.thumb_bytes = tbytes;

  // noUnderscore (legacy)
  out.publicurl = pub; out.originalfilename = orig; out.createdat = crat;
  out.isthumbnail = isth; out.storagepath = spath; out.devicetype = dtype; out.deviceid = did;
  out.thumbstoragepath = tpath; out.thumbpublicurl = turl; out.thumbwidth = tw; out.thumbheight = th; out.thumbbytes = tbytes;

  // camelCase (legacy)
  out.publicUrl = pub; out.originalFileName = orig; out.createdAt = crat;
  out.isThumbnail = isth; out.storagePath = spath; out.deviceType = dtype; out.deviceId = did;
  out.thumbStoragePath = tpath; out.thumbPublicUrl = turl; out.thumbWidth = tw; out.thumbHeight = th; out.thumbBytes = tbytes;

  return out;
}

function normalizeRows(arr) {
  return Array.isArray(arr) ? arr.map(normalizeRow) : [];
}

// Mapping tên field sort sang tên cột DB thực
var FIELD_MAP = {
  'createdat': 'created_at',
  'createdAt': 'created_at',
  'originalfilename': 'original_filename',
  'originalFileName': 'original_filename',
  'filesize': 'filesize',
  'state': 'state',
  'device_type': 'device_type',
  'devicetype': 'device_type',
  'device_id': 'device_id',
  'deviceid': 'device_id',
  'thumb_bytes': 'thumb_bytes',
  'thumbBytes': 'thumb_bytes'
};

function mapField(f) { return FIELD_MAP[f] || f; }

// ============================================================

class DevicePhotoStore {
  constructor() {
    this.initialized = false;
    this._client = null;
    this.bucketId = 'mold-photos';
    this.tableName = 'device_photos';
    this.auditTable = 'photo_audits';
    log(VERSION + ' created');
  }

  // ─── CLIENT ─────────────────────────────────────────────────────────────
  _getClient() {
    if (this._client && typeof this._client.from === 'function') return this._client;
    if (global.supabaseClient && typeof global.supabaseClient.from === 'function') return global.supabaseClient;
    throw new Error('[DevicePhotoStore] Chưa init.');
  }

  // ─── INIT ────────────────────────────────────────────────────────────────
  async init(config) {
    if (this.initialized) return;

    var cfg = config || {};
    var url = cfg.supabaseUrl || cfg.url || (global.MCSupabaseConfig && global.MCSupabaseConfig.supabaseUrl) || '';
    var anonKey = cfg.supabaseAnonKey || cfg.anonKey || (global.MCSupabaseConfig && global.MCSupabaseConfig.supabaseAnonKey) || '';

    if (url && anonKey) {
      try {
        var lib = global.supabase;
        if (lib && typeof lib.createClient === 'function') {
          this._client = lib.createClient(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });
          log('Client created from supabaseUrl');
        }
      } catch(e) {
        warn('Không thể tạo client:', e);
      }
    }

    if (!this._client && global.supabaseClient) {
      this._client = global.supabaseClient;
      log('Client fallback từ window.supabaseClient');
    }

    if (!this._client) throw new Error('[DevicePhotoStore] Không tìm thấy Supabase client.');

    if (cfg.table) this.tableName = cfg.table;
    if (cfg.bucketId) this.bucketId = cfg.bucketId;
    if (cfg.bucketid) this.bucketId = cfg.bucketid;

    this.initialized = true;
    log('Ready. bucket=' + this.bucketId + ', table=' + this.tableName);
  }

  // ─── LIST / getPhotos ────────────────────────────────────────────────────
  // A) getPhotos({ deviceType, deviceId, includeTrash, orderBy, orderDir }) => { data: [...] }
  // B) getPhotos(devicetype, deviceid, options) => array
  async getPhotos(arg1, arg2, arg3) {
    var isFiltersObj = (arg1 !== null && arg1 !== undefined && typeof arg1 === 'object');

    if (isFiltersObj) {
      var f = arg1;
      var client = this._getClient();
      var limit = f.pageSize || f.limit || 1000;
      var orderBy = mapField(f.orderBy || 'created_at');
      var asc = (f.orderDir || 'desc') === 'asc';

      var query = client.from(this.tableName).select('*').limit(limit);
      if (f.deviceType) query = query.eq('device_type', String(f.deviceType));
      if (f.deviceId) query = query.eq('device_id', String(f.deviceId));
      if (!f.includeTrash) query = query.eq('state', 'active');

      try { query = query.order(orderBy, { ascending: asc }); }
      catch(e) { query = query.order('created_at', { ascending: asc }); }

      var r = await query;
      if (r.error) { err('getPhotos error:', r.error); throw r.error; }

      var rows = normalizeRows(r.data || []);
      try { await attachFileSizes(this, rows); } catch(e) {}
      return { data: rows };
    }

    return this.listForDevice(arg1, arg2, arg3);
  }

  async listForDevice(devicetype, deviceid, options) {
    var opts = options || {};
    var state = (opts.state !== undefined) ? opts.state : 'active';
    var limit = opts.pageSize || opts.limit || 500;

    var client = this._getClient();
    var query = client.from(this.tableName).select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (devicetype) query = query.eq('device_type', String(devicetype));
    if (deviceid) query = query.eq('device_id', String(deviceid));
    if (state) query = query.eq('state', state);
    if (opts.includeThumbOnly) query = query.eq('is_thumbnail', true);

    var r = await query;
    if (r.error) { err('listForDevice error:', r.error); throw r.error; }

    var rows = normalizeRows(r.data || []);
    try { await attachFileSizes(this, rows); } catch(e) {}

    return rows;
  }

  async listByDevice(options) {
    var opts = options || {};
    return this.listForDevice(opts.devicetype, opts.deviceid, {
      state: opts.state || 'active',
      includeThumbOnly: opts.includeThumbOnly || false
    });
  }

  // ─── THUMBNAIL (row flagged is_thumbnail=true) ───────────────────────────
  async getThumbnailForDevice(devicetype, deviceid) {
    return this.getThumbnail(devicetype, deviceid);
  }

  // Returns URL string: prefer thumb_public_url if exists
  // If missing (legacy data), auto-create + save thumb to Supabase, so it always links to storage_path.
  async getThumbnailUrl(devicetype, deviceid) {
    var row = await this.getThumbnail(devicetype, deviceid);

    // Legacy fallback: if no row flagged is_thumbnail=true, take latest active photo for this device
    if (!row) row = await this.getLatestActivePhotoForDevice(devicetype, deviceid);
    if (!row) return null;

    var thumbUrl = row.thumb_public_url || row.thumbpublicurl || row.thumbPublicUrl || null;
    if (thumbUrl) return thumbUrl;

    // Auto-generate thumb from original and persist to DB (snake_case columns)
    return await this.ensureThumbForPhotoRow(row, {
      maxW: 240,
      maxH: 240,
      quality: 0.72
    });
  }

  async getLatestActivePhotoForDevice(devicetype, deviceid) {
    if (!devicetype || !deviceid) return null;

    var client = this.getClient();
    var r = await client
      .from(this.tableName)
      .select('*')
      .eq('device_type', String(devicetype))
      .eq('device_id', String(deviceid))
      .eq('state', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (r.error && r.error.code !== 'PGRST116') {
      err('getLatestActivePhotoForDevice error', r.error);
      throw r.error;
    }

    return r.data ? normalizeRow(r.data) : null;
  }

  async ensureThumbForPhotoRow(row, opts) {
    var o = opts || {};
    var maxW = clampNumber(o.maxW, 64, 1024, 240);
    var maxH = clampNumber(o.maxH, 64, 1024, 240);
    var quality = clampNumber(o.quality, 0.2, 0.95, 0.72);

    if (!row) return null;

    // Normalize to make sure snake_case keys exist
    var r = normalizeRow(row);

    var id = Number(r.id);
    if (!id || isNaN(id)) return null;

    // If already has thumb -> done
    var existingThumb = r.thumb_public_url || r.thumbpublicurl || r.thumbPublicUrl || null;
    if (existingThumb) return existingThumb;

    // Prevent duplicate work for same photo id
    if (!this._ensureThumbPromises) this._ensureThumbPromises = new Map();
    if (this._ensureThumbPromises.has(id)) return await this._ensureThumbPromises.get(id);

    var self = this;

    var p = (async function () {
      var client = self.getClient();

      // Ensure we have storage_path
      var storagePath = r.storage_path || r.storagepath || r.storagePath || null;
      if (!storagePath) return null;

      // Compute thumb_storage_path linked to storage_path
      var thumbPath = r.thumb_storage_path || r.thumbstoragepath || r.thumbStoragePath || null;
      if (!thumbPath) thumbPath = buildThumbStoragePath(storagePath);
      if (!thumbPath) return null;

      // Ensure we have public_url for original (so we can fetch blob)
      var publicUrl = r.public_url || r.publicurl || r.publicUrl || null;
      if (!publicUrl) {
        try {
          var pubR = client.storage.from(self.bucketId).getPublicUrl(storagePath);
          publicUrl = (pubR && pubR.data && pubR.data.publicUrl) ? pubR.data.publicUrl : null;
        } catch (e) {
          publicUrl = null;
        }
      }
      if (!publicUrl) return null;

      // Download original once
      var resp = await fetch(publicUrl);
      if (!resp || !resp.ok) {
        throw new Error('Cannot fetch original image to create thumbnail.');
      }
      var blob = await resp.blob();

      // Create small JPEG thumbnail
      var thumbRes = await makeSmallThumbnailJpeg(blob, { maxW: maxW, maxH: maxH, quality: quality });

      // Upload thumb to storage (linked path)
      try {
        var upR = await client.storage.from(self.bucketId).upload(
          thumbPath,
          thumbRes.blob,
          { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' }
        );
        if (upR && upR.error) throw upR.error;
      } catch (e) {
        // If already exists (409), ignore; otherwise rethrow
        var code = (e && (e.statusCode || e.status || e.code)) ? (e.statusCode || e.status || e.code) : null;
        if (String(code) !== '409') throw e;
      }

      // Get thumb public URL
      var thPub = client.storage.from(self.bucketId).getPublicUrl(thumbPath);
      var thumbUrl = (thPub && thPub.data && thPub.data.publicUrl) ? thPub.data.publicUrl : null;

      // Persist thumb fields to DB (snake_case columns)
      var payload = {
        thumb_storage_path: thumbPath,
        thumb_public_url: thumbUrl,
        thumb_width: thumbRes.width,
        thumb_height: thumbRes.height,
        thumb_bytes: thumbRes.bytes
      };

      var updR = await client
        .from(self.tableName)
        .update(payload)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (updR && updR.error) throw updR.error;

      var norm = updR && updR.data ? normalizeRow(updR.data) : null;
      emitEvent('device-photos:updated', { id: id, photo: norm });

      return (norm && (norm.thumb_public_url || norm.thumbpublicurl || norm.thumbPublicUrl)) || thumbUrl || null;
    })();

    this._ensureThumbPromises.set(id, p);

    try {
      return await p;
    } finally {
      // keep it simple: clear after done
      try { this._ensureThumbPromises.delete(id); } catch (e) {}
    }
  }

  async getThumbnail(devicetype, deviceid) {
    if (!devicetype || !deviceid) return null;

    var client = this._getClient();
    var r = await client.from(this.tableName).select('*')
      .eq('device_type', String(devicetype))
      .eq('device_id', String(deviceid))
      .eq('state', 'active')
      .eq('is_thumbnail', true)
      .limit(1).maybeSingle();

    if (r.error && r.error.code !== 'PGRST116') { err('getThumbnail error:', r.error); throw r.error; }
    return r.data ? normalizeRow(r.data) : null;
  }

  // ─── SET THUMBNAIL ───────────────────────────────────────────────────────
  async setThumbnail(photoId) {
    return await this._doSetThumbnail(photoId);
  }

  async setAsThumbnail(photoId) {
    try {
      await this._doSetThumbnail(photoId);
      return {};
    } catch(e) {
      return { error: { message: e.message || String(e) } };
    }
  }

  async _doSetThumbnail(photoId) {
    if (!photoId) throw new Error('setThumbnail cần photoId.');

    var client = this._getClient();
    var getR = await client.from(this.tableName).select('*').eq('id', photoId).maybeSingle();
    if (getR.error) throw getR.error;
    if (!getR.data) throw new Error('Không tìm thấy ảnh id=' + photoId);

    var photo = getR.data;
    var devType = photo.device_type;
    var devId = photo.device_id;
    if (!devType || !devId) throw new Error('Ảnh không gắn thiết bị.');

    await client.from(this.tableName)
      .update({ is_thumbnail: false })
      .eq('device_type', devType)
      .eq('device_id', String(devId))
      .eq('state', 'active');

    var setR = await client.from(this.tableName)
      .update({ is_thumbnail: true })
      .eq('id', photoId)
      .select().maybeSingle();

    if (setR.error) throw setR.error;

    var norm = setR.data ? normalizeRow(setR.data) : setR.data;
    emitEvent('device-photos:thumbnail-updated', { photo: norm });
    return norm;
  }

  // ─── TRASH ───────────────────────────────────────────────────────────────
  async moveToTrash(id, opts) {
    var client = this._getClient();
    var payload = { state: 'trash', deleted_at: nowIso() };
    if (opts && (opts.purgeafter || opts.purge_after)) payload.purge_after = opts.purgeafter || opts.purge_after;
    var r = await client.from(this.tableName).update(payload).eq('id', id);
    if (r.error) { err('moveToTrash error:', r.error); throw r.error; }
    emitEvent('device-photos:deleted', { id: id, hard: false });
  }

  async moveToTrashBulk(ids) {
    var arr = Array.isArray(ids) ? ids : [ids];
    if (!arr.length) return;
    var client = this._getClient();
    var payload = { state: 'trash', deleted_at: nowIso() };
    var r = await client.from(this.tableName).update(payload).in('id', arr);
    if (r.error) { err('moveToTrashBulk error:', r.error); throw r.error; }
    emitEvent('device-photos:deleted', { ids: arr, hard: false });
  }

  async restoreFromTrash(id) {
    var client = this._getClient();
    var r = await client.from(this.tableName)
      .update({ state: 'active', deleted_at: null, purge_after: null })
      .eq('id', id);
    if (r.error) { err('restoreFromTrash error:', r.error); throw r.error; }
    emitEvent('device-photos:restored', { id: id });
  }

  // ─── PERMANENT DELETE ────────────────────────────────────────────────────
  async permanentDelete(id) {
    var client = this._getClient();
    var getR = await client.from(this.tableName).select('id, storage_path, thumb_storage_path').eq('id', id).maybeSingle();
    if (getR.error) { err('permanentDelete get error:', getR.error); throw getR.error; }
    if (!getR.data) return;

    var spath = getR.data.storage_path;
    var tpath = getR.data.thumb_storage_path;

    var delR = await client.from(this.tableName).delete().eq('id', id);
    if (delR.error) { err('permanentDelete delete error:', delR.error); throw delR.error; }

    var toRemove = [];
    if (spath) toRemove.push(spath);
    if (tpath) toRemove.push(tpath);

    if (toRemove.length) {
      var rmR = await client.storage.from(this.bucketId).remove(toRemove);
      if (rmR.error) warn('permanentDelete remove file (non-fatal):', rmR.error);
    }

    emitEvent('device-photos:deleted', { id: id, hard: true });
  }

  async deletePermanent(id) { return this.permanentDelete(id); }

  async permanentDeleteBulk(ids) {
    var arr = Array.isArray(ids) ? ids : [ids];
    if (!arr.length) return { deleted: 0 };

    var client = this._getClient();
    var listR = await client.from(this.tableName)
      .select('id, storage_path, thumb_storage_path')
      .in('id', arr);

    if (listR.error) { err('permanentDeleteBulk list error:', listR.error); throw listR.error; }

    var paths = [];
    (listR.data || []).forEach(function(p) {
      if (p && p.storage_path) paths.push(p.storage_path);
      if (p && p.thumb_storage_path) paths.push(p.thumb_storage_path);
    });

    if (paths.length) {
      var rmR = await client.storage.from(this.bucketId).remove(paths);
      if (rmR.error) warn('permanentDeleteBulk remove files (non-fatal):', rmR.error);
    }

    var delR = await client.from(this.tableName).delete().in('id', arr);
    if (delR.error) { err('permanentDeleteBulk delete error:', delR.error); throw delR.error; }

    emitEvent('device-photos:deleted', { ids: arr, hard: true });
    return { deleted: arr.length };
  }

  async deletePhoto(id, hard) {
    if (hard) return this.permanentDelete(id);
    return this.moveToTrash(id);
  }

  // ─── EMPTY TRASH ─────────────────────────────────────────────────────────
  async emptyTrash(opts) {
    var o = opts || {};
    var client = this._getClient();

    var query = client.from(this.tableName).select('id, storage_path, thumb_storage_path').eq('state', 'trash');
    if (o.deviceType) query = query.eq('device_type', String(o.deviceType));
    if (o.deviceId) query = query.eq('device_id', String(o.deviceId));

    var listR = await query;
    if (listR.error) { err('emptyTrash list error:', listR.error); throw listR.error; }

    var photos = listR.data || [];
    if (!photos.length) return { deleted: 0 };

    var paths = [];
    photos.forEach(function(p) {
      if (p && p.storage_path) paths.push(p.storage_path);
      if (p && p.thumb_storage_path) paths.push(p.thumb_storage_path);
    });

    if (paths.length) {
      var rmR = await client.storage.from(this.bucketId).remove(paths);
      if (rmR.error) warn('emptyTrash remove files (non-fatal):', rmR.error);
    }

    var ids = photos.map(function(p) { return p.id; });
    var delR = await client.from(this.tableName).delete().in('id', ids);
    if (delR.error) { err('emptyTrash delete error:', delR.error); throw delR.error; }

    emitEvent('device-photos:purged', { ids: ids, count: ids.length });
    return { deleted: ids.length };
  }

  async purgeTrash() { return this.emptyTrash({}); }

  async purgeExpired(now) {
    var client = this._getClient();
    var nowIsoStr = (now || new Date()).toISOString();

    var listR = await client.from(this.tableName)
      .select('id, storage_path, thumb_storage_path')
      .lte('purge_after', nowIsoStr)
      .neq('state', 'purged');

    if (listR.error) { err('purgeExpired list error:', listR.error); throw listR.error; }

    var photos = listR.data || [];
    if (!photos.length) return { purgedCount: 0 };

    var paths = [];
    photos.forEach(function(p) {
      if (p && p.storage_path) paths.push(p.storage_path);
      if (p && p.thumb_storage_path) paths.push(p.thumb_storage_path);
    });

    if (paths.length) {
      var rmR = await client.storage.from(this.bucketId).remove(paths);
      if (rmR.error) warn('purgeExpired remove files (non-fatal):', rmR.error);
    }

    var ids = photos.map(function(p) { return p.id; });

    var updR = await client.from(this.tableName)
      .update({ state: 'purged', purged_at: nowIsoStr })
      .in('id', ids);

    if (updR.error) { err('purgeExpired update error:', updR.error); throw updR.error; }

    emitEvent('device-photos:purged', { ids: ids, count: ids.length });
    return { purgedCount: ids.length };
  }

  // ─── STORAGE STATS ───────────────────────────────────────────────────────
  async getStorageStats(opts) {
    var o = opts || {};
    var client = this._getClient();
    var self = this;

    var makeQ = function(stateVal) {
      var q = client.from(self.tableName).select('*', { count: 'exact', head: true });
      if (o.deviceType) q = q.eq('device_type', String(o.deviceType));
      if (o.deviceId) q = q.eq('device_id', String(o.deviceId));
      if (stateVal) q = q.eq('state', stateVal);
      return q;
    };

    var results = await Promise.all([makeQ(null), makeQ('active'), makeQ('trash'), makeQ('inbox')]);

    var total = results[0].count || 0;
    var active = results[1].count || 0;
    var trash = results[2].count || 0;
    var inbox = results[3].count || 0;

    async function listPathsByState(stateVal) {
      var q = client.from(self.tableName).select('storage_path, thumb_storage_path');
      if (o.deviceType) q = q.eq('device_type', String(o.deviceType));
      if (o.deviceId) q = q.eq('device_id', String(o.deviceId));
      if (stateVal) q = q.eq('state', stateVal);
      q = q.limit(2000);
      var r = await q;
      if (r.error) return [];
      var arr = [];
      (r.data || []).forEach(function(x) {
        if (x && x.storage_path) arr.push(x.storage_path);
        if (x && x.thumb_storage_path) arr.push(x.thumb_storage_path);
      });
      return arr.filter(Boolean);
    }

    async function sizeFromPaths(paths) {
      if (!paths || !paths.length) return 0;
      var groups = {};
      paths.forEach(function(sp) {
        var d = dirname(sp);
        var fn = basename(sp);
        if (!d || !fn) return;
        if (!groups[d]) groups[d] = {};
        groups[d][fn] = true;
      });
      var dirs = Object.keys(groups);
      if (dirs.length > 40) {
        dirs.sort();
        dirs = dirs.slice(-40);
      }
      var sizes = [];
      for (var i = 0; i < dirs.length; i++) {
        var dir = dirs[i];
        var want = groups[dir] || {};
        var sizeMap = await listFolderSizeMap(client, self.bucketId, dir);
        Object.keys(want).forEach(function(fn) {
          var sz = sizeMap[fn];
          if (sz !== undefined && sz !== null) sizes.push(Number(sz) || 0);
        });
      }
      return sumSizes(sizes);
    }

    var totalSize = 0, activeSize = 0, trashSize = 0, inboxSize = 0;
    try {
      var pathsAll = await listPathsByState(null);
      var pathsActive = await listPathsByState('active');
      var pathsTrash = await listPathsByState('trash');
      var pathsInbox = await listPathsByState('inbox');

      totalSize = await sizeFromPaths(pathsAll);
      activeSize = await sizeFromPaths(pathsActive);
      trashSize = await sizeFromPaths(pathsTrash);
      inboxSize = await sizeFromPaths(pathsInbox);
    } catch(e) {
      totalSize = 0; activeSize = 0; trashSize = 0; inboxSize = 0;
    }

    return {
      total: total,
      active: active,
      trash: trash,
      inbox: inbox,
      totalCount: total,
      activeCount: active,
      trashCount: trash,
      inboxCount: inbox,
      totalSize: totalSize,
      trashSize: trashSize,
      activeSize: activeSize,
      inboxSize: inboxSize
    };
  }

  // ─── UPDATE PHOTO ────────────────────────────────────────────────────────
  async updatePhoto(id, updates) {
    if (!id) return { error: { message: 'updatePhoto cần id' } };
    var client = this._getClient();

    var payload = {};
    if (updates && updates.notes !== undefined) payload.manual_notes = updates.notes;
    if (updates && updates.manual_notes !== undefined) payload.manual_notes = updates.manual_notes;

    if (!Object.keys(payload).length) return {};

    var r = await client.from(this.tableName).update(payload).eq('id', id);
    if (r.error) return { error: r.error };

    emitEvent('device-photos:updated', { id: id });
    return {};
  }

  // ─── TRANSFER ────────────────────────────────────────────────────────────
  async transferToDevice(id, newType, newId) {
    if (!id || !newType || !newId) throw new Error('transferToDevice cần id, type, và toId.');
    var client = this._getClient();
    var r = await client.from(this.tableName)
      .update({ device_type: newType, device_id: String(newId), is_thumbnail: false })
      .eq('id', id);
    if (r.error) { err('transferToDevice error:', r.error); throw r.error; }
    emitEvent('device-photos:transferred', { id: id, newType: newType, newId: newId });
  }

  async transferPhotos(ids, newDevicetype, newDeviceid) {
    if (!Array.isArray(ids) || !ids.length) throw new Error('transferPhotos cần mảng ids.');
    if (!newDevicetype || !newDeviceid) throw new Error('transferPhotos cần newDevicetype và newDeviceid.');

    var client = this._getClient();
    var r = await client.from(this.tableName)
      .update({ device_type: newDevicetype, device_id: String(newDeviceid), is_thumbnail: false })
      .in('id', ids);

    if (r.error) { err('transferPhotos error:', r.error); throw r.error; }
    emitEvent('device-photos:transferred', { ids: ids, newDevicetype: newDevicetype, newDeviceid: newDeviceid });
  }

  // ─── UPLOAD (with small thumb file) ──────────────────────────────────────
  // options:
  // - files: [File]
  // - devicetype, deviceid
  // - createThumb (default true)
  // - thumbMaxW, thumbMaxH, thumbQuality
  // - markAsThumbnail
  async uploadPhotos(options) {
    var opts = options || {};
    var files = opts.files;
    if (!Array.isArray(files) || !files.length) throw new Error('uploadPhotos cần ít nhất 1 file.');

    var client = this._getClient();
    var batchid = createBatchId();
    var now = new Date();

    var uploadedRows = [];
    var firstRow = null;

    var createThumb = (opts.createThumb !== false);
    var thumbCfg = {
      maxW: opts.thumbMaxW || 240,
      maxH: opts.thumbMaxH || 240,
      quality: (opts.thumbQuality !== undefined) ? opts.thumbQuality : 0.72
    };

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var fname = (file && file.name) ? file.name : null;

      var spath = buildStoragePath({
        devicetype: opts.devicetype || null,
        deviceid: opts.deviceid || null,
        now: now,
        originalfilename: fname
      });

      // Upload original
      var upR = await client.storage.from(this.bucketId).upload(spath, file, { cacheControl: '3600', upsert: false });
      if (upR.error) { err('Upload file error:', upR.error); throw upR.error; }

      // Original public url
      var pubR = client.storage.from(this.bucketId).getPublicUrl(spath);
      var pubUrl = (pubR && pubR.data && pubR.data.publicUrl) ? pubR.data.publicUrl : null;

      // Create + upload thumb (small JPEG)
      var thumbPath = null;
      var thumbUrl = null;
      var thumbW = null;
      var thumbH = null;
      var thumbBytes = null;

      if (createThumb) {
        try {
          var srcBlob = (file instanceof Blob) ? file : null;
          if (srcBlob) {
            var thumbRes = await makeSmallThumbnailJpeg(srcBlob, thumbCfg);
            thumbW = thumbRes.width;
            thumbH = thumbRes.height;
            thumbBytes = thumbRes.bytes;

            thumbPath = buildThumbStoragePath(spath);
            if (thumbPath) {
              var thUp = await client.storage.from(this.bucketId)
                .upload(thumbPath, thumbRes.blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
              if (thUp && thUp.error) throw thUp.error;

              var thPub = client.storage.from(this.bucketId).getPublicUrl(thumbPath);
              thumbUrl = (thPub && thPub.data && thPub.data.publicUrl) ? thPub.data.publicUrl : null;
            }
          }
        } catch(e) {
          // Non-fatal: keep working even if thumb creation fails
          warn('Create/upload thumbnail failed (non-fatal):', e);
          thumbPath = null; thumbUrl = null; thumbW = null; thumbH = null; thumbBytes = null;
        }
      }

      // Insert row
      var payload = {
        bucket_id: this.bucketId,
        state: opts.state || 'active',
        device_type: opts.devicetype || null,
        device_id: opts.deviceid ? String(opts.deviceid) : null,
        design_id: opts.designid || null,
        mold_id: opts.moldid || null,
        cutter_id: opts.cutterid || null,
        storage_path: spath,
        public_url: pubUrl,
        original_filename: fname,
        is_thumbnail: false,
        // NEW columns
        thumb_storage_path: thumbPath,
        thumb_public_url: thumbUrl,
        thumb_width: thumbW,
        thumb_height: thumbH,
        thumb_bytes: thumbBytes,
        // manual
        manual_code: opts.manualcode || null,
        manual_name: opts.manualname || null,
        manual_dimensions: opts.manualdimensions || null,
        manual_notes: opts.manualnotes || null,
        employee_id: opts.employeeid || null,
        employee_name: opts.employeename || null,
        batch_id: batchid
      };

      var insR = await client.from(this.tableName).insert(payload).select().limit(1);
      if (insR.error) {
        err('Insert device_photos error:', insR.error);
        // Cleanup uploaded files if insert fails
        try {
          var rmPaths = [spath];
          if (thumbPath) rmPaths.push(thumbPath);
          await client.storage.from(this.bucketId).remove(rmPaths);
        } catch(e) {}
        throw insR.error;
      }

      var row = (insR.data && insR.data[0]) ? normalizeRow(insR.data[0]) : null;
      if (row) {
        uploadedRows.push(row);
        if (!firstRow) firstRow = row;
      }
    }

    // Mark first photo as thumbnail for device if requested
    if (opts.markAsThumbnail && opts.devicetype && opts.deviceid && firstRow) {
      try {
        await this._doSetThumbnail(firstRow.id);
        uploadedRows[0].is_thumbnail = uploadedRows[0].isthumbnail = uploadedRows[0].isThumbnail = true;
      } catch(e) {
        warn('setThumbnail after upload (non-fatal):', e);
      }
    }

    var batchInfo = { batchid: batchid, photocount: uploadedRows.length };
    emitEvent('device-photos:uploaded', { batch: batchInfo, photos: uploadedRows });
    return { photos: uploadedRows, batch: batchInfo };
  }

  // ─── AUDIT LOG ───────────────────────────────────────────────────────────
  async listAuditByMold(moldcode, moldid) {
    var client = this._getClient();
    var query = client.from(this.auditTable).select('*').order('sent_at', { ascending: false }).limit(100);
    if (moldcode) query = query.eq('mold_code', moldcode);
    if (moldid) query = query.eq('mold_id', moldid);
    var r = await query;
    if (r.error) { err('listAuditByMold error:', r.error); throw r.error; }
    return r.data || [];
  }

  // ─── UTILITY ─────────────────────────────────────────────────────────────
  formatBytes(bytes, decimals) {
    var dec = (decimals !== undefined) ? decimals : 2;
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dec)) + ' ' + sizes[i];
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
var store = new DevicePhotoStore();

global.DevicePhotoStore = store;

log(VERSION + ' registered as window.DevicePhotoStore');

})(typeof window !== 'undefined' ? window : this);
