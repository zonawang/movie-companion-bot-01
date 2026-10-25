# 查完電影以後：替 ADK 電影夥伴加上誠品場次與票根紀錄

在[上一篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)，我建立了新的 LINE Bot「電影夥伴」，透過 Google ADK 串起 `now_playing`、`search_movies` 與 `movie_reviews`，讓 Bot 能用 TMDB 真實資料回答電影簡介與使用者評論。

查得到電影簡介後，我想把問題問得更貼近自己的日常：

> 如果今晚想去松菸誠品看電影，六點以後有哪些片和場次？

還有，電影看完以後，除了片名，能不能順手留下那天跟誰一起去、離開電影院時寫下的那句心得？

這一篇接著整理這兩個新功能：**指定影城的場次查詢（`cinema_schedule`）**，以及**需要確認才會存檔的個人票根紀錄（`prepare_ticket` / `list_tickets`）**。

## 發現「有上映」和「這間影城有放」是兩個不同的問題

一開始接好 TMDB 的上映候選清單（`now_playing`）時，可以查到台灣近期上映的電影；但當我實際想出門看電影時，才發現一般的上映清單回答不了「松菸誠品今天放什麼」。

一部電影已經在台灣上映，不代表松菸誠品有排片；同一部片在哪一天、幾點放映，更需要影城自己的時刻表。反過來說，誠品的時刻表有場次時間，卻不一定有我習慣看的簡短無劇透背景介紹；而看完電影後的個人紀錄，則屬於我自己的資料庫。

這讓我清楚看見：**同一個 ADK agent 可以搭配多個工具，但工具背後的資料來源，必須跟著問題的性質來選。**

![電影問題與影城場次使用不同資料來源](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/02-data-sources.png)

圖 1｜先確認問題需要哪一種資料：TMDB 提供一般電影背景與評論連結，誠品官方時刻表提供該影城的指定日期與場次，個人觀影回憶則存在自己的 SQLite 票根資料庫。

## 第一個新功能：問一句「今晚誠品放什麼」，模型與程式怎麼分工？

為了回答松菸誠品的場次，我和 Codex 新增了 `cinema_schedule` 工具，讀取[誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)。

當我在 LINE 問「今晚松菸誠品有哪些電影和場次？」或「10 月 28 日誠品晚上六點後有什麼片？」，這條流程把「理解自然語言」與「計算時間與格式化輸出」切得很開：

1. **模型（Gemini + ADK）負責理解語意並提出工具參數**：
   模型從對話判斷出影城名稱（`cinema`）、日期（`date`，今天或今晚傳空字串交由程式取台灣時間今天）、起始時段（`afterTime`，例如晚上從 `18:00` 起），以及是否只看現在之後尚未開演的場次（`onlyUpcoming`）。
2. **一般程式（`CinemaSource`）負責解析日期、比較時間與產生清單**：
   誠品官網上的場次日期格式是 `10/25 (日)`，沒有直接標出年份。程式會先讀取頁面上的「最後更新時間」作為基準日，推算正確年份並處理跨年邊界，接著用台灣時間（`Asia/Taipei`）篩選符合條件的場次。

更重要的是：**單純查詢影城場次時，最後回傳給使用者的時間清單是由程式直接依官方資料組成的（`formatCinemaSchedule`），不交給模型重新改寫。** 這樣可以避免模型在摘要過程中不小心漏掉場次或改錯時間，同時每一則回覆都會附上「官方更新時間」、「實際讀取時間」與[官方訂票入口](https://arthouse.eslite.com/visAgreement.aspx)。

![松菸誠品場次查詢、時段篩選與來源標示](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/07-eslite-showtimes.png)

圖 2｜本次真實 ADK 測試的場次查詢整理，非 LINE 截圖。圖中的片名與時間是 2026-10-25 17:35 的讀取節錄，不代表現在的即時場次。

在邊界條件上，程式也把幾種容易混淆的狀態分開處理：

- **查無該日公告（`not_published`）**：明確回覆「尚未查到這天的場次公告，不能判定當天沒有電影」。
- **該時段無場次（`no_upcoming`）**：明確回覆「目前公告中沒有符合這個時間條件的場次」，不推論為停映或票已售完。
- **不支援的影城**：目前場次解析只支援松菸誠品；若問到其他影城，agent 會改呼叫 `showtime_links` 提供官方查詢入口，絕不自行猜測時間、票價或剩餘座位。

## 讀官網遇到 403，以及從「查場次」接力追問「電影在講什麼」

剛把誠品時刻表接上去做第一次真實測試時，我們馬上遇到一個問題：用 Node 內建的 `fetch` 讀取官網公開頁面時，收到了 HTTP `403`，拿不到任何場次。

Codex 對照測試後發現，同一個公開網址不需要任何登入資訊、瀏覽器 cookie 或驗證挑戰，只要改用 Node 標準的 `node:https` client 發出一般請求，就能正常回傳 `200 OK` 並解析出當時頁面上的 21 個電影區塊。

為了對官方網站保持友善並兼顧穩定度，我們在 `CinemaSource` 加上了幾層保護：

- **5 分鐘共享快取與併發請求合併（`inflight`）**：五分鐘內的多則查詢共用同一份解析結果，同時進來的請求只會發起一次連線，並遵守 `robots.txt` 的讀取間隔限制。
- **結構驗證與失敗退場**：如果未來官網無法連線，或 HTML 結構改變導致解析失敗，Bot 不會拿過期的舊快取冒充現在場次，而是直接說明暫時無法讀取，並附上官方時刻表連結。

當 `cinema_schedule` 跑通後，最讓我有感的是**跨工具的多輪接力**。

在真實整合測試與手機實測中，我先問「今晚松菸誠品有哪些電影和場次？」，ADK 先呼叫 `cinema_schedule` 篩出晚上 18:00 後的《社群清算》（19:20）、《進擊的鼓手（特別場）》（19:30）等片；看到片單後，我接著追問：

> 《進擊的鼓手》在講什麼？

這時在同一個對話 session 裡，agent 知道這是一個電影內容問題，自動切換呼叫上一篇做好的 `search_movies` 工具，從 TMDB 取得電影資料（ID `244786`）並整理成兩句不劇透的簡介。

![誠品場次查詢與電影介紹的實測紀錄整理](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/03-verified-tools.png)

圖 3｜依真實 ADK 整合測試紀錄整理：第一輪先由 `cinema_schedule` 查誠品晚間場次，第二輪追問片名時自動接力呼叫 `search_movies` 查 TMDB 簡介。

## 第二個新功能：把看完的感受存成票根，確認過才寫入 SQLite

除了出發前查場次，我也想替看完電影後的時刻留下紀錄。

第一版的「個人票根收藏夾」先做最核心的文字欄位：**片名（`movieTitle`）、觀影日期（`watchedOn`）、影院（`cinema`）、同行的人（`companions`），以及自己的原始心得（`note`）**。未來的海報收藏牆或照片票根，留到後續階段再擴充。

因為寫入個人資料庫和單純查資料不同，我不希望模型聽錯一句話就直接把錯的紀錄存進資料庫。因此，我們把儲存票根設計成**「先建草稿 → 使用者按鈕確認 → 程式驗證寫入」**的兩段式流程：

1. **透過 `prepare_ticket` 建立 10 分鐘有效的待確認草稿**：
   當我在 LINE 說「我 2026-10-25 跟小安看了月台上的貓，心得是配樂很好聽」，agent 會呼叫 `prepare_ticket`。這一步**不會直接存入正式票根表**，而是先在 `drafts` 表建立一筆狀態為 `pending` 的草稿，並在 LINE 跳出草稿預覽與「確認儲存票根／取消」按鈕。
2. **程式層強制檢查「心得必須逐字引用」**：
   為了避免模型把我的個人心得改寫成制式摘要，除了在 prompt 規定之外，`store.prepare()` 在程式層也會直接比對：`ticket.note` 必須逐字出現在使用者本輪的原始訊息（`originals`）中，否則拒絕建立草稿，確保以後回頭看時，讀到的還是當時自己寫下的原句。
3. **按下 LINE 確認按鈕後，在 SQLite 交易中驗證寫入**：
   當我在手機按下「確認儲存票根」，LINE 送出 postback 事件，由應用程式執行 `store.decide()`。程式會在 SQLite 的 `BEGIN IMMEDIATE` 交易內，同時檢查**這張草稿是否屬於目前這位 LINE 使用者（`actor`）、狀態是否仍為 `pending`、是否還在 10 分鐘有效期限內**，全部通過才寫入 `tickets` 表並將草稿標為 `saved`。重複點擊確認按鈕不會產生第二張票根；按下取消則標為 `cancelled`，不會寫入任何紀錄。

![票根草稿、使用者確認與資料庫儲存流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/04-ticket-confirmation.png)

圖 4｜`prepare_ticket` 只負責建立待確認草稿；使用者在 LINE 按下確認後，才由應用程式檢查身分與期限並寫入 SQLite。這次採用 LINE 的 postback 確認流程，沒有使用 ADK 內建的工具確認機制。

儲存成功後，之後只要問「我跟小安看過哪些電影？」或搜尋片名、心得關鍵字，agent 就會呼叫 `list_tickets`，從 SQLite 撈出屬於我自己的票根紀錄（每位 LINE 使用者的資料彼此隔離，且服務重啟或切換 `demo`／`tmdb` 模式後，已確認的 SQLite 票根依然完整保留）。

## 驗證與目前的範圍

加上誠品場次與個人票根後，目前整個專案共有 **24 項自動化測試（`npm test`）**，涵蓋：

- ADK `InMemoryRunner` 與 7 個 `FunctionTool` 的呼叫流程。
- 誠品官方 HTML 結構解析、日期與時段篩選、跨年日期推算、尚未公告／該時段無場次、5 分鐘快取與格式變更錯誤處理。
- 票根草稿在確認前不寫入、取消不新增、10 分鐘過期、重複點擊去重、逐字心得驗證、跨使用者資料隔離，以及 SQLite 重啟後保留。
- LINE webhook 簽章驗證（未帶簽章回 401）與非同步佇列處理。

除了單元測試與模型替身測試，Codex 也分別跑了連接真實服務的 `smoke:adk`、`smoke:tmdb` 與 `smoke:cinema` 整合測試，並且由我在自己的手機 LINE 上完成真實訊息、誠品場次、電影簡介與來源連結的收發確認。

目前這個版本仍有很清楚的邊界：

- 影城場次目前先支援**松菸誠品電影院**，依賴公開網頁時刻表與 5 分鐘快取，不提供即時剩餘座位、票價或代訂票。
- LINE Bot 第一版僅支援一對一聊天（避免把私人票根發到群組），服務目前在本機搭配開發用 tunnel 執行，長期雲端部署（如將 SQLite 改為雲端持久資料庫）留待下一步完成。

從第一篇的「輸入片名查簡介」，到這一篇補上「出發前查松菸誠品場次」與「看完後存下自己的票根」，我對 Google ADK 在實際產品裡的位置有了更立體的體會：

> 讓模型負責理解語意並選擇工具，讓 ADK 把不同來源的工具組織在同一個對話裡，而把時間計算、資料格式與寫入確認交給明確的程式規則。

## 完整程式碼與參考資料

- [電影夥伴專案 Repo](https://github.com/zonawang/movie-companion-bot-01)
- [上一篇｜從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)
- [松菸誠品影城工具說明（`docs/cinema-eslite.md`）](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/cinema-eslite.md)
- [誠品時刻表解析與快取（`src/cinema.mjs`）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/cinema.mjs)
- [SQLite 票根草稿與確認交易（`src/store.mjs`）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/store.mjs)
- [第一版驗證紀錄（`docs/verification.md`）](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)
