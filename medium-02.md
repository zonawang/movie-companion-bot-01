# 今晚誠品放什麼？替 Google ADK 電影夥伴接上松菸誠品時刻表

在[上一篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)，我建立了新的 LINE Bot「電影夥伴」，透過 Google ADK 串起電影查詢工具，讓 Bot 能用 TMDB 真實資料回答電影簡介與評論連結。

查得到電影簡介後，我想把問題問得更貼近自己出門看電影的習慣：

> 如果今晚想去松菸誠品看電影，六點以後有哪些片和場次？

這一篇接著整理我們如何在同一個 Google ADK agent 上，擴充第一個指定影城工具：**松菸誠品場次查詢（`cinema_schedule`）**，並讓它和原本的電影簡介工具在同一個對話裡接力合作。

## 發現「有上映」和「這間影城有放」是兩個不同的問題

一開始接好 TMDB 的上映候選清單（`now_playing`）時，可以查到台灣近期上映的電影。

但當我實際想出門看電影時，才發現一般的上映清單回答不了「松菸誠品今天放什麼」。

一部電影已經在台灣上映，不代表松菸誠品有排片；同一部片在哪一天、幾點放映，更需要影城自己的時刻表。反過來說，誠品的時刻表有場次時間，卻不一定有簡短、不劇透的電影背景介紹。

這正是 Google ADK 讓我覺得很順手的地方：**不需要寫一堆條件判斷去切分路由，同一個 Google ADK `LlmAgent` 可以同時掛載多個不同來源的 `FunctionTool`，由模型根據問題自動挑選工具，再由 ADK 負責執行。**

![電影問題與影城場次使用不同資料來源](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/02-data-sources.png)

圖 1｜同一個 Google ADK agent 搭配不同資料來源的工具：TMDB 提供一般電影背景與評論連結，誠品官方時刻表提供該影城的指定日期與場次，個人觀影回憶則存在自己的 SQLite 票根資料庫。

## 問一句「今晚誠品放什麼」，Google ADK 與程式怎麼分工？

為了回答松菸誠品的場次，我們在 Google ADK 的工具列表裡新增了 `cinema_schedule`，背後讀取[誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)。

當我在 LINE 問「今晚松菸誠品有哪些電影和場次？」或「10 月 28 日誠品晚上六點後有什麼片？」，這條流程把「語意理解」和「時間計算」切得很開：

**Google ADK 與模型負責理解問題。**

模型會從自然語言對話裡讀出四個條件：影城名稱（`cinema`）、日期（`date`）、想篩選的起始時間（`afterTime`，例如晚上從 18:00 起），以及是不是只看今天還沒開演的場次（`onlyUpcoming`），再由 Google ADK 帶入這些參數執行工具。

如果我只說「今天」或「今晚」，模型會依任務說明傳入空字串，交給程式直接取台灣時間的今天，避免模型自己算錯日期。

**工具背後的程式則負責解析日期與比較時間。**

誠品官網上的場次日期只寫了「10/25 (日)」，沒有直接標出年份。程式會先讀取頁面上的「最後更新時間」當基準，推算正確年份與跨年邊界，再用台灣時間篩選符合條件的場次。

更重要的是，單純查場次時，最後回傳給 LINE 的時間清單是由程式直接依官方資料組成的，不交給模型重新改寫。

這樣可以避免模型在整理文字時不小心漏掉場次或改錯時間，而且每一則回覆都會附上官方更新時間、實際讀取時間與[官方訂票入口](https://arthouse.eslite.com/visAgreement.aspx)。

![松菸誠品場次查詢、時段篩選與來源標示](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/07-eslite-showtimes.png)

圖 2｜本次真實 Google ADK 測試的場次查詢整理，非 LINE 截圖。圖中的片名與時間是 2026-10-25 17:35 的讀取節錄，不代表現在的即時場次。

## 把「還沒公告」、「這時段沒場次」與「不支援的影城」分清楚

查影城場次時，有幾種「查不到結果」的情況其實代表完全不同的意思。我們在工具回傳狀態與 Google ADK 的任務說明裡，把它們分開處理：

**第一種是「尚未查到這天的公告」。**

影城通常只公布近期幾天的排片。如果問到比較後面的日期，官網還沒有那一天的區塊，Bot 會明確說明「尚未查到這天的場次公告，不能判定當天沒有電影」。

**第二種是「這個時段沒有場次」。**

如果當天已經有排片公告，但篩選「晚上八點以後」沒有符合的場次，Bot 會說明「目前公告中沒有符合這個時間條件的場次」，而不會推論成電影停映或票已經賣完。

**第三種是「問到目前不支援的影城」。**

目前場次解析先支援松菸誠品電影院。如果在 LINE 問了其他影城，Google ADK 的 agent 不會拿一般上映清單去冒充，而是改呼叫另一個 `showtime_links` 工具，提供官方查詢入口並說明限制，絕不自己猜測時間、票價或剩餘座位。

## 讀官網成功以前，先遇到一次 403

剛把誠品時刻表接進 Google ADK 工具做第一次真實測試時，馬上遇到一個意外：用 Node 內建的 `fetch` 讀取官網公開頁面時，收到了 HTTP 403，拿不到任何場次資料。

對照測試後發現，同一個公開網址不需要任何登入資訊、瀏覽器 cookie 或驗證挑戰，只要改用 Node 標準的 `node:https` 發出一般請求，就能正常回傳 200 OK，並解析出當時頁面上的 21 個電影區塊。

為了對官方網站保持友善並兼顧穩定度，我們也在讀取層加上了幾道保護：

- **5 分鐘共享快取**：五分鐘內的多則查詢共用同一份解析結果，避免每收到一則 LINE 訊息就重新抓取官網。
- **併發請求合併**：如果同一時間有多則詢問進來，只會發起一次連線，並遵守 `robots.txt` 的讀取間隔。
- **格式變更安全退場**：如果未來官網暫時無法連線，或網頁結構改變導致解析失敗，Bot 不會拿過期的舊快取冒充現在場次，而是直接說明無法讀取並附上官方入口。

## 用 Google ADK 的 InMemoryRunner，從「查場次」接力追問「電影在講什麼」

當 `cinema_schedule` 跑通後，最讓我感受到 Google ADK 價值的是**跨工具的多輪接力**。

在真實 Google ADK 整合測試（`npm run smoke:cinema`）與手機實測中，我先問：

> 今晚松菸誠品有哪些電影和場次？

Google ADK 先呼叫 `cinema_schedule`，篩出晚上六點後的《社群清算》（19:20）、《進擊的鼓手（特別場）》（19:30）等 6 部電影。

看到片單後，不用離開對話，我接著追問一句：

> 《進擊的鼓手》在講什麼？

因為 Google ADK 的 `InMemoryRunner` 保有同一個對話 session 的上下文，agent 知道我問的是剛才片單裡的電影，也判斷出這次需要的是「電影簡介」而非「影城排片」，於是自動切換呼叫上一篇做好的 `search_movies` 工具，從 TMDB 把電影簡介（ID `244786`）帶回來整理成兩句不劇透的介紹。

![誠品場次查詢與電影介紹的實測紀錄整理](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/03-verified-tools.png)

圖 3｜依真實 Google ADK 整合測試紀錄整理：第一輪先由 cinema_schedule 查誠品晚間場次，第二輪追問片名時，由 InMemoryRunner 延續對話並自動接力呼叫 search_movies 查 TMDB 簡介。

## 出發前找得到場次了，那看完電影以後呢？

從第一篇的「查一部電影在講什麼」，到這一篇的「查今晚松菸誠品放什麼，再接著問片名介紹」，我看見 Google ADK 如何把不同資料來源的工具串在同一個自然對話裡：

> 讓模型負責理解「今晚、六點以後、這部片在講什麼」，讓 Google ADK 決定每一輪該呼叫哪個工具，而把日期推算、時間比較與場次清單交給明確的程式規則。

解決了「出發看電影以前」的問題後，下一個想接住的時刻，是走出電影院之後：

> 看完電影後，能不能順手在 LINE 記下今天跟誰一起看、離開戲院時的那句心得，存成自己的票根收藏？

寫入個人資料庫和查詢公開資料不同，還多了一層「不能讓 AI 沒經過我確認就自己存檔」的邊界。我把這段實作整理在下一篇：[〈不只是查電影：用 Google ADK 整理觀影票根草稿，確認過才寫入 SQLite〉](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-03.md)。

## 完整程式碼與參考資料

- [電影夥伴專案 Repo](https://github.com/zonawang/movie-companion-bot-01)
- [第一篇｜從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)
- [第三篇｜不只是查電影：用 Google ADK 整理觀影票根草稿，確認過才寫入 SQLite](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium-03.md)
- [松菸誠品影城工具說明（docs/cinema-eslite.md）](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/cinema-eslite.md)
- [誠品時刻表解析與快取（src/cinema.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/cinema.mjs)
- [誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)
