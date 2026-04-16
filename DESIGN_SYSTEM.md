# 産業用ソフトウェア設計システム
## Industrial Software Design System — Kim chỉ nam phát triển phần mềm công nghiệp & hệ thống web Nhật Bản

**Version:** 2.0  
**Phạm vi:** Phần mềm quản lý sản xuất, MES/ERP, Tool Management, Warehouse Management, Quality Systems  
**Mục tiêu:** Antigravity hoạt động như một nhóm phát triển phần mềm công nghiệp Nhật Bản — chính xác, nhất quán, có phong cách riêng biệt.

---

# PHẦN I — TRIẾT LÝ & TƯ DUY THIẾT KẾ

## 1.1 Triết lý cốt lõi (Core Philosophy)

### Kaizen-first Design (改善優先設計)
Thiết kế phần mềm công nghiệp không phải là tạo ra "sản phẩm đẹp" — mà là tạo ra **công cụ làm việc hiệu quả nhất** cho người dùng chuyên nghiệp trong môi trường sản xuất.

Ba giá trị tối thượng:
1. **Seiri (整理) — Sắp xếp**: Mọi thứ trên màn hình đều có lý do tồn tại
2. **Seiton (整頓) — Ngăn nắp**: Mọi thứ ở đúng vị trí, dễ tìm trong 3 giây
3. **Shitsuke (躾) — Kỷ luật**: Mọi màn hình tuân thủ cùng một nguyên tắc

### Dense Industrial UI — Không phải SaaS Marketing
Phần mềm công nghiệp Nhật Bản (FANUC, Keyence, Mitsubishi FA, Murata Machinery) có đặc điểm:
- **Mật độ thông tin cao** — nhiều data trong ít không gian
- **Màu sắc có chức năng** — không trang trí
- **Không có "hero section"** — không có khoảng trắng lãng phí
- **Người dùng là chuyên gia** — không cần tooltip giải thích ABC

### Nguyên tắc "3 giây"
Người dùng tại xưởng sản xuất phải đọc được thông tin quan trọng nhất trong 3 giây. Nếu cần hơn 3 giây → thiết kế thất bại.

---

## 1.2 Phân loại phần mềm công nghiệp

| Loại | Ví dụ | Đặc điểm UI | Mật độ |
|---|---|---|---|
| **MES** | Sản xuất, QC, Tooling | Real-time, status colors, timeline | Cao |
| **WMS** | Kho nguyên liệu, thành phẩm | Grid, số lớn, cảnh báo ngay | Cao |
| **ERP** | Kế hoạch, mua sắm, tài chính | Form phức tạp, workflow, approval | Trung bình |
| **Dashboard / BI** | KPI, phân tích, báo cáo | Chart, trend, drill-down | Trung bình |
| **Field Tool** | Tablet tại dây chuyền | Touch-first, icon lớn, ít text | Thấp |

---

# PHẦN II — QUY TRÌNH THIẾT KẾ (7 BƯỚC)

## BƯỚC 1 — Phát hiện & Hiểu nghiệp vụ (Discovery)

### Nguyên tắc bắt buộc trước khi vẽ bất kỳ màn hình nào:

**1.1 Stakeholder Map**
Xác định đầy đủ 4 nhóm:
- **Operator** (người dùng tại xưởng): cần gì? dùng thiết bị gì? ánh sáng môi trường?
- **Supervisor** (tổ trưởng/quản đốc): cần approve gì? cần xem tổng hợp gì?
- **Engineer** (kỹ thuật/IT): cần cấu hình gì? cần log gì?
- **Manager** (quản lý): cần báo cáo gì? KPI gì?

**1.2 Job-to-be-Done (JTBD)**
Với mỗi màn hình, viết đúng 1 câu:
> "Khi [tình huống], tôi muốn [hành động], để [kết quả]."

Ví dụ: "Khi máy báo lỗi dao, tôi muốn biết ngay dao nào hỏng ở máy nào, để cử người thay trong 5 phút."

**1.3 Data Flow trước UI Flow**
Vẽ sơ đồ dữ liệu (ERD đơn giản hoặc bảng) TRƯỚC khi vẽ wireframe.
Không bao giờ thiết kế màn hình trước khi biết dữ liệu đến từ đâu.

**1.4 Critical Path**
Xác định 3–5 thao tác người dùng thực hiện nhiều nhất mỗi ngày. Đây là "happy path" phải được tối ưu nhất. Các tác vụ hiếm đặt trong menu phụ.

---

## BƯỚC 2 — Kiến trúc thông tin (Information Architecture)

### 2.1 Module Hierarchy (Phân cấp module)

```
Hệ thống
├── Module A (e.g. 金型管理 / Quản lý khuôn)
│   ├── Tab 1: Dashboard
│   ├── Tab 2: Master data
│   ├── Tab 3: Operations
│   └── Tab 4: Reports
├── Module B (e.g. プラWMS / Kho nhựa)
└── Module C (e.g. 刃物管理 / Quản lý dao)
```

Quy tắc:
- Tối đa 7 module cấp 1 trong sidebar
- Tối đa 7 tab trong 1 module
- Tối đa 3 cấp drill-down
- Mọi màn hình đều có đường về Dashboard bằng 1 click

### 2.2 Navigation Pattern cho phần mềm công nghiệp Nhật Bản

```
[Sidebar] → Module selector (icon + text)
[Top tab bar] → Sub-section trong module
[Content area] → Nội dung chính
[Right panel / Drawer] → Detail / Form (không mở tab mới)
[Modal] → Xác nhận, cảnh báo ngắn
```

Không dùng: Breadcrumb dài (>3 cấp), Mega menu, Accordion lồng > 2 cấp, Tabs lồng tabs.

### 2.3 Search Architecture
Mỗi module có search scope riêng. Global search ở header CHỈ search trong module đang active.
Search bar phải hiển thị rõ "đang search trong module nào" bằng scope pill/tag.

---

## BƯỚC 3 — Design System (Hệ thống thiết kế)

### 3.1 SPACING — Hệ thống khoảng cách Dense Industrial

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

**TUYỆT ĐỐI KHÔNG:**
- padding > 24px trong bất kỳ component UI nào
- margin-top > 16px giữa các section bình thường
- line-height > 1.6 cho body text

---

### 3.2 TYPOGRAPHY — Song ngữ JP/VI (hoặc JP/EN)

**Font stack:**
```css
--font-jp:   'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
--font-vi:   'Inter', 'Be Vietnam Pro', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
```

**Type scale — Dense Industrial:**

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
.ja {
  font-family: var(--font-jp);
  font-size: 12px; font-weight: 600;
  color: var(--text-primary);
  display: block;
}
.vi {
  font-family: var(--font-vi);
  font-size: 10px; font-weight: 400;
  color: var(--text-muted);
  display: block;
  margin-top: 1px;
}
.sep { color: var(--text-faint); font-size: 10px; }
```

---

### 3.3 COLOR SYSTEM — Màu có chức năng

**Triết lý:** Màu = trạng thái + ý nghĩa. Không dùng màu chỉ để đẹp.
Người vận hành nhìn màu → biết ngay tình trạng, không cần đọc chữ.

**Dark Mode là mặc định** cho phần mềm xưởng (giảm mỏi mắt ca dài).

**Base palette:**
```css
/* Dark mode — default (xưởng sản xuất) */
--color-bg:            #0f1117
--color-surface:       #181c24
--color-surface-2:     #1e2330
--color-surface-3:     #252b38
--color-surface-hover: #2c3345
--color-border:        rgba(255,255,255,0.08)
--color-border-strong: rgba(255,255,255,0.16)
--color-divider:       rgba(255,255,255,0.05)
--text-primary:        #e8eaf0
--text-muted:          #8892a4
--text-faint:          #4a5568
--text-inverse:        #0f1117

/* Light mode (văn phòng, báo cáo) */
--color-bg-light:       #f4f5f7
--color-surface-light:  #ffffff
--color-surface-2-light: #f9fafb
--color-border-light:   rgba(0,0,0,0.08)
--text-primary-light:   #111827
--text-muted-light:     #6b7280
```

**Accent palette — 1 màu = 1 chức năng duy nhất:**
```css
--accent-blue:    #3b82f6  /* Primary action, navigation active, link */
--accent-teal:    #00c9b1  /* Nhập kho (IN), positive, confirmed */
--accent-green:   #22c55e  /* Thành công, hoàn thành, OK, passed */
--accent-amber:   #f59e0b  /* Cảnh báo, pending, cần chú ý */
--accent-orange:  #f97316  /* Gần hết, sắp quá hạn, low stock */
--accent-red:     #ef4444  /* Lỗi, xuất kho (OUT), critical, stop */
--accent-purple:  #8b5cf6  /* Inventory, tồn kho, archived */
--accent-cyan:    #06b6d4  /* Information, help, in-progress */
--accent-gray:    #64748b  /* Disabled, inactive, neutral */
```

**Status color mapping — bắt buộc nhất quán toàn hệ thống:**

| Màu | Hex | Ý nghĩa |
|---|---|---|
| 🔵 Blue | `#3b82f6` | Active, Running, In-use |
| 🟢 Green | `#22c55e` | OK, Done, Available, Pass |
| 🟡 Amber | `#f59e0b` | Warning, Pending, Near limit |
| 🟠 Orange | `#f97316` | Low stock, Upcoming maintenance |
| 🔴 Red | `#ef4444` | Error, Stop, Critical, Fail, OUT |
| 🟣 Purple | `#8b5cf6` | Stored, Archived, On hold |
| ⚪ Gray | `#64748b` | Inactive, Disabled, Unknown |
| 🩵 Teal | `#00c9b1` | IN / Nhập kho |

**Quy tắc sử dụng màu:**
- Tối đa 3 màu accent visible trong 1 viewport
- Accent CHỈ ở: border-top card, badge, icon, số highlight, status indicator
- KHÔNG dùng accent làm background card lớn
- KHÔNG gradient button
- Hover: background tăng 1 tone (surface → surface-2)
- Active: background tint nhẹ (rgba accent 0.10–0.15)

---

### 3.4 COMPONENT LIBRARY — Specs đầy đủ

#### SIDEBAR
```
Width: 52px (collapsed) / 200px (expanded)
Background: --color-surface
Border-right: 1px solid --color-border
Transition: 200ms ease

Nav item height: 44px
Active: background rgba(blue, 0.12) + border-right 2px solid --accent-blue
Hover: background --color-surface-2
Alert dot: 6px circle --accent-red, top-right của icon
Module separator: 1px border, margin 4px 8px
```

#### HEADER / MODULE BAR (48px)
```
Layout: [module icon 28px] [title .ja .vi] | [search scope pill] [search input] | [actions right]
Background: --color-surface + border-bottom 1px --color-border
Module icon: 28x28, background rgba(accent, 0.12), border-radius 6px, icon 16px
Search: height 28px, background --color-surface-3, border-radius 6px, font 12px
Scope pill: height 18px, rgba(accent, 0.12), color accent, 10px 600, border-radius 4px
```

#### TAB BAR (36px)
```
Active tab: border-bottom 2px solid --accent-blue, color --text-primary, weight 700
Inactive: color --text-muted, hover color --text-primary
LIVE badge: 5px dot green blink 1.5s, margin-left 4px
Alert badge: pill 14px, bg --accent-red, white, 9px 700
Transition: 120ms
```

#### KPI CARD
```
Min-width: 130px | Padding: 10px 14px | Border-radius: 8px
Background: --color-surface-2
Border: 1px solid --color-border
Border-top: 3px solid [accent theo loại — xem mapping]

Layout:
  Row 1: [icon 16px] ............ [delta badge]
  Row 2: label .ja 11px 600 / .vi 10px 400 muted
  Row 3: value 22–26px 800 tabular-nums
  Row 4: unit/meta 10px muted

Delta badge: ▲+N / ▼-N, 10px 600, green/red, bg rgba 0.10, radius 3px, padding 1px 4px

KPI top-border color mapping:
  Tổng SKU / rolls → --accent-blue
  Tổng nhập / IN   → --accent-teal
  Tồn kho hiện tại → --accent-purple
  Tiêu thụ kỳ      → --accent-amber
  Tồn thấp / cảnh báo → --accent-red
  Chưa map / pending  → --accent-orange
```

#### ALERT BANNER
```
Background: rgba(accent, 0.07)
Border: 1px solid rgba(accent, 0.20) + border-left 3px solid accent
Border-radius: 6px | Padding: 8px 12px | Margin-bottom: 10px
Layout: [icon 14px] [title .ja 13px 700 / body .vi 11px muted] [X dismiss]
Variants: --warning(amber), --error(red), --info(cyan), --success(green)
```

#### TABLE
```
Header: bg --color-surface-3, height 30px, 11px JP 700 / 10px VI muted, sticky
Row: height 34px (compact) / 40px (standard), border-bottom --color-divider
Hover: bg --color-surface-3
Numeric column: font-mono, text-align right, tabular-nums
Status cell: 8px dot + label 11px, hoặc pill badge height 18px
Sort: ▲▼ 8px muted, active = --accent-blue
```

#### FORM / INPUT
```
Input:
  Height: 30px (compact) / 34px (standard)
  Background: --color-surface-3
  Border: 1px solid --color-border | Border-radius: 6px
  Focus: border --accent-blue + box-shadow 0 0 0 2px rgba(blue, 0.15)
  Font: 12px | Placeholder: --text-faint

Label:
  .ja 11px 600, display block, margin-bottom 3px
  .vi 10px 400 muted, inline sau .ja

Form group gap: 12px | Form section gap: 20px
```

#### BUTTON
```
Primary:   bg --accent-blue, white, h 28px, px 12px, 12px JP 600, radius 6px
Secondary: transparent, border 1px --color-border, color --text-primary
Ghost:     transparent, color --text-muted, hover --text-primary
Danger:    bg --accent-red * 0.9, white
Icon-only: 28x28, transparent, border 1px --color-border, radius 6px

States: hover(darken 8%) | active(darken 15% + scale 0.98) | disabled(opacity 0.4)
KHÔNG: gradient, box-shadow lớn, border-radius > 8px
```

#### CHART PANEL
```
Background: --color-surface-2 | Border: 1px solid --color-border
Border-radius: 8px | Padding: 12px

Header: title .ja 12px 700 / .vi 10px muted + period toggle right-aligned h 22px 10px
Chart area: min-height 160px (sparkline) / 220px (bar/line) / 280px (full)
Colors: từ accent palette, tối đa 5 series
Grid lines: rgba(255,255,255,0.06) | Axis labels: 10px mono muted
Tooltip: bg --color-surface, border 1px --color-border, radius 6px, padding 8px, 11px
```

#### STATUS BADGE
```
Pill: padding 2px 7px, border-radius 4px, 10px 600 uppercase
Background: rgba(accent, 0.12) | Color: accent | Border: 1px solid rgba(accent, 0.25)

CSS classes:
.status-running  → cyan   (đang chạy)
.status-ok       → green  (bình thường)
.status-warning  → amber  (cảnh báo)
.status-critical → red    (nghiêm trọng)
.status-idle     → gray   (chờ)
.status-in       → teal   (nhập kho)
.status-out      → red    (xuất kho)
.status-pending  → amber  (chờ xử lý)
.status-done     → green  (hoàn thành)
```

#### MODAL / DRAWER
```
Modal:
  Max-width: 480px | Background: --color-surface
  Border: 1px solid --color-border-strong | Border-radius: 10px
  Header: 12px 16px, border-bottom, .ja 14px 700 + close X
  Body: 16px padding | Footer: 12px 16px, border-top, right buttons, gap 8px
  Overlay: rgba(0,0,0,0.6) backdrop-blur 4px

Drawer (detail panel):
  Width: 360–480px | Background: --color-surface
  Border-left: 1px solid --color-border
  Animation: translateX(100%→0) 180ms ease
```

---

## BƯỚC 4 — Layout & Grid System

### 4.1 Page Layout chuẩn

```
┌─────────────────────────────────────────────────┐
│ SIDEBAR 52px │ MODULE HEADER 48px               │
│              ├──────────────────────────────────┤
│              │ TAB BAR 36px                      │
│              ├──────────────────────────────────┤
│              │ ALERT BANNER (nếu có) ~36px        │
│              ├──────────────────────────────────┤
│              │ CONTENT AREA                      │
│              │ padding: 12px 16px                │
│              │                                   │
│              │  [KPI GRID]                       │
│              │  [CHART GRID hoặc TABLE]          │
│              │  [DETAIL SECTIONS]                │
└─────────────────────────────────────────────────┘
```

### 4.2 KPI Grid
```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}
```

### 4.3 Chart Grid (responsive)
```css
.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
@media (max-width: 1200px) { .chart-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px)  { .chart-grid { grid-template-columns: 1fr; } }
```

### 4.4 Content padding bắt buộc
```css
.mod-content {
  padding: 12px 16px; /* KHÔNG BAO GIỜ > 20px 24px */
  overflow-y: auto;
  height: calc(100vh - 48px - 36px);
}
```

---

## BƯỚC 5 — Interaction & Motion

### 5.1 Duration Tokens — Dense UI phải nhanh
```css
--duration-instant: 80ms   /* Hover, focus ring */
--duration-fast:    120ms  /* Button press, badge appear, tab switch */
--duration-normal:  180ms  /* Drawer open, modal open */
--duration-slow:    300ms  /* Page transition — hiếm dùng */
--easing: cubic-bezier(0.16, 1, 0.3, 1)
```

KHÔNG dùng animation > 300ms trong UI công nghiệp.

### 5.2 State Design — Bắt buộc thiết kế đủ 5 states mọi view

| State | Cách xử lý |
|---|---|
| **Loading** | Skeleton shimmer (KHÔNG spinner toàn trang) |
| **Empty** | Icon + message JP/VI + action button (KHÔNG blank) |
| **Error** | Inline alert + message cụ thể + action recover |
| **Success** | Inline green feedback, 1.5s rồi tự ẩn |
| **Partial** | Hiện data có được + skeleton cho phần đang load |

### 5.3 Real-time Update Animation
```css
.kpi-value.updating {
  animation: valueFlash 400ms ease;
}
@keyframes valueFlash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; color: var(--accent-teal); }
}
```

---

## BƯỚC 6 — Accessibility & Performance

### 6.1 Accessibility — Non-negotiable
- Focus ring: 2px solid --accent-blue, offset 2px
- Touch target: tối thiểu 36x36px (compact) / 44x44px (field device)
- Không bao giờ chỉ dùng màu để báo thông tin → luôn kèm icon/text
- `aria-label` cho icon-only buttons
- `aria-live="polite"` cho real-time regions
- `@media (prefers-reduced-motion: reduce)` → tắt animation

### 6.2 Performance Rules
```
Table > 200 rows        → Virtual scroll
Chart                   → Lazy init khi tab active, destroy khi inactive
Image                   → loading="lazy" + width/height + WebP/AVIF
Font                    → preconnect + display:swap + chỉ load weights dùng
Off-screen section      → content-visibility: auto
Heavy module            → Dynamic import()
```

---

## BƯỚC 7 — Quality Checklist & Ship

### Spacing
- [ ] Không component nào có padding > 24px
- [ ] Mọi gap đều là bội số của 4px
- [ ] Content area padding: 12px 16px

### Typography
- [ ] Mọi label có cả .ja và .vi
- [ ] Font size nhỏ nhất 10px (label.vi)
- [ ] KPI value dùng tabular-nums
- [ ] Không body text > 14px

### Color
- [ ] Mỗi KPI card có màu top-border riêng biệt (đúng mapping)
- [ ] Status colors nhất quán toàn hệ thống
- [ ] Tối đa 3 accent colors trong 1 viewport
- [ ] Không gradient button

### Component
- [ ] Alert banner: border-left + bg tint nhẹ (không fill mạnh)
- [ ] Tab active: border-bottom line (không fill tab background)
- [ ] Table rows có hover state
- [ ] Modal có backdrop + dismiss X + footer buttons

### States
- [ ] Mọi data view có loading skeleton
- [ ] Mọi empty state có message + action
- [ ] Error state có message cụ thể + action recover

### Accessibility
- [ ] Icon-only buttons có aria-label
- [ ] Live regions có aria-live
- [ ] Focus ring visible

---

# PHẦN III — KIẾN TRÚC KỸ THUẬT

## 3.1 Stack lựa chọn

| Hạng mục | Ưu tiên | Lý do |
|---|---|---|
| **Frontend** | Vanilla JS + Web Components | Không phụ thuộc framework, bền dài hạn |
| **Alternative FE** | Vue 3 (Composition API) | Nhẹ, tốt cho form phức tạp |
| **Chart** | Chart.js 4 | Nhẹ, dễ customize |
| **Chart nâng cao** | Apache ECharts | Tốt cho time-series, heatmap, gauge |
| **Icon** | Lucide Icons (CDN) | Nhất quán, SVG inline |
| **Table** | TanStack Table | Virtual scroll, sort, filter |
| **Date/Time** | Day.js | Nhẹ, hỗ trợ JP locale |
| **Realtime** | SSE / WebSocket | SSE cho dashboard, WS cho 2-way |

## 3.2 File structure chuẩn
```
/project
├── index.html                  ← Entry point + module router
├── modules/
│   ├── mold/                   ← Module khuôn
│   │   ├── dashboard.js
│   │   ├── master.js
│   │   └── template.html
│   ├── wms/                    ← Module kho nhựa
│   └── cutter/                 ← Module dao cắt
├── shared/
│   ├── design-system.css       ← CSS tokens + base components
│   ├── components.js           ← Web Components chung
│   ├── api.js                  ← API layer
│   └── i18n.js                 ← Language keys JP/VI
├── assets/icons/
└── DESIGN_SYSTEM.md            ← File này (rules cho Antigravity)
```

## 3.3 i18n Pattern (Đa ngôn ngữ JP/VI)
```javascript
const lang = {
  ja: {
    'kpi.total_rolls':   '総ロール数',
    'kpi.total_in':      '総入庫量(m)',
    'action.reload':     'リロード',
    'action.export':     'エクスポート',
    'status.low_stock':  '在庫低下',
  },
  vi: {
    'kpi.total_rolls':   'Tổng cuộn',
    'kpi.total_in':      'Tổng m nhập',
    'action.reload':     'Tải lại',
    'action.export':     'Xuất file',
    'status.low_stock':  'Tồn thấp',
  }
};
// Usage: t('kpi.total_rolls', 'ja') + ' / ' + t('kpi.total_rolls', 'vi')
```

---

# PHẦN IV — ANTI-PATTERNS (TUYỆT ĐỐI KHÔNG)

## Thiết kế
- ❌ **Gradient button** → Luôn dùng solid color
- ❌ **Icon trong vòng tròn màu** → Đặt icon thẳng không bọc
- ❌ **Border-left màu accent trên card** → Dùng border-top hoặc surface elevation
- ❌ **Center-align mọi thứ** → Left-align mặc định, center chỉ cho modal title
- ❌ **Mọi card cùng màu accent** → Mỗi loại card = 1 màu riêng
- ❌ **Floating blobs/decoration không mang thông tin**
- ❌ **Wavy SVG dividers** → Dùng border 1px thẳng
- ❌ **Padding > 24px trong component** → Dense UI
- ❌ **Hero section trong dashboard** → Dashboard là công cụ
- ❌ **Tiếng Việt cùng size tiếng Nhật** → .vi luôn nhỏ hơn và muted
- ❌ **Màu accent làm background card lớn**

## Kỹ thuật
- ❌ **localStorage/sessionStorage** trong sandbox iframe
- ❌ **Hardcode color hex** → Luôn dùng CSS variable
- ❌ **Hardcode text** → Luôn dùng i18n key
- ❌ **Table > 500 rows không virtual scroll**
- ❌ **Chart.js destroy/re-init mỗi lần update** → Dùng chart.data.update()
- ❌ **Mở tab mới trong cùng hệ thống** → Dùng drawer/panel

## UX
- ❌ **Chỉ dùng màu để báo lỗi** → Luôn kèm icon + text
- ❌ **Modal confirm cho mọi action** → Chỉ cho action nguy hiểm/không hoàn tác
- ❌ **Spinner toàn trang** → Dùng skeleton loader
- ❌ **Blank empty state** → Luôn có icon + message + action
- ❌ **Breadcrumb > 3 cấp**
- ❌ **Tabs lồng tabs**

---

# PHẦN V — INSTRUCTIONS CHO ANTIGRAVITY

## Khi nhận request thiết kế hoặc build UI mới

**Bước 1 — Clarify (nếu chưa đủ thông tin):**
Hỏi đúng 3 điểm:
1. Module này thuộc hệ thống nào? Module nào đã tồn tại?
2. Người dùng chính là ai? (operator / supervisor / manager)
3. Thao tác quan trọng nhất mỗi ngày là gì?

**Bước 2 — Áp dụng Design System này:**
- Luôn dùng spacing system 4px base — KHÔNG tự tăng padding
- Luôn dùng accent palette đúng chức năng (xem mapping 3.3)
- Luôn viết song ngữ .ja / .vi cho mọi label
- Luôn thiết kế đủ 5 states: loading, empty, error, success, partial

**Bước 3 — Build theo thứ tự:**
tokens → sidebar → header → tabs → kpi grid → charts/table → states
KHÔNG build theo visual order từ trên xuống

**Bước 4 — Validate trước khi output:**
Chạy qua Quality Checklist (Phần II / Bước 7) trước khi trả về code

## Khi nhận design feedback

| Feedback | Hành động |
|---|---|
| "Loãng / nhiều khoảng trống" | Giảm padding về ≤ 12px, tăng thông tin density |
| "Không đồng bộ giữa màn hình" | Kiểm tra naming CSS classes và tokens |
| "Màu lộn xộn / quá nhiều màu" | Đối chiếu accent palette, mỗi màu 1 chức năng |
| "Text khó đọc" | Tăng contrast, kiểm tra .vi ≥ 10px |
| "Trông như AI / generic" | Kiểm tra anti-pattern list, bỏ gradient/icon circles |
| "Tiếng Nhật / Việt lộn xộn" | Kiểm tra .ja và .vi classes, size hierarchy |

---

*Document này là nguồn sự thật duy nhất (Single Source of Truth — SSOT) cho mọi quyết định thiết kế.*
*Commit file này vào repo gốc để Antigravity luôn có thể reference khi context reset.*

*Last updated: 2026-04-11*
