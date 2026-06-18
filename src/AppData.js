/**
 * Backend data API for the 電子發票 single-page app (InvoiceUi.html).
 * Reads/writes the same "Invoices" / "InvoiceDetails" sheets used by Fetch.js.
 */

const APP_CATEGORIES_DEFAULT_ = {
  餐飲: ["早餐", "午餐", "晚餐", "飲料", "點心", "外送", "聚餐", "其他餐飲"],
  食品雜貨: ["生鮮", "零食", "飲品", "日用品", "超市量販", "其他食品雜貨"],
  交通: ["捷運公車", "計程車", "高鐵台鐵", "加油", "停車", "租車", "其他交通"],
  購物: ["服飾", "3C", "家電", "書籍文具", "網購", "百貨", "其他購物"],
  居家: ["家具", "清潔用品", "修繕", "生活用品", "其他居家"],
  水電電信: ["電費", "水費", "瓦斯", "網路", "手機", "其他水電電信"],
  健康: ["藥品", "診所醫院", "保健品", "運動健身", "其他健康"],
  娛樂: ["電影", "遊戲", "展演", "訂閱服務", "旅遊休閒", "其他娛樂"],
  旅行: ["住宿", "機票", "交通票券", "景點活動", "其他旅行"],
  教育: ["課程", "書籍", "教材", "考試", "其他教育"],
  工作: ["辦公用品", "商務餐飲", "軟體服務", "設備", "其他工作"],
  其他: ["未分類"],
};

function ensureCategoriesSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(UI_CATEGORIES_SHEET_NAME) || spreadsheet.insertSheet(UI_CATEGORIES_SHEET_NAME);
  if (sheet.getLastRow() > 0) return sheet;

  const headers = ["Main Category", "Subcategory"];
  const rows = [];
  Object.keys(APP_CATEGORIES_DEFAULT_).forEach(function (mainCategory) {
    APP_CATEGORIES_DEFAULT_[mainCategory].forEach(function (subcategory) {
      rows.push([mainCategory, subcategory]);
    });
  });

  sheet.appendRow(headers);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return sheet;
}

const APP_PROMPTS_DEFAULT_ = [
  {
    title: "分類並寫回這個表單",
    prompt:
      "你是我的記帳助理。請打開這份 Google 試算表：{{SPREADSHEET_URL}}\n" +
      "讀取 Invoices 工作表中尚未分類（Main Category 或 Subcategory 為空）的發票，" +
      "並依據商店名稱與品項，幫每一筆挑選最合適的主類別與子類別（請參考 Categories 工作表中的既有分類），" +
      "然後將結果寫回 Invoices 工作表對應的 Main Category / Subcategory 欄位。",
  },
  {
    title: "這個月的消費分析",
    prompt:
      "你是我的記帳助理。請打開這份 Google 試算表：{{SPREADSHEET_URL}}\n" +
      "讀取 Invoices 工作表，篩選出本月（今天日期所在月份）的所有發票，" +
      "幫我分析：1) 本月總支出與筆數 2) 各主類別/子類別佔比與金額排名 3) 與上個月相比的變化 4) 三個可以節省支出的具體建議。",
  },
  {
    title: "訂閱服務分析",
    prompt:
      "你是我的記帳助理。請打開這份 Google 試算表：{{SPREADSHEET_URL}}\n" +
      "讀取 Invoices 工作表，找出所有看起來像訂閱服務的支出（例如類別為「娛樂/訂閱服務」、" +
      "或同一商店每月固定金額重複出現），列出每個訂閱服務的商店名稱、月費金額、" +
      "上次扣款日期，並估算這些訂閱服務的年化總支出，標註是否有重複或可能忘記取消的服務。",
  },
  {
    title: "尋找異常消費",
    prompt:
      "你是我的記帳助理。請打開這份 Google 試算表：{{SPREADSHEET_URL}}\n" +
      "讀取 Invoices 工作表，根據金額大小、消費頻率與類別分布，找出可能的異常消費" +
      "（例如單筆金額明顯偏高、同一天同一商店重複收費、罕見類別突然出現大額支出等），" +
      "列出每筆異常的發票號碼、日期、商店、金額與你判斷異常的原因。",
  },
  {
    title: "產生本月 AI 洞察",
    prompt:
      "你是我的記帳助理。請打開這份 Google 試算表：{{SPREADSHEET_URL}}\n" +
      "讀取 Invoices 工作表，篩選出本月（今天日期所在月份，格式 yyyy-MM）的所有發票，並可參考上月資料做比較。\n\n" +
      "請完成以下兩件事，並寫入 AIInsights 工作表（若該月已有資料請先清空舊資料再寫入新的，欄位為 ID / Month / Type / Tag / Title / Content / CreatedAt）：\n\n" +
      "1. 一篇「本月報告」：Type 填 report，Tag 留空，ID 填「本月(yyyy-MM)-report」，Title 填「YYYY年M月消費報告」，" +
      "Content 用 3-5 段文字總結：總支出與筆數、最大類別、相較上月變化、值得注意的消費模式、給下月的具體建議。\n\n" +
      "2. 3 到 6 張「洞察小卡」：Type 填 card，ID 依序填「本月(yyyy-MM)-card-1」「本月(yyyy-MM)-card-2」...，每張包含：\n" +
      "   - Title：一句話標題（10-15 字內）\n" +
      "   - Content：1-3 句說明，要具體（提到金額、店家或百分比）\n" +
      "   - Tag：從 info / warning / tip / good 中選一個（warning=異常或超支，tip=可行動建議，good=做得好的地方，info=中性觀察）\n\n" +
      "   洞察方向可包含：異常消費、訂閱服務、類別超支、消費習慣變化、省錢成就、常光顧商店、下月預測。" +
      "不需要每個方向都寫，挑最有意義的幾個即可。\n\n" +
      "每筆都要填 Month（本月，格式 yyyy-MM）與 CreatedAt（現在時間）。",
  },
];

function ensurePromptsSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(UI_PROMPTS_SHEET_NAME) || spreadsheet.insertSheet(UI_PROMPTS_SHEET_NAME);
  if (sheet.getLastRow() > 0) return sheet;

  const headers = ["Title", "Prompt"];
  const rows = APP_PROMPTS_DEFAULT_.map(function (item) { return [item.title, item.prompt]; });

  sheet.appendRow(headers);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return sheet;
}

function getAppPrompts_(spreadsheet) {
  ensurePromptsSheet_(spreadsheet);
  const rows = readTableObjects_(spreadsheet, UI_PROMPTS_SHEET_NAME);
  if (!rows.length) return APP_PROMPTS_DEFAULT_;

  const prompts = rows
    .map(function (row) {
      return { title: String(row.Title || "").trim(), prompt: String(row.Prompt || "").trim() };
    })
    .filter(function (item) { return item.title && item.prompt; });

  return prompts.length ? prompts : APP_PROMPTS_DEFAULT_;
}

function ensureInsightsSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(UI_INSIGHTS_SHEET_NAME) || spreadsheet.insertSheet(UI_INSIGHTS_SHEET_NAME);
  if (sheet.getLastRow() > 0) return sheet;
  sheet.appendRow(["ID", "Month", "Type", "Tag", "Title", "Content", "CreatedAt"]);
  return sheet;
}

function getAppInsights_(spreadsheet) {
  ensureInsightsSheet_(spreadsheet);
  const rows = readTableObjects_(spreadsheet, UI_INSIGHTS_SHEET_NAME);

  return rows
    .map(function (row) {
      return {
        id: String(row.ID || ""),
        month: String(row.Month || ""),
        type: String(row.Type || "card") === "report" ? "report" : "card",
        tag: String(row.Tag || "info"),
        title: String(row.Title || ""),
        content: String(row.Content || ""),
        createdAt: String(row.CreatedAt || ""),
      };
    })
    .filter(function (insight) { return insight.month && insight.title; });
}

function getAppCategories_(spreadsheet) {
  const rows = readTableObjects_(spreadsheet, UI_CATEGORIES_SHEET_NAME);
  if (!rows.length) return APP_CATEGORIES_DEFAULT_;

  const categories = {};
  rows.forEach(function (row) {
    const mainCategory = String(row["Main Category"] || "").trim();
    const subcategory = String(row.Subcategory || "").trim();
    if (!mainCategory || !subcategory) return;
    if (!categories[mainCategory]) categories[mainCategory] = [];
    categories[mainCategory].push(subcategory);
  });

  return Object.keys(categories).length ? categories : APP_CATEGORIES_DEFAULT_;
}

function getPageData() {
  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const invoices = readTableObjects_(spreadsheet, config.sheetName)
    .map(normalizeInvoiceForApp_)
    .filter(function (invoice) { return invoice.id; });
  const details = readTableObjects_(spreadsheet, UI_INVOICE_DETAIL_SHEET_NAME)
    .map(normalizeDetailForApp_)
    .filter(function (detail) { return detail.invoiceNumber; });

  const detailsByInvoice = {};
  details.forEach(function (detail) {
    if (!detailsByInvoice[detail.invoiceNumber]) detailsByInvoice[detail.invoiceNumber] = [];
    detailsByInvoice[detail.invoiceNumber].push(detail);
  });
  invoices.forEach(function (invoice) {
    invoice.items = (detailsByInvoice[invoice.id] || []).map(function (detail) {
      return { name: detail.description, qty: detail.quantity, unitPrice: detail.unitPrice, amount: detail.amount };
    });
  });

  invoices.sort(function (a, b) { return dateTimeSortValue_(b) - dateTimeSortValue_(a); });

  const timezone = Session.getScriptTimeZone();
  const currentMonth = Utilities.formatDate(new Date(), timezone, "yyyy-MM");
  const lastSyncedAt = latestFetchedAt_(invoices);

  return {
    currentMonth: currentMonth,
    lastSyncedAt: lastSyncedAt,
    summary: buildSummary_(invoices, currentMonth),
    invoices: invoices,
    monthlyTrend: buildMonthlyTrend_(invoices, currentMonth),
    categories: getAppCategories_(spreadsheet),
    prompts: getAppPrompts_(spreadsheet),
    insights: getAppInsights_(spreadsheet),
    spreadsheetUrl: spreadsheet.getUrl(),
  };
}

function updateInvoice(params) {
  const id = params && params.id;
  if (!id) throw new Error("Missing invoice id.");

  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) throw new Error("Invoices sheet not found.");

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header || "").trim();
  });
  const idColumn = headers.indexOf("Invoice Number") + 1;
  const mainCategoryColumn = headers.indexOf("Main Category") + 1;
  const subcategoryColumn = headers.indexOf("Subcategory") + 1;
  const noteColumn = headers.indexOf("Note") + 1;
  if (!idColumn) throw new Error("Invoice Number column not found.");

  const ids = sheet.getRange(2, idColumn, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  let rowIndex = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex === -1) throw new Error("Invoice not found: " + id);

  const mainCategory = String((params && params.mainCategory) || "");
  const subcategory = String((params && params.subcategory) || "");
  const note = String((params && params.note) || "");

  if (mainCategoryColumn) sheet.getRange(rowIndex, mainCategoryColumn).setValue(mainCategory);
  if (subcategoryColumn) sheet.getRange(rowIndex, subcategoryColumn).setValue(subcategory);
  if (noteColumn) sheet.getRange(rowIndex, noteColumn).setValue(note);

  return { success: true };
}

function syncInvoices(params) {
  const startMonth = params && params.startMonth;
  const endMonth = params && params.endMonth;
  if (!startMonth || !endMonth) throw new Error("Missing startMonth/endMonth.");

  const periods = invoicePeriodsForMonthRange_(startMonth, endMonth);
  const result = syncTaiwanEInvoicesForPeriods_(periods);

  return {
    success: true,
    invoices: result.invoices,
    details: result.details,
    startMonth: startMonth,
    endMonth: endMonth,
  };
}

function exportData(params) {
  const startMonth = params && params.startMonth;
  const endMonth = params && params.endMonth;
  const format = (params && params.format) === "json" ? "json" : "csv";
  if (!startMonth || !endMonth) throw new Error("Missing startMonth/endMonth.");

  const data = getPageData();
  const filtered = data.invoices.filter(function (invoice) {
    const month = invoice.date.slice(0, 7);
    return month >= startMonth && month <= endMonth;
  });

  const suffix = startMonth.replace("-", "") + "_" + endMonth.replace("-", "");
  if (format === "json") {
    return { data: JSON.stringify(filtered, null, 2), filename: "invoices_" + suffix + ".json" };
  }

  const rows = [["發票號碼", "日期", "時間", "商店", "主類別", "子類別", "金額", "備註", "品項"]];
  filtered.forEach(function (invoice) {
    const items = invoice.items
      .map(function (item) { return item.name + " x" + item.qty; })
      .join(", ");
    rows.push([
      invoice.id,
      invoice.date,
      invoice.time,
      invoice.seller,
      invoice.mainCategory,
      invoice.subcategory,
      invoice.amount,
      invoice.note,
      items,
    ]);
  });

  const csv = rows
    .map(function (row) {
      return row.map(csvEscape_).join(",");
    })
    .join("\n");

  return { data: csv, filename: "invoices_" + suffix + ".csv" };
}

function csvEscape_(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function normalizeInvoiceForApp_(row) {
  const rawDate = row.Date;
  const mainCategory = String(row["Main Category"] || "") || "其他";
  const subcategory = String(row.Subcategory || "") || "未分類";
  return {
    id: String(row["Invoice Number"] || ""),
    date: dateOnlyForApp_(rawDate),
    time: timeOnlyForApp_(rawDate),
    seller: String(row.Seller || ""),
    amount: numberValue_(row.Amount),
    mainCategory: mainCategory,
    subcategory: subcategory,
    note: String(row.Note || ""),
    fetchedAt: String(row["Fetched At"] || ""),
    items: [],
  };
}

function normalizeDetailForApp_(row) {
  return {
    invoiceNumber: String(row["Invoice Number"] || ""),
    description: String(row["Item Description"] || ""),
    quantity: row["Item Quantity"],
    unitPrice: row["Item Unit Price"],
    amount: numberValue_(row["Item Amount"]),
  };
}

function dateOnlyForApp_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const match = String(value || "").match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return "";
  return match[1] + "-" + pad2ForUi_(Number(match[2])) + "-" + pad2ForUi_(Number(match[3]));
}

function timeOnlyForApp_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    const text = Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
    return text === "00:00" ? "" : text;
  }
  const match = String(value || "").match(/(\d{1,2}):(\d{2})(:\d{2})?$/);
  return match ? pad2ForUi_(Number(match[1])) + ":" + match[2] : "";
}

function dateTimeSortValue_(invoice) {
  const date = new Date((invoice.date || "") + "T" + (invoice.time || "00:00") + ":00");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function latestFetchedAt_(invoices) {
  let latest = "";
  invoices.forEach(function (invoice) {
    if (invoice.fetchedAt > latest) latest = invoice.fetchedAt;
  });
  if (!latest) return "";
  return latest.replace(" ", "T");
}

function buildSummary_(invoices, currentMonth) {
  const lastMonth = previousMonthKey_(currentMonth);
  const currentInvoices = invoices.filter(function (invoice) { return invoice.date.slice(0, 7) === currentMonth; });
  const lastInvoices = invoices.filter(function (invoice) { return invoice.date.slice(0, 7) === lastMonth; });

  const totalAmount = sumAmount_(currentInvoices);
  const lastTotalAmount = sumAmount_(lastInvoices);
  const invoiceCount = currentInvoices.length;
  const distinctDays = uniqueSortedAsc_(currentInvoices.map(function (invoice) { return invoice.date; })).length;
  const dailyAverage = distinctDays ? Math.round(totalAmount / distinctDays) : 0;
  const maxSingle = currentInvoices.reduce(function (max, invoice) { return Math.max(max, invoice.amount); }, 0);
  const vsLastMonthAmount = totalAmount - lastTotalAmount;
  const vsLastMonth = lastTotalAmount ? Math.round((vsLastMonthAmount / lastTotalAmount) * 1000) / 10 : 0;

  return {
    totalAmount: totalAmount,
    invoiceCount: invoiceCount,
    dailyAverage: dailyAverage,
    maxSingle: maxSingle,
    vsLastMonth: vsLastMonth,
    vsLastMonthAmount: vsLastMonthAmount,
    byCategory: buildByCategory_(currentInvoices, totalAmount),
  };
}

function buildByCategory_(invoices, totalAmount) {
  const byMain = {};
  invoices.forEach(function (invoice) {
    if (!byMain[invoice.mainCategory]) byMain[invoice.mainCategory] = { amount: 0, count: 0, subcategories: {} };
    const bucket = byMain[invoice.mainCategory];
    bucket.amount += invoice.amount;
    bucket.count += 1;
    if (!bucket.subcategories[invoice.subcategory]) bucket.subcategories[invoice.subcategory] = { amount: 0, count: 0 };
    bucket.subcategories[invoice.subcategory].amount += invoice.amount;
    bucket.subcategories[invoice.subcategory].count += 1;
  });

  return Object.keys(byMain)
    .map(function (category) {
      const bucket = byMain[category];
      return {
        category: category,
        amount: bucket.amount,
        count: bucket.count,
        pct: totalAmount ? Math.round((bucket.amount / totalAmount) * 1000) / 10 : 0,
        subcategories: Object.keys(bucket.subcategories)
          .map(function (subcategory) {
            const subBucket = bucket.subcategories[subcategory];
            return {
              subcategory: subcategory,
              amount: subBucket.amount,
              count: subBucket.count,
              pct: totalAmount ? Math.round((subBucket.amount / totalAmount) * 1000) / 10 : 0,
            };
          })
          .sort(function (a, b) { return b.amount - a.amount; }),
      };
    })
    .sort(function (a, b) { return b.amount - a.amount; });
}

function buildMonthlyTrend_(invoices, currentMonth) {
  const months = [];
  let cursor = currentMonth;
  for (let i = 0; i < 6; i++) {
    months.unshift(cursor);
    cursor = previousMonthKey_(cursor);
  }

  const totals = {};
  invoices.forEach(function (invoice) {
    const month = invoice.date.slice(0, 7);
    totals[month] = (totals[month] || 0) + invoice.amount;
  });

  return months.map(function (month) {
    return { month: month, amount: totals[month] || 0 };
  });
}

function previousMonthKey_(monthKey) {
  const match = String(monthKey).match(/^(\d{4})-(\d{1,2})$/);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(year, month - 2, 1);
  return date.getFullYear() + "-" + pad2ForUi_(date.getMonth() + 1);
}

function sumAmount_(invoices) {
  return invoices.reduce(function (sum, invoice) { return sum + invoice.amount; }, 0);
}
