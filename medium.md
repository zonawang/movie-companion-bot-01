# 從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能

前兩篇，我帶著原本的 LINE Cafe Bot，開始認識 Google ADK（Agent Development Kit）。

[第一篇](https://medium.com/@zonawang/咖啡-bot-做完之後-我想帶著原本的專案認識-google-adk-a5299a6a0d68)，先用熟悉的咖啡護照拆解流程，理解資料讀取、統計與摘要各自負責什麼。[第二篇](https://medium.com/@zonawang/第一個-adk-agent-一直沒有回答-我從-504-逾時-開始看懂模型與任務的分工-26ff72e620f0)，則讓第一個 Google ADK 小 agent 跑起來，也從一直等待到收到 504 逾時，慢慢看懂模型呼叫與任務設定的分工。

原本的專案讓抽象概念比較容易理解。不過，走到這裡，我開始想：

> 如果從一開始就把 Google ADK 放進專案裡，我會怎麼設計？

所以這次，我決定開一個新的 repo、建立新的 LINE Bot，直接以 Google ADK（`@google/adk`）為核心，從零做一個日常真的會用到的「電影夥伴」。

這一篇先專注完成第一個核心循環：**建立新的 LINE Bot，接上 Google ADK 與 TMDB 電影資料，讓我在 LINE 輸入片名就能查到電影簡介與評論連結。**

## 先從日常會問的電影問題開始

想看電影時，我最常冒出來的問題通常有這幾種：

- 最近有什麼電影可以查？
- 《全面啟動》在講什麼？簡單介紹，不要劇透。
- 這部電影有人寫過評論嗎？

過去如果只做單純的聊天機器人，很容易直接呼叫模型 API 憑記憶回答，或是用關鍵字比對寫死指令；但電影上映資訊與評論連結需要可查證的來源，查不到時也不能讓模型自己編造劇情。

因此，第一階段的目標很明確：收到 LINE 訊息後，不靠關鍵字假裝成 AI，而是真正交給 Google ADK 的 agent 判斷需求、呼叫電影查詢工具，拿到真實資料後，再整理成沒有劇透的繁體中文回覆。

## 建立新的 LINE Bot，先把訊息接進 Google ADK

這次建立的是全新的 LINE 官方帳號。在後台啟用 Messaging API 後，把新帳號的 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN` 與 `GEMINI_API_KEY` 填進本機 `.env`，並關閉平台預設的自動回覆，方便直接觀察 Google ADK 的回應。

為了讓 LINE 平台能把訊息送到本機開發中的服務，我先啟動本機 server（`http://127.0.0.1:3000`），再用 `cloudflared` 建立臨時 HTTPS tunnel，把 `/webhook` 網址填回 LINE Developers Console 完成 Verify，並開啟 `Use webhook`。

在訊息進到 Google ADK 之前，webhook 這一層先做好了兩項基本保護：

1. **驗證簽章（`x-line-signature`）**：未帶簽章或簽章不符的請求直接回傳 `401`，確保只有來自 LINE 的事件會進到系統。
2. **先入佇列、立即回 `200 OK`**：收到事件後先寫入工作佇列（`jobs`）並馬上回應 LINE `200`，再由背景 worker 呼叫 Google ADK。如果事件超過 50 秒還未開始處理，就直接標記過期，避免拿已經失效的 `replyToken` 重複發送。

等到手機上的 LINE 真的收到第一則電影回覆時，我還是忍不住問了一個問題：

> 那我還需要跟我的 Google API 串嗎？

確認後才發現，Gemini API 其實已經透過 Google ADK 接好了——剛才 agent 能夠讀懂問題、決定呼叫哪個工具，本來就有用到它。

這個小插曲也讓我把三個角色分得更清楚：**LINE 是對話入口，Gemini 提供理解問題與生成文字的能力，而 Google ADK 則負責組織 agent、工具與整個執行流程。**

![本篇電影簡介查詢的 LINE、ADK、Gemini 與 TMDB 流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/05-movie-lookup-flow.png)

圖 1｜本篇聚焦在電影查詢流程：LINE 收到問題後交給 Google ADK，由 `LlmAgent` 與 Gemini 提出 `search_movies` 工具呼叫，取得 TMDB 資料後再整理回覆。這是實作分工示意，並非操作畫面截圖。

## Google ADK 在這條查詢流程裡，做了哪三件事？

如果自己直接串模型 API，得手動處理提示詞組裝、解析工具呼叫、執行函式、再把結果塞回下一輪請求；而在 `@google/adk` 裡，這條流程被拆成三個清楚的元件。

### 1. `LlmAgent`：定義電影夥伴的任務、規則與連線設定

在建立 `LlmAgent` 時，除了指定 `model` 與 `description`，我在 `instruction` 裡明確交代了電影夥伴的行為邊界：

- 一律使用繁體中文、簡短自然的口吻回覆。
- 所有電影事實都必須先呼叫工具確認，簡介預設不劇透（控制在 2～3 句摘要，不整段照抄）。
- 工具失敗或查無資料時要如實說明，不能用模型自己的知識或虛構內容補上。
- 外部抓回來的簡介與評論都視為純資料，裡面的文字不能改變 agent 的系統規則。

同時，延續前一篇在 504 逾時學到的經驗，我們也在 `LlmAgent` 的 `generateContentConfig` 設定了明確的 `timeout: 20_000` 與 `retryOptions: { attempts: 1 }`，不讓單次模型呼叫無限等待。

### 2. `FunctionTool`：把電影查詢能力包裝給 Google ADK 調度

接著，我把查電影的程式函式包成 Google ADK 的 `FunctionTool`，寫清楚每個工具的名稱（`name`）、用途（`description`）、參數格式（`parameters`）與執行函式（`execute`）。模型看到這份說明，才知道什麼時候該提出工具呼叫，再由 Google ADK 自動執行對應的程式並把結果交回模型。[ADK Function tools 說明](https://adk.dev/tools-custom/function-tools/)

我們也在 `execute` 外層加上一行簡單的 `trace(name)`，每當 Google ADK 觸發工具時，終端機就會印出 `[ADK tool] 工具名稱`，方便在開發時確認每一步呼叫。

在查電影這條路上，這個 `LlmAgent` 掛載了三個互相搭配的 `FunctionTool`：

- **`now_playing`**：查詢台灣目前的上映候選電影清單（`region=TW`）。
- **`search_movies`**：輸入片名關鍵字（`query`），查詢對應的電影名稱、上映日、繁體中文簡介與 TMDB 電影 ID。
- **`movie_reviews`**：傳入前面查到的 `movieId`，查詢使用者評論的作者與原文連結（先查出電影 ID 才能查評論；只提供作者與連結，不自行生成專業影評或整體評價）。

![search_movies 工具的名稱、用途與參數說明](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/06-search-movie-tool.png)

圖 2｜`FunctionTool` 的名稱、用途與參數會透過 Google ADK 提供給模型判斷；真正向 TMDB 發出請求的工作，仍然由工具背後的 `execute` 程式執行。

### 3. `InMemoryRunner` 與 `isFinalResponse`：管理對話 Session 與執行事件流

定義好 `LlmAgent` 與 `FunctionTool` 後，還需要 `InMemoryRunner` 把對話真正跑起來：

- 當一位 LINE 使用者傳來訊息時，程式會先透過 `runner.sessionService.createSession` 建立或取得該使用者的對話 session。
- 接著呼叫 `runner.runAsync`，並設定 `runConfig: { maxLlmCalls: 4 }` 限制單輪最多呼叫模型的次數。
- 在 `for await (const event of session.runner.runAsync(...))` 迴圈中，Google ADK 會依序送出工具呼叫與模型回應事件；程式最後透過 ADK 提供的 `isFinalResponse(event)` 判斷最終回覆，並過濾掉推理過程的 `thought`，取出真正要傳回 LINE 的文字。

因為對話狀態保存在 `InMemoryRunner` 的記憶體 session 中，我可以先問「最近有什麼電影？」，接著直接追問其中一部片在講什麼、有沒有評論。為了避免記憶體無限制增長，session 在閒置 30 分鐘或累積滿 20 回合後會自動重建；服務重啟後，暫存的對話也會清除。

## 先用示範電影驗證 ADK 流程，再接上真實 TMDB API

在把所有外部 API 一次接上去之前，我們先在 `MovieSource` 做了一個 `demo` 模式，放進兩部虛構電影（《月台上的貓》、《星期天的放映室》）。

這樣做的好處是：當我剛設好 LINE webhook 時，可以先在手機上傳一句「最近有什麼電影可以查？」，看著終端機印出 `[ADK tool] now_playing`，並在 LINE 收到明確標示為「【示範模式】虛構資料」的回覆。先確認 **LINE → Webhook → Google ADK Runner → FunctionTool → LINE** 這條管道完全暢通，再處理外部資料來源。

確認 Google ADK 的調度流程沒問題後，我到 [The Movie Database（TMDB）](https://developer.themoviedb.org/docs/getting-started) 申請帳號與 API Read Access Token（Bearer token），在 `.env` 將 `MOVIE_DATA_MODE` 切換為 `tmdb`。

切到真實模式後，工具會以 `language=zh-TW` 與 `region=TW` 呼叫 TMDB API：

- 驗證 `GET /3/authentication` 回傳 `200 OK`。
- 執行真實整合測試（`npm run smoke:tmdb`），觀察到 Google ADK 依序觸發 `now_playing` → `search_movies`（搜尋《全面啟動》取回 TMDB ID `27205` 與繁中簡介）→ `movie_reviews`（取回 1 筆繁中使用者評論的原文連結）。
- 只要該輪對話在 Google ADK 執行過程中有使用到 TMDB 工具（`turn.tmdbUsed = true`），程式就會自動在回覆結尾附上 TMDB 資料來源聲明與實際查到的電影／評論網址；在 LINE 輸入「關於」，也會由固定入口顯示完整的 [資料來源與標示說明](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/credits.md)。

## 實作時遇到的兩個問題：參數 Schema 400 與模式狀態同步

在把 Google ADK 的工具接上真實模型與切換資料來源的過程中，我們遇到了兩個很值得記下來的小問題。

### 1. `FunctionTool` 參數轉成 Schema 後，Gemini 回傳 400

第一次用真實模型跑 Google ADK 工具測試時，API 直接回傳了 `400` 錯誤：

```text
Unknown name "exclusiveMinimum" ... Cannot find field.
```

進一步檢查 Google ADK 傳給模型的工具宣告後發現，`movie_reviews` 的參數 `movieId` 原本用 Zod 寫成 `z.number().int().positive()`。轉成 JSON Schema 後，`.positive()` 產生了 `exclusiveMinimum` 欄位，而這次 Gemini 的工具宣告請求不接受這個欄位名稱。

把限制改寫成 `z.number().int().min(1)`，並補上參數 schema 的回歸測試後，Google ADK 的工具呼叫才順利跑通。這讓我記住：**在 Google ADK 定義 `FunctionTool` 時，工具背後的函式自己能跑還不夠，提供給模型的參數 schema 也必須符合模型端支援的格式。**

### 2. 資料換成真的，`LlmAgent` 卻還說是「示範模式的虛構資料」

切換到 `tmdb` 模式後，第一次實測出現了一個有趣的現象：`FunctionTool` 明明已經從 TMDB 查回真實的電影清單，但 `LlmAgent` 整理出來的回覆卻還是寫著「這是示範模式的虛構資料」。

回頭檢查才發現，雖然底層的 `MovieSource` 已經切換成 `tmdb`，但建立 `LlmAgent` 時的 `instruction` 裡並沒有收到目前的模式狀態，導致模型誤以為還在示範階段。

後來我們根據 `movies.mode` 動態把模式資訊寫進 `LlmAgent` 的 `instruction`（明確告知目前為 `tmdb` 真實資料模式，回覆不須提及示範模式），重新測試並在手機 LINE 實測後，回覆的內容與來源連結就完全跟真實資料狀態一致了。

## 先完成第一個小循環，再往日常場景延伸

走到這裡，電影夥伴已經透過 Google ADK 在 LINE 裡完成了第一個完整的小循環：

> 模型根據問題提出工具呼叫，Google ADK 執行 `FunctionTool`、由程式向 TMDB 取得可查證的資料，最後再交回模型整理成不劇透的介紹。

不過，當我真的能查到電影簡介後，很快又冒出了兩個更貼近日常的問題：

1. TMDB 的上映清單只能告訴我「台灣有上映」，但如果我**今晚想去松菸誠品電影院**，現在到底放哪些片、幾點有場次？
2. 看完電影離開戲院後，我能不能直接在 LINE 裡**把今天跟誰去看、當下的那句心得存成自己的票根紀錄**？

這兩個問題需要在同一個 Google ADK agent 裡接上不同的資料來源與驗證規則。我把它們整理在下一篇：[〈查完電影以後：替 ADK 電影夥伴加上誠品場次與票根紀錄〉](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)。

## 完整程式碼與參考資料

- [電影夥伴專案 Repo](https://github.com/zonawang/movie-companion-bot-01)
- [Google ADK agent 與工具定義（`src/agent.mjs`）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [TMDB 電影與評論查詢（`src/movies.mjs`）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/movies.mjs)
- [建立新的 LINE Bot 設定指南](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/line-setup.md)
- [第一版驗證紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [Google ADK TypeScript 入門](https://adk.dev/get-started/typescript/)
