# Tính năng Thanh tra Tuyến tàu (Metro Line Inspector Simulation)

Mô phỏng nhân viên thanh tra di chuyển thực tế trên mạng lưới đường sắt đô thị. Người chơi tự do chỉ định 1 ga xuất phát (hoàn toàn miễn phí), thanh tra sẽ đón tàu và tuần tra qua các tuyến. Khi hoàn thành tuần tra tối thiểu 5 ga mà không để xảy ra quá tải trong thời gian giới hạn, người chơi nhận ngay phần thưởng $2,000.

### User Review & Critical Decisions

> [!IMPORTANT]
> Tóm tắt các quyết định đã xác nhận từ khảo sát:
> - **Cơ chế tuần tra**: Thanh tra xuất phát từ 1 ga do người chơi chọn (miễn phí), sau đó đón tàu và tuần tra tự do qua các ga kết nối cho đến khi đạt tối thiểu 5 ga khác nhau.
> - **Hiển thị trực quan**: Biểu tượng thanh tra đặc biệt (huy hiệu cảnh sát/thanh tra vàng ánh kim) hiển thị nổi bật trên ga khi đợi tàu, và di chuyển mượt mà trên nóc đoàn tàu khi đang tuần tra trên tuyến.
> - **Điều kiện thử thách & thất bại**:
>   1. Có giới hạn thời gian (90 giây) cho mỗi đợt tuần tra và thời gian hồi chiêu (60 giây) giữa các lần gọi thanh tra.
>   2. Nhiệm vụ sẽ thất bại ngay lập tức nếu bất kỳ ga nào trong lộ trình thanh tra bị quá tải (overcrowded) trước khi hoàn tất.
> - **Phần thưởng**: Nhận ngay **$2,000** tiền thưởng ngân sách khi hoàn thành kiểm tra tối thiểu 5 ga.

---

### 1. Tổng quan & Trải nghiệm Người chơi (Overview & Core Concept)

- **Mục tiêu**: Bổ sung một hoạt động tương tác chiến thuật thời gian thực, kích thích người chơi thiết kế mạng lưới đường sắt kết nối liền mạch và giám sát áp lực tải của từng ga.
- **Quy trình trải nghiệm**:
  1. Người chơi bấm nút **"Phái Thanh tra"** trên thanh công cụ hoặc HUD bản đồ (khi không trong thời gian hồi chiêu).
  2. Bản đồ chuyển sang chế độ chọn ga xuất phát (nhấp vào bất kỳ ga nào hiện có trên bản đồ, hoàn toàn miễn phí).
  3. Thanh tra xuất hiện tại ga đã chọn với huy hiệu thanh tra đặc biệt.
  4. Khi có tàu ghé ga này, thanh tra sẽ tự động lên tàu. Biểu tượng thanh tra di chuyển cùng đoàn tàu trên ray ray.
  5. Mỗi khi tàu dừng trả/đón khách ở một ga mới chưa được thanh tra, ga đó được đánh dấu "Đã kiểm tra", tăng bộ đếm ga (1/5, 2/5, 3/5, 4/5, 5/5) kèm hiệu ứng chữ bay (+1 Ga thanh tra) và âm thanh tích tắc.
  6. Nếu thanh tra tích luỹ đủ 5 ga hợp lệ trước khi hết 90s và không có ga nào bị vỡ trận quá tải, người chơi nhận thưởng **+$2,000** tiền mặt, hiệu ứng pháo hoa tài chính và âm thanh chúc mừng.
  7. Nếu hết giờ hoặc xảy ra quá tải, thanh tra rời đi với thông báo thất bại. Hệ thống bước vào thời gian hồi chiêu (60s).

---

### 2. Thiết kế Giao diện & Trực quan (UX & Visual Design)

- **Nút điều khiển & Trạng thái HUD**:
  - Tích hợp một nút bấm/thẻ điều khiển thanh lịch trên giao diện:
    - *Trạng thái Sẵn sàng*: Nút "Phái Thanh tra" kèm icon Huy hiệu (Shield / Badge), hiển thị phần thưởng tiềm năng `+$2,000`.
    - *Trạng thái Chọn ga*: Thanh thông báo hướng dẫn: "Chạm hoặc click vào một nhà ga bất kỳ để bắt đầu thanh tra".
    - *Trạng thái Đang thanh tra*: Thanh tiến độ Inspector HUD hiển thị:
      - Tên ga đang dừng hoặc đoàn tàu đang đi (`Tàu Tuyến Đỏ ➔ Ga Hoàn Kiếm`).
      - Tiến độ: `3/5 ga`.
      - Đồng hồ đếm ngược: `01:15`.
      - Cảnh báo: `Tránh để quá tải ga!`.
      - Nút "Huỷ thanh tra" nếu người chơi muốn ngừng sớm.
    - *Trạng thái Hồi chiêu*: Đếm ngược thời gian hồi chiêu (ví dụ: `Hồi chiêu: 42s`) với vòng tròn tiến độ.

- **Hiển thị trên Canvas (Canvas Rendering)**:
  - **Khi ở sân ga**: Vẽ huy hiệu hình khiên thanh tra vàng kim `#F59E0B` viền `#FFFFFF` với hiệu ứng hào quang radar nhẹ xung quanh nhà ga.
  - **Khi trên tàu**: Vẽ huy hiệu thanh tra nổi phía trên nóc toa tàu đầu tiên, xoay và di chuyển theo đúng góc nghiêng và toạ độ thực của đoàn tàu.
  - **Hiệu ứng kiểm tra thành công**: Tại mỗi ga vừa được thanh tra, xuất hiện vòng sóng lan toả màu ngọc lục bảo và chữ nổi lướt lên: `Đã kiểm tra (X/5)`.

- **Âm thanh (Sound Engine)**:
  - Âm còi hiệu lệnh khi thanh tra lên tàu.
  - Âm chuông xác nhận kiểm tra từng ga.
  - Âm thanh chiến thắng đặc biệt khi đạt 5/5 ga và nhận $2,000.
  - Âm báo động thất bại nếu ga bị vỡ tải hoặc hết giờ.

---

### 3. Kiến trúc Kỹ thuật & Luồng Dữ liệu (Technical Architecture)

```
┌────────────────────────────────────────────────────────┐
│                      App.tsx                           │
│  - inspectorState (idle, picking_station, inspecting)  │
│  - handleDispatchInspector(), handleSelectStartStation │
└─────────────────────────┬──────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
┌─────────────────────────┐     ┌────────────────────────┐
│     MetroEngine.ts      │     │      Renderer.ts       │
│ - inspector tick update │     │ - Draw Inspector badge │
│ - train boarding logic  │     │   on station platform  │
│ - 5 stations counter    │     │ - Draw Inspector badge │
│ - reward $2,000 trigger │     │   on moving locomotive │
│ - fail on overcrowding  │     │ - Floating texts & HUD │
└─────────────────────────┘     └────────────────────────┘
```

#### Cấu trúc dữ liệu `InspectorState`:
```typescript
export interface InspectorState {
  status: 'idle' | 'selecting_station' | 'patrolling' | 'completed' | 'failed';
  currentStationId: string | null;
  currentTrainId: string | null;
  visitedStationIds: string[]; // Danh sách các ga đã thanh tra
  timeRemaining: number;       // Thời gian còn lại (90s)
  cooldownRemaining: number;   // Thời gian hồi chiêu (60s)
  targetCount: number;         // 5 ga
  rewardAmount: number;        // 2000
  failureReason?: string;
}
```

#### Logic mô phỏng trong `MetroEngine.update()`:
1. **Lên tàu**: Khi thanh tra đang ở ga (`currentStationId !== null`), nếu có bất kỳ đoàn tàu nào ghé ga và đang đón khách (`train.dwellingTime > 0`), thanh tra bước lên tàu (`currentTrainId = train.id`, `currentStationId = null`).
2. **Ghé ga tiếp theo**: Khi đoàn tàu đưa thanh tra đến ga tiếp theo, nếu ga này chưa có trong `visitedStationIds`, thêm ga vào danh sách, phát âm thanh và hiển thị floating text.
3. **Chuyển tuyến**: Nếu tàu đã đi hết tuyến hoặc quay đầu, thanh tra có thể đổi sang tàu khác ghé cùng ga đó để tiếp tục hành trình mở rộng.
4. **Kiểm tra hoàn thành**: Khi `visitedStationIds.length >= 5`:
   - Cộng ngay `$2,000` vào `this.state.money`.
   - Tạo thông báo FloatingText `+$2,000 THƯỞNG THANH TRA!`.
   - Chuyển trạng thái sang `completed`, sau đó bắt đầu hồi chiêu `cooldownRemaining = 60`.
5. **Kiểm tra thất bại**:
   - Nếu `timeRemaining <= 0` ➔ Thất bại do hết thời gian.
   - Nếu có ga trong hệ thống bị quá tải (`overcrowdedTimer >= 1.0` dẫn tới nguy cơ hỏng mạng lưới) ➔ Thất bại ngay lập tức.

---

### 4. Kế hoạch Thực hiện (Execution Steps)

1. **Cập nhật Types (`src/types/game.ts`)**:
   - Thêm interface `InspectorState` vào `SimulationState`.
2. **Cập nhật Logic Mô phỏng (`src/simulation/metroEngine.ts`)**:
   - Khởi tạo `inspectorState` trong `SimulationState`.
   - Triển khai các hàm điều khiển: `startSelectingInspectorStation()`, `deployInspectorAtStation(stationId)`, `cancelInspector()`.
   - Cập nhật chu trình `update()`: giảm thời gian, kiểm tra lên/xuống tàu tại điểm dừng, ghi nhận số ga đã tuần tra, xử lý điều kiện thắng/thua, trao thưởng $2,000.
3. **Cập nhật Bộ vẽ Canvas (`src/canvas/renderer.ts`)**:
   - Vẽ huy hiệu thanh tra trên ga (khi đợi) và trên nóc toa tàu (khi đang di chuyển).
4. **Cập nhật Giao diện HUD (`src/components/InspectorHUD.tsx` & `src/App.tsx`)**:
   - Tạo component `InspectorHUD` nhỏ gọn, hiển thị linh hoạt cả trên desktop và thiết bị di động (theo chuẩn `frontend-design`).
   - Xử lý tương tác nhấp chọn ga trên canvas khi ở trạng thái `selecting_station`.
5. **Kiểm thử & Biên dịch**:
   - Chạy `lint_applet` và `compile_applet` đảm bảo không có lỗi TypeScript.
