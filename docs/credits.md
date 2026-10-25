# 電影夥伴｜關於與資料來源

電影夥伴是使用 Google ADK 與 LINE Messaging API 的個人學習專案，提供電影查詢與個人觀影票根紀錄。

## 電影資料

<a href="https://www.themoviedb.org"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB" width="140"></a>

This product uses the TMDB API but is not endorsed or certified by TMDB.

電影片名、簡介、上映候選清單與使用者評論連結來自 [The Movie Database（TMDB）](https://www.themoviedb.org)。本專案不宣稱擁有這些資料或圖片的著作權，也不代表 TMDB 背書。

上映清單使用 `region=TW` 與 `language=zh-TW` 查詢，不代表台灣所有影院目前都有場次。場次仍需到影城官網確認。

評論目前查詢繁中使用者評論，只提供作者與原文連結；原文可能包含劇透。這些內容不代表專業影評、全面調查或整體觀眾共識。沒有評論時會如實告知。

## 松菸誠品的場次

松菸誠品電影片單與時間來自 [誠品電影院官方時刻表](https://meet.eslite.com/tw/tc/gallery/movieschedule/201803020001)，使用 [官方訂票入口](https://arthouse.eslite.com/visAgreement.aspx) 連回售票網站。與 TMDB 的一般上映清單分開處理。

只整理必要的片名、日期與公告場次，不複製完整電影介紹或海報。回覆附上更新與讀取時間，可能使用 5 分鐘快取；場次異動與售票狀況以誠品官方為準。本專案與誠品沒有合作或背書關係。

## 你的票根

個人票根由你提供片名、日期、同伴與心得，確認後才儲存。原始心得與電影資料分開處理，模型不會自行替你確認。對話內容與工具結果會送交 Gemini 處理；金鑰不會交給模型。

目前使用本機 SQLite 保存票根。這個版本尚未部署為長期雲端服務。

## 參考

- [TMDB API 與標示規範](https://developer.themoviedb.org/docs/faq)
- [TMDB 官方標誌](https://www.themoviedb.org/about/logos-attribution)
- [Google ADK](https://adk.dev/)
- [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/overview/)
