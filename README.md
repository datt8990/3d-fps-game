# FPS ONLINE – BATTLE STRIKE v2.0 (Full-Stack 3D Multiplayer & Vercel Ready)

Game bắn súng góc nhìn thứ nhất 3D đa người chơi (**Online Multiplayer FPS**) chạy trực tiếp trên trình duyệt, tích hợp đầy đủ **Frontend (Three.js WebGL + Web Audio)**, **Backend (Express REST API + Hybrid WebSocket / WebRTC P2P)** và **Database đa tầng**.

---

## 1. Triển khai lên Vercel (Chỉ cần đẩy lên GitHub là tự Build!)

Dự án đã được cấu hình sẵn [`vercel.json`](file:///c:/Users/Administrator/Downloads/Game-FPS_BanSung/vercel.json), [`api/index.js`](file:///c:/Users/Administrator/Downloads/Game-FPS_BanSung/api/index.js) và [`scripts/build.mjs`](file:///c:/Users/Administrator/Downloads/Game-FPS_BanSung/scripts/build.mjs):
1. Đẩy toàn bộ mã nguồn lên kho lưu trữ **GitHub** của bạn.
2. Vào **Vercel Dashboard** → **Add New Project** → Chọn repo GitHub vừa đẩy → Bấm **Deploy** *(Không cần cấu hình thêm biến môi trường nào!)*.
3. **Cách hoạt động trên Vercel Serverless**:
   - `npm run build` tự động đóng gói Frontend, Engine vật lý dùng chung và thư viện `Three.js` + `PeerJS` vào thư mục tĩnh `dist/`.
   - Toàn bộ `/api/*` định tuyến về Serverless Function [`api/index.js`](file:///c:/Users/Administrator/Downloads/Game-FPS_BanSung/api/index.js) kết hợp cơ chế **Cloud Signed Profile Backup (HMAC)** + `/tmp` (và tự động nhận diện **Vercel KV / Upstash Redis** nếu bạn gắn thêm `KV_REST_API_URL`).
   - Khi chạy trên Vercel, [`NetworkClient`](file:///c:/Users/Administrator/Downloads/Game-FPS_BanSung/public/js/network.js) tự động kích hoạt chế độ **Cloud WebRTC P2P (PeerJS + GameRoomCore 30Hz)**: Chủ phòng chạy Engine vật lý 30Hz trực tiếp và kết nối P2P độ trễ cực thấp tới bạn bè qua **Mã Phòng 6 ký tự (`#BSxxxx`)** hoặc **Link Mời (`?room=BSxxxx`)**!

---

## 2. Chạy Local / Dedicated Server

```bash
npm install
npm start
```
Mở trình duyệt tại: **`http://localhost:3000`**

---

## 3. Tính năng nổi bật phiên bản v2.0

- **Ghép trận cùng bạn bè cực nhanh**:
  - **Mã Phòng 6 ký tự (`#BS1001`)**: Nhập mã phòng ngay tại Sảnh Chính, Danh Sách Phòng hoặc Ngăn kéo Bạn Bè để vào thẳng phòng của bạn bè.
  - **Copy Link Mời (`?room=BS1001`)**: Bấm nút **Copy Link Mời Bạn Bè** trong phòng chờ rồi gửi qua Zalo/Discord/Messenger — bạn bè bấm vào link là tự động vào chung phòng đấu!
  - **Hệ thống Kết Bạn (`VN-xxxx`) & Mời Tổ Đội**: Kết bạn bằng Tên hoặc Mã `VN-xxxx`, xem trạng thái Online/Phòng hiện tại và bấm **Mời** để hiện thông báo mời trực tiếp trên màn hình bạn bè.
- **Kho Vũ Khí 12 Khẩu (6 Phân Nhóm) & Phòng Tập 3D**:
  - **Súng Trường (AR)**: `AK-47`, `M4A1-S`, `SCAR-H`
  - **Tiểu Liên (SMG)**: `MP5-SD` (giảm thanh tích hợp), `P90 Tactical` (băng đạn 50 viên)
  - **Shotgun**: `SPAS-12` (bắn chùm 8 viên đạn chì cận chiến)
  - **Bắn Tỉa (Sniper)**: `AWP Magnum`, `Barrett M82 .50` (bán tự động .50 BMG + ống ngắm 2 nấc)
  - **Súng Ngắn**: `Desert Eagle .50 AE`, `USP-S Tactical`
  - **Cận Chiến**: `M9 Bayonet`, `Karambit Vuốt Hổ` (+10% tốc chạy)
  - **Lựu Đạn Nổ (`[G]`)**: Vật lý nảy tường/sàn và phát nổ gây sát thương diện rộng.
- **6 Quân Nhân Đặc Nhiệm (Kèm Kỹ năng Nội tại) & 8 Trang Phục + 8 Skin Vũ Khí**:
  - `VANGUARD`, `GHOST` (+4% tốc chạy), `TITAN` (120 Giáp hạng nặng), `VALKYRIE` (+10% thay đạn nhanh), `SHADOW NVG` (Kính nhìn đêm 3 mắt + 5% tốc chạy), `PHOENIX` (Tự hồi +3 HP/giây ngoài giao tranh).
  - 8 Skin súng: *Quân Dụng*, *Băng Giá Vĩnh Cửu*, *Huyết Mạng Nhện*, *Tia Chớp Cyber*, *Ngọc Bích Đế Vương*, *Asiimov*, *Lõi Dung Nham Hỏa Ngục*, *Hoàng Kim Long*.
- **HUD Chiến Đấu Esports**:
  - Thông báo chuỗi hạ gục (**First Blood**, **Double Kill**, **Triple Kill**, **Quadra Kill**, **Rampage**) + Âm thanh hợp âm chiến thắng.
  - Menu **Radio Chiến Thuật (`[Z]` + `1..6`)** báo vị trí Khu A/B cho đồng đội.
