# 第一版驗證紀錄

日期：2026-10-25。由 Codex 在本機執行，不代表使用者已在手機上操作完成。

## 已實際驗證

- Node.js v24.22.1、Google ADK 2.3.0、Gemini 模型 `gemini-3.5-flash-lite`。
- `npm test`：13 項測試，涵蓋真正 ADK Runner 與 FunctionTool 流程（模型使用測試替身）、票根確認前不寫入、取消、過期、去重、使用者隔離、SQLite 重啟後保留、LINE 簽章與非同步回應、TMDB 錯誤處理。
- `npm run demo`：離線工具示範成功；這項不呼叫模型。
- `npm run smoke:adk`：真的連到 Gemini，依序觀察到 `now_playing`、`prepare_ticket`、`list_tickets`。使用記憶體資料庫與虛構電影，確認動作由測試程式模擬。
- `npm audit --omit=dev --audit-level=moderate`：未發現已知漏洞（執行當下的掃描結果）。

真實模型測試的回覆節錄：

> 目前可查詢的電影如下（【示範模式】以下資料皆為虛構，並非目前真實上映名單）：

> 我已經幫你準備好觀影票根草稿囉！請檢查下方的草稿內容，點按確認即可將票根存入你的個人紀錄中。

> 查到你和小安一起看的紀錄囉：電影：月台上的貓……心得：配樂很好聽。

只在測試子程序的記憶體中讀取既有本機 Gemini 設定；沒有把 key 複製到新 repo、測試檔案、文件或提交內容。

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
- 本次只驗證查詢電影的手機流程；尚未在手機確認保存票根。電影仍為虛構示範模式。
- 此連線依賴本機服務與臨時 tunnel，尚未部署為常駐線上服務。臨時網址與金鑰不寫入 repo。

## 尚未驗證
- 真實 TMDB token、目前上映電影或真實評論回傳。
- 即時場次：尚未串接；目前只提供官網入口。
- 雲端部署、多人負載、票根圖片與 MINI App。

下一步用手機建立一張票根，檢查草稿後點確認，再用同伴查回；接著才切換到真實 TMDB 資料。實際 LINE 截圖待使用者補上。
