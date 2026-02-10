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

  class NotificationModule {
    constructor() {
      this.notifications = [];
      this.maxNotifications = 50; // Giới hạn lưu trữ
      this.storageKey = 'moldcutter_notifications_v8';
      this.container = null;
      this.badgeElement = null;
      this.unreadCount = 0;
      this.autoDismissTime = 5000; // 5 giây

      console.log('✅ NotificationModule v8.2.3 initializing...');
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
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          this.notifications = JSON.parse(saved);
          // Giới hạn số lượng
          if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(0, this.maxNotifications);
            this.saveNotifications();
          }
        }
      } catch (e) {
        console.warn('Failed to load notifications:', e);
        this.notifications = [];
      }
    }

    saveNotifications() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.notifications));
      } catch (e) {
        console.warn('Failed to save notifications:', e);
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
        message: message,
        title: title || this.getDefaultTitle(type),
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
