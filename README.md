# 台灣電子發票收集器（Taiwan E-Invoice Collector）

一個開源的 Google Apps Script 專案，能自動把你的台灣電子發票收集到 Google Sheet 中，方便直接交給 AI 工具或自動化流程處理。

## 功能特色

- **自動抓取**：從財政部電子發票整合服務平台同步發票與品項明細到你自己的 Google Sheet。
- **Web App**：輕量的瀏覽器內介面（與同一個 script 一起部署），可依月份搜尋、篩選並檢視發票與品項。
- **用你自己的方式做 AI 分類與分析**：表格中已預留 `Category` / `Main Category` / `Subcategory` 欄位，直接把 ChatGPT（或任何 AI 工具）連到這份表格就能進行分類與消費分析，不需要額外串接程式碼。
- **自帶自動化**：因為資料就放在一般的 Google Sheet 裡，Zapier / Make / n8n 內建的 Google Sheets 觸發器（或直接呼叫 Sheets API）都能直接使用。
- **無需後端、無主機費用**：所有運算都在你自己的 Google 帳號中，使用 Apps Script 的免費額度執行。

## 快速安裝

透過範本試算表安裝：

1. 開啟 [Taiwan E-Invoice Collector 範本試算表](https://docs.google.com/spreadsheets/d/1355FPdglSwXjqbiN6hw-VQEC_BGJdqb4G71tQeHsJ5s/copy)，點選 **使用範本**（這會建立屬於你自己的副本，你的發票資料不會碰到別人的試算表）。
2. 在你的副本中，開啟 **擴充功能 → Apps Script**，腳本已經綁定到你的試算表。
3. 前往 **專案設定 → Script properties**，新增以下屬性：

   | 屬性 | 是否必填 | 說明 |
   |---|---|---|
   | `EINVOICE_MOBILE` | 是 | 你在電子發票平台登入用的手機號碼 |
   | `EINVOICE_PASSWORD` | 是 | 電子發票平台密碼 |
   | `PERIODS_TO_FETCH` | 否（預設 `3`） | 要同步幾個雙月期（2 個月一期）的資料 |

4. 在 Apps Script 編輯器中執行一次 `syncTaiwanEInvoicesToSheet` 以授權腳本（因為這是你自己的個人副本，Google 會顯示「未經驗證的應用程式」警告，點選 **進階 → 前往（專案名稱）（不安全）** 即可繼續）。
5. 部署為 Web App：**部署 → 新增部署作業 → Web 應用程式**，執行身分選「我」，存取權限選「僅限本人」（如果想開放他人檢視，可選「知道連結的任何人」）。開啟部署網址即可瀏覽發票。
6. （選用）在 `syncTaiwanEInvoicesToSheet` 上新增時間驅動觸發條件（Apps Script 編輯器 → **觸發條件** → **新增觸發條件**），即可自動定期同步，例如每天一次。

## 試算表分頁說明

腳本會在你的 Google 試算表中自動建立／使用以下分頁（除 `Invoices` 外，其他分頁第一次被用到時會自動建立，不需要手動新增）：

| 分頁 | 欄位 | 內容 |
|---|---|---|
| **Invoices** | Invoice Number、Date、Month、Seller、Amount、Main Category、Subcategory、Carrier、Period、Fetched At、Note、Items | 從電子發票平台同步回來的發票主檔，`Fetched At` 同時也是 Web App 設定頁「最後同步」時間的來源 |
| **InvoiceDetails** | Item Key、Invoice Number、Date、Month、Seller、Item Description、Item Quantity、Item Unit Price、Item Amount、Fetched At | 每張發票的品項明細 |
| **Categories** | Main Category、Subcategory | 分類對照表，預設 11 個主類別（餐飲、食品雜貨、交通、購物、居家、水電電信、健康、娛樂、旅行、教育、工作），可直接編輯來新增/調整類別 |
| **AIPrompts** | Title、Prompt | Web App「AI 範本」分頁顯示的提示詞清單，編輯這裡的內容就能自訂或新增自己的 AI 提示詞，不需要改程式碼 |
| **AIInsights** | ID、Month、Type、Tag、Title、Content、CreatedAt | AI 寫入的本月報告（Type=report）與洞察小卡（Type=card，Tag 為 info/warning/tip/good），顯示在 Web App 首頁與「AI 洞察」分頁 |

## Web App 分頁說明

部署後開啟 Web App 網址，畫面上有以下分頁：

| 分頁 | 內容 |
|---|---|
| **首頁** | 本月總支出與環比上月變化、前 5 大類別、近 6 個月趨勢圖、最近發票，以及 AI 洞察摘要卡片（最多 3 張）與本月報告第一段 |
| **發票** | 完整發票清單，可依月份／日期切換、依商店或品項搜尋、依類別篩選，並可匯出 CSV / JSON |
| **彙總** | 依月份做的分類彙總，含本月 vs. 上月長條圖比較，主類別可展開看子類別明細 |
| **AI 洞察** | 顯示 AI 寫入 `AIInsights` 工作表的本月報告全文與洞察小卡（標記 info / warning / tip / good） |
| **AI 範本** | 預設的 AI 提示詞（分類、消費分析、訂閱服務分析、異常消費、產生本月 AI 洞察），一鍵複製貼到 ChatGPT 等工具使用 |
| **設定** | 發票同步、同步歷史紀錄、資料匯出等設定 |

## 分類、消費分析與自動化

本專案刻意**不**內建分類器或對外 webhook。發票一旦同步進 Google Sheet，這份表格本身就是整合的入口——直接把任何你想用的工具接到這個檔案即可。

### 用 ChatGPT 幫發票分類

最簡單的方式是用 Web App 內建的「AI 範本」分頁：

1. 開啟 Web App，切到 **AI 範本** 分頁，裡面已經整理好幾組現成的提示詞（分類、消費分析、訂閱服務分析、異常消費、產生本月 AI 洞察），按 **複製範本** 即可複製到剪貼簿。
2. 貼到 ChatGPT（或任何能存取 Google Sheets 的 AI 工具），並啟用 **Google Drive 連接器**（設定 → 連接器 → Google Drive）或具備 Drive/Sheets 存取權的 Custom GPT / Action，讓它能打開提示詞裡帶的試算表連結並讀寫資料。
3. 讓 ChatGPT 把分類結果或洞察內容寫回表格（它可以透過 Drive 連接器直接編輯 Sheets，或者你也可以貼上它的輸出，用 **特別貼上 → 僅貼上值** 來填入欄位）。

如果想用自己的提示詞，不需要改程式碼——直接到試算表中的 `AIPrompts` 工作表（第一次開啟 Web App 的「AI 範本」分頁時會自動建立，欄位為 `Title` / `Prompt`）新增或修改內容即可，Web App 的「AI 範本」分頁會直接讀取這份表單並顯示出來。

`Invoices` 分頁已經內建 `Category`、`Main Category`、`Subcategory` 欄位（定義於 `src/Fetch.js` 的 `INVOICE_HEADERS`），所以任何分類工具——ChatGPT、Gemini、表格公式，或手動標記——都能直接填寫，不需要修改程式碼。

### 消費分析

分類完成後，可以直接請 ChatGPT 分析資料（或自行用 Sheets 樞紐分析表 / 圖表）：依類別計算月度總額、找出最大消費商家、觀察消費趨勢等。因為資料就放在一般的 Google Sheet 中，任何能讀取 Sheets 的工具都能拿來分析。

### 串接其他自動化工具

不需要在這個腳本裡維護自訂 webhook，直接讓你的自動化工具對接這份試算表即可：

- **Zapier / Make / n8n**：使用它們內建的 Google Sheets 觸發器（「New Row」/「Updated Row」），對應到 `Invoices` 分頁。
- **自訂程式**：透過 [Google Sheets API](https://developers.google.com/sheets/api)，使用服務帳號或 OAuth 讀取表格，方式與讀取其他試算表完全相同。

這樣可以讓電子發票腳本本身保持精簡，新增整合也不需要重新部署這個專案。

## 專案結構

```
src/
  Fetch.js          # 登入並向官方電子發票 API 同步資料
  WebApp.js         # doGet() 與 UI 資料端點
  InvoiceUi.html    # Web app 前端
  appsscript.json   # Apps Script 設定檔
```

## 貢獻

歡迎貢獻！請參考 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 授權

[MIT](LICENSE)

## 免責聲明

本專案為獨立的開源專案，與財政部無任何關係，亦未經其認可。使用前請自行評估風險，並在輸入電子發票帳密前先檢視原始碼。
