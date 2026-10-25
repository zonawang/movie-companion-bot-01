# 第一版驗證紀錄

日期：2026-10-25。以下分別記錄 Codex 的本機／API 測試與使用者回報的手機實測。

## 已實際驗證

- Node.js v24.22.1、Google ADK 2.3.0、Gemini 模型 `gemini-3.5-flash-lite`。
- `npm test`：16 項測試，涵蓋真正 ADK Runner 與 FunctionTool 流程（模型使用測試替身）、票根確認前不寫入、取消、過期、去重、使用者隔離、SQLite 重啟後保留、LINE 簽章與非同步回應、TMDB 錯誤處理、來源連結篩選與關於入口。
- `npm run demo`：離線工具示範成功；這項不呼叫模型。
- `npm run smoke:adk`：真的連到 Gemini，依序觀察到 `now_playing`、`prepare_ticket`、`list_tickets`。使用記憶體資料庫與虛構電影，確認動作由測試程式模擬。
- `npm audit --omit=dev --audit-level=moderate`：未發現已知漏洞（執行當下的掃描結果）。

真實模型測試的回覆節錄：

> 目前可查詢的電影如下（【示範模式】以下資料皆為虛構，並非目前真實上映名單）：

> 我已經幫你準備好觀影票根草稿囉！請檢查下方的草稿內容，點按確認即可將票根存入你的個人紀錄中。

> 查到你和小安一起看的紀錄囉：電影：月台上的貓……心得：配樂很好聽。

最初測試只在子程序的記憶體中讀取既有本機 Gemini 設定；之後建立本機 `.env` 供新 Bot 使用。金鑰未寫入版本控制、測試檔案、文件或提交內容。

## 開發時確實遇到的問題

第一次真實模型測試回傳 400：

```text
Unknown name "exclusiveMinimum" ... Cannot find field.
```

原因是工具參數 `z.number().int().positive()` 轉出的 schema 含 `exclusiveMinimum`，這個請求格式不被 Gemini 接受。已改成 `z.number().int().min(1)`，並加入參數 schema 的回歸檢查。修正後才跑通真實模型的三段流程。

安裝時也掃到間接依賴的已知漏洞，已在現有版本範圍內更新 lockfile，重新掃描為 0，沒有強制升級 ADK 的主要版本。

## 新 LINE Bot 實際串接（2026-10-25）

- 使用者已建立新帳號並在本機填入 Channel secret 與 Channel access token。
- LINE API 驗證 token 屬於指定的 Channel ID；本機 Bot 與開發用 HTTPS tunnel 已啟動。
- LINE 官方 webhook 測試回傳 `success: true`、`statusCode: 200`，實際簽章驗證通過。
- 已設定 webhook URL；使用者開啟 Use webhook 後，API 確認 `active: true`。
- 使用者回報「LINE 有收到電影回覆」。同時服務記錄顯示真正呼叫 `now_playing`，事件狀態為 `done`，表示 LINE 回覆 API 成功。
- 未帶簽章的公開 webhook 請求回傳 401；LINE API 也接受票根確認按鈕的訊息格式。
- 首次手機實測驗證了查詢電影的流程，當時使用虛構示範模式；其後真實 TMDB 串接結果記錄於下節。
- 此連線依賴本機服務與臨時 tunnel，尚未部署為常駐線上服務。臨時網址與金鑰不寫入 repo。

## 真實 TMDB 串接（2026-10-25）

- 使用者申請 TMDB 帳號並將 API Read Access Token 填入本機 `.env`；`GET /3/authentication` 回傳 HTTP 200 與 `success: true`。
- `movie/now_playing`、`search/movie`、`movie/{id}/reviews` 皆成功；查詢語系為 `zh-TW`，電影搜尋與上映候選加上 `region=TW`。
- 《全面啟動》搜尋回傳 TMDB ID `27205`，繁中評論查到 1 筆原文連結。這是測試當時的結果，之後資料可能改變。
- `npm run smoke:tmdb` 真正呼叫 Gemini 與 TMDB，觀察到 `now_playing` → `search_movies` → `movie_reviews`；模型收到真實工具結果並回覆。
- 第一次完整測試時，模型把真實電影誤稱為「示範模式的虛構資料」。已明確傳入目前的 `tmdb`／`demo` 模式，重新跑測試後，真實資料不再帶示範標籤。
- 回覆會由程式補上 TMDB 來源與實際工具回傳的連結；「關於」入口提供來源聲明與標誌頁。
- 本機 LINE Bot 已重啟為 `tmdb` 模式，Use webhook 維持開啟，LINE 官方 webhook 測試再次回傳 200。
- 切換前後比對 SQLite，原有 1 張票根的 ID、擁有者、內容與建立時間皆保留。測試使用另一個記憶體資料庫，不寫正式票根。
- 真實 TMDB 資料的手機回覆尚待使用者操作確認；不把本機成功當成手機已完成。

## 尚未驗證

- 真實 TMDB 回覆的手機操作與截圖、查無資料時的手機回覆。
- 即時場次：尚未串接；目前只提供官網入口。
- 雲端部署、多人負載、票根圖片與 MINI App。

下一步用 LINE 問「最近有什麼電影可以查？」或「全面啟動在講什麼？有使用者評論嗎？」，確認真實資料與來源。實際 LINE 截圖待使用者補上。
