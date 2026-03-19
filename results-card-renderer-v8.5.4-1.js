/* ============================================================================
   RESULTS CARD RENDERER v8.0.4-3
   Exact Copy from Mockup r8.1.0 Design

   Created: 2026-01-27

   Changes from v8.0.4-2:
   - Match exact mockup r8.1.0 card design
   - Dual button footer: 詳細/Xem chi tiết + 編作/Thao tác
   - Gradient background from type color to white
   - Improved data mapping and layout

============================================================================ */
console.log('✅ results-card-renderer-v8.5.4-1 LOADED');


class ResultsCardRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.items = [];
        this.selectedItems = new Set();
        this.itemsPerPage = 24;
        this.currentPage = 1;

        // Cache thumbnail theo thiết bị để không gọi Supabase quá nhiều
        this._thumbUrlCache = new Map();      // key: "mold|123" -> url (string hoặc "")
        this._thumbPromiseCache = new Map();  // key -> Promise đang chạy
        this._thumbHydrateTimer = null;

        // Callbacks
        this.onItemClick = null;
        this.onSelectionChange = null;

        this.init();
    }

    init() {
        // Card detail button - mở detail panel



        // Card action button - mở action menu/modal
        document.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.card-action-btn');
            if (actionBtn) {
                e.preventDefault();

                const itemId = (actionBtn.dataset.id || '').trim();
                const item = this.items.find(it => {
                const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                return String(id).trim() === String(itemId);
                });

                if (!item) return;

                this.openCardActionMenu(actionBtn, item);
            }
        }, true);

        // Chuột phải (contextmenu) vào ảnh thumb -> Bật Action Menu giống nút Action
        document.addEventListener('contextmenu', (e) => {
            const thumbArea = e.target.closest('.card-thumbnail');
            if (thumbArea) {
                e.preventDefault(); // Chặn menu mặc định của trình duyệt

                const card = thumbArea.closest('.result-card');
                if (!card) return;

                const itemId = String(card.dataset.id || '').trim();
                const item = this.items.find(it => {
                    const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                    return String(id).trim() === itemId;
                });

                if (!item) return;

                // Dùng chính vùng thumbArea làm anchor để mở popup menu
                this.openCardActionMenu(thumbArea, item);
            }
        });


        // Zoom button handler (mở ảnh dạng popup trong trang, giống PhotoManager)
        document.addEventListener('click', async (e) => {
            const zoomBtn = e.target.closest('.image-zoom-btn');
            if (!zoomBtn) return;

            e.preventDefault();
            e.stopPropagation();

            const itemId = String(zoomBtn.dataset.id || '').trim();
            if (!itemId) return;

            const item = this.items.find(it => {
                const id = it.type === 'mold' ? it.MoldID : it.CutterID;
                return String(id || '').trim() === itemId;
            });
            if (!item) return;

            const deviceType = item.type === 'mold' ? 'mold' : 'cutter';

            // Dùng đúng ID đang gắn trên card (khớp device_id khi hydrate thumb)
            const deviceId = itemId;

            const title = deviceType === 'mold'
                ? (item.MoldCode || item.MoldID || itemId)
                : (item.CutterNo || item.CutterID || itemId);

            console.log('[CardZoom] click', { deviceType, deviceId, title });

            try {
                if (!window.DevicePhotoStore) throw new Error('DevicePhotoStore chưa sẵn sàng');

                // Lấy ảnh để phóng to: ưu tiên thumbnail, fallback ảnh mới nhất
                let row = null;

                // Bước 1: thử lấy thumbnail (đúng với ảnh nhỏ đang hiển thị trên card)
                if (typeof window.DevicePhotoStore.getThumbnailForDevice === 'function') {
                    row = await window.DevicePhotoStore.getThumbnailForDevice(deviceType, String(deviceId));
                }

                // Bước 2: nếu không có thumbnail thì lấy ảnh active mới nhất
                if (!row || !String(row.public_url || row.publicurl || row.publicUrl || '').trim()) {
                    row = null;
                    if (typeof window.DevicePhotoStore.listForDevice === 'function') {
                        const rows = await window.DevicePhotoStore.listForDevice(deviceType, String(deviceId), {
                            state: 'active',
                            limit: 1
                        });
                        row = Array.isArray(rows) ? (rows[0] || null) : null;
                    } else if (typeof window.DevicePhotoStore.getPhotos === 'function') {
                        const r = await window.DevicePhotoStore.getPhotos({
                            deviceType: deviceType,
                            deviceId: String(deviceId),
                            includeTrash: false,
                            orderBy: 'created_at',
                            orderDir: 'desc',
                            limit: 1
                        });
                        const rows = r && Array.isArray(r.data) ? r.data : (Array.isArray(r) ? r : []);
                        row = rows[0] || null;
                    }
                }


                const fullUrl = row ? String(row.public_url || row.publicurl || row.publicUrl || '') : '';
                if (!fullUrl) {
                    alert('Thiết bị này chưa có ảnh (active) để phóng to');
                    return;
                }

                console.log('[CardZoom] open url:', fullUrl);

                // Dùng lightbox của PhotoManager (_openLightbox với gạch dưới)
                if (window.PhotoManager && typeof window.PhotoManager._openLightbox === 'function') {
                    // Đảm bảo DOM lightbox đã được tạo (mount nếu chưa có)
                    if (typeof window.PhotoManager._mount === 'function') {
                        window.PhotoManager._mount();
                    }

                    // Dựng 1 record giả để _renderLightboxSlide hiển thị đúng
                    const fakeRecord = Object.assign({}, row || {}, {
                        public_url:       fullUrl,
                        publicurl:        fullUrl,
                        originalfilename: title,
                        devicetype:       deviceType,
                        deviceid:         String(deviceId)
                    });

                    // Lưu lại danh sách _filtered hiện tại rồi ghi đè tạm 1 record
                    const savedFiltered = window.PhotoManager._filtered;
                    const savedLbIndex  = window.PhotoManager._lbIndex;
                    window.PhotoManager._filtered = [fakeRecord];
                    window.PhotoManager._lbIndex  = 0;
                    // Xóa ảnh cũ trước khi mở để tránh flash ảnh cũ
                    const lbImgEl = document.getElementById('pmLbImg');
                    if (lbImgEl) { lbImgEl.removeAttribute('src'); lbImgEl.style.opacity = '0'; }

                    // Mở lightbox
                    window.PhotoManager._openLightbox(0);

                    // Sau khi đóng lightbox thì trả lại _filtered/_lbIndex cũ
                    const lb = document.getElementById('pmLightbox');
                    if (lbImgEl) { lbImgEl.onload = () => { lbImgEl.style.opacity = '1'; }; lbImgEl.onerror = () => { lbImgEl.style.opacity = '1'; }; }
                    if (lb) {
                        const restore = () => {
                            window.PhotoManager._filtered = savedFiltered;
                            window.PhotoManager._lbIndex  = savedLbIndex;
                            window.PhotoManager._savedFilteredForZoom = undefined;
                            window.PhotoManager._savedLbIndexForZoom  = undefined;

                            lb.removeEventListener('click', onLbClick);
                            document.removeEventListener('keydown', onEsc);
                        };
                        const pmCloseBtn = document.getElementById('pmLbClose');
                        if (pmCloseBtn) pmCloseBtn.addEventListener('click', restore, { once: true });
                        const onLbClick = (ev) => {
                            const body = lb.querySelector('.pm-lb-body');
                            if (body && !body.contains(ev.target)) restore();
                        };
                        const onEsc = (ev) => { if (ev.key === 'Escape') restore(); };
                        lb.addEventListener('click', onLbClick);
                        document.addEventListener('keydown', onEsc);
                    }
                    return;
                }

                // Fallback tuyệt đối nếu không có PhotoManager
                window.open(fullUrl, '_blank', 'noopener');

            } catch (err) {
                console.warn('[CardZoom] error:', err);
                alert('Không mở được ảnh. Vui lòng thử lại');
            }
        }, true);



        // Location link handler
        document.addEventListener('click', (e) => {
            const locationLink = e.target.closest('.location-link');
            if (locationLink) {
                e.preventDefault();
                e.stopPropagation();
                
                const rackId = locationLink.dataset.rackId;
                const layerId = locationLink.dataset.layerId;
                
                console.log('Open rack map:', { rackId, layerId });
                // TODO: Open rack map or location image
                alert(`📍 位置マップ / Bản đồ vị trí\nRack: ${rackId}\n開発中... / Đang phát triển...`);
            }
        });

        // Checkbox handler
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('card-checkbox')) {
                const itemId = parseInt(e.target.dataset.id);
                if (e.target.checked) {
                    this.selectedItems.add(itemId);
                } else {
                    this.selectedItems.delete(itemId);
                }

                // Update card visual state
                const card = e.target.closest('.result-card');
                if (card) {
                    card.classList.toggle('selected', e.target.checked);
                }

                // Notify parent
                if (this.onSelectionChange) {
                    this.onSelectionChange(Array.from(this.selectedItems));
                }
            }
        });

        // Card click -> mở chi tiết (trừ các nút/điểm bấm đặc biệt)
        document.addEventListener('click', (e) => {
        const card = e.target.closest('.result-card');
        if (!card) return;

        // Không mở chi tiết khi bấm vào các phần tương tác
        if (
            e.target.closest('.card-checkbox') ||
            e.target.closest('.image-zoom-btn') ||
            e.target.closest('.location-link') ||
            e.target.closest('.card-action-btn') ||
            e.target.closest('.card-action-menu-v8')
        ) {
            return;
        }

        e.preventDefault();

        const itemId = String(card.dataset.id || '').trim();
        if (!itemId) return;

        if (this.onItemClick) {
            const item = this.items.find(it => {
            const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
            return String(id).trim() === itemId;
            });
            if (item) this.onItemClick(item);
        }
        }, true);

        // Store ready / thumbnail changed -> nạp lại ảnh đại diện cho card
        document.addEventListener('device-photosready', this.scheduleHydrateThumbnails.bind(this))
        document.addEventListener('device-photosthumbnail-changed', this.scheduleHydrateThumbnails.bind(this))
        document.addEventListener('device-photoschanged', this.scheduleHydrateThumbnails.bind(this))


    }

    openCardActionMenu(buttonEl, item) {
        this.closeCardActionMenu();

        const rect = buttonEl.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'card-action-menu-v8';
        menu.style.position = 'fixed';
        menu.style.zIndex = '40000';
        menu.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 210)) + 'px';
        menu.style.top = Math.min(rect.bottom + 8, window.innerHeight - 380) + 'px';
        menu.style.width = '200px';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #e0e0e0';
        menu.style.borderRadius = '10px';
        menu.style.boxShadow = '0 10px 25px rgba(0,0,0,0.18)';
        menu.style.padding = '10px';

        const code = item.code || item.MoldCode || item.CutterNo || item.displayCode || '';
        const itemType = item.type || 'mold';

        menu.innerHTML = `
        <div style="font-weight:800;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${String(code)}
        </div>

        <button class="cam-act" data-act="detail"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.12);background:#0ea5a0;color:#fff;font-weight:800;cursor:pointer;">
            詳細 / Chi tiết
        </button>

        <div style="height:8px;"></div>

        <button class="cam-act" data-act="checkin"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.10);background:#fff;cursor:pointer;font-weight:700;">
            入庫 / Check-in
        </button>

        <div style="height:6px;"></div>

        <button class="cam-act" data-act="checkout"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.10);background:#fff;cursor:pointer;font-weight:700;">
            出庫 / Check-out
        </button>

        <div style="height:6px;"></div>

        <button class="cam-act" data-act="inventory"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.10);background:#fff;cursor:pointer;font-weight:700;">
            棚卸 / Kiểm kê
        </button>

        <div style="height:6px;"></div>

        <button class="cam-act" data-act="qr"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.10);background:#fff;cursor:pointer;font-weight:700;">
            QRコード / Mã QR
        </button>

        <div style="height:6px;"></div>

        <button class="cam-act" data-act="move"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.10);background:#fff;cursor:pointer;font-weight:700;">
            位置 / Location
        </button>

        <div style="height:6px;"></div>

        <button class="cam-act" data-act="open-storage-module"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(0,0,0,0.10);background:#f7f7f7;cursor:pointer;font-weight:700;">
            モジュール / Mở module kho
        </button>

        <div style="height:10px;"></div>

        <button class="cam-act" data-act="close"
            style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;background:#f7f7f7;cursor:pointer;">
            閉じる / Đóng
        </button>
        `;


        menu.querySelectorAll('.cam-act').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const act = btn.dataset.act;
            this.closeCardActionMenu();

            if (act === 'close') return;

            if (act === 'detail') {
            if (this.onItemClick) this.onItemClick(item);
            return;
            }

            // 1) Các action chuẩn: phát event quick-action (để sau này nối module r7.2.4)
            if (['checkin','checkout','inventory','move','print'].includes(act)) {
                document.dispatchEvent(new CustomEvent('quick-action', {
                    detail: { action: act, item, itemType }
                }));
                return;
            }

            // Gọi Module xuất QR trực tiếp thay vì đẩy Event
            if (act === 'qr') {
                if (window.ExportQR && typeof window.ExportQR.generate === 'function') {
                    window.ExportQR.generate(item);
                } else {
                    alert('Module Tạo ảnh QR chưa tải xong.');
                }
                return;
            }

            // 2) Mở module tương lai: phát event module:open giống DetailPanel
            if (act === 'open-storage-module') {
            const moldId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || '';
            document.dispatchEvent(new CustomEvent('module:open', {
                detail: { module: 'storage', moldId, mold: item, from: 'CardActionMenu' }
            }));
            return;
            }
        });
        });


        // Click ra ngoài thì đóng
        const onOutside = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== buttonEl) {
            this.closeCardActionMenu();
            document.removeEventListener('click', onOutside, true);
            }
        };
        document.addEventListener('click', onOutside, true);

        document.body.appendChild(menu);
        this._cardActionMenuEl = menu;
        }

        closeCardActionMenu() {
        if (this._cardActionMenuEl) {
            this._cardActionMenuEl.remove();
            this._cardActionMenuEl = null;
        }
    }

    /**
     * Render cards from items array
     */
    render(items, page = 1) {
        this.items = items;
        this.currentPage = page;
        // Tính tổng số trang
        this.totalPages = Math.ceil(items.length / this.itemsPerPage);

        if (!this.container) {
            console.error('Card container not found');
            return;
        }

        // Clear container
        this.container.innerHTML = '';

        // Empty state
        if (!items || items.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate pagination
        const startIdx = (page - 1) * this.itemsPerPage;
        const endIdx = startIdx + this.itemsPerPage;
        const pageItems = items.slice(startIdx, endIdx);

        // Render cards
        pageItems.forEach(item => {
        const card = this.createCard(item);
        this.container.appendChild(card);
        });

        this.scheduleHydrateThumbnails();

        // Đồng bộ checkbox với selectedItems
        this.updateCheckboxes();

        // Pagination được xử lý bởi app.js
    }


    /**
     * Create card element - Exact mockup r8.1.0 design
     */
    createCard(item) {
        const card = document.createElement('div');
        card.className = 'result-card';

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        card.dataset.id = itemId;
        card.dataset.type = item.type;

        // Check if selected
        if (this.selectedItems.has(itemId)) {
            card.classList.add('selected');
        }

        // Get data with correct mapping
        const code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');

        // Product name: Priority TrayInfoForMoldDesign > MoldName/CutterName
        let productName = '';
        if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
            productName = item.designInfo.TrayInfoForMoldDesign;
        } else {
            productName = item.type === 'mold' 
                ? (item.MoldName || '') 
                : (item.CutterName || item.CutterDesignName || '');
        }

        const dimensions = item.dimensions || 'N/A';
        
        // Lấy vị trí theo format RackID-LayerNumber
        const rackLocation = this.getRackLocation(item);
        const location = rackLocation.display;
        
        // Lấy trạng thái từ statuslogs
        const statusInfo = this.getLatestStatus(item);
        const statusClass = statusInfo.status ? statusInfo.status.toLowerCase() : '';
        const statusLabel = this.getStatusLabel(statusInfo.status);
        const statusDate = statusInfo.date ? this.formatDate(statusInfo.date) : '';
        
        const company = item.company || '-';


        // Type info
        const itemType = item.type === 'mold' ? 'mold' : 'cutter';
        const typeBadge = item.type === 'mold' ? '金型' : '抜型';
        const typeIcon = item.type === 'mold' ? 'cube' : 'cut';

                // Card HTML - Exact mockup structure r8.1.0
        card.innerHTML = `
            <!-- Checkbox - Top Left -->
            <input type="checkbox" 
                   class="card-checkbox" 
                   data-id="${itemId}" 
                   ${this.selectedItems.has(itemId) ? 'checked' : ''}>
            
            <!-- Type Badge - Top Right -->
            <div class="item-type-badge ${itemType}">${typeBadge}</div>
            
            <!-- Thumbnail Area -->
            <div class="card-thumbnail">
                <img class="card-thumb-img"
                    data-devicetype="${itemType}"
                    data-deviceid="${itemId}"
                    alt=""
                    style="width:100%;height:100%;object-fit:cover;display:none;" />
                <div class="placeholder-icon" data-thumb-placeholder="1">
                    <i class="fas fa-${typeIcon}"></i>
                </div>
                <button class="image-zoom-btn" data-id="${itemId}" title="Phóng to ảnh">
                    <i class="fas fa-search-plus"></i>
                </button>
            </div>
            
            <!-- Card Body -->
            <div class="card-body">
                <!-- ID Label -->
                <div class="item-id">ID: ${itemId}</div>
                
                <!-- Code - Bold -->
                <div class="item-code">${code}</div>
                
                <!-- Product Name -->
                <div class="item-name">${productName}</div>
                
                <!-- Dimensions - Green -->
                <div class="item-dimensions">
                    <i class="fas fa-ruler-combined"></i>
                    ${dimensions}
                </div>
                
                <!-- Meta Info Group: Location + Status + Date -->
                <div class="item-meta-group">
                    <!-- Location - Blue (clickable) -->
                    <div class="meta-item location">
                        <i class="fas fa-map-marker-alt"></i>
                        <a href="#" class="location-link" 
                           data-rack-id="${rackLocation.rackId || ''}" 
                           data-layer-id="${rackLocation.rackLayerId || ''}"
                           onclick="event.stopPropagation(); event.preventDefault();">
                            ${location}
                        </a>
                    </div>
                    
                    ${statusInfo.status ? `
                    <!-- Status Badge -->
                    <div class="meta-item status ${statusClass}">
                        ${statusLabel}
                    </div>
                    ` : '<div class="meta-item status">-</div>'}
                    
                    <!-- Update Date - Right aligned -->
                    <div class="meta-item date">
                    <i class="fas fa-calendar-alt"></i>
                    <span class="meta-date-text">${statusDate || '-'}</span>

                    <button class="card-action-btn"
                            data-id="${itemId}"
                            data-type="${itemType}"
                            aria-label="actions"
                            onclick="event.stopPropagation();"
                            style="margin-left:6px;width:28px;height:28px;border-radius:10px;border:1px solid rgba(2,6,23,0.12);background:rgba(255,255,255,0.96);color:var(--ui-accent-hover,#0A5C56);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    </div>

                </div>
            </div>
            
            <!-- Card Footer - Dual Buttons -->
            
        `;

        return card;
    }

    scheduleHydrateThumbnails() {
        if (this._thumbHydrateTimer) clearTimeout(this._thumbHydrateTimer);
        this._thumbHydrateTimer = setTimeout(() => this.hydrateThumbnails(), 80);
    }

    async hydrateThumbnails() {
        if (!window.DevicePhotoStore) return;
        if (typeof window.DevicePhotoStore.getThumbnailUrl !== 'function' &&
            typeof window.DevicePhotoStore.getThumbnailForDevice !== 'function') return;

        // Khởi tạo Intersection Observer nếu chưa có
        if (!this._thumbObserver) {
            this._thumbObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        this.loadSingleThumbnail(img);
                        observer.unobserve(img); // Chỉ load lần đầu lọt vào màn hình
                    }
                });
            }, {
                root: null, // Viewport
                rootMargin: '100px', // Load trước khi cuộn tới 100px (Lazy load an toàn)
                threshold: 0.01
            });
        }

        // Lấy tất cả ảnh mộc vừa render ra chưa tải (chưa có cờ) 
        const imgs = this.container.querySelectorAll('img.card-thumb-img[data-devicetype][data-deviceid]:not([data-loaded="true"])');
        imgs.forEach(img => {
            this._thumbObserver.observe(img);
        });
    }

    async loadSingleThumbnail(img) {
        if (!img || !img.isConnected) return;
        
        // Đánh dấu để Observer không gọi lại lần 2
        img.dataset.loaded = "true";

        const dt = (img.dataset.devicetype || '').trim();
        const did = (img.dataset.deviceid || '').trim();
        if (!dt || !did) return;

        const key = dt + '|' + did;

        // Cache 1: Đã có sẵn trong RAM -> Móc ra xài không chớp nhoáng
        if (this._thumbUrlCache.has(key)) {
            const url = this._thumbUrlCache.get(key) || '';
            this._applyThumbToImg(img, url);
            return;
        }

        // Cache 2: Mạng lắc, API Đang bận ở thẻ bên cạnh -> Ngồi chung hàng chờ Promise
        if (this._thumbPromiseCache.has(key)) {
            try {
                const url = await this._thumbPromiseCache.get(key);
                this._applyThumbToImg(img, url || '');
            } catch (e) {}
            return;
        }

        // Chính thức: Phát tín hiệu lấy link cho 1 thẻ duy nhất
        const p = (async () => {
            try {
                let url = '';

                // Ưu tiên API v8
                if (typeof window.DevicePhotoStore.getThumbnailUrl === 'function') {
                    url = await window.DevicePhotoStore.getThumbnailUrl(dt, did);
                } else {
                    // Fallback tương thích ngược
                    const row = await window.DevicePhotoStore.getThumbnailForDevice(dt, did);
                    url = row ? String(
                        row.thumbpublicurl || row.thumbPublicUrl || row.thumb_public_url ||
                        row.thumbnailpublicurl || row.thumbnail_public_url ||
                        row.thumbnailurl || row.thumbnail_url || row.thumb_url || ''
                    ).trim() : '';
                }

                url = String(url || '').trim();
                this._thumbUrlCache.set(key, url);
                return url;
            } catch (e) {
                this._thumbUrlCache.set(key, '');
                return '';
            } finally {
                this._thumbPromiseCache.delete(key);
            }
        })();

        this._thumbPromiseCache.set(key, p);

        const url = await p;
        this._applyThumbToImg(img, url || '');
    }

    _applyThumbToImg(img, url) {
    if (!img || !img.isConnected) return;

    const wrap = img.closest('.card-thumbnail');
    const placeholder = wrap ? wrap.querySelector('.placeholder-icon') : null;

    if (!url) {
        img.style.display = 'none';
        try { img.removeAttribute('src'); } catch (e) {}
        if (placeholder) placeholder.style.display = '';
        return;
    }

    img.onerror = () => {
        img.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
    };

    img.onload = () => {
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    };

    if (img.getAttribute('src') !== url) img.src = url;
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <div class="empty-state-text">
                    検索結果がありません / Không có kết quả
                </div>
                <div class="empty-state-subtext">
                    検索条件を変更してください<br>
                    Vui lòng thay đổi điều kiện tìm kiếm
                </div>
            </div>
        `;
    }

    /**
     * Get total pages
     */
    getTotalPages() {
        return Math.ceil(this.items.length / this.itemsPerPage);
    }

    /**
     * Get selected items
     */
    getSelectedItems() {
        return this.items.filter(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            return this.selectedItems.has(id);
        });
    }

    /**
     * Select all items on current page
     */
    selectAll() {
        const pageItems = this.getCurrentPageItems();
        pageItems.forEach(item => {
        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        this.selectedItems.add(itemId);
        });
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Select ALL results (across all pages)
     */
    selectAllResults() {
        // Chọn TẤT CẢ items trong this.items (không chỉ trang hiện tại)
        this.items.forEach(item => {
        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        this.selectedItems.add(itemId);
        });
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange(Array.from(this.selectedItems));
        }
        console.log(`✅ Đã chọn TẤT CẢ ${this.selectedItems.size} kết quả`);
    }


    selectAllResults() {
        // Chọn toàn bộ items của kết quả tìm kiếm (mọi trang)
        this.selectedItems.clear();

        (this.items || []).forEach(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            const n = parseInt(id);
            if (!isNaN(n)) this.selectedItems.add(n);
        });

        // Cập nhật giao diện trang hiện tại
        const cards = this.container?.querySelectorAll('.result-card') || [];
        cards.forEach(card => {
            const id = parseInt(card.dataset.id);
            const checked = this.selectedItems.has(id);
            card.classList.toggle('selected', checked);

            const cb = card.querySelector('.card-checkbox');
            if (cb) cb.checked = checked;
        });

        if (this.onSelectionChange) {
            this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Deselect all items
     */
    deselectAll() {
        this.selectedItems.clear();
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange([]);
        }
    }

    /**
     * Update checkboxes to match selectedItems state
     */
    updateCheckboxes() {
        const checkboxes = this.container.querySelectorAll('.card-checkbox');
        checkboxes.forEach(checkbox => {
        const itemId = parseInt(checkbox.dataset.id);
        const isSelected = this.selectedItems.has(itemId);
        checkbox.checked = isSelected;
        
        // Update card visual state
        const card = checkbox.closest('.result-card');
        if (card) {
            card.classList.toggle('selected', isSelected);
        }
        });
    }


        /**
     * Lấy trạng thái mới nhất từ statuslogs.csv
     */
    getLatestStatus(item) {
        if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.statuslogs) {
            return { status: null, date: null };
        }

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        const idField = item.type === 'mold' ? 'MoldID' : 'CutterID';

        // Lọc các log của item này
        const logs = window.DataManager.data.statuslogs.filter(log => {
            return String(log[idField] || '').trim() === String(itemId).trim();
        });

        if (!logs || logs.length === 0) {
            return { status: null, date: null };
        }

        // Sắp xếp theo Timestamp (mới nhất trước)
        logs.sort((a, b) => {
            const dateA = new Date(a.Timestamp || 0);
            const dateB = new Date(b.Timestamp || 0);
            return dateB - dateA;
        });

        const latest = logs[0];
        return {
            status: latest.Status || null,
            date: latest.Timestamp || null,
            notes: latest.Notes || ''
        };
    }

    /**
     * Lấy thông tin vị trí dạng RackID-RackLayerNumber
     */
    getRackLocation(item) {
        if (!window.DataManager || !window.DataManager.data) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackLayerId = item.RackLayerID;
        if (!rackLayerId) {
            return { display: '-', rackId: null, layerNum: null };
        }

        // Tìm trong racklayers
        const rackLayer = window.DataManager.data.racklayers?.find(rl => 
            String(rl.RackLayerID).trim() === String(rackLayerId).trim()
        );

        if (!rackLayer) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackId = rackLayer.RackID;
        const layerNum = rackLayer.RackLayerNumber;

        // Tìm tên giá trong racks
        const rack = window.DataManager.data.racks?.find(r => 
            String(r.RackID).trim() === String(rackId).trim()
        );

        const rackName = rack?.RackName || rackId;
        
        return {
            display: `${rackName}-${layerNum}`,
            rackId: rackId,
            layerNum: layerNum,
            rackLayerId: rackLayerId
        };
    }

        /**
     * Chuyển status code thành label hiển thị
     */
    getStatusLabel(status) {
        if (!status) return '-';
        
        const labels = {
            'IN': '入庫 IN',
            'OUT': '出庫 OUT',
            'AUDIT': '棚卸 AUDIT',
            'DISPOSED': '廃棄',
            'RETURNED': '返却'
        };
        
        return labels[status.toUpperCase()] || status;
    }

    /**
     * Format ngày tháng
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date)) return dateStr;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}.${month}.${day}`;
        } catch (e) {
            return dateStr;
        }
    }

}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultsCardRenderer;
}
