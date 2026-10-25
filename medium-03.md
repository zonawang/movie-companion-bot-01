# 不只是查電影：用 Google ADK 整理觀影票根草稿，確認過才寫入 SQLite

在前兩篇，我用 Google ADK 做出了電影夥伴的兩個查詢能力：[第一篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)串接 TMDB 查電影簡介與評論連結，[第二篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)則接上松菸誠品官方時刻表，解決「今晚誠品放什麼」的場次問題。

這兩個功能照顧的是「出發看電影以前」的需求。但對我來說，看電影還有後半段：

> 走出電影院之後，除了片名，我還想記得那天是跟誰一起去、在哪間戲院看，以及剛看完時留下的那句心得。

這一篇想整理電影夥伴的第三個核心功能：**用 Google ADK 整理觀影票根草稿，搭配 LINE 確認按鈕與 SQLite，做出屬於自己的票根收藏夾。**

## 「查資料」與「存紀錄」差在哪裡？

前面做的電影簡介和誠品場次，本質上都是「唯讀查詢」。如果模型不小心聽錯片名或查錯日期，我頂多再問一次，不會改變系統裡的任何資料。

但「把觀影心得存進資料庫」就不一樣了。

如果我只是隨口聊到一部片，或是模型把日期、同伴聽錯了，就直接呼叫工具寫進資料庫，我的個人票根收藏很快就會混進錯誤的紀錄。

因此，在把票根功能放進 Google ADK 時，我最想先劃清楚的邊界是：

> 自然語言的理解與欄位整理，可以交給 Google ADK 與模型；但「要不要存進去」以及「能不能寫入資料庫」，必須由使用者確認、由程式規則把關。

## 不給 Google ADK「直接存檔」的工具，而是先建草稿

第一版的票根收藏夾先收錄五個最核心的文字欄位：**片名、觀影日期、影院、同行的人，以及自己的原始心得**。未來的海報收藏牆或照片票根，留到後續階段再擴充。

為了確保模型不會跳過我直接存檔，我們在定義 Google ADK 的 `LlmAgent` 時，做了一個很關鍵的架構選擇：**刻意不提供任何「直接寫入正式票根表」的 `FunctionTool`。**

在票根這條路上，Google ADK 的 agent 手上只有兩個工具：

- **`prepare_ticket`**：整理觀影資訊，建立一張 10 分鐘有效的「待確認草稿」。
- **`list_tickets`**：從已經確認儲存的票根裡，查詢屬於自己的觀影紀錄。

換句話說，就算模型再想幫我存檔，它最多也只能呼叫 `prepare_ticket` 產生草稿，並在回覆裡提醒我檢查下方的草稿內容、點按確認按鈕才會正式存入。

![票根草稿、使用者確認與資料庫儲存流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/04-ticket-confirmation.png)

圖 1｜Google ADK 的 prepare_ticket 工具只負責建立待確認草稿；使用者在 LINE 按下確認後，才由應用程式檢查身分與期限並寫入 SQLite。這次採用 LINE 的確認流程，沒有使用 ADK 內建的工具確認機制。

## 第一步：讓 Google ADK 從一句話裡抽取出票根草稿

平常在 LINE 記事情，我不會按照表格一欄一欄填，比較常直接打出一句話：

> 我 2026-10-25 跟小安看了月台上的貓，心得是配樂很好聽。

這句話進到 Google ADK 後，`LlmAgent` 會根據 `prepare_ticket` 的參數說明，把句子拆成對應的欄位：

- **片名（`movieTitle`）**：月台上的貓
- **觀影日期（`watchedOn`）**：2026-10-25
- **同行的人（`companions`）**：小安
- **原始心得（`note`）**：配樂很好聽

如果我少說了必要資訊（例如只說「我跟小安去看了全面啟動」，沒提到是哪一天看的），我們在 `LlmAgent` 的任務說明裡規定：缺少片名或日期時，不能自己猜測，要先開口向使用者追問。

等到必要欄位齊全、Google ADK 執行 `prepare_ticket` 後，程式會在 SQLite 的 `drafts` 資料表建立一筆狀態為 `pending` 的草稿，接著在 LINE 顯示整理好的草稿內容，以及「確認儲存票根」與「取消」兩個按鈕。

## 第二步：留住當下的原話，不讓模型改寫我的心得

做票根紀錄時，有一件事我特別在意：**我希望幾個月後回頭看，讀到的還是離開電影院時自己寫下的那句原話，而不是被 AI 潤飾過的摘要。**

但語言模型天生很習慣幫人改寫句子。如果只在提示詞（instruction）裡寫一句「請逐字引用使用者心得」，有時模型還是可能順手多加兩個字或改掉標點。

所以我們把這條規則同時寫進了 Google ADK 工具背後的程式裡。

每當使用者傳訊息進來，對話 session 會保留這一輪使用者親手輸入的原始文字。當 Google ADK 呼叫 `prepare_ticket` 時，程式會直接比對：模型傳進來的 `note` 欄位，必須**逐字出現在使用者的原始訊息裡**。

如果模型自己改寫了句子，比對就會失敗，工具會退回這次呼叫並要求重新處理。透過「提示詞交代」加上「程式層逐字檢查」，就能確保每一張票根上的心得都是百分之百的原句。

## 第三步：按下 LINE 確認按鈕，在 SQLite 交易中完成寫入

當我看過 LINE 上的草稿預覽、按下「確認儲存票根」時，LINE 會送出一個 postback 事件到 webhook。

這一步完全不需要再呼叫模型，而是由應用程式直接在 SQLite 的交易（Transaction）裡做三項安全檢查：

1. **檢查擁有者**：這張草稿是不是目前按下按鈕的這位 LINE 使用者建立的？
2. **檢查狀態**：這張草稿是不是還處於未處理（`pending`）狀態？
3. **檢查有效期限**：距離建立草稿是不是還在 10 分鐘以內？

三項檢查都通過後，程式才會把草稿內容寫入正式的 `tickets` 資料表，並把草稿狀態改為 `saved`。

因為整個檢查與寫入包在同一個資料庫交易裡，就算不小心在手機上連點兩次「確認儲存票根」，第二次點擊時草稿狀態已經改變，不會重複存出第二張票根；如果發現內容有錯按下「取消」，草稿就會標為 `cancelled`，正式票根表裡不會留下任何紀錄。

## 第四步：用 `list_tickets` 找回自己的觀影回憶

票根存進 SQLite 後，查詢也變得很有日常感。

之後我在 LINE 裡問：

> 我跟小安看過哪些電影？

或者輸入片名、日期、心得裡的關鍵字，Google ADK 的 `LlmAgent` 就會判斷這是在查個人紀錄，自動呼叫 `list_tickets` 工具，從 SQLite 撈出符合條件的票根回覆給我。

這裡也讓我更清楚看見 **對話暫存（Session）** 與 **永久資料（Database）** 在 Google ADK 應用裡的分工：

- **`InMemoryRunner` 的記憶體 Session**：負責記住「現在這幾輪對話聊到哪裡」，方便追問；閒置 30 分鐘或服務重啟後就會清除。
- **SQLite 票根資料庫**：負責永久保存「我確認過的觀影回憶」，並且依每位 LINE 使用者的 ID 嚴格隔離。就算重啟 server，或是把電影資料從示範模式切換到 TMDB 真實模式，之前存下的票根依然完整保留。

## 三篇走完，回頭看 Google ADK 在電影夥伴裡的角色

加上票根草稿與確認流程後，整個電影夥伴第一版共有 **24 項自動化測試（`npm test`）**，涵蓋了 Google ADK Runner 與 7 個工具的呼叫流程、誠品時刻表解析与快取、票根確認前不存檔、取消不新增、10 分鐘過期、重複點擊去重、逐字心得檢查，以及跨使用者的資料隔離。

回頭看這三篇從零建立「電影夥伴」的過程，每一步都讓我對 Google ADK 有更具體的認識：

- **[第一篇（查電影簡介與評論）](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)**：透過 `LlmAgent`、`FunctionTool` 與 `InMemoryRunner`，把 LINE、Gemini 與外部 TMDB API 接成第一個查資料的小循環。
- **[第二篇（查松菸誠品場次）](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)**：在同一個 agent 裡掛上不同性質的資料來源，讓模型理解「今晚六點後」，讓程式處理日期推算、403 讀取與精確時間清單，並用 `InMemoryRunner` 跨工具接力追問。
- **第三篇（存下個人觀影票根）**：把 Google ADK 的強項留在「理解自然語言、整理草稿與查詢回憶」，而把「逐字心得驗證、按鈕確認與寫入 SQLite」留在明確的程式規則裡。

對我來說，學會用 Google ADK 並不只是把所有事情都交給 AI 做，而是更清楚知道：**哪一步適合讓 agent 幫我理解與調度，哪一步應該留給程式與自己做最後確認。**

## 完整程式碼與參考資料

- [電影夥伴專案 Repo](https://github.com/zonawang/movie-companion-bot-01)
- [第一篇｜從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)
- [第二篇｜今晚誠品放什麼？替 Google ADK 電影夥伴接上松菸誠品時刻表](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)
- [Google ADK agent 與 7 個工具定義（src/agent.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [SQLite 票根草稿、逐字心得檢查與確認交易（src/store.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/store.mjs)
- [LINE 訊息與確認按鈕處理（src/line.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/line.mjs)
- [第一版驗證紀錄（docs/verification.md）](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
