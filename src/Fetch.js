/**
 * Taiwan E-Invoice -> Google Sheets
 *
 * Paste this file into Google Apps Script bound to the target spreadsheet (Extensions > Apps Script)
 * and run syncTaiwanEInvoicesToSheet().
 *
 * Required script properties:
 *   EINVOICE_MOBILE       Taiwan e-invoice login phone number
 *   EINVOICE_PASSWORD     Taiwan e-invoice password / verify code
 *
 * Optional script properties:
 *   SHEET_NAME            Default: Invoices
 *   PERIODS_TO_FETCH      Default: 3
 *
 * Apps Script setup:
 *   Project Settings -> Script properties -> add the properties above.
 *   Services are not required; this uses UrlFetchApp and SpreadsheetApp.
 */

const EINVOICE_BASE_URL = "https://invoiceapp.nat.gov.tw/UIAPAPP/api/";
const EINVOICE_APP_VERSION = "6.0630.31";
const EINVOICE_OS = "Android";
const EINVOICE_DEVICE_ID = "http://OpenUDID.org";
const EINVOICE_API_KEY = "xkRT21hZ3uDJehRthVlDAdfzpAoPLEoKpTAKyR/eB2iMqErmM7U5IVC6G5eHD/MN";
const FORGE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/forge/1.3.1/forge.min.js";

const EINVOICE_RSA_PUBLIC_KEY =
  "<RSAKeyValue>" +
  "<Modulus>wWj/ElSXlSJCJv/ELn47aYNIx8pWec6RFgVWnW836DQwQjh7pL90av6Mvv5kPjNbM4njxeLeuXx9ZuNP2A+JUhVLkU6zdqB+T2Nyj+zhUa5szkmaJm0ntXJvGN7iAwIvLPE2BcMWGlsPBFhWMoRt8goM06AUcFIzI4dL3iDpUWvm/Og/bzeel7/rb0RVbV86zv4MzqIt7PJM7mnw+SCjH59nEBsKkR96kR3Ye6iwztvAZcIGyTihFW2J0GEq+sPO09XW+oobQt62qIaisbR7rVZcY5Qcu8g6qeVzoz1n77/SeG4BZo/hLR13I874ZUZ+rdbFNoOPj9mj+WSPFIPf6Q==</Modulus>" +
  "<Exponent>AQAB</Exponent>" +
  "</RSAKeyValue>";

const INVOICE_HEADERS = [
  "Invoice Number",
  "Date",
  "Month",
  "Seller",
  "Amount",
  "Main Category",
  "Subcategory",
  "Carrier",
  "Period",
  "Fetched At",
  "Note",
  "Items",
];

const INVOICE_ITEMS_FORMULA =
  '=MAP(A2:A, LAMBDA(inv, IF(inv="", "", TEXTJOIN(", ", TRUE, IFERROR(FILTER(InvoiceDetails!F:F & " (" & InvoiceDetails!I:I & ")", InvoiceDetails!B:B=inv), "")))))';

const INVOICE_DETAIL_SHEET_NAME = "InvoiceDetails";
const INVOICE_DETAIL_HEADERS = [
  "Item Key",
  "Invoice Number",
  "Date",
  "Month",
  "Seller",
  "Item Description",
  "Item Quantity",
  "Item Unit Price",
  "Item Amount",
  "Fetched At",
];

function syncTaiwanEInvoicesToSheet() {
  const config = getConfig_();
  return syncTaiwanEInvoicesForPeriods_(recentInvoicePeriods_(config.periodsToFetch));
}

function syncTaiwanEInvoicesForPeriods_(periods) {
  const config = getConfig_();
  const client = new TaiwanEInvoiceClient_();
  client.login(config.mobile, config.password);

  if (!client.currentUser || !client.currentUser.userToken) {
    throw new Error("Login failed. Check EINVOICE_MOBILE and EINVOICE_PASSWORD.");
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const invoiceSheet = getOrCreateSheet_(spreadsheet, config.sheetName, INVOICE_HEADERS);
  const detailSheet = getOrCreateSheet_(spreadsheet, INVOICE_DETAIL_SHEET_NAME, INVOICE_DETAIL_HEADERS);
  ensureCategoriesSheet_(spreadsheet);
  ensureItemsFormula_(invoiceSheet);
  const existingInvoiceNumbers = readExistingValues_(invoiceSheet, 1);
  const existingDetailKeys = readExistingValues_(detailSheet, 1);
  const fetchedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  const invoiceRows = [];
  const detailRows = [];

  for (const period of periods) {
    const payload = client.checkCarrierInvoices({
      carrierId: client.currentUser.mobileBarcode || "",
      carrierType: "3J0002",
      cardEncrypt: config.password,
      startDate: period.startDate,
      endDate: period.endDate,
    });

    for (const invoice of extractInvoiceRows_(payload)) {
      const invoiceNumber = firstValue_(invoice, ["invNum", "InvNum"]);
      if (!invoiceNumber) continue;

      const invoiceDate = firstValue_(invoice, ["invDate", "InvDate"]);
      const invoiceMonth = monthFromDateText_(invoiceDate);
      const invoiceAmount = firstValue_(invoice, ["amount", "InvTransAmt"]);
      const seller = firstValue_(invoice, ["sellerName", "SellerName"]);
      if (!existingInvoiceNumbers[invoiceNumber]) {
        invoiceRows.push([
          invoiceNumber,
          invoiceDate,
          invoiceMonth,
          seller,
          invoiceAmount,
          "",
          "",
          "",
          "",
          client.currentUser.mobileBarcode || "",
          period.label,
          fetchedAt,
          "",
          "",
        ]);
        existingInvoiceNumbers[invoiceNumber] = true;
      }

      let items = [];
      try {
        const detailPayload = client.checkCarrierInvoiceDetail({
          carrierId: client.currentUser.mobileBarcode || "",
          carrierType: "3J0002",
          cardEncrypt: config.password,
          invNum: invoiceNumber,
          invDate: invoiceDate,
        });
        items = extractInvoiceItemRows_(detailPayload);
      } catch (err) {
        Logger.log("Invoice detail failed for " + invoiceNumber + ": " + err.message);
      }

      items.forEach(function (item, index) {
        const itemKey = invoiceDetailKey_(invoiceNumber, item, index);
        if (existingDetailKeys[itemKey]) return;

        detailRows.push([
          itemKey,
          invoiceNumber,
          invoiceDate,
          invoiceMonth,
          seller,
          firstValue_(item, ["description", "Description", "itemName", "ItemName"]),
          firstValue_(item, ["quantity", "Quantity", "qty", "Qty"]),
          firstValue_(item, ["unitPrice", "UnitPrice"]),
          firstValue_(item, ["amount", "Amount"]),
          fetchedAt,
        ]);
        existingDetailKeys[itemKey] = true;
      });
    }
  }

  if (invoiceRows.length > 0) {
    invoiceSheet
      .getRange(invoiceSheet.getLastRow() + 1, 1, invoiceRows.length, INVOICE_HEADERS.length)
      .setValues(invoiceRows);
  }
  if (detailRows.length > 0) {
    detailSheet
      .getRange(detailSheet.getLastRow() + 1, 1, detailRows.length, INVOICE_DETAIL_HEADERS.length)
      .setValues(detailRows);
  }

  initializeSheetDefaults_(invoiceSheet, INVOICE_HEADERS);
  initializeSheetDefaults_(detailSheet, INVOICE_DETAIL_HEADERS);

  Logger.log("Wrote " + invoiceRows.length + " invoice rows and " + detailRows.length + " detail rows.");
  return { invoices: invoiceRows.length, details: detailRows.length };
}

class TaiwanEInvoiceClient_ {
  constructor() {
    this.currentUser = null;
    this.headers = {
      "Content-Type": "application/json",
      ApiKey: EINVOICE_API_KEY,
      AppVersion: EINVOICE_APP_VERSION,
      OS: EINVOICE_OS,
    };
  }

  login(mobile, password) {
    return this.post("User/Login", {
      Id: mobile,
      VerifyCode: password,
      DeviceID: EINVOICE_DEVICE_ID,
      Platform: EINVOICE_OS,
      PushToken: "",
    });
  }

  checkCarrierInvoices(params) {
    return this.post("Invoice/ChkCarrierInv", params);
  }

  checkCarrierInvoiceDetail(params) {
    return this.post("Invoice/ChkCarrierInvDetail", params);
  }

  post(path, body) {
    const request = this.encryptRequest_(JSON.stringify(body || { "": "" }));
    const response = UrlFetchApp.fetch(EINVOICE_BASE_URL + path, {
      method: "post",
      payload: request.body,
      headers: Object.assign({}, this.headers, request.headers),
      muteHttpExceptions: true,
    });
    const data = this.readResponse_(response, path, request.cryptoKey);
    if (path === "User/Login") this.setCurrentUserFromLogin_(data);
    return data;
  }

  encryptRequest_(json) {
    const user = this.currentUser;
    if (user && user.mobile && user.userToken) {
      const cryptoKey = aesEncryptString_(user.mobile, user.userToken);
      const headers = {
        encrypt: "mixed",
        ValidationToken: cryptoKey,
        Token: user.userToken,
        UUID: EINVOICE_DEVICE_ID,
      };
      if (user.mobileBarcode) headers.CarrierCode = user.mobileBarcode;

      return {
        body: aesEncryptString_(json, cryptoKey),
        cryptoKey: cryptoKey,
        headers: headers,
      };
    }

    return {
      body: rsaEncrypt_(json),
      cryptoKey: singleResponseKey_(),
      headers: { encrypt: "single" },
    };
  }

  readResponse_(response, path, cryptoKey) {
    const headers = response.getHeaders();
    const encryptMode = headers.encrypt || headers.Encrypt || null;
    const raw = response.getContentText("UTF-8");
    let text = raw;

    if (raw && encryptMode === "single") text = aesDecryptString_(raw, singleResponseKey_());
    if (raw && encryptMode === "mixed" && cryptoKey) text = aesDecryptString_(raw, cryptoKey);

    let data = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (err) {
        data = text;
      }
    }

    const status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      const message = data && data.Message ? ": " + data.Message : "";
      throw new Error("HTTP " + status + " - " + path + message);
    }

    return data;
  }

  setCurrentUserFromLogin_(data) {
    const result = data && (data.result || data.Result);
    const user = result && (result.user || result.User);
    if (user && user.mobile && user.userToken) this.currentUser = user;
  }
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const mobile = props.getProperty("EINVOICE_MOBILE");
  const password = props.getProperty("EINVOICE_PASSWORD");

  if (!mobile) throw new Error("Missing script property EINVOICE_MOBILE.");
  if (!password) throw new Error("Missing script property EINVOICE_PASSWORD.");

  return {
    mobile: mobile,
    password: password,
    sheetName: "Invoices",
    periodsToFetch: Number(props.getProperty("PERIODS_TO_FETCH") || 3),
  };
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    ensureSheetHeaders_(sheet, headers);
  }
  return sheet;
}

function ensureSheetHeaders_(sheet, headers) {
  for (let i = 0; i < headers.length; i++) {
    const currentLastColumn = Math.max(sheet.getLastColumn(), 1);
    const currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0].map(function (header) {
      return String(header || "").trim();
    });
    if (currentHeaders[i] === headers[i]) continue;
    if (currentHeaders.indexOf(headers[i]) !== -1) continue;

    sheet.insertColumnBefore(i + 1);
    sheet.getRange(1, i + 1).setValue(headers[i]);
  }
}

function ensureItemsFormula_(sheet) {
  const itemsColumn = INVOICE_HEADERS.indexOf("Items") + 1;
  const cell = sheet.getRange(2, itemsColumn);
  if (cell.getFormula() !== INVOICE_ITEMS_FORMULA) {
    cell.setFormula(INVOICE_ITEMS_FORMULA);
  }
}

function initializeSheetDefaults_(sheet, headers) {
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  const maxRows = Math.max(sheet.getLastRow(), 1);
  const filterRange = sheet.getRange(1, 1, maxRows, headers.length);
  if (!sheet.getFilter()) {
    filterRange.createFilter();
    sortSheetByDateDesc_(sheet, headers);
  }
}

function sortSheetByDateDesc_(sheet, headers) {
  const dateColumn = headers.indexOf("Date") + 1;
  if (!dateColumn || sheet.getLastRow() <= 2) return;

  const itemsColumn = headers.indexOf("Items") + 1;
  if (itemsColumn) sheet.getRange(2, itemsColumn, sheet.getLastRow() - 1, 1).clearContent();

  sheet
    .getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .sort([{ column: dateColumn, ascending: false }]);

  if (itemsColumn) ensureItemsFormula_(sheet);
}

function readExistingValues_(sheet, column) {
  const existing = {};
  if (sheet.getLastRow() <= 1) return existing;

  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  for (const row of values) {
    if (row[0]) existing[String(row[0])] = true;
  }
  return existing;
}

function extractInvoiceRows_(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.result)) return payload.result;
  if (Array.isArray(payload.details)) return payload.details;
  if (Array.isArray(payload.Details)) return payload.Details;
  if (Array.isArray(payload.InvDetail)) return payload.InvDetail;
  return [];
}

function extractInvoiceItemRows_(payload) {
  if (!payload || typeof payload !== "object") return [];
  const result = payload.result || payload.Result || payload;
  if (result && Array.isArray(result.details)) return result.details;
  if (result && Array.isArray(result.Details)) return result.Details;
  if (Array.isArray(payload.details)) return payload.details;
  if (Array.isArray(payload.Details)) return payload.Details;
  return [];
}

function invoiceDetailKey_(invoiceNumber, item, index) {
  const rowNum = firstValue_(item, ["rowNum", "RowNum", "rowNumber", "RowNumber"]);
  if (rowNum !== "") return invoiceNumber + "|" + rowNum;

  return [
    invoiceNumber,
    index + 1,
    firstValue_(item, ["description", "Description", "itemName", "ItemName"]),
    firstValue_(item, ["quantity", "Quantity", "qty", "Qty"]),
    firstValue_(item, ["unitPrice", "UnitPrice"]),
    firstValue_(item, ["amount", "Amount"]),
  ].join("|");
}

function monthFromDateText_(dateText) {
  const match = String(dateText || "").match(/^(\d{4})[/-](\d{1,2})/);
  if (!match) return "";
  return match[1] + "-" + pad2_(Number(match[2]));
}

function firstValue_(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] != null) return obj[key];
  }
  return "";
}

function recentInvoicePeriods_(count) {
  const periods = [];
  const now = new Date();
  let index = now.getFullYear() * 6 + Math.floor(now.getMonth() / 2);

  for (let i = 0; i < count; i++) {
    periods.push(invoicePeriodFromIndex_(index - i));
  }
  return periods;
}

function invoicePeriodsForMonthRange_(startMonth, endMonth) {
  const startIndex = monthKeyToPeriodIndex_(startMonth);
  const endIndex = monthKeyToPeriodIndex_(endMonth);
  const periods = [];
  for (let index = startIndex; index <= endIndex; index++) {
    periods.push(invoicePeriodFromIndex_(index));
  }
  return periods;
}

function monthKeyToPeriodIndex_(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) throw new Error("Invalid month: " + monthKey);
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year * 6 + Math.floor((month - 1) / 2);
}

function invoicePeriodFromIndex_(index) {
  const year = Math.floor(index / 6);
  const pair = index % 6;
  const startMonthIndex = pair * 2;
  const start = new Date(year, startMonthIndex, 1);
  const end = new Date(year, startMonthIndex + 2, 0);
  const today = new Date();
  const boundedEnd = end.getTime() > today.getTime() ? today : end;

  return {
    label: year + "/" + pad2_(startMonthIndex + 1) + "-" + pad2_(startMonthIndex + 2),
    startDate: formatApiDate_(start),
    endDate: formatApiDate_(boundedEnd),
  };
}

function formatApiDate_(date) {
  return date.getFullYear() + "/" + pad2_(date.getMonth() + 1) + "/" + pad2_(date.getDate());
}

function pad2_(value) {
  return value < 10 ? "0" + value : String(value);
}

function aesEncryptString_(text, keyText) {
  const forge = loadForge_();
  const cipher = createAesCipher_("encrypt", keyText);
  cipher.update(forge.util.createBuffer(text, "utf8"));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
}

function aesDecryptString_(text, keyText) {
  const forge = loadForge_();
  const cipher = createAesCipher_("decrypt", keyText);
  cipher.update(forge.util.createBuffer(forge.util.decode64(text), "raw"));
  cipher.finish();
  return cipher.output.toString();
}

function createAesCipher_(direction, keyText) {
  const forge = loadForge_();
  const key = forge.md.sha256.create().update(keyText, "utf8").digest().getBytes();
  const iv = forge.md.md5.create().update(keyText, "utf8").digest().getBytes();
  const cipher =
    direction === "encrypt"
      ? forge.cipher.createCipher("AES-CBC", key)
      : forge.cipher.createDecipher("AES-CBC", key);
  cipher.start({ iv: iv });
  return cipher;
}

function rsaEncrypt_(text) {
  const forge = loadForge_();
  const publicKey = forge.pki.publicKeyFromPem(rsaPublicKeyPem_());
  const bytes = forge.util.encodeUtf8(text);
  const chunks = [];

  for (let offset = 0; offset < bytes.length; offset += 245) {
    chunks.push(publicKey.encrypt(bytes.slice(offset, offset + 245), "RSAES-PKCS1-V1_5"));
  }

  return forge.util.encode64(chunks.join(""));
}

function rsaPublicKeyPem_() {
  const forge = loadForge_();
  const key = forge.pki.setRsaPublicKey(
    new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(rsaXmlValue_("Modulus"))), 16),
    new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(rsaXmlValue_("Exponent"))), 16)
  );
  return forge.pki.publicKeyToPem(key);
}

function rsaXmlValue_(name) {
  const match = EINVOICE_RSA_PUBLIC_KEY.match(new RegExp("<" + name + ">([^<]+)</" + name + ">"));
  if (!match) throw new Error("Missing RSA key field: " + name);
  return match[1];
}

function singleResponseKey_() {
  const forge = loadForge_();
  return forge.util.encode64(
    forge.md.sha256.create().update(EINVOICE_RSA_PUBLIC_KEY.slice(0, 16), "utf8").digest().getBytes()
  );
}

function loadForge_() {
  if (typeof globalThis.forge !== "undefined") return globalThis.forge;

  const source = UrlFetchApp.fetch(FORGE_CDN_URL).getContentText("UTF-8");
  const module = { exports: {} };
  const exports = module.exports;
  const window = globalThis;
  const self = globalThis;
  const global = globalThis;
  const navigator = { userAgent: "Google Apps Script" };

  eval(source);

  const loadedForge =
    module.exports && Object.keys(module.exports).length > 0 ? module.exports : globalThis.forge;
  if (!loadedForge) throw new Error("Unable to load node-forge.");

  globalThis.forge = loadedForge;
  return globalThis.forge;
}
