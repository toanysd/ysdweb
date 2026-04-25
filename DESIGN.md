# DESIGN.md - YSD Industrial Design System

**Version:** 3.0 (Unified Standard for AI Agents)  
**Scope:** Phần mềm quản lý sản xuất, MES/ERP, Tool Management, Warehouse Management, Quality Systems  
**Target:** MoldCutterSearch, Plastic Manager, and future YSD modules.  
**Goal:** Antigravity and any standard coding agents generate 100% consistent, functional, and culturally accurate UI for Japanese manufacturing floors without manual CSS adjustments.

---

## 1. CORE PHILOSOPHY & MINDSET

### 1.1 Kaizen-first Design (改善優先設計)
Thiết kế phần mềm công nghiệp không phải là tạo ra "sản phẩm đẹp" — mà là tạo ra **công cụ làm việc hiệu quả nhất** cho người dùng chuyên nghiệp trong môi trường sản xuất.
Ba giá trị tối thượng:
1. **Seiri (整理) — Sắp xếp**: Mọi thứ trên màn hình đều có lý do tồn tại
2. **Seiton (整頓) — Ngăn nắp**: Mọi thứ ở đúng vị trí, dễ tìm trong 3 giây
3. **Shitsuke (躾) — Kỷ luật**: Mọi màn hình tuân thủ cùng một nguyên tắc

### 1.2 Dense Industrial UI — (Không phải SaaS Marketing)
Phần mềm công nghiệp Nhật Bản (FANUC, Keyence, Mitsubishi FA, Murata Machinery) có đặc điểm:
- **Mật độ thông tin cao** — nhiều data trong ít không gian.
- **Màu sắc có chức năng** — không trang trí.
- **Không có "hero section"** — không có khoảng trắng lãng phí.
- **Người dùng là chuyên gia** — không cần tooltip giải thích ABC.
- **Nguyên tắc "3 giây"**: Người dùng tại xưởng sản xuất phải đọc được thông tin quan trọng nhất trong 3 giây. Nếu cần hơn 3 giây → thiết kế thất bại.

### 1.3 Light Industrial Teal (Không bắt buộc Dark Mode)
Hệ thống YSD được thiết kế cho môi trường nhà máy, văn phòng sản xuất với màn hình thường dùng ban ngày dưới ánh đèn công xưởng. Light Mode là chế độ mặc định và **duy nhất bắt buộc**.
**Lý do:**
- Kỹ thuật viên, quản lý kho, kế hoạch sản xuất nhìn màn hình trong môi trường sáng.
- Dữ liệu dày đặc (bảng, số, trạng thái) dễ đọc hơn trên nền trắng.
- Dark mode trên bảng nhiều dữ liệu gây mờ ranh giới cột/hàng.
- Không có yêu cầu thực tế từ người dùng nhà máy cần dark mode.
**Quy tắc tác nhân (Agent Rule):** Antigravity **tuyệt đối không được tự ý thêm dark mode toggle** vào bất kỳ module nào trừ khi có yêu cầu tường minh từ chủ hệ thống.

---

## 2. GLOBAL TOKENS & THEMING

### 2.1 SPACING SYSTEM — Mật độ cao (Dense UI)
Base unit: **4px**

```css
--space-1:  4px   /* Icon gap, badge padding inline */
--space-2:  8px   /* Input padding, tight component gap */
--space-3:  10px  /* Card padding, form field gap */
--space-4:  12px  /* Section internal padding, toolbar gap */
--space-5:  16px  /* Component group gap */
--space-6:  20px  /* Section gap */
--space-8:  24px  /* Major section gap — TỐI ĐA cho dense UI */
--space-12: 32px  /* Chỉ dùng cho page margin ngoài cùng */

/* Fixed dimensions */
--height-header:    48px
--height-tab:       36px
--height-toolbar:   40px
--height-row-sm:    30px   /* Table row compact */
--height-row-md:    36px   /* Table row standard */
--height-row-lg:    44px   /* Table row với ảnh/nhiều dòng */
--height-input:     30px   /* Input compact */
--height-input-md:  34px   /* Input standard */
--height-button:    28px   /* Button compact */
--height-button-md: 32px   /* Button standard */
--sidebar-collapsed: 52px
--sidebar-expanded:  200px
```

**TUYỆT ĐỐI KHÔNG:** Default padding > 24px trong UI; Margin-top > 16px giữa các section bình thường; Line-height > 1.6 cho body text.

### 2.2 TYPOGRAPHY — Song ngữ JP/VI

**Font stack:**
```css
--font-jp:   'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
--font-vi:   'Inter', 'Be Vietnam Pro', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
```

**Type Scale:**
| Token | Size | Weight | Font | Dùng cho |
|---|---|---|---|---|
| `--text-kpi` | 26px | 800 | JP | KPI value số lớn |
| `--text-h1` | 16px | 700 | JP | Page title (hiếm) |
| `--text-h2` | 14px | 700 | JP | Section title |
| `--text-h3` | 13px | 600 | JP | Sub-section |
| `--text-label-jp` | 12px | 600 | JP | Label chính |
| `--text-label-vi` | 10px | 400 | VI | Label phụ (muted) |
| `--text-body` | 12px | 400 | VI | Body text |
| `--text-meta` | 11px | 400 | VI | Metadata, timestamp |
| `--text-badge` | 10px | 600 | VI | Badge, tag, uppercase |
| `--text-mono` | 11px | 400 | Mono | Code, ID, số kỹ thuật |

**Quy tắc song ngữ (bắt buộc với mọi label):**
```html
<span class="label">
  <span class="ja">在庫数量</span>
  <span class="vi">Số lượng tồn kho</span>
</span>
```
```css
.ja { display: block; font-family: var(--font-jp); font-size: 12px; font-weight: 600; color: var(--mcs-text); }
.vi { display: block; margin-top: 1px; font-family: var(--font-vi); font-size: 10px; font-weight: 400; color: var(--mcs-text-muted); }
```

### 2.3 COLOR SYSTEM — Bảng màu Light Industrial Teal

**Triết lý:** Màu = trạng thái + ý nghĩa. Không dùng màu chỉ để đẹp. Người vận hành nhìn màu → biết ngay tình trạng.

```css
:root {
  /* ── Nền & Bề mặt ─────────────────────────────── */
  --mcs-bg:              #f5f6f8;   /* Nền toàn trang */
  --mcs-surface:         #ffffff;   /* Card, panel, modal */
  --mcs-surface-2:       #f8f9fa;   /* Nền dòng xen kẽ bảng, sidebar nhẹ */
  --mcs-surface-3:       #eef0f3;   /* Nền header bảng, nền input disabled */
  --mcs-surface-hover:   #e8f4f4;   /* Hover state trên row, card */

  /* ── Viền & Ngăn cách ─────────────────────────── */
  --mcs-border:          #dde1e7;   /* Viền mặc định */
  --mcs-border-strong:   #b2bec3;   /* Viền nổi bật, table border */
  --mcs-divider:         #eceff1;   /* Ngăn cách nhẹ trong form */

  /* ── Text ─────────────────────────────────────── */
  --mcs-text:            #1a1a2e;   /* Text chính — đọc trên nền trắng */
  --mcs-text-secondary:  #4a5568;   /* Label, caption, mô tả phụ */
  --mcs-text-muted:      #718096;   /* Placeholder, hint, disabled text */
  --mcs-text-inverse:    #ffffff;   /* Text trên nền tối (button, badge) */

  /* ── Màu nhấn chính — Teal ────────────────────── */
  --mcs-primary:         #0d7a7a;   /* Teal chính: button, link, active */
  --mcs-primary-hover:   #0a6262;   /* Hover */
  --mcs-primary-active:  #084f4f;   /* Active / pressed */
  --mcs-primary-light:   #e6f4f4;   /* Nền nhạt khi highlight, tag */
  --mcs-primary-mid:     #4db6ac;   /* Teal nhạt hơn cho gradient, chart */

  /* ── Trạng thái — Ngữ nghĩa Màu (KHÔNG thay đổi) */
  --mcs-success:         #27ae60;   /* Thành công / OK / Bình thường */
  --mcs-success-hover:   #219150;
  --mcs-success-light:   #eafaf1;
  --mcs-success-text:    #1d6e3c;

  --mcs-warning:         #f39c12;   /* Cảnh báo / Pending / Sắp tới hạn */
  --mcs-warning-hover:   #d68910;
  --mcs-warning-light:   #fef9e7;
  --mcs-warning-text:    #7d5a0a;

  --mcs-error:           #e74c3c;   /* Lỗi / Quá hạn / OUT / Hỏng */
  --mcs-error-hover:     #c0392b;
  --mcs-error-light:     #fdf2f1;
  --mcs-error-text:      #922b21;

  --mcs-info:            #2980b9;   /* Thông tin / In-progress / Chờ xử lý */
  --mcs-info-hover:      #1f6391;
  --mcs-info-light:      #eaf3fb;
  --mcs-info-text:       #1a5276;

  --mcs-neutral:         #95a5a6;   /* Đã hủy / Tồn kho chết / Blocked */
  --mcs-neutral-hover:   #7f8c8d;
  --mcs-neutral-light:   #f2f3f4;
  --mcs-neutral-text:    #515a5a;

  --mcs-returned:        #f97316;   /* Trả Khách / Xuất Khách - Cam / Orange */

  /* ── Màu Chart & Nhóm phân loại ── */
  --mcs-group-1:         #0d7a7a;
  --mcs-group-2:         #8e44ad;   /* Tím - Nhóm mở rộng */
  --mcs-group-3:         #2980b9;
  --mcs-group-4:         #d35400;
  --mcs-group-5:         #16a085;
  --mcs-group-6:         #7f8c8d;

  /* ── Shadow & Borders ─────────────────────────── */
  --mcs-shadow-sm:   0 1px 3px rgba(0,0,0,0.08);
  --mcs-shadow-md:   0 4px 12px rgba(0,0,0,0.10);
  --mcs-shadow-lg:   0 8px 24px rgba(0,0,0,0.12);
  --mcs-shadow-card: 0 2px 8px rgba(13,122,122,0.08);  /* Teal-tinted card shadow */

  --mcs-radius-sm:   4px;
  --mcs-radius-md:   8px;
  --mcs-radius-lg:   12px;
  --mcs-radius-full: 9999px;
  --mcs-transition:  150ms ease;
}
```

**Bảng Ngữ Nghĩa Màu Ứng Dụng (MOLD / PLASTIC):**
- Khuôn đang chạy / Dao còn > 50% / Nhựa còn Kho → `--mcs-success`
- Khuôn sắp bảo / Dao 20-50% / Nhựa cần nhập → `--mcs-warning`
- Khuôn hỏng / Dao < 20% / Nhựa < Min → `--mcs-error`
- Khuôn bảo trì / Cun nhựa mới dùng → `--mcs-info`
- Khuôn Hủy / Nhựa Xuất Hết / Lưu Kho → `--mcs-neutral` (Trường hợp đặc quyền: Disposed Molds đóng mộc đỏ, Returned Mods đóng mộc cam trực tiếp lên ảnh)

---

## 3. COMPONENT LIBRARY SYSTEM

### 3.1 Button
- Primary: bg `--mcs-primary`, white text, height 28px/32px, radius 8px.
- Secondary: transparent, border 1px `--mcs-border`, color `--mcs-text`.
- Ghost: transparent, color `--mcs-text-muted`, hover `--mcs-text`.
- Danger: bg `--mcs-error`, white text.
- Icon-only: 28x28 tương đương Secondary.
- Mọi hover tăng/darken nền hoặc dùng `--mcs-surface-hover`.
- KHÔNG BAO GIỜ: Gradient, box-shadow lớn, viền cong viên thuốc (trừ badge).

### 3.2 Form / Input
- Height 30px (compact) / 34px (standard).
- Background: `--mcs-surface-3`. Viền: `--mcs-border`. Radius: 6px.
- Focus: border `--mcs-primary` + shadow `0 0 0 2px rgba(13,122,122,0.15)`.

### 3.3 Table & Datagrid
```css
/* Nền xen kẽ */
tr:nth-child(even) td { background: var(--mcs-surface-2); }
tr:hover td { background: var(--mcs-surface-hover); }
tr.selected td { background: var(--mcs-primary-light); }
thead th { background: var(--mcs-surface-3); color: var(--mcs-text); position: sticky; top: 0; z-index: 10; }
```
- Numeric columns: `--font-mono`, right aligned, `tabular-nums`.
- Virtual scrolling nếU data > 200 rows.

### 3.4 Khối Module (Cards & Panels)
```css
.card {
  background: var(--mcs-surface);
  border: 1px solid var(--mcs-border);
  border-radius: var(--mcs-radius-md);
  box-shadow: var(--mcs-shadow-card);
}
```

### 3.5 Status Badge
Luôn dùng cặp màu `_light` + `_text` để đảm bảo contrast. Không dùng opacity để làm nhạt nền thủ công (vì dễ lỗi hiển thị trên nhiều nền).
```css
.badge-success { background: var(--mcs-success-light); color: var(--mcs-success-text); border: 1px solid rgba(39,174,96,0.25); border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
```

### 3.6 Sidebar / Header Architect
- Sidebar (Expanded 200px / Collapsed 52px): bg `--mcs-surface-2`
- Header (48px): bg `--mcs-surface`
- Search bar tại Navigation: Phải đi kèm "Scope Pill" thể hiện rõ đang truy vấn ở Module nào.

---

## 4. ARCHITECTURE & WORKFLOW (7 QUY TẮC)

### 4.1. Stakeholders, Data First
- Xác định 4 luồng người: Operator (Tại nhà máy), Supervisor (Quản lý cụm), Engineer (Kỹ thuật), Manager (Theo dõi tổng).
- Phải chốt luồng truy vấn Database Flow, Relation trước khi sinh giao diện.

### 4.2. Khung Bố Cục Thống Nhất
```text
┌─────────────────────────────────────────────────┐
│ SIDEBAR 52px │ MODULE HEADER 48px               │
│              ├──────────────────────────────────┤
│              │ TAB BAR 36px                      │
│              ├──────────────────────────────────┤
│              │ ALERT BANNER (nếu có) ~36px        │
│              ├──────────────────────────────────┤
│              │ CONTENT AREA (Padding Max 12x16)  │
│              │                                   │
│              │  [KPI GRID / TABLE / PANEL]       │
└─────────────────────────────────────────────────┘
```
- KPIs, Charts (Grid Responsive 1~3 Cols) đặt ngay đầu tiên. Content kéo xuống. Không chia cắt UI quá dài.

### 4.3. Navigation (Điều hướng)
- Module Cấp 1 -> Cấp 2 bằng Top Tab Bar.
- View Chi tiết: Sử dụng Right Drawer Panel / Inline Card Detail (Slide over) => Không mở Tab trình duyệt mới, Không ép Back liên lục.

### 4.4. State Design (5 Trạng Thái Tích Cực)
- Mọi thành phần UI cần quy định rõ 5 states:
  - **Loading**: Render Skeleton block, không được che toàn trang bằng xoay vô cực.
  - **Empty**: Luôn có Icon + Text .ja/.vi + Nút Gợi ý Tạo mới.
  - **Error**: Inline Text Error đỏ.
  - **Success**: Inline Toast/Banner biến mất tự động.
  - **Partial**: Render list hiện đại, skeleton các phần đang fetch.
  - Thêm Real-time Pulse (flash green/teal -> opacity ngầm) cho giá trị WS trả về.

---

## 5. CÔNG NGHỆ ÁP DỤNG & i18n
- **Stack**: Vanilla JS / Web Components / JS Đơn Thuần để bền bỉ tối đa trong môi trường Offline Industry.
- **Biểu Đồ (Charts)**: Apache ECharts / Chart.js 4 (Sử dụng bảng màu Variable).
- **Thành Phần SVG**: Cố định kích thước, Lucide Icons.
- **i18n Implementation**: Translate object / Dataset data mapping. Không dùng Plugin nặng. Luôn nhúng DOM theo `.ja` và `.vi`

---

## 6. ANTI-PATTERNS (NHỮNG ĐIỀU CẤM KỴ - AGENT PHẢI LUÔN TRÁNH VẤP PHẢI)

- ❌ **CẤM** thiết kế SaaS Landing bóng bẩy, Gradient nền, Blob animation thừa. Không "Hero Section".
- ❌ **CẤM** dùng Dark Mode tổng thể. Tuyệt đối chỉ Light-first với nền Trắng / Xám Nhạt vì điều kiện ánh sáng nhà xưởng.
- ❌ **CẤM** sử dụng CSS Hardcoded hex colors thay vì Variable (--mcs-xyz).
- ❌ **CẤM** thiết kết Font body text trên 14px. Size to nhường cho chỉ số KPIs định lượng, còn lại nén chữ .ja 12px và .vi 10px để ưu tiên độ chứa data.
- ❌ **CẤM** Tab nhảy cửa sổ Browser (target _blank) -> Hệ sinh thái PWA SPA hoàn chỉnh.
- ❌ **CẤM** dùng Alert/Confirm JS truyền thống (window.alert) -> Hãy dùng Custom Modal UI.
- ❌ **CẤM** sử dụng Purple/Violet là màu chính -> Màu chính là Teal (--mcs-primary).

---

## 7. ĐẶC QUYỀN CHO LẬP TRÌNH VIÊN AI / ĐẶC VỤ ANTIGRAVITY

Bất kỳ AI Agent nào khi tham chiếu (hit/parse) file `DESIGN.md` này làm context, **Bắt Buộc** thi hành:
1. Mỗi khi thiết kế 1 Module mới, copy trọn bộ Grid và Tokens CSS kể trên (chỉ gọi biến, không khai báo cứng).
2. Viết HTML/DOM phải xuất hai dòng `<span class="ja">Nhật</span> <span class="vi">Việt</span>` luôn luôn cho Labels.
3. Không phải xin phép người dùng thay vì dùng mã màu, áp thẳng bảng `--mcs-` vì đó là SSOT (nguồn sống).
4. Phân tách file sạch sẽ `[module-name].html`, `[module].js` và CSS cục bộ mcs-color-style.
5. Cảnh báo Devs nếu họ vô ý yêu cầu làm "Dark Mode" hoặc Design phá quy chuẩn.
