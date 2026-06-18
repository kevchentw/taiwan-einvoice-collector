const UI_INVOICE_DETAIL_SHEET_NAME = "InvoiceDetails";
const UI_CATEGORIES_SHEET_NAME = "Categories";
const UI_PROMPTS_SHEET_NAME = "AIPrompts";
const UI_INSIGHTS_SHEET_NAME = "AIInsights";

function doGet() {
  return HtmlService.createTemplateFromFile("InvoiceUi")
    .evaluate()
    .setTitle("電子發票")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function readTableObjects_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return [];

  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0].map(function (header) { return String(header || "").trim(); });

  return values.slice(1).map(function (row) {
    const item = {};
    headers.forEach(function (header, index) {
      if (header) item[header] = row[index];
    });
    return item;
  });
}

function numberValue_(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pad2ForUi_(value) {
  return value < 10 ? "0" + value : String(value);
}

function uniqueSortedAsc_(values) {
  const seen = {};
  values.forEach(function (value) {
    if (value) seen[value] = true;
  });
  return Object.keys(seen).sort();
}
