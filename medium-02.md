# 今晚誠品放什麼？讓 ADK 電影夥伴接上真實資料

[上一篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)，我從原本的咖啡 Bot 轉向新的電影夥伴，先整理 LINE、Gemini 與 Google ADK 的分工。

模型理解問題、提出工具呼叫，ADK 執行對應程式。接下來，我想確認的是：工具應該去哪裡取得資料，才能回答我真的想問的問題？

這篇繼續整理同一次實作的後半段，從 TMDB 的一般電影資訊，走到松菸誠品的實際公告場次。

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

圖 1｜先確認問題需要什麼資料。TMDB 補電影背景，誠品官方公告提供該影城的日期與場次；個人觀影紀錄則來自自己的票根資料庫。

這也是今天對我很有幫助的一個理解：ADK 可以使用不同來源的工具，資料來源要跟著問題選。

## 問一句「今晚誠品放什麼」，背後開始接上不同的工作

加入 cinema_schedule 後，我在 LINE 試著問：

> 今晚松菸誠品有哪些電影和場次？

Gemini 透過 ADK 提出工具呼叫，把影城、日期與時段條件交給程式。程式讀取官網目前的公告，再使用台灣時間篩選符合的場次。

這裡我特別把「理解問題」與「計算時間」分開。模型可以理解「今晚」、「六點以後」；日期驗證、時間比較與場次清單的輸出，則保留明確的程式規則。

單純查場次時，最後看到的時間清單會由程式直接組成，並附上官方更新時間、實際讀取時間，以及官方訂票入口。

收到片單後，還可以接著問一部電影在講什麼，這時就換成電影搜尋工具取得簡介，再由模型整理。

![誠品場次查詢與電影介紹的實測紀錄整理](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/03-verified-tools.png)

圖 2｜依 Codex 的真實 ADK 測試紀錄整理，非 LINE 畫面截圖。測試中先呼叫 cinema_schedule，再用 search_movies 查《進擊的鼓手》；我也在手機確認收到場次與官方連結。

看見終端機的工具名稱，再對照 LINE 收到的內容，我比較能指出 ADK 真正參與了哪一步：模型選工具，ADK 執行呼叫，工具取得資料，再接著處理下一個問題。

## 接上資料後，還遇到兩個問題

第一個，是已經查到真實電影，回覆卻還寫著「示範模式的虛構資料」。

資料來源切換成功了，但 agent 的任務說明還需要明確知道現在的模式。補上目前使用 tmdb 或 demo 的資訊，再重新測試，才讓回覆與資料狀態一致。

第二個，是讀取誠品官網時，Node fetch 收到 403。

同一個公開頁面用標準 HTTPS client 可以讀取，所以這個來源改用 node:https，並保留逾時與讀取失敗的處理。官網如果之後無法連線或格式改變，Bot 就回覆無法讀取，附上官方入口。

對我來說，這兩個問題提醒了不同的事：外部資料需要實際測試；資料狀態改變，也要讓 agent 知道。

## 能查到資料，也要說清楚資料的範圍

目前程式有 24 項測試，涵蓋票根確認、使用者隔離、場次日期與時段、跨年、快取及格式變更等情境。這些包含測試資料與模型替身，不代表每一項都連到外部服務。

Codex 另外跑了真實 Gemini、TMDB 與誠品時刻表的整合測試。我也在自己的 LINE 確認，收到了真實電影、誠品片名與場次，以及對應的官方連結。

目前影城場次先支援松菸誠品，使用五分鐘快取，沒有即時剩餘座位、票價或代訂票。某天還沒查到公告，也不能直接推論當天沒有電影。服務仍跑在本機，長期雲端部署還沒做。

這次從「現在有什麼電影」，走到「今晚誠品放什麼」，讓我更清楚看見：問題越具體，工具需要的資料也會跟著改變。

先找到能回答問題的資料，再讓 ADK 組織工具怎麼被使用。這是電影夥伴這次往前走的一小步。

## 完整程式碼與參考資料

- [電影夥伴專案](https://github.com/zonawang/movie-companion-bot-01)
- [松菸誠品影城工具](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/cinema-eslite.md)
- [本次學習與驗證紀錄](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)
- [TMDB 與本專案的資料來源標示](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/credits.md)
