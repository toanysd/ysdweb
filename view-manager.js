/**
 * View Manager v8.5.9
 * Quản lý chuyển đổi các View (Tráo đổi màn hình chính) trong kiến trúc SPA.
 */

(function(global) {
    var ViewManager = function() {
        this.currentView = 'mold'; // 'mold' | 'tray' | 'plastic'
        this.views = {
            mold: document.getElementById('mcs-view-mold'),
            tray: document.getElementById('mcs-view-tray'),
            plastic: document.getElementById('plastic-app-root')
        };
        this.navs = {
            mold: document.getElementById('sidebarNavMolds'),
            tray: document.getElementById('sidebarNavTrays'),
            plastic: document.getElementById('sidebarPlasticManagerBtn')
        };
        this.categoryDropdown = document.getElementById('categoryDropdown');
        
        this.init();
    };

    ViewManager.prototype.init = function() {
        var self = this;
        
        if (this.navs.mold) {
            this.navs.mold.addEventListener('click', function(e) {
                e.preventDefault();
                self.switchView('mold');
            });
        }
        
        if (this.navs.tray) {
            this.navs.tray.addEventListener('click', function(e) {
                e.preventDefault();
                self.switchView('tray');
            });
        }

        // Tích hợp Global Searchbox: 
        // Khi gõ vào ô search, nếu đang ở view Tray, ta tự động gán categoryDropdown thành 'tray'
        // Tuy nhiên sếp yêu cầu: "Phần global search giữ nguyên để khi cần chỉ cần gõ tìm kiếm là về ngay trang search thiết bị."
        // Nghĩa là: nếu đang ở tab Khay mà User gõ vào Global Search -> Tự động nhảy về Mold View.
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            // Cho phép focus tự nhiên. Logic filter thực sự sẽ do FilterCore / PlasticRouterUI xử lý (kịch bản oninput).
            // Nếu từ tab Khay gõ search, ta mới đưa về Mold.
            searchInput.addEventListener('focus', function() {
                if (self.currentView === 'tray') {
                    if (self.categoryDropdown) self.categoryDropdown.value = 'all'; 
                    self.switchView('mold');
                }
            });
        }
        
        // Cấu hình ban đầu
        this.switchView('mold');
    };

    ViewManager.prototype.switchView = function(viewName) {
        if (!this.views[viewName]) return;
        this.currentView = viewName;
        window.CurrentSearchContext = viewName; // Update Global Search Context
        
        // Trigger Scope Pill Update & Searchbar Styling
        var scopePill = document.getElementById('search-scope-pill');
        var searchInput = document.getElementById('searchInput');
        var moduleIcon = document.querySelector('.topbar-module-icon');
        var moduleLabelJa = document.querySelector('.topbar-module-label .ja');
        var moduleLabelVi = document.querySelector('.topbar-module-label .vi');
        var categoryDropdown = document.getElementById('categoryDropdown');
        var searchDivider = document.querySelector('.search-divider');
        
        if (viewName === 'plastic') {
            if(scopePill) { scopePill.innerHTML = '<i class="fas fa-box-open"></i> WMS専用'; scopePill.classList.remove('mcs-hidden'); }
            if(searchInput) searchInput.placeholder = 'ロール番号、種類、場所などを検索... / Tìm cuộn, mã nhựa, nsx...';
            if(moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-box-open"></i>';
            if(moduleLabelJa) moduleLabelJa.textContent = 'プラ材料倉庫管理 (WMS)';
            if(moduleLabelVi) moduleLabelVi.textContent = 'Quản lý Nhựa / Plastic WMS';
            if(categoryDropdown) categoryDropdown.classList.add('mcs-hidden');
            if(searchDivider) searchDivider.classList.add('mcs-hidden');
        } else if (viewName === 'tray') {
            if(scopePill) scopePill.classList.add('mcs-hidden');
            if(searchInput) searchInput.placeholder = 'Khay, thông số...';
            if(moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-box"></i>';
            if(moduleLabelJa) moduleLabelJa.textContent = 'トレイ管理';
            if(moduleLabelVi) moduleLabelVi.textContent = 'Quản lý Khay';
            if(categoryDropdown) categoryDropdown.classList.remove('mcs-hidden');
            if(searchDivider) searchDivider.classList.remove('mcs-hidden');
        } else {
            // mold
            if(scopePill) scopePill.classList.add('mcs-hidden');
            if(searchInput) searchInput.placeholder = 'Mã, tên, vị trí, công ty...';
            if(moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-search"></i>';
            if(moduleLabelJa) moduleLabelJa.textContent = '金型・抜型 検索';
            if(moduleLabelVi) moduleLabelVi.textContent = 'Tìm kiếm Khuôn / Dao cắt';
            if(categoryDropdown) categoryDropdown.classList.remove('mcs-hidden');
            if(searchDivider) searchDivider.classList.remove('mcs-hidden');
        }
        
        // Ẩn tất cả views, hiện view được chọn
        var self = this;
        Object.keys(this.views).forEach(function(key) {
            if (self.views[key]) {
                if (key === viewName) {
                    self.views[key].style.display = 'flex';
                } else {
                    self.views[key].style.display = 'none';
                }
            }
        });

        // Cập nhật trạng thái Nav sidebar
        Object.keys(this.navs).forEach(function(key) {
            if (self.navs[key]) {
                if (key === viewName) {
                    self.navs[key].classList.add('active');
                } else {
                    self.navs[key].classList.remove('active');
                }
            }
        });
        
        // Dispatch event để các module khác biết (e.g. TrayManager có thể re-render)
        document.dispatchEvent(new CustomEvent('mcsViewChanged', { detail: { view: viewName } }));
        
        // Nếu chuyển sang module khác, đóng sidebar trên mobile (nếu đang bật)
        if (window.innerWidth <= 768) {
            var sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('open');
            }
        }

        // Cập nhật thẻ Module Switcher (Demo)
        document.querySelectorAll('.module-switcher .ms-btn').forEach(function(btn) {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewName)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    // Singleton
    document.addEventListener('DOMContentLoaded', function() {
        global.ViewManager = new ViewManager();
    });

})(window);
