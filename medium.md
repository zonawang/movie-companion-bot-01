# 從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能

前兩篇，我帶著原本的 LINE Cafe Bot，開始認識 Google ADK（Agent Development Kit）。

[第一篇](https://medium.com/@zonawang/咖啡-bot-做完之後-我想帶著原本的專案認識-google-adk-a5299a6a0d68)，先用熟悉的咖啡護照拆解流程，理解資料讀取、統計與摘要各自負責什麼。[第二篇](https://medium.com/@zonawang/第一個-adk-agent-一直沒有回答-我從-504-逾時-開始看懂模型與任務的分工-26ff72e620f0)，則讓第一個 Google ADK 小 agent 跑起來，也從一直等待到收到 504 逾時，慢慢看懂模型呼叫與任務設定的分工。

原本的專案讓抽象概念比較容易理解。不過，走到這裡，我開始想：

> 如果從一開始就把 Google ADK 放進專案裡，我會怎麼做？

所以這次，我決定開一個新的 repo、建立新的 LINE Bot，直接以 Google ADK 為核心，從零做一個日常真的會用到的「電影夥伴」。

這一篇先完成第一個核心循環：**建立新的 LINE Bot，接上 Google ADK 與 TMDB 電影資料，讓我在 LINE 輸入片名，就能查到電影簡介與評論連結。**

## 先從日常會問的電影問題開始

想看電影時，我最常冒出來的問題通常有這幾種：

- 最近有什麼電影可以查？
- 《全面啟動》在講什麼？簡單介紹，不要劇透。
- 這部電影有人寫過評論嗎？

如果只做單純的聊天機器人，很容易直接讓模型憑記憶回答，或是用關鍵字比對寫死指令。但電影上映資訊與評論連結需要可查證的來源，查不到時，也不能讓模型自己編造劇情。

因此，第一階段的目標很明確：收到 LINE 訊息後，真正交給 Google ADK 的 agent 判斷需求、呼叫電影查詢工具，拿到資料後，再整理成不劇透的繁體中文回覆。

## 建立新的 LINE Bot，先把訊息接進 Google ADK

這次建立的是全新的 LINE 官方帳號。

在後台啟用 Messaging API 後，我把新帳號的 Channel secret、Channel access token 與 Gemini API key 填進本機 `.env`，也先關掉平台預設的自動回覆，方便直接觀察 Google ADK 的回應。

為了讓 LINE 平台能把訊息送到本機開發中的服務，我先啟動本機 server，再用 `cloudflared` 建立臨時的 HTTPS tunnel，把 webhook 網址填回 LINE 後台完成驗證並啟用。

在訊息真正交給 Google ADK 之前，webhook 這一層先做好了兩件基本保護：

第一是驗證簽章。沒有帶簽章或簽章不符的請求會直接回傳 401，確保只有來自 LINE 的事件能進入系統。

第二是先排進佇列、立即回覆 200 OK，再由背景程式呼叫 Google ADK。如果事件超過 50 秒還沒開始處理，就直接標記過期，避免拿已經失效的回覆權杖重複發送。

等到手機上的 LINE 真的收到第一則電影回覆時，我還是忍不住問了一個問題：

> 那我還需要跟我的 Google API 串嗎？

確認後才發現，Gemini API 其實已經透過 Google ADK 接好了。剛才 agent 能讀懂問題、決定呼叫哪個工具，本來就有用到它。

這個小插曲也讓我把三個角色分得更清楚：**LINE 是對話入口，Gemini 提供理解問題與生成文字的能力，而 Google ADK 則負責組織 agent、工具與整個執行流程。**

![本篇電影簡介查詢的 LINE、ADK、Gemini 與 TMDB 流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/05-movie-lookup-flow.png)

圖 1｜本篇聚焦在電影查詢流程：LINE 收到問題後交給 Google ADK，由 LlmAgent 與 Gemini 提出 search_movies 工具呼叫，取得 TMDB 資料後再整理回覆。這是實作分工示意，並非操作畫面截圖。

## Google ADK 在這條查詢流程裡，做了哪三件事？

如果自己直接串接模型 API，得手動組裝提示詞、解析工具呼叫、執行函式，再把結果塞回下一輪請求。

而在 Google ADK 裡，這條流程被拆成三個清楚的元件。

### 1. LlmAgent：定義電影夥伴的任務與邊界

建立 LlmAgent 時，我在任務說明（instruction）裡交代了幾條明確規則：用繁體中文簡短回覆、所有電影事實都必須先查工具、簡介預設控制在兩三句且不劇透。

如果工具查詢失敗或沒有資料，也要如實說明，不能用模型自己的知識補上。同時，延續前一篇處理 504 逾時的經驗，我也替模型請求設好 20 秒逾時上限並關閉自動重試，不讓單次呼叫無限等待。

### 2. FunctionTool：把電影查詢能力交給 Google ADK 調度

接著，我把查電影的函式包成 Google ADK 的 FunctionTool，替每個工具寫清楚名稱、用途說明與需要的參數。[ADK Function tools 說明](https://adk.dev/tools-custom/function-tools/)

模型看到這份說明，才知道什麼時候該提出工具呼叫；Google ADK 則負責實際執行對應的程式，再把結果交回模型繼續整理。我們也在工具執行時印出 `[ADK tool]` 紀錄，方便在終端機觀察 Google ADK 每一步呼叫了什麼。

在查電影這條路上，這個 agent 搭配了三個工具：

- **now_playing**：查詢台灣目前的上映候選電影清單。
- **search_movies**：用片名關鍵字查詢電影名稱、上映日、繁中簡介與電影 ID。
- **movie_reviews**：根據前面查到的電影 ID，查詢繁中使用者評論的作者與原文連結。

這裡有一個刻意的設計：必須先查出電影 ID 才能查評論，而且評論只分享作者與原文連結，不讓模型自己編造影評或整體評價。

![search_movies 工具的名稱、用途與參數說明](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/06-search-movie-tool.png)

圖 2｜FunctionTool 的名稱、用途與參數會透過 Google ADK 提供給模型判斷；真正向 TMDB 發出請求的工作，仍然由工具背後的程式執行。

### 3. InMemoryRunner：管理多輪對話與執行事件

定義好 agent 與工具後，由 InMemoryRunner 負責把一輪輪對話跑起來。

當訊息進來時，Runner 會載入這位使用者的對話 session、執行 agent，並在事件流裡送出工具呼叫與最終回覆。程式只取出最終回答的文字，把中間推理過程過濾掉。

因為對話暫存在記憶體裡，我可以先問「最近有什麼電影？」，接著直接追問其中一部片在講什麼、有沒有評論。對話在閒置 30 分鐘或滿 20 回合後會自動重置，服務重啟後也會清除。

## 先用示範電影驗證 ADK 流程，再接上真實 TMDB 資料

在把外部 API 接上去之前，我們先做了一個示範模式（demo），放進《月台上的貓》、《星期天的放映室》兩部虛構電影。

這樣當 LINE webhook 剛設好時，我可以先在手機問一句「最近有什麼電影可以查？」，看著終端機印出 `[ADK tool] now_playing`，並在 LINE 收到標示為「示範模式虛構資料」的回覆。

先確認 **LINE → Webhook → Google ADK → 工具 → LINE** 整條路走得通，再來接外部資料，排查問題時單純很多。

接著，我到 [The Movie Database（TMDB）](https://developer.themoviedb.org/docs/getting-started) 申請帳號與 Read Access Token，填入本機設定並切換為真實資料模式（tmdb）。

切換後，工具會以台灣地區與繁體中文向 TMDB 查詢。實際用《全面啟動》測試時，可以看到 Google ADK 依序呼叫上映查詢、片名搜尋與評論查詢，成功帶回電影簡介與繁中評論連結。

只要當輪對話實際用過 TMDB 工具，程式就會在回覆結尾自動補上資料來源聲明與網址；在 LINE 輸入「關於」，也能查看完整的[資料來源說明](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/credits.md)。

## 實作時遇到的兩個問題：參數格式 400 與模式狀態同步

在把 Google ADK 工具接上真實模型與切換資料來源時，遇到了兩個讓我印象深刻的問題。

**第一個問題，是工具宣告傳給模型時回傳了 400。**

第一次用真實模型跑 Google ADK 工具測試時，畫面直接跳出 `Unknown name "exclusiveMinimum"` 的錯誤。

檢查後發現，評論工具的「電影 ID」參數原本設定為「正整數（`.positive()`）」。轉成 JSON Schema 後，產生了 Gemini 工具宣告不接受的 `exclusiveMinimum` 欄位。

把限制改寫成「最小為 1（`.min(1)`）」並補上檢查測試後，Google ADK 的工具呼叫才順利跑通。這提醒了我：**在 Google ADK 定義工具時，函式自己能執行還不夠，轉給模型的參數格式也必須是模型看得懂的寫法。**

**第二個問題，是資料換成真的，agent 卻還說是「虛構資料」。**

切換到 TMDB 模式後，工具明明已經查回真實電影，LINE 收到的回覆卻還寫著「這是示範模式的虛構資料」。

原來底層資料來源雖然切換成功了，但 Google ADK 的 LlmAgent 任務說明裡沒有同步收到目前的模式狀態，模型還以為自己在跑測試資料。

把目前的資料模式（tmdb 或 demo）動態寫進任務說明、重新測試後，手機上收到的電影介紹與來源連結就完全一致了。

## 先完成第一個小循環，再往日常場景延伸

走到這裡，電影夥伴已經透過 Google ADK 在 LINE 裡完成了第一個完整的小循環：

> 模型根據問題提出工具呼叫，Google ADK 執行工具、由程式向 TMDB 取得可查證的資料，最後再交回模型整理成不劇透的介紹。

不過，當我真的能查到電影簡介後，很快又冒出了一個更貼近日常的問題：

> TMDB 的上映清單只能告訴我「台灣有上映」，但如果我今晚想去松菸誠品電影院，現在到底放哪些片、幾點有場次？

要回答這個問題，不能只靠一般上映清單，而需要在同一個 Google ADK agent 裡接上影城自己的時刻表。我把這一段實作整理在下一篇：[〈今晚誠品放什麼？替 Google ADK 電影夥伴接上松菸誠品時刻表〉](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)；至於看完電影後的個人票根收藏，則整理在[第三篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-03.md)。

## 完整程式碼與參考資料

- [電影夥伴專案 Repo](https://github.com/zonawang/movie-companion-bot-01)
- [Google ADK agent 與工具定義（src/agent.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [TMDB 電影與評論查詢（src/movies.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/movies.mjs)
- [建立新的 LINE Bot 設定指南](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/line-setup.md)
- [第一版驗證紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [Google ADK TypeScript 入門](https://adk.dev/get-started/typescript/)
