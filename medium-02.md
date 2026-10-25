# 查完電影以後：替 ADK 電影夥伴加上誠品場次與票根紀錄

在[上一篇](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)，我建立了新的 LINE Bot「電影夥伴」，透過 Google ADK 串起電影查詢工具，讓 Bot 能用 TMDB 真實資料回答電影簡介與評論連結。

查得到電影簡介後，我想把問題問得更貼近自己的日常：

> 如果今晚想去松菸誠品看電影，六點以後有哪些片和場次？

還有，電影看完以後，除了片名，能不能順手留下那天跟誰一起去、離開電影院時寫下的那句心得？

這一篇接著整理我們如何在同一個 Google ADK agent 上，擴充這兩個新能力：**指定影城的場次查詢**，以及**需要確認才會存檔的個人票根紀錄**。

## 發現「有上映」和「這間影城有放」是兩個不同的問題

一開始接好 TMDB 的上映候選清單時，可以查到台灣近期上映的電影。但當我實際想出門看電影時，才發現一般的上映清單回答不了「松菸誠品今天放什麼」。

一部電影已經在台灣上映，不代表松菸誠品有排片；同一部片在哪一天、幾點放映，更需要影城自己的時刻表。

反過來說，誠品的時刻表有場次時間，卻不一定有簡短、不劇透的電影背景介紹；而看完電影後的個人紀錄，則屬於我自己的資料庫。

這正是 Google ADK 讓我覺得很順手的地方：**不需要寫一堆條件判斷去切分路由，同一個 Google ADK agent 可以同時掛載多個不同來源的工具，由模型根據問題自動挑選工具，再由 ADK 負責執行。**

![電影問題與影城場次使用不同資料來源](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/02-data-sources.png)

圖 1｜同一個 Google ADK agent 搭配三種資料來源的工具：TMDB 提供一般電影背景與評論連結，誠品官方時刻表提供該影城的指定日期與場次，個人觀影回憶則存在自己的 SQLite 票根資料庫。

## 第一個新功能：問一句「今晚誠品放什麼」，Google ADK 與程式怎麼分工？

為了回答松菸誠品的場次，我們在 Google ADK 的工具列表裡新增了 `cinema_schedule`，背後讀取[誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)。

當我在 LINE 問「今晚松菸誠品有哪些電影和場次？」或「10 月 28 日誠品晚上六點後有什麼片？」，這條流程把「語意理解」和「時間計算」切得很開：

**Google ADK 與模型負責理解問題。** 它會從對話裡讀出影城名稱、日期、想篩選的起始時間（例如晚上從 18:00 起），以及是不是只看今天還沒開演的場次，再把這些條件放進工具參數。

**工具背後的程式則負責解析日期與比較時間。** 誠品官網上的場次日期只寫了「10/25 (日)」，沒有直接標出年份；程式會先讀取頁面上的「最後更新時間」當基準，推算正確年份與跨年邊界，再用台灣時間篩選符合條件的場次。

更重要的是，單純查場次時，最後回傳給 LINE 的時間清單是由程式直接依官方資料組成的，不交給模型重新改寫。

這樣可以避免模型在整理文字時漏掉場次或改錯時間，而且每一則回覆都會附上官方更新時間、實際讀取時間與[官方訂票入口](https://arthouse.eslite.com/visAgreement.aspx)。

![松菸誠品場次查詢、時段篩選與來源標示](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/07-eslite-showtimes.png)

圖 2｜本次真實 Google ADK 測試的場次查詢整理，非 LINE 截圖。圖中的片名與時間是 2026-10-25 17:35 的讀取節錄，不代表現在的即時場次。

在邊界條件上，我們也把幾種容易混淆的情況分開處理：

- **查無該日公告**：明確回覆「尚未查到這天的場次公告，不能判定當天沒有電影」。
- **該時段沒有場次**：明確回覆「沒有符合這個時間條件的場次」，不推論為停映或票已售完。
- **問到不支援的影城**：目前場次解析只支援松菸誠品；若問到其他影城，Google ADK 會改呼叫 `showtime_links` 工具提供官網入口，絕不自己猜測時間、票價或座位。

## 讀官網遇到 403，以及用 Google ADK 跨工具接力追問

剛把誠品時刻表接進工具做第一次測試時，馬上遇到一個問題：用 Node 內建的 `fetch` 讀取官網公開頁面時，收到了 HTTP 403，拿不到任何資料。

對照測試後發現，同一個公開網址不需要任何登入資訊或 cookie，只要改用標準的 `node:https` 發出一般請求，就能正常讀回頁面上的 21 個電影區塊。

為了對官方網站保持友善，我們加上了 5 分鐘共享快取，並把同時進來的請求合併成一次連線；如果未來官網無法連線或網頁結構改變，Bot 也不會拿舊快取冒充現在的場次，而是直接說明無法讀取並附上官方入口。

當場次查詢跑通後，最讓我感受到 Google ADK 價值的是**跨工具的多輪接力**。

在真實測試與手機實測中，我先問「今晚松菸誠品有哪些電影和場次？」，Google ADK 先呼叫 `cinema_schedule` 篩出晚上六點後的《社群清算》、《進擊的鼓手（特別場）》等片。

看到片單後，我接著追問一句：

> 《進擊的鼓手》在講什麼？

因為 Google ADK 的 InMemoryRunner 保有同一個對話 session 的上下文，agent 知道我問的是剛才片單裡的電影，也判斷出這次需要的是電影介紹，於是自動切換呼叫上一篇做好的 `search_movies` 工具，從 TMDB 把簡介帶回來整理給我。

![誠品場次查詢與電影介紹的實測紀錄整理](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/03-verified-tools.png)

圖 3｜依真實 Google ADK 整合測試紀錄整理：第一輪先由 cinema_schedule 查誠品晚間場次，第二輪追問片名時，由 InMemoryRunner 延續對話並自動接力呼叫 search_movies 查 TMDB 簡介。

## 第二個新功能：用 Google ADK 整理票根草稿，確認過才寫入 SQLite

除了出發前查場次，我也想替看完電影後的時刻留下紀錄。

第一版的「個人票根收藏夾」先收錄五個文字欄位：**片名、觀影日期、影院、同行的人，以及自己的原始心得**。海報收藏牆或照片票根，留到後面再想。

在設計這個功能時，我特別留意 **Google ADK 工具呼叫與資料庫寫入權限的邊界**。寫入個人資料庫和單純查資料不同，我不希望模型聽錯一句話，就直接把錯誤的紀錄存進資料庫。

因此，我們刻意**不給 Google ADK 的 agent 任何直接寫入正式票根表的工具**，而是把流程拆成兩段：

**第一步，由 Google ADK 呼叫 `prepare_ticket` 建立待確認草稿。**

當我在 LINE 說「我 2026-10-25 跟小安看了月台上的貓，心得是配樂很好聽」，agent 會從自然語言整理出欄位並建立一張 10 分鐘有效的草稿，再由 LINE 顯示草稿內容與「確認儲存票根／取消」按鈕。

為了避免模型把我的個人心得改寫成制式摘要，除了在任務說明規定之外，工具背後的程式也會直接比對：心得文字必須逐字出現在我剛才傳送的原始訊息裡，否則拒絕建立草稿。這樣以後回頭看時，讀到的還會是當時自己寫下的原句。

**第二步，按下 LINE 確認按鈕後，才由程式驗證並寫入 SQLite。**

當我在手機按下「確認儲存票根」，程式會在 SQLite 交易裡同時檢查：這張草稿是否屬於目前這位使用者、狀態是否還未處理、是否還在 10 分鐘有效期限內。

全部通過後，才會真正寫入正式票根表；重複點擊不會存成兩張，按下取消也不會新增任何紀錄。

![票根草稿、使用者確認與資料庫儲存流程](https://raw.githubusercontent.com/zonawang/movie-companion-bot-01/main/assets/medium/04-ticket-confirmation.png)

圖 4｜Google ADK 的 prepare_ticket 工具只負責建立待確認草稿；使用者在 LINE 按下確認後，才由應用程式檢查身分與期限並寫入 SQLite。這次採用 LINE 的確認流程，沒有使用 ADK 內建的工具確認機制。

儲存成功後，之後只要問「我跟小安看過哪些電影？」或搜尋片名、心得關鍵字，Google ADK 就會呼叫 `list_tickets` 工具，從 SQLite 找回屬於我自己的票根紀錄。

不同使用者的資料彼此隔離，而且就算服務重啟或切換資料模式，已經確認存入 SQLite 的票根依然會完整保留。

## 驗證與目前的範圍

加上誠品場次與個人票根後，目前整個專案共有 24 項自動化測試，涵蓋 Google ADK Runner 與 7 個工具的呼叫流程、誠品時刻表解析與跨年計算、快取、票根確認前不存檔、逐字心得檢查、跨使用者隔離，以及 LINE webhook 簽章驗證。

除了自動化測試，我們也跑了連接真實 Gemini、TMDB 與誠品時刻表的整合測試，並由我在自己的手機 LINE 上完成真實訊息、誠品場次、電影簡介與來源連結的收發確認。

目前這個版本仍有很清楚的範圍：

- 影城場次先支援松菸誠品電影院，使用 5 分鐘快取，沒有即時剩餘座位、票價或代訂票。
- LINE Bot 第一版僅支援一對一聊天，目前跑在本機與開發用 tunnel，長期雲端部署留待後續完成。

從第一篇的「輸入片名查簡介」，到這一篇補上「出發前查松菸誠品場次」與「看完後存下自己的票根」，我對 Google ADK 在實際產品裡的位置有了更具體的體會：

> 讓模型負責理解語意並選擇工具，讓 Google ADK 把不同來源的工具組織在同一個對話裡，而把時間計算、資料格式與寫入確認交給明確的程式規則。

## 完整程式碼與參考資料

- [電影夥伴專案 Repo](https://github.com/zonawang/movie-companion-bot-01)
- [上一篇｜從咖啡 Bot 到電影夥伴：用 Google ADK 做出第一個查電影功能](https://github.com/zonawang/movie-companion-bot-01/blob/main/medium.md)
- [Google ADK agent 與 7 個工具定義（src/agent.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/agent.mjs)
- [松菸誠品影城工具說明（docs/cinema-eslite.md）](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/cinema-eslite.md)
- [誠品時刻表解析與快取（src/cinema.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/cinema.mjs)
- [SQLite 票根草稿與確認交易（src/store.mjs）](https://github.com/zonawang/movie-companion-bot-01/blob/main/src/store.mjs)
- [第一版驗證紀錄（docs/verification.md）](https://github.com/zonawang/movie-companion-bot-01/blob/main/docs/verification.md)
- [誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)
