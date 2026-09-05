# Kế hoạch tách nhỏ `app/reception/dispatch/page.tsx`

**Ngày lập:** 05/09/2026
**Nhánh:** `feat/bit-lo-hong-phase1`
**Trạng thái:** Chờ duyệt.
**Tiền lệ:** KTV Dashboard đã tách xong ở `1b1d70f` + `f820f3b` (2549 → 184 dòng, nạp trang 7,16s → 0,44s).

---

## 1. Vì sao phải tách

File **207KB / 3983 dòng**, và toàn bộ nằm trong **một hàm duy nhất** `DispatchBoardPage`.

Hệ quả đo được:
- Next dev biên dịch lại 7–20 giây mỗi lần sửa, vượt timeout 15s của `apiClient` → UI báo *"Kết nối bị quá hạn"*
- Sửa một nút nhỏ cũng phải nạp lại cả file trong đầu
- Chạm vào file là đụng mọi thứ — rủi ro hồi quy cao trên màn quầy dùng hằng ngày

Khác với KTV Dashboard (mỗi màn đã là một `function` riêng, tách rất gọn), file này **không có ranh giới sẵn**. Phải bóc từng khối JSX ra khỏi closure của component cha.

---

## 2. Cấu trúc hiện tại

```
dòng    1 – 1944   state + handler   (47 hook, 13 handler lớn)
dòng 1945 – 3983   một khối JSX return duy nhất
```

Chi tiết khối JSX:

| Khối | Dòng | Số dòng | Độ khó tách |
|---|---|---|---|
| Header | 1945–2126 | 182 | Trung bình |
| LEFT: Order Panel | 2127–2330 | 204 | Khó |
| CENTER: Assignment Panel | 2331–2966 | **636** | Khó nhất |
| Add Svc Modal | 2967–3070 | 104 | Dễ |
| Dispatch Confirmation Modal | 3071–3213 | 143 | Dễ |
| Context Menu Cancellation | 3214–3370 | 157 | Dễ |
| QR Journey Modal | 3371–3429 | 59 | Dễ |
| Split Service Modal | 3430–3597 | 168 | Dễ |
| Modal Xem Ảnh | 3598–3702 | 105 | Dễ |
| Modal Tạm Dừng / Đổi KTV | 3703–3728 | 26 | Dễ (đã là component ngoài) |
| Custom Confirm Modal | 3729–3767 | 39 | Dễ |
| Custom Start Service Modal | 3768–3838 | 71 | Dễ |
| Invoice Language Modal | 3839–3982 | 144 | Dễ |

Thư mục `_components/` đã có sẵn 13 file (KanbanBoard, QuickDispatchTable, AddOrderModal…) — nghĩa là dự án đã theo hướng này, chỉ là làm dở.

---

## 3. Nguyên tắc

1. **Không đổi hành vi.** Chỉ di chuyển code, không sửa logic. Mọi khác biệt nghiệp vụ phải là một commit riêng.
2. **Tách từ dễ đến khó**, commit sau mỗi bước, `tsc` sạch mới đi tiếp.
3. **Modal trước, panel sau.** Modal chỉ đọc vài state và gọi vài handler → truyền qua props là xong. Panel bám sâu vào closure.
4. **Kiểm chứng trên trình duyệt sau mỗi đợt**, không chỉ dựa vào `tsc` — đây là màn quầy đang chạy thật.
5. Dùng lại công cụ cắt theo tên hàm + cân bằng ngoặc đã viết cho KTV Dashboard (bỏ qua ngoặc trong chuỗi/comment). **Không cắt theo số dòng** — lần đầu làm vậy ở dashboard đã hỏng file.

---

## 4. Các đợt

### Đợt 1 — 9 modal (≈1016 dòng) · rủi ro thấp

Bóc từng modal thành component nhận props rõ ràng, đặt trong `_components/`:

| File mới | Từ khối |
|---|---|
| `AddServiceModal.tsx` | Add Svc Modal |
| `DispatchConfirmModal.tsx` | Dispatch Confirmation Modal |
| `OrderContextMenu.tsx` | Context Menu Cancellation |
| `QrJourneyModal.tsx` | QR Journey Modal |
| `SplitServiceModal.tsx` | Split Service Modal |
| `PhotoViewerModal.tsx` | Modal Xem Ảnh |
| `ConfirmModal.tsx` | Custom Confirm Modal |
| `StartServiceModal.tsx` | Custom Start Service Modal |
| `InvoiceLanguageModal.tsx` | Invoice Language Modal |

Cách làm cho mỗi modal: liệt kê state/handler nó dùng → thành props → thay khối trong `page.tsx` bằng `<XModal ... />`.

→ **page.tsx còn ≈2960 dòng.** Đây là đợt đáng giá nhất so với công sức bỏ ra.

### Đợt 2 — Header (182 dòng) · rủi ro trung bình

Tách `DispatchHeader.tsx`: chọn ngày, bộ đếm, nút chuyển chế độ mobile. Chủ yếu đọc state, ít ghi.

→ **page.tsx còn ≈2780 dòng.**

### Đợt 3 — Hai panel (840 dòng) · rủi ro cao

- `OrderPanel.tsx` (204 dòng) — danh sách đơn chờ
- `AssignmentPanel.tsx` (636 dòng) — khối gán KTV, dày state nhất

Bước này cần khoanh vùng state trước: state nào chỉ panel dùng thì **đẩy hẳn vào panel**, state nào chia sẻ thì giữ ở cha và truyền xuống. Làm ẩu ở đây sẽ đẻ ra prop drilling 20 tham số.

→ **page.tsx còn ≈1940 dòng.**

### Đợt 4 — Handler (≈1000 dòng) · rủi ro cao

13 handler lớn (`handleDispatch` 305 dòng, `handleSaveDraft` 162 dòng, `handleUpdateStatus` 152 dòng…) chuyển vào `useDispatchBoard.logic.ts` đang có sẵn, hoặc tách `useDispatchActions.ts` riêng.

→ **page.tsx còn ≈900 dòng** — chấp nhận được cho một màn phức tạp cỡ này.

---

## 5. Rủi ro

- **Đây là màn quầy dùng hằng ngày.** Hỏng là chặn vận hành ngay. Cần kiểm thử thủ công luồng điều phối sau mỗi đợt, không chỉ `tsc`.
- **File đang có thay đổi chưa commit** từ phiên song song (`M app/reception/dispatch/page.tsx` trong git status đầu phiên). Phải commit hoặc stash sạch trước khi bắt đầu, nếu không sẽ lẫn.
- **Dev server hay hỏng** khi có nhiều tiến trình cùng chạy. Chỉ để một `npm run dev`.
- `handleDispatch` (305 dòng) có nhiều nhánh `skipValidation` / `specificSvcIds` / `precomputedSplitPlan` — đụng vào phải rất cẩn thận, để cuối cùng.

---

## 6. Đề xuất

Làm **Đợt 1** trước rồi dừng lại đánh giá. Nó gỡ được 1/4 số dòng với rủi ro thấp nhất, và cho thấy cách chia props có ổn không trước khi động vào phần khó.

Đợt 3 và 4 nên tách thành phiên làm việc riêng, có thời gian kiểm thử luồng điều phối đầy đủ.
