# 從咖啡 Bot 到電影夥伴：這次，我想用 Google ADK 從零做一個新東西

前兩篇，我帶著原本的 LINE Cafe Bot，開始認識 Google ADK。

[第一篇](https://medium.com/@zonawang/咖啡-bot-做完之後-我想帶著原本的專案認識-google-adk-a5299a6a0d68)，先用熟悉的咖啡護照拆解流程，理解資料讀取、統計、摘要各自負責什麼。[第二篇](https://medium.com/@zonawang/第一個-adk-agent-一直沒有回答-我從-504-逾時-開始看懂模型與任務的分工-26ff72e620f0)，則讓第一個小 agent 跑起來，也從一直等待到收到 504，慢慢看懂模型呼叫與任務設定的分工。

原本的專案讓抽象概念比較容易理解。不過，走到這裡，我開始想：

> 如果從一開始就把 ADK 放進專案裡，我會怎麼做？

所以這次，我決定開一個新的 repo、建立新的 LINE Bot，和 Codex 一起用 Google ADK，從零做一個日常真的可能用到的東西。

主題從咖啡換成電影，這次想做的是一個「電影夥伴」。

## 想知道今天看什麼，也想留下看完以後的事

想到電影時，我最先想到的需求很直覺：現在有什麼可以看？這一部在講什麼？有沒有人寫過評論？

接著，我又想到看完以後，可能還想記得那天跟誰一起去，以及離開電影院時留下的那句心得。

因此，這個 Bot 先往三個方向做：找片單與放映資訊、了解電影，以及保存自己的觀影紀錄。

這些功能可以慢慢增加。這一篇先從新的 LINE Bot，以及它裡面的 ADK 分工開始。

## 建好新的 LINE Bot 後，我還是問了一次：Google API 串了嗎？

這次建立的是新的 LINE 官方帳號，啟用 Messaging API 後，訊息就能送到這個專案的 webhook。

Channel secret、Channel access token 和 Gemini API key 都放在本機 .env，程式與測試則和 Codex 一起逐步接起來。

等到 LINE 真的收到第一則電影回覆，我還問了一個問題：

> 那我還需要跟我的 Google API 串嗎？

確認後才發現，Gemini API 已經接好了。剛才 agent 能處理問題、提出工具呼叫，本來就有用到它。

這也讓我再整理一次三個角色：**LINE 是對話入口，Gemini 提供理解與生成能力，ADK 則組織 agent、工具與執行流程。**

一則訊息進來後，Gemini 會依照問題與工具說明，提出要呼叫哪個工具；ADK 執行這個呼叫，再把工具結果交回模型，讓它繼續處理。

![電影夥伴的 LINE、ADK、Gemini 與工具分工](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/01-adk-flow.png)

圖 1｜依本次程式整理的分工圖。目前採用一個 LlmAgent 搭配多個工具；這張圖是說明流程，並非已實作的 Graph Workflow。

## 今天真正用到 ADK 的地方，是這三件事

上一篇的小 agent 先練習回一句話。這次，我替它加上能實際查詢與處理資料的能力。

**LlmAgent：定義電影夥伴的任務。**

我在 instruction 裡交代：用繁體中文回覆、先查資料再回答、簡介預設不劇透；資料不足時要說明，不能自己補造場次或評論。

**FunctionTool：把程式功能交給 agent 使用。**

我把查電影、準備票根、搜尋個人紀錄等函式包成工具，寫上名稱、用途與需要的參數。模型根據這些說明提出工具呼叫，ADK 再執行對應程式。[ADK Function tools 說明](https://adk.dev/tools-custom/function-tools/)

例如，問電影內容可以使用 search_movies；想記下觀影心得，則透過 prepare_ticket 建立草稿。

**InMemoryRunner：把一輪輪對話跑起來。**

Runner 負責載入對話、執行 agent，並接收執行事件。目前對話存在記憶體，可以接著追問；程式重啟後會清除。已確認的票根另外存在 SQLite，會繼續保留。

## 工具能跑，還要確認模型看得懂參數

實作時，工具接上模型後曾回傳 400。

Codex 查到，參數限制轉成 schema 後，包含 Gemini 這次請求不接受的 exclusiveMinimum。把正整數限制從 .positive() 改成 .min(1)，再重新驗證，工具呼叫才跑通。

我先記住的是：函式本身能執行，還需要確認提供給模型的參數格式可以使用。

## 票根先做成草稿，讓我確認過再存

另一個想做的功能，是自己的電影票根收藏夾。

這裡先做文字紀錄：片名、觀影日期、影院、同行的人，以及一小段原始心得。未來的海報收藏牆或照片票根，留到後面再想。

在這條流程裡，agent 會透過 prepare_ticket 整理草稿，LINE 再顯示內容與確認按鈕。

**按下「確認儲存票根」後，程式才會檢查這張草稿是否屬於目前使用者、是否還在有效時間內，然後寫入 SQLite。**

心得保留原句，讓之後回頭看時，還能看見當時自己怎麼形容這部電影。

![票根草稿、使用者確認與資料庫儲存流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/04-ticket-confirmation.png)

圖 2｜ADK 工具負責建立草稿；確認按鈕與寫入驗證由應用程式處理。這次使用 LINE 的確認流程，沒有使用 ADK 內建的工具確認機制。

測試時，我們先用虛構電影資料驗證確認前不存檔、確認後能查回，並檢查不同使用者的資料會分開。這些示範紀錄不能當成真實觀影經歷。

## 先讓角色、工具與執行流程接起來

這一篇先整理電影夥伴的起點：建立新的 LINE Bot，透過 LlmAgent 定義任務、FunctionTool 提供能力，再用 Runner 執行對話。

票根流程也讓我更能分清楚：模型整理資訊，ADK 執行工具；確認身分、檢查期限與真正寫入，保留程式規則。

今天最想留下的是：

> 把程式功能整理成工具，讓模型依照問題提出呼叫，再由 ADK 把這些呼叫接起來。

這次實作還接上了真實電影與影城資料。我把那一段整理到[下一篇：今晚誠品放什麼？讓 ADK 電影夥伴接上真實資料](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)。

## 完整程式碼與參考資料

- [電影夥伴專案](https://github.com/zonawang/movie-companion-bot-01)
- [ADK agent 與工具定義](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [本次學習與驗證紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [Google ADK TypeScript 入門](https://adk.dev/get-started/typescript/)
