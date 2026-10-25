# 從咖啡 Bot 到電影夥伴：這次，我想用 Google ADK 從零做一個新東西

前兩篇，我帶著原本的 LINE Cafe Bot，開始認識 Google ADK。

[第一篇](https://medium.com/@zonawang/咖啡-bot-做完之後-我想帶著原本的專案認識-google-adk-a5299a6a0d68)，先用熟悉的咖啡護照拆解流程，理解資料讀取、統計、摘要各自負責什麼。[第二篇](https://medium.com/@zonawang/第一個-adk-agent-一直沒有回答-我從-504-逾時-開始看懂模型與任務的分工-26ff72e620f0)，則讓第一個小 agent 跑起來，也從一直等待到收到 504，慢慢看懂模型呼叫與任務設定的分工。

原本的專案讓抽象概念比較容易理解。不過，走到這裡，我開始想：

> 如果從一開始就把 ADK 放進專案裡，我會怎麼做？

所以這次，我決定開一個新的 repo、建立新的 LINE Bot，和 Codex 一起用 Google ADK，從零做一個日常真的可能用到的東西。

主題從咖啡換成電影，這次想做的是一個「電影夥伴」。

## 想知道今天看什麼，也想留下看完以後的事

想到電影時，我第一個想到的需求很直覺：現在有什麼電影可以看？這一部在講什麼？有沒有人寫過評論？

接著，我又想到另一種時刻。

電影看完後，除了片名，我可能還想記得：那天跟誰一起去、在哪裡看，以及離開電影院時留下的那句心得。

因此，這個 Bot 先往三個方向做：

- 看電影以前，幫我找片單與放映資訊。
- 想了解一部片時，幫我查簡介與使用者評論連結。
- 看完以後，把日期、同伴與心得收進自己的票根紀錄。

這些功能可以慢慢增加。今天先讓它在 LINE 裡，完成一個能查資料、也能留下紀錄的小循環。

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

**第一個是 LlmAgent：定義電影夥伴的任務。**

我在 instruction 裡交代：用繁體中文回覆、先查資料再回答、簡介預設不劇透；資料不足時要說明，不能自己補造場次或評論。

這份任務說明也會告訴它，目前使用的是真實 TMDB 資料，或只是虛構示範資料。

**第二個是 FunctionTool：把程式功能交給 agent 使用。**

我先把查電影、查評論、準備票根、搜尋個人紀錄等函式包成工具，替它們寫上名稱、用途與需要的參數。

例如，問「這部在講什麼」，可以呼叫 search_movies；想記下觀影心得，就用 prepare_ticket 建立草稿。之後加入的影城查詢，則叫 cinema_schedule。

工具的說明會提供給模型，讓模型判斷怎麼使用；真正取得資料與操作資料庫的，仍然是工具背後的程式。[ADK Function tools 說明](https://adk.dev/tools-custom/function-tools/)

**第三個是 InMemoryRunner：把一輪輪對話跑起來。**

這份專案透過 Runner 載入對話、執行 agent，並接收它產生的事件。對話紀錄暫時放在記憶體裡，因此可以從查片單接著追問電影介紹；程式重啟後，這段對話會清除。

個人票根另外保存在 SQLite，不會跟著對話一起消失。

今天先理解這三個元件，就已經能把「定義角色」、「提供工具」和「執行對話」連在一起看。

## 先接 TMDB，才發現「有上映」和「這間影城有放」是兩個問題

第一個電影資料來源選了 TMDB，也就是 The Movie Database。

它提供片名、電影簡介、上映候選清單與使用者評論等資料，適合先把「ADK 呼叫工具、工具帶回真實資料」這條路跑通。[TMDB 官方介紹](https://developer.themoviedb.org/docs/getting-started)

我申請帳號與 Read Access Token，填進本機設定。切換後，LINE 就能回覆真實電影與 TMDB 來源連結。

但接著，我問了一個更接近日常的問題：

> 如果我想知道松菸誠品電影院現在放哪些片，查得到嗎？

這時候才更清楚：一般的上映清單，不能直接拿來回答某間影城今天放什麼。

電影可能已經上映，卻不代表松菸誠品有排；同一部片在哪一天、幾點放，也要有影城自己的資料。

因此，這個專案多了一個資料來源：[誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)。影城片單與時間從這裡查，電影背景再視需要用 TMDB 補充。

![電影問題與影城場次使用不同資料來源](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/02-data-sources.png)

圖 2｜先確認問題需要什麼資料。TMDB 補電影背景，誠品官方公告提供該影城的日期與場次；個人觀影紀錄則來自自己的票根資料庫。

這也是今天對我很有幫助的一個理解：ADK 可以使用不同來源的工具，資料來源要跟著問題選。

## 問一句「今晚誠品放什麼」，背後開始接上不同的工作

加入 cinema_schedule 後，我在 LINE 試著問：

> 今晚松菸誠品有哪些電影和場次？

Gemini 透過 ADK 提出工具呼叫，把影城、日期與時段條件交給程式。程式讀取官網目前的公告，再使用台灣時間篩選符合的場次。

這裡我特別把「理解問題」與「計算時間」分開。模型可以理解「今晚」、「六點以後」；日期驗證、時間比較與場次清單的輸出，則保留明確的程式規則。

單純查場次時，最後看到的時間清單會由程式直接組成，並附上官方更新時間、實際讀取時間，以及官方訂票入口。

收到片單後，還可以接著問一部電影在講什麼，這時就換成電影搜尋工具取得簡介，再由模型整理。

![誠品場次查詢與電影介紹的實測紀錄整理](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/03-verified-tools.png)

圖 3｜依 Codex 的真實 ADK 測試紀錄整理，非 LINE 畫面截圖。測試中先呼叫 cinema_schedule，再用 search_movies 查《進擊的鼓手》；我也在手機確認收到場次與官方連結。

看見終端機的工具名稱，再對照 LINE 收到的內容，我比較能指出 ADK 真正參與了哪一步：模型選工具，ADK 執行呼叫，工具取得資料，再接著處理下一個問題。

## 票根先做成草稿，讓我確認過再存

另一個想做的功能，是自己的電影票根收藏夾。

這裡先做文字紀錄：片名、觀影日期、影院、同行的人，以及一小段原始心得。未來的海報收藏牆或照片票根，留到後面再想。

在這條流程裡，agent 會透過 prepare_ticket 整理草稿，LINE 再顯示內容與確認按鈕。

**按下「確認儲存票根」後，程式才會檢查這張草稿是否屬於目前使用者、是否還在有效時間內，然後寫入 SQLite。**

心得保留原句，讓之後回頭看時，還能看見當時自己怎麼形容這部電影。

![票根草稿、使用者確認與資料庫儲存流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/04-ticket-confirmation.png)

圖 4｜ADK 工具負責建立草稿；確認按鈕與寫入驗證由應用程式處理。這次使用 LINE 的確認流程，沒有使用 ADK 內建的工具確認機制。

測試時，我們先用虛構電影資料驗證確認前不存檔、確認後能查回，並檢查不同使用者的資料會分開。這些示範紀錄不能當成真實觀影經歷。

## 今天也遇到幾個讓我重新確認分工的問題

第一個，是工具接上模型後回傳了 400。

Codex 查到，工具參數的限制轉成 schema 後，包含 Gemini 這次請求不接受的 exclusiveMinimum。把正整數限制從 .positive() 改成 .min(1)，再重新驗證，工具呼叫才跑通。

我先記住的是：工具背後的函式能跑，還需要確認模型看得懂它的參數格式。

第二個，是已經查到真實電影，回覆卻還寫著「示範模式的虛構資料」。

資料來源切換成功了，但 agent 的任務說明還需要明確知道現在的模式。補上目前使用 tmdb 或 demo 的資訊，再重新測試，才讓回覆與資料狀態一致。

第三個，是讀取誠品官網時，Node fetch 收到 403。

同一個公開頁面用標準 HTTPS client 可以讀取，所以這個來源改用 node:https，並保留逾時與讀取失敗的處理。官網如果之後無法連線或格式改變，Bot 就回覆無法讀取，附上官方入口，讓使用者直接確認。

這幾個問題讓今天的實作變得更具體：模型、工具參數、外部資料來源與程式設定，都有各自需要驗證的地方。

## 今天完成的，是一條真的能在 LINE 裡使用的流程

目前程式有 24 項測試，涵蓋票根確認、使用者資料隔離、場次日期與時段、跨年、快取，以及官網格式變更等情境。這些包含使用測試資料與模型替身的驗證，不代表 24 項都連到外部服務。

Codex 另外跑了真實 Gemini、TMDB 與誠品時刻表的整合測試。我也在自己的 LINE 確認，收到了真實電影、誠品片名與場次，以及對應的官方連結。

這個版本仍然有很清楚的範圍：影城場次先支援松菸誠品，資料使用五分鐘快取，沒有即時剩餘座位、票價或代訂票。某天還沒查到公告，也不能直接推論當天沒有電影。

服務目前跑在本機，長期雲端部署還沒做。

從前兩篇帶著舊專案認識概念，到今天從零做出新的電影夥伴，我開始能把 ADK 放回一個實際需求裡理解。

今天最想留下的，是這句話：

> 把程式功能整理成工具，讓模型依照問題提出呼叫，再由 ADK 把這些呼叫接起來。

對我來說，這比先記住很多名詞更有感。當我真的能問「今晚誠品放什麼」，再接著了解一部電影，ADK、模型與一般程式的分工，就慢慢有了具體的樣子。

## 完整程式碼與參考資料

- [電影夥伴專案](https://github.com/zonawang/movie-companion-bot-01)
- [ADK agent 與工具定義](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [本次學習與驗證紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [松菸誠品影城工具](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/cinema-eslite.md)
- [Google ADK TypeScript 入門](https://adk.dev/get-started/typescript/)
- [Google ADK Function tools](https://adk.dev/tools-custom/function-tools/)
- [TMDB 與本專案的資料來源標示](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/credits.md)
