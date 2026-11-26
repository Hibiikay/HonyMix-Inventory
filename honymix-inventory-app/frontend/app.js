/* =========================================================
   HONYMIX INVENTORY & POS FRONTEND APPLICATION
   Supports Live Google Apps Script Backend + Instant Local Demo Mode
========================================================= */

const STORAGE_KEY = "honymix_app_state_v1";
const CURRENCY = "₦";

let state = {
  mode: "demo", // "live" | "demo"
  apiUrl: "",
  username: "admin",
  password: "",
  lowStockThreshold: 5,
  products: [],
  sales: [],
  purchases: []
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* =========================================================
   DEMO SEED DATA (SO BUSINESS OWNERS CAN TEST IMMEDIATELY)
========================================================= */

function getDefaultDemoData() {
  const today = todayISO();
  return {
    products: [
      { id: "PRD-001", name: "Pure Blossom Honey 500g", category: "Raw Honey", sellPrice: 4500, bought: 40, sold: 28, stock: 12, avgCost: 2600 },
      { id: "PRD-002", name: "Wildflower Honey 1kg", category: "Raw Honey", sellPrice: 8200, bought: 25, sold: 21, stock: 4, avgCost: 4800 },
      { id: "PRD-003", name: "Ginger Infused Honey 350g", category: "Infused Honey", sellPrice: 3800, bought: 30, sold: 16, stock: 14, avgCost: 2100 },
      { id: "PRD-004", name: "Raw Honeycomb Jar 400g", category: "Specialty", sellPrice: 6000, bought: 15, sold: 13, stock: 2, avgCost: 3500 },
      { id: "PRD-005", name: "Natural Beeswax Balm 50g", category: "Skincare", sellPrice: 2500, bought: 35, sold: 19, stock: 16, avgCost: 1100 }
    ],
    sales: [
      { date: today, product: "Pure Blossom Honey 500g", qty: 3, sellPrice: 4500, revenue: 13500, profit: 5700, payment: "Bank Transfer", status: "Paid" },
      { date: today, product: "Wildflower Honey 1kg", qty: 2, sellPrice: 8200, revenue: 16400, profit: 6800, payment: "POS Card", status: "Paid" },
      { date: today, product: "Ginger Infused Honey 350g", qty: 4, sellPrice: 3800, revenue: 15200, profit: 6800, payment: "Cash", status: "Paid" },
      { date: today, product: "Raw Honeycomb Jar 400g", qty: 1, sellPrice: 6000, revenue: 6000, profit: 2500, payment: "Bank Transfer", status: "Pending" }
    ],
    purchases: [
      { date: today, product: "Pure Blossom Honey 500g", qty: 40, totalCost: 104000, unitCost: 2600, note: "Kaduna Apiary Co-op" },
      { date: today, product: "Wildflower Honey 1kg", qty: 25, totalCost: 120000, unitCost: 4800, note: "Oyo Harvest Farms" },
      { date: today, product: "Ginger Infused Honey 350g", qty: 30, totalCost: 63000, unitCost: 2100, note: "Direct Batch #12" }
    ]
  };
}

/* =========================================================
   HELPERS & ANIMATED COUNTERS
========================================================= */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(num) {
  const n = Number(num || 0);
  return CURRENCY + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[ch]);
}

function animateNumber(el, target, isCurrency = false) {
  if (!el) return;
  const end = Number(target || 0);
  const start = 0;
  const duration = 550;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    el.textContent = isCurrency ? formatMoney(Math.round(current)) : Math.round(current).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = isCurrency ? formatMoney(end) : end.toLocaleString();
  }
  requestAnimationFrame(step);
}

function showToast(msg, type = "default") {
  const box = $("#toastContainer");
  if (!box) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  box.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "all 0.22s ease";
    setTimeout(() => toast.remove(), 240);
  }, 3400);
}

/* =========================================================
   API LAYER (APPS SCRIPT OR LOCAL DEMO)
========================================================= */

async function callBackend(action, payload = {}) {
  if (state.mode === "demo") {
    return handleDemoAction(action, payload);
  }

  const res = await fetch(state.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action,
      username: state.username,
      password: state.password,
      ...payload
    })
  });

  if (!res.ok) {
    throw new Error(`Server error (${res.status}). Check your Apps Script deployment.`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || "Action failed.");
  }
  return json.data;
}

function saveDemoToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    products: state.products,
    sales: state.sales,
    purchases: state.purchases,
    lowStockThreshold: state.lowStockThreshold
  }));
}

function handleDemoAction(action, payload) {
  if (action === "login") {
    if (payload.username !== "admin" || payload.password !== "Honymix2026") {
      throw new Error("Demo credentials are admin / Honymix2026");
    }
    return { authenticated: true };
  }

  if (action === "getAll") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed;
    }
    const seed = getDefaultDemoData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  if (action === "recordSale") {
    const item = state.products.find(p => p.name === payload.product);
    if (!item) throw new Error("Product not found.");
    const qty = Number(payload.qty);
    const price = Number(payload.sellPrice);
    if (qty <= 0) throw new Error("Quantity must be greater than zero.");
    if (qty > item.stock) {
      throw new Error(`Only ${item.stock} piece(s) of ${item.name} are in stock.`);
    }

    item.sold += qty;
    item.stock -= qty;

    const revenue = qty * price;
    const profit = qty * (price - item.avgCost);
    state.sales.unshift({
      date: payload.date || todayISO(),
      product: item.name,
      qty,
      sellPrice: price,
      revenue,
      profit,
      payment: payload.payment || "Cash",
      status: payload.status || "Paid"
    });
    saveDemoToStorage();
    const lowMsg = item.stock <= state.lowStockThreshold ? ` Low stock alert: ${item.stock} left.` : "";
    return { message: "Sale recorded successfully." + lowMsg };
  }

  if (action === "recordPurchase") {
    const item = state.products.find(p => p.name === payload.product);
    if (!item) throw new Error("Product not found.");
    const qty = Number(payload.qty);
    const totalCost = Number(payload.totalCost);
    if (qty <= 0 || totalCost < 0) throw new Error("Enter valid quantity and cost.");

    const prevTotalCost = item.bought * item.avgCost;
    item.bought += qty;
    item.stock += qty;
    item.avgCost = item.bought > 0 ? (prevTotalCost + totalCost) / item.bought : 0;

    state.purchases.unshift({
      date: payload.date || todayISO(),
      product: item.name,
      qty,
      totalCost,
      unitCost: totalCost / qty,
      note: payload.note || ""
    });
    saveDemoToStorage();
    return { message: "Stock purchase recorded successfully." };
  }

  if (action === "saveProduct") {
    const existing = state.products.find(p => p.id === payload.id);
    if (existing) {
      existing.name = payload.name;
      existing.category = payload.category || "General";
      existing.sellPrice = Number(payload.sellPrice || 0);
    } else {
      const nextNum = state.products.length + 1;
      state.products.push({
        id: "PRD-" + String(nextNum).padStart(3, "0"),
        name: payload.name,
        category: payload.category || "General",
        sellPrice: Number(payload.sellPrice || 0),
        bought: 0,
        sold: 0,
        stock: 0,
        avgCost: 0
      });
    }
    saveDemoToStorage();
    return { message: `Product "${payload.name}" saved.` };
  }

  if (action === "syncForm") {
    return { message: `Demo: Synced ${state.products.length} products to Google Form dropdown.` };
  }

  if (action === "setupSheets") {
    return { message: "Demo: Products, Sales & Purchases tabs verified." };
  }
}

/* =========================================================
   INITIALIZATION & NAVIGATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  $("#saleDateInput").value = todayISO();
  $("#purchaseDateInput").value = todayISO();

  bindAuthEvents();
  bindNavigation();
  bindPosEvents();
  bindPurchaseEvents();
  bindProductEvents();
  bindAutomationEvents();
});

function bindAuthEvents() {
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const url = $("#apiUrlInput").value.trim();
    const username = $("#usernameInput").value.trim();
    const password = $("#passwordInput").value;
    const errEl = $("#loginError");
    const btn = $("#loginBtn");

    errEl.textContent = "";
    btn.disabled = true;

    try {
      state.mode = url ? "live" : "demo";
      state.apiUrl = url;
      state.username = username;
      state.password = password;

      await callBackend("login", { username, password });
      enterApp();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $("#demoModeBtn").addEventListener("click", () => {
    state.mode = "demo";
    state.apiUrl = "";
    state.username = "admin";
    state.password = "Honymix2026";
    enterApp();
  });

  $("#logoutBtn").addEventListener("click", () => {
    $("#appShell").classList.add("hidden");
    $("#loginView").classList.remove("hidden");
  });
}

async function enterApp() {
  $("#loginView").classList.add("hidden");
  $("#appShell").classList.remove("hidden");

  const pill = $("#connectionPill");
  if (state.mode === "live") {
    pill.textContent = "Live Google Sheet";
    pill.className = "conn-pill live";
  } else {
    pill.textContent = "Demo Mode";
    pill.className = "conn-pill demo";
  }

  await refreshData();
  showToast(state.mode === "live" ? "Connected to Google Sheet!" : "Welcome to HonyMix Demo Mode!", "success");
}

async function refreshData() {
  const icon = $("#syncIcon");
  if (icon) icon.classList.add("spinning");

  try {
    const data = await callBackend("getAll");
    state.products = data.products || [];
    state.sales = data.sales || [];
    state.purchases = data.purchases || [];
    if (data.lowStockThreshold) {
      state.lowStockThreshold = Number(data.lowStockThreshold);
      $("#thresholdInput").value = state.lowStockThreshold;
    }
    renderAll();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (icon) icon.classList.remove("spinning");
  }
}

function bindNavigation() {
  const titles = {
    dashboard: ["Business Overview", "Real-time sales, profit & stock health"],
    pos: ["Quick Sale (POS)", "Fast checkout with automatic oversell protection"],
    purchases: ["Restock & Purchases", "Log supplier deliveries and recalculate unit costs"],
    products: ["Products & Stock", "Manage prices, SKUs, and live inventory balances"],
    automations: ["Easy Automations", "One-click Form sync, low-stock alerts & Sheet setup"]
  };

  function switchTab(tab) {
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
    const [t, sub] = titles[tab] || ["HonyMix", ""];
    $("#viewTitle").textContent = t;
    $("#viewSubtitle").textContent = sub;
    $("#sidebar").classList.remove("open");
  }

  $$(".nav-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $$("[data-jump]").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.jump)));

  $("#openSidebarBtn").addEventListener("click", () => $("#sidebar").classList.add("open"));
  $("#closeSidebarBtn").addEventListener("click", () => $("#sidebar").classList.remove("open"));
  $("#sidebarOverlay").addEventListener("click", () => $("#sidebar").classList.remove("open"));
  $("#syncBtn").addEventListener("click", async () => {
    await refreshData();
    showToast("Inventory & sales synced.");
  });
}

/* =========================================================
   RENDERING ENGINE
========================================================= */

function renderAll() {
  renderDashboard();
  populateProductSelects();
  renderPurchasesTable();
  renderProductsTable();
}

function renderDashboard() {
  const totalRev = state.sales.reduce((s, x) => s + Number(x.revenue || 0), 0);
  const totalProfit = state.sales.reduce((s, x) => s + Number(x.profit || 0), 0);
  const totalStock = state.products.reduce((s, x) => s + Number(x.stock || 0), 0);
  const lowItems = state.products.filter(p => Number(p.stock) <= state.lowStockThreshold);

  animateNumber($("#kpiRevenue"), totalRev, true);
  animateNumber($("#kpiProfit"), totalProfit, true);
  animateNumber($("#kpiStock"), totalStock, false);
  animateNumber($("#kpiLowStock"), lowItems.length, false);

  $("#kpiSalesCount").textContent = `${state.sales.length} transaction(s)`;
  const margin = totalRev > 0 ? Math.round((totalProfit / totalRev) * 100) : 0;
  $("#kpiMargin").textContent = `${margin}% avg margin`;
  $("#kpiSkuCount").textContent = `${state.products.length} active products`;

  // Low stock alert banner
  const banner = $("#lowStockBanner");
  if (lowItems.length > 0) {
    banner.classList.remove("hidden");
    banner.innerHTML = `
      <span>⚠️ <strong>Low Stock Warning:</strong> ${lowItems.map(i => `${escapeHTML(i.name)} (${i.stock} left)`).join(", ")}</span>
      <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-tab=purchases]').click()">Restock Now</button>
    `;
  } else {
    banner.classList.add("hidden");
  }

  // Revenue by product animated bar chart
  const revByProduct = {};
  state.sales.forEach(s => {
    revByProduct[s.product] = (revByProduct[s.product] || 0) + Number(s.revenue || 0);
  });
  const sorted = Object.entries(revByProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxRev = sorted.length ? sorted[0][1] : 1;

  const barsEl = $("#revenueBars");
  if (!sorted.length) {
    barsEl.innerHTML = `<p class="muted">No sales recorded yet.</p>`;
  } else {
    barsEl.innerHTML = sorted.map(([name, rev]) => `
      <div class="bar-row">
        <div class="bar-meta">
          <span>${escapeHTML(name)}</span>
          <span>${formatMoney(rev)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" data-width="${Math.round((rev / maxRev) * 100)}%"></div>
        </div>
      </div>
    `).join("");

    requestAnimationFrame(() => {
      $$(".bar-fill", barsEl).forEach(bar => {
        bar.style.width = bar.dataset.width;
      });
    });
  }

  // Stock watchlist
  const watchEl = $("#stockWatchlist");
  const orderedStock = [...state.products].sort((a, b) => a.stock - b.stock).slice(0, 5);
  watchEl.innerHTML = orderedStock.map(p => {
    const cls = p.stock <= 0 ? "badge-out" : p.stock <= state.lowStockThreshold ? "badge-low" : "badge-ok";
    const label = p.stock <= 0 ? "Out of stock" : `${p.stock} left`;
    return `
      <div class="watch-item">
        <span>${escapeHTML(p.name)}</span>
        <span class="badge ${cls}">${label}</span>
      </div>
    `;
  }).join("") || `<p class="muted">No products added yet.</p>`;

  // Recent sales table
  const tbody = $("#recentSalesBody");
  tbody.innerHTML = state.sales.slice(0, 10).map(s => `
    <tr>
      <td>${escapeHTML(s.date)}</td>
      <td><strong>${escapeHTML(s.product)}</strong></td>
      <td>${s.qty}</td>
      <td>${formatMoney(s.sellPrice)}</td>
      <td><strong>${formatMoney(s.revenue)}</strong></td>
      <td class="accent-green">${formatMoney(s.profit)}</td>
      <td>${escapeHTML(s.payment)}</td>
      <td><span class="badge ${s.status === "Paid" ? "badge-ok" : "badge-low"}">${escapeHTML(s.status)}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="8" class="muted">No sales recorded yet.</td></tr>`;
}

function populateProductSelects() {
  const options = state.products.map(p =>
    `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)} (${p.stock} in stock)</option>`
  ).join("");

  const saleSel = $("#saleProductSelect");
  const purSel = $("#purchaseProductSelect");
  const prevSale = saleSel.value;
  const prevPur = purSel.value;

  saleSel.innerHTML = options || `<option value="">No products available</option>`;
  purSel.innerHTML = options || `<option value="">No products available</option>`;

  if (prevSale && state.products.some(p => p.name === prevSale)) saleSel.value = prevSale;
  if (prevPur && state.products.some(p => p.name === prevPur)) purSel.value = prevPur;

  updateSalePreview(true);
  updatePurchasePreview();
}

/* =========================================================
   POS (QUICK SALE) LOGIC
========================================================= */

function bindPosEvents() {
  $("#saleProductSelect").addEventListener("change", () => updateSalePreview(true));
  $("#saleQtyInput").addEventListener("input", () => updateSalePreview(false));
  $("#salePriceInput").addEventListener("input", () => updateSalePreview(false));
  $("#saleDateInput").addEventListener("change", () => updateSalePreview(false));
  $("#salePaymentSelect").addEventListener("change", () => updateSalePreview(false));
  $("#saleStatusSelect").addEventListener("change", () => updateSalePreview(false));

  $("#printReceiptBtn").addEventListener("click", () => window.print());

  $("#saleForm").addEventListener("submit", async e => {
    e.preventDefault();
    const product = $("#saleProductSelect").value;
    const qty = Number($("#saleQtyInput").value);
    const sellPrice = Number($("#salePriceInput").value);
    const date = $("#saleDateInput").value;
    const payment = $("#salePaymentSelect").value;
    const status = $("#saleStatusSelect").value;

    const item = state.products.find(p => p.name === product);
    if (!item) return showToast("Please select a product.", "error");
    if (qty > item.stock) {
      return showToast(`Blocked: Only ${item.stock} unit(s) of ${product} in stock.`, "error");
    }

    const btn = $("#submitSaleBtn");
    btn.disabled = true;
    btn.textContent = "Recording Sale...";

    try {
      const res = await callBackend("recordSale", { product, qty, sellPrice, date, payment, status });
      await refreshData();
      $("#saleQtyInput").value = 1;
      updateSalePreview(true);
      showToast(res.message || "Sale recorded!", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Complete Sale & Deduct Stock";
    }
  });
}

function updateSalePreview(resetPrice = false) {
  const product = $("#saleProductSelect").value;
  const item = state.products.find(p => p.name === product);
  const hint = $("#saleStockHint");

  if (!item) {
    hint.textContent = "Add a product first to begin recording sales.";
    return;
  }

  if (resetPrice) {
    $("#salePriceInput").value = item.sellPrice;
  }

  const qty = Math.max(0, Number($("#saleQtyInput").value || 0));
  const price = Math.max(0, Number($("#salePriceInput").value || 0));
  const total = qty * price;
  const profit = qty * (price - item.avgCost);

  if (qty > item.stock) {
    hint.innerHTML = `<span style="color:var(--danger)">⚠️ Exceeds available stock (${item.stock} unit(s) available)</span>`;
  } else {
    hint.textContent = `Available Stock: ${item.stock} unit(s) • Unit Cost: ${formatMoney(item.avgCost)}`;
  }

  $("#saleTotalPreview").textContent = formatMoney(total);
  $("#saleProfitPreview").textContent = formatMoney(profit);

  // Sync live customer receipt
  $("#recDate").textContent = $("#saleDateInput").value || todayISO();
  $("#recItem").textContent = item.name;
  $("#recSub").textContent = `${qty} × ${formatMoney(price)}`;
  $("#recLineTotal").textContent = formatMoney(total);
  $("#recGrandTotal").textContent = formatMoney(total);
  $("#recMethod").textContent = `Method: ${$("#salePaymentSelect").value}`;
  $("#recStatus").textContent = `Status: ${$("#saleStatusSelect").value}`;
}

/* =========================================================
   PURCHASES / RESTOCK LOGIC
========================================================= */

function bindPurchaseEvents() {
  $("#purchaseProductSelect").addEventListener("change", updatePurchasePreview);
  $("#purchaseQtyInput").addEventListener("input", updatePurchasePreview);
  $("#purchaseCostInput").addEventListener("input", updatePurchasePreview);

  $("#purchaseForm").addEventListener("submit", async e => {
    e.preventDefault();
    const product = $("#purchaseProductSelect").value;
    const qty = Number($("#purchaseQtyInput").value);
    const totalCost = Number($("#purchaseCostInput").value);
    const date = $("#purchaseDateInput").value;
    const note = $("#purchaseNoteInput").value.trim();

    const btn = $("#submitPurchaseBtn");
    btn.disabled = true;
    btn.textContent = "Saving Restock...";

    try {
      const res = await callBackend("recordPurchase", { product, qty, totalCost, date, note });
      $("#purchaseCostInput").value = "";
      $("#purchaseNoteInput").value = "";
      await refreshData();
      showToast(res.message || "Purchase recorded!", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Purchase & Update Stock";
    }
  });
}

function updatePurchasePreview() {
  const product = $("#purchaseProductSelect").value;
  const item = state.products.find(p => p.name === product);
  const qty = Math.max(0, Number($("#purchaseQtyInput").value || 0));
  const total = Math.max(0, Number($("#purchaseCostInput").value || 0));
  const unitCost = qty > 0 ? total / qty : 0;

  $("#purchaseUnitCostPreview").textContent = formatMoney(unitCost);
  $("#purchaseNewStockPreview").textContent = `${(item ? item.stock : 0) + qty} units`;
}

function renderPurchasesTable() {
  const tbody = $("#purchasesBody");
  tbody.innerHTML = state.purchases.map(p => `
    <tr>
      <td>${escapeHTML(p.date)}</td>
      <td><strong>${escapeHTML(p.product)}</strong></td>
      <td>+${p.qty}</td>
      <td>${formatMoney(p.unitCost)}</td>
      <td>${formatMoney(p.totalCost)}</td>
      <td>${escapeHTML(p.note || "—")}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted">No purchases recorded yet.</td></tr>`;
}

/* =========================================================
   PRODUCTS CATALOG & MODAL
========================================================= */

function bindProductEvents() {
  $("#productSearchInput").addEventListener("input", renderProductsTable);

  $("#openAddProductBtn").addEventListener("click", () => openProductModal());
  $$("[data-close-modal]").forEach(el => el.addEventListener("click", closeProductModal));

  $("#productForm").addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#prodIdInput").value;
    const name = $("#prodNameInput").value.trim();
    const category = $("#prodCategoryInput").value.trim() || "General";
    const sellPrice = Number($("#prodPriceInput").value || 0);

    const btn = $("#saveProductBtn");
    btn.disabled = true;

    try {
      const res = await callBackend("saveProduct", { id, name, category, sellPrice });
      closeProductModal();
      await refreshData();
      showToast(res.message || "Product saved!", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("#exportSalesCsvBtn").addEventListener("click", exportSalesCSV);
}

function renderProductsTable() {
  const q = ($("#productSearchInput").value || "").trim().toLowerCase();
  const filtered = state.products.filter(p =>
    !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  );

  $("#productsBody").innerHTML = filtered.map(p => {
    const cls = p.stock <= 0 ? "badge-out" : p.stock <= state.lowStockThreshold ? "badge-low" : "badge-ok";
    return `
      <tr>
        <td><code>${escapeHTML(p.id)}</code></td>
        <td><strong>${escapeHTML(p.name)}</strong></td>
        <td>${escapeHTML(p.category)}</td>
        <td>${formatMoney(p.sellPrice)}</td>
        <td>${formatMoney(p.avgCost)}</td>
        <td>${p.bought}</td>
        <td>${p.sold}</td>
        <td><span class="badge ${cls}">${p.stock} units</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editProduct('${escapeHTML(p.id)}')">Edit</button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="9" class="muted">No matching products found.</td></tr>`;
}

window.editProduct = function(id) {
  const item = state.products.find(p => p.id === id);
  if (item) openProductModal(item);
};

function openProductModal(item = null) {
  $("#modalTitle").textContent = item ? "Edit Product" : "Add New Product";
  $("#prodIdInput").value = item ? item.id : "";
  $("#prodNameInput").value = item ? item.name : "";
  $("#prodCategoryInput").value = item ? item.category : "General";
  $("#prodPriceInput").value = item ? item.sellPrice : "";
  $("#productModal").classList.remove("hidden");
}

function closeProductModal() {
  $("#productModal").classList.add("hidden");
}

/* =========================================================
   AUTOMATIONS & CSV EXPORT
========================================================= */

function bindAutomationEvents() {
  $("#triggerSyncFormBtn").addEventListener("click", async () => {
    try {
      const res = await callBackend("syncForm");
      showToast(res.message, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  $("#setupSheetsBtn").addEventListener("click", async () => {
    try {
      const res = await callBackend("setupSheets");
      await refreshData();
      showToast(res.message, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  $("#thresholdInput").addEventListener("change", e => {
    state.lowStockThreshold = Math.max(1, Number(e.target.value || 5));
    renderAll();
    showToast(`Low-stock alert threshold set to ${state.lowStockThreshold} units.`);
  });
}

function exportSalesCSV() {
  if (!state.sales.length) return showToast("No sales data to export.", "error");
  const headers = ["Date", "Product", "Quantity", "Unit Price", "Revenue", "Profit", "Payment", "Status"];
  const rows = state.sales.map(s => [
    s.date, `"${s.product.replaceAll('"', '""')}"`, s.qty, s.sellPrice, s.revenue, s.profit, s.payment, s.status
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `HonyMix_Sales_${todayISO()}.csv`;
  link.click();
  showToast("Sales CSV exported!", "success");
}
