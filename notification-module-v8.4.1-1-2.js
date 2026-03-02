/* ============================================================================
   NOTIFICATION MODULE v8.2.3
   Hệ thống thông báo cho Mold/Cutter Search System

   Tính năng:
   - Toast notifications (success, error, warning, info)
   - Badge counters cho unread notifications
   - Event-driven system
   - Auto-dismiss sau 5 giây
   - Bilingual (Japanese/Vietnamese)
   - Tích hợp với detail-panel, comments, teflon modules

   Created: 2026-02-03
   ============================================================================ */

(function() {
  'use strict';


  // ===========================================================================
  // Storage helpers (v8.2.3-2) - đặt ngoài class để tránh lỗi cú pháp do chèn nhầm
  // ===========================================================================
  function _nmText(v, maxLen) {
    var s = '';
    try { s = (v === null || v === undefined) ? '' : String(v); } catch (_) { s = ''; }
    if (!maxLen || maxLen <= 0) return s;
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
  }

  function _safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function _isQuotaError(e) {
    try {
      if (!e) return false;
      if (e.name === 'QuotaExceededError') return true;
      if (e.code === 22 || e.code === 1014) return true;
      var msg = String(e.message || e).toLowerCase();
      return (msg.indexOf('quota') >= 0) || (msg.indexOf('exceeded') >= 0) || (msg.indexOf('storage') >= 0);
    } catch (_) {
      return false;
    }
  }

  function _compactNotifications(list, keep, opts, getDefaultTitleFn) {
    opts = opts || {};
    var maxMsg = Number.isFinite(opts.maxMsg) ? opts.maxMsg : 180;
    var maxTitle = Number.isFinite(opts.maxTitle) ? opts.maxTitle : 80;

    var arr = Array.isArray(list) ? list : [];
    var sliced = (Number.isFinite(keep) && keep > 0) ? arr.slice(0, keep) : arr.slice();

    return sliced
      .filter(function(n){ return n && typeof n === 'object'; })
      .map(function(n){
        var type = _nmText(n.type, 16) || 'info';
        var title = _nmText(n.title, maxTitle);
        if (!title && typeof getDefaultTitleFn === 'function') title = getDefaultTitleFn(type);
        return {
          id: _nmText(n.id, 80),
          type: type,
          title: title,
          message: _nmText(n.message, maxMsg),
          timestamp: _nmText(n.timestamp, 40),
          read: !!n.read,
          dismissed: !!n.dismissed
          // Không lưu field data để tránh phình localStorage
        };
      });
  }

  function _sortForKeep(list) {
    var arr = Array.isArray(list) ? list.slice() : [];
    // Ưu tiên giữ chưa đọc trước, sau đó theo thời gian mới nhất
    arr.sort(function(a, b){
      var ar = !!(a && a.read);
      var br = !!(b && b.read);
      if (ar !== br) return ar ? 1 : -1;
      var at = String(a && a.timestamp ? a.timestamp : '');
      var bt = String(b && b.timestamp ? b.timestamp : '');
      return bt.localeCompare(at);
    });
    return arr;
  }

  class NotificationModule {
    constructor() {
      this.notifications = [];
      this.maxNotifications = 50; // Giới hạn lưu trữ
      this.storageKey = 'moldcutter_notifications_v8';
      this.container = null;
      this.badgeElement = null;
      this.unreadCount = 0;
      this.autoDismissTime = 5000; // 5 giây

      

      // Storage-safe flags (v8.2.3-2)
      this.persistenceEnabled = true;
      this._persistWarned = false;
      this._persistDisabledWarned = false;
      this._lastPersistError = null;
console.log('✅ NotificationModule v8.2.3-2 initializing...');
      this.init();
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    init() {
      // Tạo container cho toast
      this.createToastContainer();

      // Load notifications từ localStorage
      this.loadNotifications();

      // Tính toán unread count
      this.updateUnreadCount();

      // Bind events
      this.bindEvents();

      console.log('✅ NotificationModule initialized');
    }

    createToastContainer() {
      // Kiểm tra đã tồn tại chưa
      let existing = document.getElementById('notification-toast-container');
      if (existing) {
        this.container = existing;
        return;
      }

      // Tạo mới
      const container = document.createElement('div');
      container.id = 'notification-toast-container';
      container.className = 'notification-toast-container';
      container.innerHTML = ''; // Empty initially

      document.body.appendChild(container);
      this.container = container;

      console.log('✅ Toast container created');
    }

    bindEvents() {
      // Listen for custom notification events
      document.addEventListener('notify', (e) => {
        const { type, message, title, data } = e.detail;
        this.show(type, message, title, data);
      });

      // Listen for notification read
      document.addEventListener('notification:read', (e) => {
        const { id } = e.detail;
        this.markAsRead(id);
      });

      // Listen for clear all
      document.addEventListener('notification:clearAll', () => {
        this.clearAll();
      });
    }

    // =========================================================================
    // STORAGE
    // =========================================================================
  loadNotifications() {
    try {
      var saved = localStorage.getItem(this.storageKey);
      if (!saved) {
        this.notifications = [];
        return;
      }

      var parsed = _safeParse(saved, null);
      if (!Array.isArray(parsed)) {
        this.notifications = [];
        return;
      }

      // Compact lại để tránh data cũ quá nặng
      var compact = _compactNotifications(parsed, this.maxNotifications, { maxMsg: 220, maxTitle: 90 }, this.getDefaultTitle.bind(this));
      this.notifications = compact;

      // Lưu lại dạng compact để giảm nguy cơ đầy quota lần sau
      this.saveNotifications();
    } catch (e) {
      console.warn('Failed to load notifications:', e);
      this.notifications = [];
    }
  }

  
  saveNotifications() {
    if (!this.persistenceEnabled) return;

    try {
      var compact = _compactNotifications(this.notifications, this.maxNotifications, { maxMsg: 220, maxTitle: 90 }, this.getDefaultTitle.bind(this));
      localStorage.setItem(this.storageKey, JSON.stringify(compact));
      this._lastPersistError = null;
      return;
    } catch (e) {
      this._lastPersistError = e;

      if (!_isQuotaError(e)) {
        if (!this._persistWarned) {
          this._persistWarned = true;
          console.warn('Failed to save notifications:', e);
        }
        return;
      }

      // QuotaExceededError: cố thu gọn để vẫn lưu được
      try {
        var sorted = _sortForKeep(this.notifications)
          .filter(function(n){ return n && typeof n === 'object'; })
          .filter(function(n){ return !(n.dismissed && n.read); });

        var levels = [40, 25, 15, 8];
        for (var i = 0; i < levels.length; i++) {
          var keep = levels[i];
          var compact2 = _compactNotifications(sorted, keep, { maxMsg: 160, maxTitle: 70 }, this.getDefaultTitle.bind(this));
          try {
            localStorage.setItem(this.storageKey, JSON.stringify(compact2));
            this._lastPersistError = null;
            return;
          } catch (e2) {
            if (!_isQuotaError(e2)) break;
          }
        }

        // Nếu vẫn không lưu được: xoá key rồi thử lưu mức tối thiểu
        try { localStorage.removeItem(this.storageKey); } catch (_) {}
        try {
          var compactMin = _compactNotifications(sorted, 8, { maxMsg: 120, maxTitle: 60 }, this.getDefaultTitle.bind(this));
          localStorage.setItem(this.storageKey, JSON.stringify(compactMin));
          this._lastPersistError = null;
          return;
        } catch (_) {
          // Không thể persist nữa -> tắt persist để tránh spam lỗi, toast vẫn chạy
          this.persistenceEnabled = false;
          if (!this._persistDisabledWarned) {
            this._persistDisabledWarned = true;
            console.warn('Notification persistence disabled due to storage quota. Toast will still work.');
          }
        }
      } catch (e3) {
        this.persistenceEnabled = false;
        if (!this._persistDisabledWarned) {
          this._persistDisabledWarned = true;
          console.warn('Notification persistence disabled due to storage error. Toast will still work.', e3);
        }
      }
    }
  }

  // =========================================================================
  // MAIN METHODS
    // =========================================================================
    show(type = 'info', message = '', title = '', data = null) {
      const id = `notify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const notification = {
        id: id,
        type: type,
        message: (message === null || message === undefined) ? '' : String(message),
        title: (title ? String(title) : this.getDefaultTitle(type)),
        data: data,
        timestamp: new Date().toISOString(),
        read: false,
        dismissed: false
      };

      // Lưu vào danh sách
      this.notifications.unshift(notification);

      // Giới hạn số lượng
      if (this.notifications.length > this.maxNotifications) {
        this.notifications = this.notifications.slice(0, this.maxNotifications);
      }

      this.saveNotifications();
      this.updateUnreadCount();

      // Hiển thị toast
      this.showToast(notification);

      // Dispatch event để các module khác biết
      document.dispatchEvent(new CustomEvent('notification:created', {
        detail: notification
      }));

      return id;
    }

    showToast(notification) {
      if (!this.container) return;

      const toast = document.createElement('div');
      toast.className = `notification-toast notification-${notification.type}`;
      toast.setAttribute('data-id', notification.id);

      toast.innerHTML = `
        <div class="toast-icon">
          <i class="fas ${this.getIcon(notification.type)}"></i>
        </div>
        <div class="toast-content">
          <div class="toast-title">${this.escapeHtml(notification.title)}</div>
          <div class="toast-message">${this.escapeHtml(notification.message)}</div>
        </div>
        <button class="toast-close" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      `;

      // Bind close button
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => {
        this.dismissToast(toast, notification.id);
      });

      // Click toast to mark as read
      toast.addEventListener('click', (e) => {
        if (!e.target.closest('.toast-close')) {
          this.markAsRead(notification.id);
          this.dismissToast(toast, notification.id);
        }
      });

      // Thêm vào container
      this.container.appendChild(toast);

      // Animation: fade in
      setTimeout(() => {
        toast.classList.add('show');
      }, 10);

      // Auto dismiss sau 5 giây
      setTimeout(() => {
        this.dismissToast(toast, notification.id);
      }, this.autoDismissTime);
    }

    dismissToast(toastElement, notificationId) {
      if (!toastElement) return;

      toastElement.classList.remove('show');
      toastElement.classList.add('hide');

      setTimeout(() => {
        if (toastElement && toastElement.parentNode) {
          toastElement.parentNode.removeChild(toastElement);
        }
      }, 300);

      // Mark as dismissed
      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.dismissed = true;
        this.saveNotifications();
      }
    }

    // =========================================================================
    // NOTIFICATION MANAGEMENT
    // =========================================================================
    markAsRead(id) {
      const notification = this.notifications.find(n => n.id === id);
      if (notification && !notification.read) {
        notification.read = true;
        this.saveNotifications();
        this.updateUnreadCount();

        document.dispatchEvent(new CustomEvent('notification:read', {
          detail: { id: id }
        }));
      }
    }

    markAllAsRead() {
      let changed = false;
      this.notifications.forEach(n => {
        if (!n.read) {
          n.read = true;
          changed = true;
        }
      });

      if (changed) {
        this.saveNotifications();
        this.updateUnreadCount();

        document.dispatchEvent(new CustomEvent('notification:allRead'));
      }
    }

    clearAll() {
      this.notifications = [];
      this.saveNotifications();
      this.updateUnreadCount();

      document.dispatchEvent(new CustomEvent('notification:cleared'));
    }

    getUnread() {
      return this.notifications.filter(n => !n.read);
    }

    getAll() {
      return this.notifications;
    }

    getById(id) {
      return this.notifications.find(n => n.id === id);
    }

    deleteById(id) {
      const index = this.notifications.findIndex(n => n.id === id);
      if (index >= 0) {
        this.notifications.splice(index, 1);
        this.saveNotifications();
        this.updateUnreadCount();

        document.dispatchEvent(new CustomEvent('notification:deleted', {
          detail: { id: id }
        }));
      }
    }

    updateUnreadCount() {
      this.unreadCount = this.notifications.filter(n => !n.read).length;

      // Dispatch event
      document.dispatchEvent(new CustomEvent('notification:unreadCountChanged', {
        detail: { count: this.unreadCount }
      }));

      // Update badge nếu có
      this.updateBadge();
    }

    updateBadge() {
      // Tìm badge element (nếu có trong UI)
      const badges = document.querySelectorAll('[data-notification-badge]');
      badges.forEach(badge => {
        if (this.unreadCount > 0) {
          badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      });
    }

    // =========================================================================
    // CONVENIENCE METHODS
    // =========================================================================
    success(message, title = null) {
      return this.show('success', message, title);
    }

    error(message, title = null) {
      return this.show('error', message, title);
    }

    warning(message, title = null) {
      return this.show('warning', message, title);
    }

    info(message, title = null) {
      return this.show('info', message, title);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    getDefaultTitle(type) {
      const titles = {
        success: '成功 / Thành công',
        error: 'エラー / Lỗi',
        warning: '警告 / Cảnh báo',
        info: '情報 / Thông tin'
      };
      return titles[type] || titles.info;
    }

    getIcon(type) {
      const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
      };
      return icons[type] || icons.info;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // =========================================================================
  // CSS INJECTION
  // =========================================================================
  function injectStyles() {
    if (document.getElementById('notification-module-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-module-styles';
    style.textContent = `
      /* Notification Toast Container */
      .notification-toast-container {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }

      /* Toast */
      .notification-toast {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 320px;
        max-width: 420px;
        padding: 16px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        border-left: 4px solid #ccc;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
      }

      .notification-toast.show {
        opacity: 1;
        transform: translateX(0);
      }

      .notification-toast.hide {
        opacity: 0;
        transform: translateX(100%);
      }

      /* Toast Types */
      .notification-toast.notification-success {
        border-left-color: #4CAF50;
      }

      .notification-toast.notification-error {
        border-left-color: #F44336;
      }

      .notification-toast.notification-warning {
        border-left-color: #FF9800;
      }

      .notification-toast.notification-info {
        border-left-color: #2196F3;
      }

      /* Toast Icon */
      .toast-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 16px;
      }

      .notification-success .toast-icon {
        background: rgba(76, 175, 80, 0.1);
        color: #4CAF50;
      }

      .notification-error .toast-icon {
        background: rgba(244, 67, 54, 0.1);
        color: #F44336;
      }

      .notification-warning .toast-icon {
        background: rgba(255, 152, 0, 0.1);
        color: #FF9800;
      }

      .notification-info .toast-icon {
        background: rgba(33, 150, 243, 0.1);
        color: #2196F3;
      }

      /* Toast Content */
      .toast-content {
        flex: 1;
        min-width: 0;
      }

      .toast-title {
        font-size: 14px;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 4px;
      }

      .toast-message {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.4;
        word-wrap: break-word;
      }

      /* Toast Close Button */
      .toast-close {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .toast-close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #4b5563;
      }

      /* Mobile Responsive */
      @media (max-width: 767px) {
        .notification-toast-container {
          top: 60px;
          right: 10px;
          left: 10px;
        }

        .notification-toast {
          min-width: auto;
          max-width: none;
        }
      }

      /* Badge (for notification count in UI) */
      [data-notification-badge] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        background: #F44336;
        color: #ffffff;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }
    `;

    document.head.appendChild(style);
  }

  // =========================================================================
  // AUTO-INIT
  // =========================================================================
  function autoInit() {
    // Inject styles
    injectStyles();

    // Initialize module
    window.NotificationModule = new NotificationModule();

    // Expose convenience methods to window
    window.notify = {
      success: (message, title) => window.NotificationModule.success(message, title),
      error: (message, title) => window.NotificationModule.error(message, title),
      warning: (message, title) => window.NotificationModule.warning(message, title),
      info: (message, title) => window.NotificationModule.info(message, title)
    };

    console.log('✅ NotificationModule ready. Use window.notify.success("message")');
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})();
