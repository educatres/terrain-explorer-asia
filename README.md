# 地形探險隊－亞洲

可部署在 GitHub Pages 的亞洲互動式地理教材。學生可在以亞洲為中心的衛星地圖上探索山脈、河流、湖泊、特殊地形、國家公園及代表性動植物，並透過資訊卡、觀察任務與隨機測驗理解地理環境和生態分布。

線上教材：https://educatres.github.io/terrain-explorer-asia/

## 功能

- Leaflet 互動地圖，預設顯示亞洲且限制主要瀏覽範圍。
- 七類教材圖層，可獨立顯示或隱藏。
- 亞洲代表性景點、物種、概略山脈線、河流線與湖泊面。
- 中文與英文名稱搜尋、輪播導覽、觀察任務及隨機挑戰。
- 每筆內容附主要來源與延伸閱讀。
- 右側資訊區提供多張 Wikimedia Commons 免費授權照片，並標示作者、授權與原始來源。
- 響應式介面，可在桌面與行動裝置使用。

## 本機執行

此專案使用 ES modules 與 `fetch()` 載入 JSON，請透過 HTTP 伺服器開啟：

```bash
python3 -m http.server 8000
```

再前往 `http://localhost:8000`。

## 部署

本專案透過 GitHub Pages 從 `main` 分支根目錄自動部署。

## 資料與授權

- 程式碼：MIT License。
- 地圖程式：Leaflet，BSD-2-Clause。
- 衛星底圖：Esri World Imagery，使用時保留 attribution。
- 概略地理資料：參考 Natural Earth 與公開地理資料後簡化，僅供教學。
- 公園與物種：優先採用 UNESCO、IUCN、各國公園主管機關與 Kew 等來源。

詳細政策見 [docs/source-policy.md](docs/source-policy.md)，教材設計見 [docs/specification.md](docs/specification.md)。
