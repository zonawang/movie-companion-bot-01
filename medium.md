# 從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能

前兩篇，我帶著原本的 LINE Cafe Bot，開始認識 Google ADK。

[第一篇](https://medium.com/@zonawang/咖啡-bot-做完之後-我想帶著原本的專案認識-google-adk-a5299a6a0d68)，用咖啡護照拆解流程，理解資料讀取、統計與摘要的分工。[第二篇](https://medium.com/@zonawang/第一個-adk-agent-一直沒有回答-我從-504-逾時-開始看懂模型與任務的分工-26ff72e620f0)，則讓第一個小 agent 跑起來，也從 504 逾時開始，慢慢看懂模型呼叫與任務設定。

原本的專案讓抽象概念比較容易理解。不過，走到這裡，我開始想：

> 如果從一開始就把 ADK 放進專案裡，我會怎麼做？

所以這次，我開了一個新的 repo、建立新的 LINE Bot，和 Codex 一起從零做一個「電影夥伴」。

這篇先挑一個小功能來看：**在 LINE 輸入片名，查到這部電影在講什麼。**

## 先從一個問題開始

想看電影時，我常常先知道片名，卻還不清楚內容。

我想讓 Bot 接得住這種問題：

> 《全面啟動》在講什麼？簡單介紹，不要劇透。

先完成這件事，就有一條可以觀察的流程：收到問題、找到電影資料、整理簡介，再回到 LINE。

## 建好 LINE Bot 後，我還是問了一次：Google API 串了嗎？

這次建立的是新的 LINE 官方帳號。啟用 Messaging API 後，訊息會送到專案的 webhook，再交給 agent 處理。

Channel secret、Channel access token 與 Gemini API key 都放在本機 .env，程式與測試則和 Codex 一起逐步接起來。

等到 LINE 收到第一則回覆，我還問了一個問題：

> 那我還需要跟我的 Google API 串嗎？

確認後才發現，Gemini API 已經接好了。剛才 agent 能處理問題、提出工具呼叫，本來就有使用它。

這也讓我把三個角色再分清楚一次：**LINE 是入口，Gemini 理解問題與生成文字，ADK 則組織 agent、工具與執行流程。**

![本篇電影簡介查詢的 LINE、ADK、Gemini 與 TMDB 流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/05-movie-lookup-flow.png)

圖 1｜本篇只看電影簡介查詢：ADK 執行 search_movies，取得工具結果後，再交給模型整理。這是實作分工示意，並非操作畫面截圖。

## ADK 在這個小功能裡，做了什麼？

**LlmAgent 定義任務。**

我在 instruction 裡交代：用繁體中文、先查資料再回答、簡介預設不劇透；查不到時要說明，不能自己補造內容。

**FunctionTool 提供查詢能力。**

我把查電影的函式包成 search_movies，說明它的用途與需要的參數。模型看到這份說明，才能提出「用這個片名查詢」的工具呼叫；ADK 再執行對應程式。[Function tools 說明](https://adk.dev/tools-custom/function-tools/)

工具背後使用 TMDB，也就是 The Movie Database，取得片名與電影簡介。申請 Read Access Token、填入本機設定後，就能透過 API 查真實資料。[TMDB 官方介紹](https://developer.themoviedb.org/docs/getting-started)

![search_movies 工具的名稱、用途與參數說明](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/06-search-movie-tool.png)

圖 2｜工具的名稱、用途與參數會提供給模型；真正呼叫 TMDB 的工作，仍然由工具背後的程式執行。

**InMemoryRunner 把對話跑起來。**

它負責載入對話、執行 agent，並接收執行事件。目前對話存在記憶體，可以接著追問；程式重啟後，這段對話會清除。

## 資料換成真的，agent 也要知道

切換 TMDB 後，曾出現一個有點意外的狀況：工具已經查到真實電影，回覆卻還寫著「示範模式的虛構資料」。

資料來源切換成功了，任務說明還需要明確告訴 agent 現在使用 tmdb 或 demo。補上模式資訊、重新測試後，回答才跟資料狀態一致。

Codex 在本機實際用《全面啟動》驗證電影搜尋與簡介。我也另外在 LINE 確認，電影資料與來源連結可以正常回覆。

這次我先看懂一個完整的小循環：模型根據問題提出工具呼叫，ADK 執行工具，程式取得資料，再讓模型整理成我看得懂的文字。

從原本認識框架的概念，走到新的 LINE Bot 能查電影，ADK 開始有了比較具體的位置。

接下來，再替它加入[影城場次與自己的觀影紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-02.md)。

## 完整程式碼與參考資料

- [電影夥伴專案](https://github.com/zonawang/movie-companion-bot-01)
- [ADK agent 與工具定義](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [本次驗證紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [Google ADK TypeScript 入門](https://adk.dev/get-started/typescript/)
