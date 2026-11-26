/**
 * HonyMix Inventory, Sales & Automation Backend (Google Apps Script)
 * Paste this entire file into Extensions > Apps Script in your Google Sheet.
 */

const CONFIG = {
  SPREADSHEET_ID: '', // Leave blank when bound directly to your Inventory Google Sheet
  SHEETS: {
    PRODUCTS: 'Products',
    SALES: 'Sales',
    PURCHASES: 'Purchases',
    FORM_RESPONSES: 'Form Responses 1'
  },
  USERNAME: 'admin',
  PASSWORD: 'Honymix2026',
  LOW_STOCK_THRESHOLD: 5,
  ALERT_EMAIL: '' // Optional: put owner email e.g. 'owner@honymix.com' for low-stock alerts
};

/* =========================================================
   WEB APP API ENDPOINTS (POST & GET)
========================================================= */

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let data;

    switch (req.action) {
      case 'login':
        data = login_(req);
        break;
      case 'getAll':
        requireAuth_(req);
        data = getAll_();
        break;
      case 'recordSale':
        requireAuth_(req);
        data = recordSale_(req);
        break;
      case 'recordPurchase':
        requireAuth_(req);
        data = recordPurchase_(req);
        break;
      case 'saveProduct':
        requireAuth_(req);
        data = saveProduct_(req);
        break;
      case 'syncForm':
        requireAuth_(req);
        updateProductList();
        data = { message: 'Google Form product dropdown synced!' };
        break;
      case 'setupSheets':
        requireAuth_(req);
        data = setupSheets_();
        break;
      default:
        throw new Error('Unknown action: ' + req.action);
    }

    return json_({ ok: true, data });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'HonyMix Inventory & POS API v2' });
}

function login_(req) {
  const valid =
    String(req.username || '').trim() === CONFIG.USERNAME &&
    String(req.password || '') === CONFIG.PASSWORD;

  if (!valid) {
    throw new Error('Invalid username or password.');
  }

  return {
    authenticated: true,
    username: CONFIG.USERNAME
  };
}

function requireAuth_(req) {
  // Supports token/credentials when passed; keeps compatibility with simple first-version setups
  if (req.username || req.password) {
    if (
      String(req.username || '').trim() !== CONFIG.USERNAME ||
      String(req.password || '') !== CONFIG.PASSWORD
    ) {
      throw new Error('Unauthorized session. Please log in again.');
    }
  }
}

function getSS_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

/* =========================================================
   DATA READERS
========================================================= */

function getAll_() {
  const ss = getSS_();
  const products = readProducts_(ss);
  const sales = readSales_(ss);
  const purchases = readPurchases_(ss);
  return {
    products,
    sales,
    purchases,
    lowStockThreshold: CONFIG.LOW_STOCK_THRESHOLD
  };
}

function headers_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function readProducts_(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEETS.PRODUCTS);
  if (!sh || sh.getLastRow() < 2) return [];
  const h = headers_(sh);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
  const idx = {};
  h.forEach((x, i) => (idx[x.trim().toLowerCase()] = i));

  return rows
    .filter(r => r[idx['product id']] || r[idx['product name']])
    .map(r => ({
      id: String(r[idx['product id']] || ''),
      name: String(r[idx['product name']] || ''),
      category: String(r[idx['category']] || 'General'),
      sellPrice: Number(r[idx['selling price']] || 0),
      bought: Number(r[idx['total bought']] || 0),
      sold: Number(r[idx['total sold']] || 0),
      stock: Number(r[idx['stock balance']] || 0),
      avgCost: Number(r[idx['average cost']] || 0)
    }));
}

function readSales_(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEETS.SALES);
  if (!sh || sh.getLastRow() < 2) return [];
  const h = headers_(sh);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
  const idx = {};
  h.forEach((x, i) => (idx[x.trim().toLowerCase()] = i));
  const get = (r, name) => (idx[name] === undefined ? '' : r[idx[name]]);

  return rows
    .filter(r => get(r, 'product'))
    .map(r => ({
      date: formatDate_(get(r, 'sale date') || get(r, 'timestamp')),
      product: String(get(r, 'product')),
      qty: Number(get(r, 'quantity sold') || 0),
      sellPrice: Number(get(r, 'selling price / unit') || 0),
      revenue: Number(get(r, 'total sales') || get(r, 'revenue') || 0),
      profit: Number(get(r, 'profit') || 0),
      payment: String(get(r, 'payment method') || ''),
      status: String(get(r, 'payment status') || 'Paid')
    }));
}

function readPurchases_(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEETS.PURCHASES);
  if (!sh || sh.getLastRow() < 2) return [];
  const h = headers_(sh);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
  const idx = {};
  h.forEach((x, i) => (idx[x.trim().toLowerCase()] = i));
  const get = (r, n) => (idx[n] === undefined ? '' : r[idx[n]]);

  return rows
    .filter(r => get(r, 'product name') || get(r, 'product id'))
    .map(r => ({
      date: formatDate_(get(r, 'date bought')),
      product: String(get(r, 'product name') || get(r, 'product id')),
      qty: Number(get(r, 'quantity') || 0),
      totalCost: Number(get(r, 'total cost') || 0),
      unitCost: Number(get(r, 'cost / unit') || 0),
      note: String(get(r, 'supplier / note') || '')
    }));
}

/* =========================================================
   RECORD SALE, PURCHASE & PRODUCT CRUD
========================================================= */

function recordSale_(p) {
  const ss = getSS_();
  const sh = ss.getSheetByName(CONFIG.SHEETS.SALES);
  const product = String(p.product || '').trim();
  const qty = Number(p.qty);
  const price = Number(p.sellPrice);

  const products = readProducts_(ss);
  const item = products.find(x => x.name === product);
  if (!item) throw new Error('Product not found.');
  if (qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (qty > item.stock) {
    throw new Error(`Only ${item.stock} piece(s) of ${product} are in stock.`);
  }

  const headers = headers_(sh);
  const row = new Array(headers.length).fill('');
  const put = (name, val) => {
    const i = headers.findIndex(x => x.trim().toLowerCase() === name);
    if (i >= 0) row[i] = val;
  };

  const revenue = qty * price;
  const profit = qty * (price - item.avgCost);

  put('timestamp', new Date());
  put('sale date', new Date((p.date || formatDate_(new Date())) + 'T12:00:00'));
  put('product', product);
  put('quantity sold', qty);
  put('selling price / unit', price);
  put('total sales', revenue);
  put('revenue', revenue);
  put('profit', profit);
  put('payment method', p.payment || 'Cash');
  put('payment status', p.status || 'Paid');

  sh.appendRow(row);

  // Check if remaining stock dropped below threshold
  const remaining = item.stock - qty;
  let alertNote = '';
  if (remaining <= CONFIG.LOW_STOCK_THRESHOLD) {
    alertNote = ` Low stock alert: ${remaining} left.`;
    sendLowStockEmail_(item.name, remaining);
  }

  return { message: 'Sale recorded successfully.' + alertNote };
}

function recordPurchase_(p) {
  const ss = getSS_();
  const sh = ss.getSheetByName(CONFIG.SHEETS.PURCHASES);
  const qty = Number(p.qty);
  const total = Number(p.totalCost);

  if (!p.product || qty <= 0 || total < 0) {
    throw new Error('Enter a valid product, quantity and total cost.');
  }

  const products = readProducts_(ss);
  const item = products.find(x => x.name === p.product);
  if (!item) throw new Error('Product not found. Add it to Products first.');

  const headers = headers_(sh);
  const row = new Array(headers.length).fill('');
  const put = (name, val) => {
    const i = headers.findIndex(x => x.trim().toLowerCase() === name);
    if (i >= 0) row[i] = val;
  };

  put('purchase id', 'PUR-' + Date.now());
  put('date bought', new Date((p.date || formatDate_(new Date())) + 'T12:00:00'));
  put('product id', item.id);
  put('product name', item.name);
  put('quantity', qty);
  put('total cost', total);
  put('cost / unit', qty > 0 ? total / qty : 0);
  put('supplier / note', p.note || '');

  sh.appendRow(row);
  return { message: 'Stock purchase recorded successfully.' };
}

function saveProduct_(p) {
  const ss = getSS_();
  const sh = ss.getSheetByName(CONFIG.SHEETS.PRODUCTS);
  const name = String(p.name || '').trim();
  const category = String(p.category || 'General').trim();
  const sellPrice = Number(p.sellPrice || 0);

  if (!name) throw new Error('Product name is required.');

  const headers = headers_(sh);
  const idx = {};
  headers.forEach((x, i) => (idx[x.trim().toLowerCase()] = i));

  const lastRow = sh.getLastRow();
  let targetRow = -1;

  if (lastRow >= 2 && p.id) {
    const ids = sh.getRange(2, idx['product id'] + 1, lastRow - 1, 1).getValues().flat();
    const foundIndex = ids.findIndex(v => String(v) === String(p.id));
    if (foundIndex >= 0) targetRow = foundIndex + 2;
  }

  if (targetRow > 0) {
    sh.getRange(targetRow, idx['product name'] + 1).setValue(name);
    if (idx['category'] !== undefined) sh.getRange(targetRow, idx['category'] + 1).setValue(category);
    if (idx['selling price'] !== undefined) sh.getRange(targetRow, idx['selling price'] + 1).setValue(sellPrice);
  } else {
    const nextRow = lastRow + 1;
    const newId = p.id || 'PRD-' + String(nextRow - 1).padStart(3, '0');
    const row = new Array(headers.length).fill('');
    if (idx['product id'] !== undefined) row[idx['product id']] = newId;
    if (idx['product name'] !== undefined) row[idx['product name']] = name;
    if (idx['category'] !== undefined) row[idx['category']] = category;
    if (idx['selling price'] !== undefined) row[idx['selling price']] = sellPrice;
    // Live Google Sheets formulas for automatic stock & average cost tracking
    if (idx['total bought'] !== undefined) row[idx['total bought']] = `=SUMIF(Purchases!D:D, B${nextRow}, Purchases!E:E)`;
    if (idx['total sold'] !== undefined) row[idx['total sold']] = `=SUMIF(Sales!C:C, B${nextRow}, Sales!D:D)`;
    if (idx['stock balance'] !== undefined) row[idx['stock balance']] = `=E${nextRow}-F${nextRow}`;
    if (idx['average cost'] !== undefined) row[idx['average cost']] = `=IFERROR(SUMIF(Purchases!D:D, B${nextRow}, Purchases!F:F)/E${nextRow}, 0)`;
    sh.appendRow(row);
  }

  try { updateProductList(); } catch (_) {}
  return { message: `Product "${name}" saved and synced.` };
}

/* =========================================================
   ONE-CLICK SHEET INITIALIZER FOR NEW BUSINESSES
========================================================= */

function setupSheets_() {
  const ss = getSS_();

  const schemas = {
    Products: ['Product ID', 'Product Name', 'Category', 'Selling Price', 'Total Bought', 'Total Sold', 'Stock Balance', 'Average Cost'],
    Sales: ['Timestamp', 'Sale Date', 'Product', 'Quantity Sold', 'Selling Price / Unit', 'Total Sales', 'Payment Status', 'Payment Method', 'Profit'],
    Purchases: ['Purchase ID', 'Date Bought', 'Product ID', 'Product Name', 'Quantity', 'Total Cost', 'Cost / Unit', 'Supplier / Note']
  };

  Object.keys(schemas).forEach(sheetName => {
    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
    }
    if (sh.getLastRow() === 0) {
      sh.appendRow(schemas[sheetName]);
      sh.getRange(1, 1, 1, schemas[sheetName].length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });

  return { message: 'Inventory sheets initialized and ready!' };
}

/* =========================================================
   GOOGLE FORMS & SPREADSHEET AUTOMATIONS (PRESERVED + UNIFIED)
========================================================= */

function updateProductList() {
  const ss = getSS_();
  const productsSheet = ss.getSheetByName(CONFIG.SHEETS.PRODUCTS);
  if (!productsSheet) return;

  const lastRow = productsSheet.getLastRow();
  const products = productsSheet
    .getRange(2, 2, Math.max(lastRow - 1, 1), 1)
    .getValues()
    .flat()
    .filter(String);

  const responseSheet = ss.getSheetByName(CONFIG.SHEETS.FORM_RESPONSES);
  if (!responseSheet) return;

  const formUrl = responseSheet.getFormUrl();
  if (!formUrl) return;

  const form = FormApp.openByUrl(formUrl);
  const items = form.getItems();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.getTitle().trim().toLowerCase() === 'product') {
      const type = item.getType();
      if (type === FormApp.ItemType.LIST) {
        item.asListItem().setChoiceValues(products);
      } else if (type === FormApp.ItemType.MULTIPLE_CHOICE) {
        item.asMultipleChoiceItem().setChoiceValues(products);
      }
      return;
    }
  }
}

// Unified Edit Trigger: handles both Products -> Form Sync AND Sales -> Stock Guard
function onSheetEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();

  // 1. Auto-sync Google Form when Product Name (Column B) changes
  if (sheetName === CONFIG.SHEETS.PRODUCTS && e.range.getColumn() === 2) {
    try { updateProductList(); } catch (_) {}
    return;
  }

  // 2. Guard against overselling in Sales sheet
  if (sheetName === CONFIG.SHEETS.SALES) {
    checkSaleStock(e);
  }
}

function checkSaleStock(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.SALES) return;

  const row = e.range.getRow();
  if (row < 2) return;

  const product = sheet.getRange(row, 3).getValue(); // Column C
  const quantity = Number(sheet.getRange(row, 4).getValue()); // Column D
  if (!product || !quantity) return;

  const ss = getSS_();
  const productsSheet = ss.getSheetByName(CONFIG.SHEETS.PRODUCTS);
  const lastRow = productsSheet.getLastRow();
  if (lastRow < 2) return;

  const data = productsSheet.getRange(2, 2, lastRow - 1, 6).getValues();
  for (let i = 0; i < data.length; i++) {
    const productName = data[i][0];
    const stock = Number(data[i][5]);

    if (productName === product) {
      if (quantity > stock) {
        sheet.getRange(row, 4).setValue(0);
        sheet.getRange(row, 7).setValue('INVALID - NOT ENOUGH STOCK');
        try {
          SpreadsheetApp.getUi().alert(
            product + ' only has ' + stock + ' piece(s) available. This sale has been stopped.'
          );
        } catch (_) {}
      }
      return;
    }
  }
}

// Run this once from Apps Script editor to install all automatic triggers
function installAutomations() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(getSS_())
    .onEdit()
    .create();

  // Also sync Form dropdown whenever a new Form response is submitted
  ScriptApp.newTrigger('updateProductList')
    .forSpreadsheet(getSS_())
    .onFormSubmit()
    .create();
}

function sendLowStockEmail_(productName, stockLeft) {
  if (!CONFIG.ALERT_EMAIL) return;
  try {
    MailApp.sendEmail({
      to: CONFIG.ALERT_EMAIL,
      subject: `Low Stock Alert: ${productName} (${stockLeft} left)`,
      body: `Heads up! "${productName}" has dropped to ${stockLeft} unit(s) in your HonyMix Inventory.`
    });
  } catch (_) {}
}

function formatDate_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
