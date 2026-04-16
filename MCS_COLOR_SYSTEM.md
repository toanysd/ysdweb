---
name: mcs-color-system
description: Quy chuẩn màu sắc (Light Industrial Teal) cho toàn bộ hệ thống YSD. Áp dụng bắt buộc khi thiết kế CSS, vẽ Chart hoặc phân loại trạng thái. KHÔNG dùng Dark Mode.
---

# MCS Color System — Quy Chuẩn Màu Sắc Hệ Thống YSD

> **Phiên bản:** 1.0 | **Ngày:** 2026-04-11  
> **Áp dụng cho:** Tất cả module trong hệ thống YSD (MoldCutterSearch, Plastic Manager, và các module tương lai)  
> **Phương châm:** Light-first. Không bắt buộc Dark Mode. Màu sắc = thông tin.

***

## 1. Đánh Giá Theme Màu Hiện Tại

### 1.1 Nhận Diện Tone Màu

Sau khi phân tích file mcs-color-design-v8.4.0.css, styles-v8.4.1.css và các screenshot hệ thống hiện tại, tone màu của hệ thống YSD được xác định là:

**→ Light Industrial Teal — Màu nền sáng, trọng tâm xanh ngọc lam (Teal), bảng dữ liệu rõ ràng, trạng thái màu có chức năng.**

| Thuộc tính | Nhận xét |
|---|---|
| Nền chủ đạo | Trắng tinh / xám rất nhạt #f5f6f8 → sáng, không chói |
| Màu nhấn chính | Teal #0d7a7a / #0a6e6e — xanh ngọc đậm vừa, chuyên nghiệp |
| Màu text | Đen xám #1a1a2e / #2d3436 — đọc tốt trên nền sáng |
| Bảng / dữ liệu | Xen kẽ dòng trắng / xám rất nhạt #f8f9fa |
| Trạng thái OK | Xanh lá #27ae60 |
| Trạng thái Cảnh báo | Vàng cam #f39c12 |
| Trạng thái Lỗi | Đỏ #e74c3c |
| Trạng thái Chờ | Xám #95a5a6 |
| Accent phụ | Tím nhạt #8e44ad (dùng cho nhóm đặc biệt) |

***

## 2. Quyết Định Về Dark Mode

### 2.1 Không bắt buộc Dark Mode

Hệ thống YSD được thiết kế cho môi trường nhà máy, văn phòng sản xuất với màn hình thường dùng ban ngày dưới ánh đèn công xưởng. Light Mode là chế độ mặc định và **duy nhất bắt buộc**.

**Lý do:**
- Người dùng là kỹ thuật viên, quản lý kho, kế hoạch sản xuất — nhìn màn hình trong môi trường sáng
- Dữ liệu dày đặc (bảng, số, trạng thái) dễ đọc hơn trên nền trắng
- Dark mode trên bảng nhiều dữ liệu gây mờ ranh giới cột/hàng
- Không có yêu cầu thực tế từ người dùng nhà máy cần dark mode

**Quy tắc:** Antigravity **không được tự ý thêm dark mode toggle** vào bất kỳ module nào trừ khi có yêu cầu tường minh từ chủ hệ thống.

***

## 3. Bảng Màu Chuẩn — MCS Palette v1.0

### 3.1 CSS Variables Chính Thức

`css
/* ══════════════════════════════════════════════════
   MCS COLOR SYSTEM v1.0 — Light Industrial Teal
   YSD Manufacturing System
   ══════════════════════════════════════════════════ */

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

  /* Thành công / OK / Bình thường */
  --mcs-success:         #27ae60;
  --mcs-success-hover:   #219150;
  --mcs-success-light:   #eafaf1;
  --mcs-success-text:    #1d6e3c;

  /* Cảnh báo / Chờ xử lý / Gần đến hạn */
  --mcs-warning:         #f39c12;
  --mcs-warning-hover:   #d68910;
  --mcs-warning-light:   #fef9e7;
  --mcs-warning-text:    #7d5a0a;

  /* Lỗi / Quá hạn / Từ chối */
  --mcs-error:           #e74c3c;
  --mcs-error-hover:     #c0392b;
  --mcs-error-light:     #fdf2f1;
  --mcs-error-text:      #922b21;

  /* Thông tin / Đang xử lý / Ghi chú */
  --mcs-info:            #2980b9;
  --mcs-info-hover:      #1f6391;
  --mcs-info-light:      #eaf3fb;
  --mcs-info-text:       #1a5276;

  /* Không hoạt động / Đã hủy / Lưu trữ */
  --mcs-neutral:         #95a5a6;
  --mcs-neutral-hover:   #7f8c8d;
  --mcs-neutral-light:   #f2f3f4;
  --mcs-neutral-text:    #515a5a;

  /* ── Màu nhóm phân loại (cho chart, tag, badge) ── */
  --mcs-group-1:         #0d7a7a;   /* Teal — nhóm chính */
  --mcs-group-2:         #8e44ad;   /* Tím — nhóm phụ */
  --mcs-group-3:         #2980b9;   /* Xanh dương */
  --mcs-group-4:         #d35400;   /* Cam đất */
  --mcs-group-5:         #16a085;   /* Xanh lá đậm */
  --mcs-group-6:         #7f8c8d;   /* Xám trung */

  /* ── Shadow ────────────────────────────────────── */
  --mcs-shadow-sm:   0 1px 3px rgba(0,0,0,0.08);
  --mcs-shadow-md:   0 4px 12px rgba(0,0,0,0.10);
  --mcs-shadow-lg:   0 8px 24px rgba(0,0,0,0.12);
  --mcs-shadow-card: 0 2px 8px rgba(13,122,122,0.08);  /* Teal-tinted card shadow */

  /* ── Border Radius ─────────────────────────────── */
  --mcs-radius-sm:   4px;
  --mcs-radius-md:   8px;
  --mcs-radius-lg:   12px;
  --mcs-radius-full: 9999px;

  /* ── Transition ─────────────────────────────────── */
  --mcs-transition: 150ms ease;
}
`

***

## 4. Quy Tắc Sử Dụng Màu

### 4.1 Nguyên Tắc Cốt Lõi

**Màu sắc = thông tin, không phải trang trí.**

Mỗi màu trong hệ thống có một ý nghĩa duy nhất và nhất quán. Người dùng nhà máy nhìn màu đỏ → biết ngay là lỗi/cảnh báo. Không được dùng màu đỏ cho mục đích thẩm mỹ.

`
✅ ĐÚNG: Dùng --mcs-error cho trạng thái hỏng, quá hạn, từ chối
❌ SAI:  Dùng --mcs-error để làm nổi bật một tiêu đề section
`

### 4.2 Bảng Ngữ Nghĩa Màu Trạng Thái

| Màu | Biến | Dùng cho | Ví dụ cụ thể |
|---|---|---|---|
| 🟢 Xanh lá | --mcs-success | Bình thường, OK, Đang dùng | Khuôn đang hoạt động, dao còn hạn |
| 🟡 Vàng cam | --mcs-warning | Sắp đến hạn, Cần chú ý | Còn < 20% tuổi thọ, cần bảo trì |
| 🔴 Đỏ | --mcs-error | Hỏng, Quá hạn, Từ chối, Lỗi | Khuôn hỏng, dao hết tuổi thọ |
| 🔵 Xanh dương | --mcs-info | Đang xử lý, Thông tin, Chờ | Đang bảo trì, đang chờ phê duyệt |
| ⚫ Xám | --mcs-neutral | Không hoạt động, Đã hủy | Khuôn lưu kho, đã xuất bỏ |
| 🩵 Teal | --mcs-primary | Hành động chính, Link, Active | Nút lưu, tab đang chọn |

### 4.3 Quy Tắc Màu Nền Bảng (Table)

`css
/* Dòng thường */
tr:nth-child(even) td { background: var(--mcs-surface-2); }

/* Dòng hover */
tr:hover td { background: var(--mcs-surface-hover); }

/* Dòng được chọn (selected) */
tr.selected td { background: var(--mcs-primary-light); }

/* Header bảng */
thead th { background: var(--mcs-surface-3); color: var(--mcs-text); }
`

### 4.4 Quy Tắc Badge / Tag Trạng Thái

Badge phải dùng cặp _light (nền) + _text (chữ) để đảm bảo tương phản:

`css
/* Badge mẫu */
.badge-success {
  background: var(--mcs-success-light);
  color: var(--mcs-success-text);
  border: 1px solid rgba(39,174,96,0.25);
}

.badge-warning {
  background: var(--mcs-warning-light);
  color: var(--mcs-warning-text);
  border: 1px solid rgba(243,156,18,0.25);
}

.badge-error {
  background: var(--mcs-error-light);
  color: var(--mcs-error-text);
  border: 1px solid rgba(231,76,60,0.25);
}
`

### 4.5 Anti-Pattern Màu — TUYỆT ĐỐI KHÔNG

`
❌ Gradient button: background: linear-gradient(#0d7a7a, #27ae60)
   → Dùng màu solid --mcs-primary

❌ Viền màu bên trái card: border-left: 4px solid #e74c3c
   → Dùng badge trạng thái bên trong card

❌ Nhiều màu nhấn trên cùng 1 màn hình
   → Tối đa 1 màu nhấn + màu trạng thái, không thêm màu trang trí

❌ Text màu trên nền màu không kiểm tra tương phản
   → Luôn dùng cặp _light/_text đã được kiểm tra

❌ Màu purple/violet/indigo cho giao diện chính
   → --mcs-group-2 (tím) chỉ dùng cho biểu đồ/nhóm phân loại

❌ Nền tối (dark) cho bất kỳ phần nào của giao diện chính
   → Hệ thống là Light-only
`

***

## 5. Quy Tắc Typography Đi Kèm Màu

Màu sắc phải đi cùng độ đậm nhạt đúng để tạo phân cấp thông tin:

| Mức độ | Font weight | Màu text | Dùng cho |
|---|---|---|---|
| Tiêu đề màn hình | 600-700 | --mcs-text | Tên module, tên màn hình |
| Tiêu đề bảng | 600 | --mcs-text | Header cột |
| Dữ liệu chính | 400-500 | --mcs-text | Giá trị trong bảng |
| Dữ liệu phụ | 400 | --mcs-text-secondary | Mã phụ, ghi chú |
| Placeholder | 400 | --mcs-text-muted | Input placeholder |
| Số quan trọng | 700 | --mcs-primary hoặc màu trạng thái | Số tồn kho, % tuổi thọ |

***

## 6. Ứng Dụng Thực Tế Theo Module

### 6.1 MoldCutterSearch (Khuôn / Dao cắt)

`
Khuôn đang chạy sản xuất   → badge success (xanh lá)
Khuôn sắp bảo trì          → badge warning (vàng)
Khuôn đang bảo trì         → badge info (xanh dương)
Khuôn hỏng / loại bỏ       → badge error (đỏ)
Khuôn lưu kho              → badge neutral (xám)
Dao còn > 50% tuổi thọ     → text success-text
Dao còn 20-50%             → text warning-text
Dao còn < 20%              → text error-text (đậm)
`

### 6.2 Plastic Manager (Kho Nhựa)

`
Cun nhựa đang dùng         → badge info
Cun nhựa còn kho            → badge success
Cun nhựa hết / xuất hết     → badge neutral
Tồn kho < min              → text error + icon cảnh báo
Tồn kho cần nhập thêm      → text warning
Mapping chưa xác nhận       → badge warning
Mapping đã xác nhận         → badge success
`

### 6.3 Dashboard / KPI

`
KPI đạt mục tiêu           → số màu --mcs-success
KPI sắp vi phạm            → số màu --mcs-warning
KPI vi phạm / vượt ngưỡng  → số màu --mcs-error
KPI bình thường / thông tin → số màu --mcs-primary
`

***

## 7. Quy Tắc Cho Antigravity

### 7.1 Khi viết CSS mới

`
1. Luôn dùng biến CSS --mcs-* thay vì hardcode hex
2. Không tạo thêm biến màu mới nếu không có trong bảng
3. Khi cần màu chưa có trong bảng → hỏi chủ hệ thống
4. Không dùng opacity để tạo màu nhạt → dùng biến _light đã định nghĩa
`

### 7.2 Khi tạo component mới

`
1. Xác định trạng thái nào cần hiển thị (ok/warning/error/info/neutral)
2. Map trạng thái với biến màu trong bảng ngữ nghĩa (mục 4.2)
3. Dùng cặp _light + _text cho text trên nền màu
4. Không thêm màu nền tối hoặc dark mode
`

### 7.3 Checklist màu trước khi commit

`
□ Tất cả màu dùng biến --mcs-* 
□ Không có hex code hardcoded ngoài file biến
□ Badge/tag dùng đúng cặp _light + _text
□ Không có viền màu bên trái card
□ Không có gradient button
□ Không có màu trang trí không có nghĩa
□ Bảng dùng đúng nền xen kẽ và hover
`

***

## 8. Màu Sắc Trong Biểu Đồ (Chart)

Khi vẽ chart dùng Chart.js hoặc tương tự, sử dụng bảng màu nhóm theo thứ tự:

`javascript
const MCS_CHART_COLORS = [
  '#0d7a7a',  // group-1: Teal
  '#8e44ad',  // group-2: Tím
  '#2980b9',  // group-3: Xanh dương
  '#d35400',  // group-4: Cam đất
  '#16a085',  // group-5: Xanh lá đậm
  '#7f8c8d',  // group-6: Xám
  // Nếu cần thêm, lấy từ các màu trạng thái:
  '#27ae60',  // success
  '#f39c12',  // warning
  '#e74c3c',  // error
];

// Màu nền chart (với alpha)
const MCS_CHART_BG = MCS_CHART_COLORS.map(c => c + '33'); // 20% opacity
`

***

## 9. Phiên Bản & Lịch Sử

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0 | 2026-04-11 | Khởi tạo từ phân tích mcs-color-design-v8.4.0.css + styles-v8.4.1.css |
