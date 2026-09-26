/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
"use client";

type MountCtx = { root: HTMLElement; accessToken: string };
let mountCtx: MountCtx | null = null;

const getToken = () => mountCtx?.accessToken ?? "";
const $ = (sel: string) => mountCtx?.root.querySelector(sel);
const $$ = (sel: string) => Array.from(mountCtx?.root.querySelectorAll(sel) ?? []);

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010").replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login?callbackUrl=/service";
    return;
  }
  if (!res.ok) {
    let detail = "Wystąpił błąd";
    try {
      const err = await res.json();
      detail = err.detail || JSON.stringify(err);
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ──────────── Utils UI ──────────── */
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2500);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Dwie kolumny kwot (sprzedaż, dochód) — zawsze obecne, żeby siatka się nie rozjeżdżała
function repairListMoneyHtml(repair) {
  const grand = Number(repair.grand_total || 0);
  const purchase = Number(repair.purchase_total || 0);
  if (grand <= 0 && purchase <= 0) {
    return `<span class="repair-amount"></span><span class="repair-amount"></span>`;
  }
  return `
    <span class="repair-amount">💰 ${fmtMoney(grand)}</span>
    <span class="repair-amount repair-meta-income">💰 ${fmtMoney(repairIncome(repair))}</span>`;
}

function customerName(c) {
  if (c.kind === "company") return c.company_name || "(firma)";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "(bez nazwy)";
}

function statusLabel(s) {
  return { received: "Przyjęte", in_progress: "W toku", done: "Gotowe", handed_over: "Wydane" }[s] || s;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}

/* ──────────── Nawigacja widoków ──────────── */
function showView(name, push = true) {
  $$(".view").forEach((v) => (v.hidden = true));
  const view = $(`#view-${name}`);
  if (view) view.hidden = false;
  if (name === "home") refreshCounts();
  if (name === "customers") loadCustomers();
  if (name === "cars") loadCars();
  if (name === "repairs") loadRepairs();
  if (push) history.pushState({ view: name }, "", `#${name}`);
}

/* ──────────── Liczniki na kafelkach ──────────── */
async function refreshCounts() {
  try {
    const [customers, cars, repairs] = await Promise.all([
      api("GET", "/api/v1/service/customers"),
      api("GET", "/api/v1/service/cars"),
      api("GET", "/api/v1/service/repairs"),
    ]);
    $("#count-customers").textContent = `Liczba: ${customers.length}`;
    $("#count-cars").textContent = `Liczba: ${cars.length}`;
    $("#count-repairs").textContent = `Liczba: ${repairs.length}`;
  } catch (e) {
    /* po cichu — brak tokenu etc. */
  }
}

/* ═══════════════════════════════════════════════
   KLIENT
   ═══════════════════════════════════════════════ */
let customersCache = [];

async function loadCustomers(q = "") {
  const list = $("#customer-list");
  list.innerHTML = `<div class="list-empty">Ładowanie…</div>`;
  try {
    const items = await api("GET", `/api/v1/service/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    customersCache = items;
    renderCustomers(items);
  } catch (e) {
    list.innerHTML = `<div class="list-empty">Błąd: ${esc(e.message)}</div>`;
  }
}

function renderCustomers(items) {
  const list = $("#customer-list");
  if (!items.length) {
    list.innerHTML = `<div class="list-empty">Brak klientów. Dodaj pierwszego klienta przyciskiem powyżej.</div>`;
    return;
  }
  list.innerHTML = items.map((c) => `
    <div class="list-item">
      <div class="list-item-main">
        <p class="list-item-title">${esc(customerName(c))} <span class="badge badge-kind">${c.kind === "company" ? "Firma" : "Osoba"}</span></p>
        <div class="list-item-meta">
          <span>📞 ${esc(c.phone)}</span>
          ${c.email ? `<span>✉ ${esc(c.email)}</span>` : ""}
          ${c.tax_id ? `<span>NIP: ${esc(c.tax_id)}</span>` : ""}
          <span>🚗 ${c.cars_count} ${c.cars_count === 1 ? "auto" : "aut"}</span>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-row btn-row-green" data-view-cars="${c.id}">Samochody</button>
        <button class="btn btn-row" data-edit-customer="${c.id}">Edytuj</button>
        <button class="btn btn-row btn-row-danger" data-del-customer="${c.id}">Usuń</button>
      </div>
    </div>
  `).join("");
}

/* ═══════════════════════════════════════════════
   SAMOCHODY
   ═══════════════════════════════════════════════ */
let carsCache = [];
let carsFilterCustomer: string | null = null;

async function loadCars(q = "") {
  const list = $("#car-list");
  list.innerHTML = `<div class="list-empty">Ładowanie…</div>`;
  try {
    const items = await api("GET", `/api/v1/service/cars${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    carsCache = items;
    // doładuj nazwy klientów
    if (!customersCache.length) {
      customersCache = await api("GET", "/api/v1/service/customers");
    }
    renderCars(items);
  } catch (e) {
    list.innerHTML = `<div class="list-empty">Błąd: ${esc(e.message)}</div>`;
  }
}

function renderCars(items) {
  const list = $("#car-list");
  let banner = "";
  if (carsFilterCustomer) {
    const cust = customersCache.find((c) => c.id === carsFilterCustomer);
    const custName = cust ? customerName(cust) : "klienta";
    items = items.filter((car) => car.customer_id === carsFilterCustomer);
    banner = `<div class="filter-banner">Samochody klienta: <strong>${esc(custName)}</strong> <button type="button" class="btn-link" data-clear-cars-filter>← wszystkie samochody</button></div>`;
  }
  if (!items.length) {
    list.innerHTML = banner + `<div class="list-empty">Brak samochodów. Dodaj pierwszy pojazd przyciskiem powyżej.</div>`;
    return;
  }
  list.innerHTML = banner + items.map((car) => {
    const owner = customersCache.find((c) => c.id === car.customer_id);
    return `
    <div class="list-item">
      <div class="list-item-main">
        <p class="list-item-title">${esc(car.make)} ${esc(car.model)} (${esc(car.year || "—")})</p>
        <div class="list-item-meta">
          <span>🔢 ${esc(car.plate)}</span>
          ${car.vin ? `<span>VIN: ${esc(car.vin)}</span>` : ""}
          ${car.mileage != null ? `<span>Przebieg: ${car.mileage.toLocaleString("pl-PL")} km</span>` : ""}
          ${owner ? `<span>👤 ${esc(customerName(owner))}</span>` : ""}
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-row btn-row-green" data-view-repairs="${car.id}">Usługi</button>
        <button class="btn btn-row" data-edit-car="${car.id}">Edytuj</button>
        <button class="btn btn-row btn-row-danger" data-del-car="${car.id}">Usuń</button>
      </div>
    </div>`;
  }).join("");
}

/* ═══════════════════════════════════════════════
   NAPRAWY
   ═══════════════════════════════════════════════ */
let repairsCache = [];
let repairsFilterCar: string | null = null;

async function loadRepairs() {
  const list = $("#repair-list");
  list.innerHTML = `<div class="list-empty">Ładowanie…</div>`;
  try {
    const items = await api("GET", "/api/v1/service/repairs");
    repairsCache = items;
    if (!carsCache.length) carsCache = await api("GET", "/api/v1/service/cars");
    renderRepairs(items);
  } catch (e) {
    list.innerHTML = `<div class="list-empty">Błąd: ${esc(e.message)}</div>`;
  }
}

let lastRepairsInput = [];

function renderRepairs(items) {
  lastRepairsInput = items;
  const list = $("#repair-list");
  let banner = "";
  if (repairsFilterCar) {
    const carObj = carsCache.find((c) => c.id === repairsFilterCar);
    const carName = carObj ? `${carObj.make} ${carObj.model} (${carObj.plate})` : "samochodu";
    items = items.filter((r) => r.car_id === repairsFilterCar);
    banner = `<div class="filter-banner">Usługi samochodu: <strong>${esc(carName)}</strong> <button type="button" class="btn-link" data-clear-repairs-filter>← wszystkie usługi</button></div>`;
  }
  if (!items.length) {
    list.innerHTML = banner + `<div class="list-empty">Brak napraw. Dodaj pierwsze zlecenie przyciskiem powyżej.</div>`;
    return;
  }
  list.innerHTML = banner + groupRepairsByMonth(items).map((g, index) => {
    const open = monthOpen.has(g.key) ? monthOpen.get(g.key) : index < 2;
    return `
    <div class="month-head${open ? "" : " month-head-collapsed"}" data-toggle-month="${esc(g.key)}" data-month-open="${open ? "1" : "0"}">
      <h2 class="month-title"><span class="month-chevron">${open ? "▾" : "▸"}</span> ${esc(g.label)} <span class="month-count">(${g.items.length})</span></h2>
      <span></span>
      <span></span>
      <span class="repair-amount month-income"><span class="month-income-label">dochód:</span> ${fmtMoney(g.income)}</span>
    </div>
    ${open ? g.items.map(repairItemHtml).join("") : ""}
  `;
  }).join("");
}

// Stan rozwinięcia miesięcy (klucz RRRR-MM); domyślnie otwarte tylko dwa najnowsze
const monthOpen = new Map<string, boolean>();

const MONTHS_PL = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

function repairIncome(r) {
  return Number(r.grand_total || 0) - Number(r.purchase_total || 0);
}

// Grupy miesięczne wg daty przyjęcia, od najnowszego miesiąca
function groupRepairsByMonth(items) {
  const groups = new Map();
  [...items]
    .sort((a, b) => String(b.received_at || "").localeCompare(String(a.received_at || "")))
    .forEach((r) => {
      const d = r.received_at ? new Date(r.received_at) : null;
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "brak";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: d ? `${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}` : "Bez daty",
          income: 0,
          items: [],
        });
      }
      const g = groups.get(key);
      g.items.push(r);
      g.income += repairIncome(r);
    });
  // W miesiącu: najpierw niewydane, potem wydane (kolejność dat zachowana — sort stabilny)
  const handed = (r) => (r.status === "handed_over" ? 1 : 0);
  groups.forEach((g) => g.items.sort((a, b) => handed(a) - handed(b)));
  return [...groups.values()];
}

function repairItemHtml(r) {
    const car = carsCache.find((c) => c.id === r.car_id);
    return `
    <div class="list-item repair-row${r.status === "handed_over" ? " repair-row-compact" : ""}">
      <div class="list-item-main">
        <p class="list-item-title">${car ? `${esc(car.make)} ${esc(car.model)} (${esc(car.plate)})` : "Auto usunięte"}</p>
        <div class="list-item-meta">
          ${r.number != null ? `<span class="badge badge-kind">ZS/${esc(String(r.number).padStart(4, "0"))}</span>` : ""}
          <span class="badge badge-${r.status}">${statusLabel(r.status)}</span>
          <span>📅 Przyjęto: ${fmtDate(r.received_at)}</span>
          ${r.completed_at ? `<span>✓ Zakończono: ${fmtDate(r.completed_at)}</span>` : ""}
        </div>
      </div>
      ${repairListMoneyHtml(r)}
      <div class="list-item-actions">
        <button class="btn btn-row" data-preview-repair="${r.id}">Podgląd</button>
        <button class="btn btn-row" data-edit-repair="${r.id}">Edytuj</button>
        <button class="btn btn-row btn-row-danger" data-del-repair="${r.id}">Usuń</button>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════
   FORMULARZE (w modalach)
   ═══════════════════════════════════════════════ */
function openModal(title, html, onSubmit, options = {}) {
  $("#modal-title").textContent = title;
  const modalEl = document.querySelector("#modal-root .modal");
  modalEl.style.maxWidth = options.wide ? "820px" : "560px";
  $("#modal-body").innerHTML = html;
  $("#modal-root").hidden = false;

  const form = $("#modal-body").querySelector("form");
  if (form && onSubmit) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await onSubmit(new FormData(form));
        closeModal();
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        const errEl = form.querySelector(".form-error");
        if (errEl) { errEl.textContent = err.message; errEl.hidden = false; }
        else toast("Błąd: " + err.message);
      }
    });
  }
}

function closeModal() {
  $("#modal-root").hidden = true;
  $("#modal-body").innerHTML = "";
  const modalEl = document.querySelector("#modal-root .modal");
  if (modalEl) modalEl.style.maxWidth = "";
}

function goToCustomerCars(customerId: string) {
  carsFilterCustomer = customerId;
  const si = $("#car-search") as HTMLInputElement | null;
  if (si) si.value = "";
  showView("cars");
}

function goToCarRepairs(carId: string) {
  repairsFilterCar = carId;
  const si = $("#repair-search") as HTMLInputElement | null;
  if (si) si.value = "";
  showView("repairs");
}

/* ──────────── Formularz klienta ──────────── */
function openCustomerForm(existing = null) {
  const c = existing || {};
  const html = `
    <form class="form-grid">
      <div class="form-error" hidden></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Rodzaj klienta</label>
          <select class="form-select" name="kind">
            <option value="person" ${c.kind === "person" ? "selected" : ""}>Osoba prywatna</option>
            <option value="company" ${c.kind === "company" ? "selected" : ""}>Firma</option>
          </select>
        </div>
        <div class="form-group"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Imię</label>
          <input class="form-input" name="first_name" value="${esc(c.first_name || "")}" />
        </div>
        <div class="form-group">
          <label class="form-label">Nazwisko</label>
          <input class="form-input" name="last_name" value="${esc(c.last_name || "")}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nazwa firmy</label>
          <input class="form-input" name="company_name" value="${esc(c.company_name || "")}" />
        </div>
        <div class="form-group">
          <label class="form-label">NIP</label>
          <input class="form-input" name="tax_id" value="${esc(c.tax_id || "")}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Telefon *</label>
          <input class="form-input" name="phone" value="${esc(c.phone || "")}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" name="email" type="email" value="${esc(c.email || "")}" />
        </div>
      </div>
      <div class="form-group full">
        <label class="form-label">Adres</label>
        <input class="form-input" name="address" value="${esc(c.address || "")}" />
      </div>
      <div class="form-group full">
        <label class="form-label">Notatki</label>
        <textarea class="form-textarea" name="notes">${esc(c.notes || "")}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-modal-close>Anuluj</button>
        <button type="submit" class="btn btn-primary">Zapisz klienta</button>
      </div>
    </form>`;

  openModal(existing ? "Edytuj klienta" : "Nowy klient", html, async (fd) => {
    const data = Object.fromEntries(fd);
    if (data.kind === "person" && !data.first_name && !data.last_name) {
      throw new Error("Podaj imię lub nazwisko dla osoby prywatnej");
    }
    if (data.kind === "company" && !data.company_name) {
      throw new Error("Podaj nazwę firmy");
    }
    Object.keys(data).forEach((k) => data[k] === "" && (data[k] = null));
    data.phone = data.phone || null;

    if (existing) {
      await api("PATCH", `/api/v1/service/customers/${existing.id}`, data);
      toast("Klient zaktualizowany");
    } else {
      await api("POST", "/api/v1/service/customers", data);
      toast("Klient dodany");
    }
    await loadCustomers($("#customer-search").value);
    refreshCounts();
  });
}

/* ──────────── Formularz samochodu ──────────── */
function openCarForm(existing = null) {
  if (!customersCache.length) {
    toast("Najpierw dodaj klienta");
    return;
  }
  const c = existing || {};
  const opts = customersCache.map((cust) =>
    `<option value="${cust.id}" ${c.customer_id === cust.id ? "selected" : ""}>${esc(customerName(cust))} — ${esc(cust.phone)}</option>`
  ).join("");
  const html = `
    <form class="form-grid">
      <div class="form-error" hidden></div>
      <div class="form-group full">
        <label class="form-label">Właściciel *</label>
        <select class="form-select" name="customer_id" required>
          ${opts}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Marka *</label>
          <input class="form-input" name="make" value="${esc(c.make || "")}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Model *</label>
          <input class="form-input" name="model" value="${esc(c.model || "")}" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Rok</label>
          <input class="form-input" name="year" type="number" min="1900" max="2100" value="${esc(c.year || "")}" />
        </div>
        <div class="form-group">
          <label class="form-label">Numer rejestracyjny *</label>
          <input class="form-input" name="plate" value="${esc(c.plate || "")}" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">VIN</label>
          <input class="form-input" name="vin" maxlength="17" value="${esc(c.vin || "")}" />
        </div>
        <div class="form-group">
          <label class="form-label">Kolor</label>
          <input class="form-input" name="color" value="${esc(c.color || "")}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Przebieg (km)</label>
          <input class="form-input" name="mileage" type="number" min="0" value="${esc(c.mileage ?? "")}" />
        </div>
        <div class="form-group"></div>
      </div>
      <div class="form-group full">
        <label class="form-label">Notatki</label>
        <textarea class="form-textarea" name="notes">${esc(c.notes || "")}</textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-modal-close>Anuluj</button>
        <button type="submit" class="btn btn-primary">Zapisz samochód</button>
      </div>
    </form>`;

  openModal(existing ? "Edytuj samochód" : "Nowy samochód", html, async (fd) => {
    const data = Object.fromEntries(fd);
    ["year", "mileage"].forEach((k) => { data[k] = data[k] === "" ? null : Number(data[k]); });
    Object.keys(data).forEach((k) => data[k] === "" && (data[k] = null));

    if (existing) {
      await api("PATCH", `/api/v1/service/cars/${existing.id}`, data);
      toast("Samochód zaktualizowany");
    } else {
      await api("POST", "/api/v1/service/cars", data);
      toast("Samochód dodany");
    }
    await loadCars($("#car-search").value);
    refreshCounts();
  });
}

/* ──────────── Formularz naprawy ──────────── */
let staffCache = [];
let currentRepairItems = [];

function normalizeRepairItem(item = {}) {
  return {
    id: item.id || null,
    kind: item.kind || "part",
    name: item.name || "",
    sku: item.sku || "",
    quantity: item.quantity ?? 1,
    unit: item.unit || "",
    unit_price: item.unit_price ?? "",
    purchase_price: item.purchase_price ?? "",
    vat_rate: item.vat_rate ?? 23,
    warranty_months: item.warranty_months ?? "",
    sort_order: item.sort_order ?? 0,
    __deleted: false,
    __dirty: false,
  };
}

function repairItemPayload(item) {
  return {
    kind: item.kind,
    name: item.name,
    sku: item.sku || null,
    quantity: Number(item.quantity || 0),
    unit: item.unit || null,
    unit_price: Number(item.unit_price || 0),
    purchase_price: item.purchase_price === "" || item.purchase_price == null ? null : Number(item.purchase_price),
    vat_rate: Number(item.vat_rate || 23),
    warranty_months: item.warranty_months === "" || item.warranty_months == null ? null : Number(item.warranty_months),
    sort_order: Number(item.sort_order || 0),
  };
}

function repairItemsTotals(items) {
  let parts = 0;
  let labor = 0;
  let purchaseParts = 0;
  let purchaseLabor = 0;
  items.filter((item) => !item.__deleted).forEach((item) => {
    const qty = Number(item.quantity || 0);
    const total = qty * Number(item.unit_price || 0);
    const purchase = qty * Number(item.purchase_price || 0);
    if (item.kind === "part") {
      parts += total;
      purchaseParts += purchase;
    } else {
      labor += total;
      purchaseLabor += purchase;
    }
  });
  const purchase = purchaseParts + purchaseLabor;
  return { parts, labor, grand: parts + labor, purchase, purchaseParts, purchaseLabor };
}

function renderRepairItemsMarkup(items) {
  const totals = repairItemsTotals(items);
  const visibleItems = items.filter((item) => !item.__deleted);
  return `
    <div class="items-section">
      <div class="item-row item-row-header">
        <span class="item-row-col-label">Rodzaj</span>
        <span class="item-row-col-label">Nazwa</span>
        <span class="item-row-col-label">Liczba sztuk</span>
        <span class="item-row-col-label">Cena sprzedaży</span>
        <span class="item-row-col-label">Cena zakupu</span>
        <span class="item-row-col-label">Stawka VAT</span>
        <span></span>
      </div>
      ${visibleItems.length ? visibleItems.map((item, index) => `
        <div class="item-row" data-repair-item-index="${index}">
          <select class="form-select repair-item-field" data-repair-item-index="${index}" data-repair-item-field="kind">
            <option value="part" ${item.kind === "part" ? "selected" : ""}>Część</option>
            <option value="service" ${item.kind === "service" ? "selected" : ""}>Robocizna</option>
          </select>
          <input class="form-input repair-item-field" data-repair-item-index="${index}" data-repair-item-field="name" placeholder="Nazwa" value="${esc(item.name || "")}" />
          <input class="form-input repair-item-field" data-repair-item-index="${index}" data-repair-item-field="quantity" type="number" min="0" step="0.01" placeholder="Ilość" value="${esc(item.quantity ?? 1)}" />
          <input class="form-input repair-item-field" data-repair-item-index="${index}" data-repair-item-field="unit_price" type="number" min="0" step="0.01" placeholder="Cena sprz." value="${esc(item.unit_price ?? "")}" />
          <input class="form-input repair-item-field item-purchase" data-repair-item-index="${index}" data-repair-item-field="purchase_price" type="number" min="0" step="0.01" placeholder="Cena zakupu" value="${esc(item.kind === "service" ? (item.purchase_price ?? 0) : (item.purchase_price ?? ""))}" />
          <select class="form-select repair-item-field" data-repair-item-index="${index}" data-repair-item-field="vat_rate">
            <option value="0" ${item.vat_rate === 0 ? "selected" : ""}>0%</option>
            <option value="8" ${item.vat_rate === 8 ? "selected" : ""}>8%</option>
            <option value="23" ${item.vat_rate === 23 ? "selected" : ""}>23%</option>
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-repair-item-delete="${index}" title="Usuń">✕</button>
        </div>
      `).join("") : `<div class="form-hint">Brak pozycji — dodaj część lub robociznę.</div>`}
      <div class="items-head">
        <button type="button" class="btn btn-ghost btn-sm" data-repair-item-add>+ Dodaj pozycję</button>
      </div>
      <div class="items-totals">
        <span>Części: <strong>${fmtMoney(totals.parts)}</strong></span>
        <span>Robocizna: <strong>${fmtMoney(totals.labor)}</strong></span>
        <span>Razem: <strong>${fmtMoney(totals.grand)}</strong></span>
      </div>
      ${totals.purchase > 0 ? `
      <div class="items-purchase-total">
        <span>Koszt zakupu części: <strong>${fmtMoney(totals.purchaseParts)}</strong></span>
        <span>Koszt robocizny: <strong>${fmtMoney(totals.purchaseLabor)}</strong></span>
        <span>Razem: <strong>${fmtMoney(totals.purchase)}</strong></span>
        <span>Marża: <strong style="color: var(--green)">${fmtMoney(totals.grand - totals.purchase)}</strong></span>
      </div>` : ""}
    </div>
  `;
}

function renderRepairItemsContainer() {
  const container = document.getElementById("repair-items-container");
  if (!container) return;
  container.innerHTML = renderRepairItemsMarkup(currentRepairItems);
}

function refreshRepairItemsTotalsOnly() {
  const totals = repairItemsTotals(currentRepairItems);
  document.querySelectorAll(".items-totals").forEach((el) => {
    el.innerHTML = `
      <span>Części: <strong>${fmtMoney(totals.parts)}</strong></span>
      <span>Robocizna: <strong>${fmtMoney(totals.labor)}</strong></span>
      <span>Razem: <strong>${fmtMoney(totals.grand)}</strong></span>
    `;
  });
  document.querySelectorAll(".items-purchase-total").forEach((el) => {
    el.innerHTML = `
      <span>Koszt zakupu części: <strong>${fmtMoney(totals.purchaseParts)}</strong></span>
      <span>Koszt robocizny: <strong>${fmtMoney(totals.purchaseLabor)}</strong></span>
      <span>Razem: <strong>${fmtMoney(totals.purchase)}</strong></span>
      <span>Marża: <strong style="color: var(--green)">${fmtMoney(totals.grand - totals.purchase)}</strong></span>
    `;
  });
}

function updateRepairItemField(index, field, value) {
  if (!currentRepairItems[index]) return;
  currentRepairItems[index][field] = value;
  currentRepairItems[index].__dirty = true;
  // Odśwież tylko sumy — NIE przebudowuj HTML, żeby nie zgubić focus.
  refreshRepairItemsTotalsOnly();
}

async function syncRepairItems(repairId, items) {
  const created = items.filter((item) => !item.__deleted && !item.id);
  const updated = items.filter((item) => !item.__deleted && item.id && item.__dirty);
  const deleted = items.filter((item) => item.__deleted && item.id);

  for (const item of created) {
    await api("POST", `/api/v1/service/repairs/${repairId}/items`, repairItemPayload(item));
  }
  for (const item of updated) {
    await api("PATCH", `/api/v1/service/repairs/${repairId}/items/${item.id}`, repairItemPayload(item));
  }
  for (const item of deleted) {
    await api("DELETE", `/api/v1/service/repairs/${repairId}/items/${item.id}`);
  }
}

/* ──────────── Backup stanu formularza do powrotu po modalu pozycji ──────────── */
let repairFormBackup = null;

function captureRepairFormState() {
  const form = document.querySelector("#modal-body form");
  if (!form) return null;
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

async function openItemsModal(repairId) {
  // Zachowaj stan bieżącego formularza
  repairFormBackup = { repairId, data: captureRepairFormState() };

  try {
    const repair = await api("GET", `/api/v1/service/repairs/${repairId}`);
    currentRepairItems = (repair.items || []).map((item) => normalizeRepairItem(item));
  } catch (e) {
    toast("Nie udało się pobrać pozycji: " + e.message);
    repairFormBackup = null;
    return;
  }

  const html = `
    <form class="form-grid">
      <div class="form-error" hidden></div>
      <div id="repair-items-container" class="form-group full"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-repair-items-cancel>Anuluj</button>
        <button type="submit" class="btn btn-primary">Zapisz pozycje</button>
      </div>
    </form>`;

  openModal("Pozycje zlecenia", html, async () => {
    await syncRepairItems(repairId, currentRepairItems);
    toast("Pozycje zapisane");
    await reopenRepairFormFromBackup();
  }, { wide: true });

  renderRepairItemsContainer();
}

async function reopenRepairFormFromBackup() {
  if (!repairFormBackup) return;
  const { repairId, data } = repairFormBackup;
  repairFormBackup = null;
  try {
    const repair = await api("GET", `/api/v1/service/repairs/${repairId}`);
    await openRepairForm(repair, data);
  } catch (e) {
    toast("Błąd: " + e.message);
  }
}

async function openRepairForm(existing = null, formDataOverride = null) {
  // doładuj zależności
  try {
    if (!carsCache.length) carsCache = await api("GET", "/api/v1/service/cars");
    staffCache = await api("GET", "/api/v1/service/staff");
  } catch {}

  if (!carsCache.length) {
    toast("Najpierw dodaj samochód");
    return;
  }

  const repairData = existing || {};
  const r = formDataOverride ? { ...repairData, ...formDataOverride } : repairData;
  const defaultCarId = r.car_id || carsCache[0]?.id || "";
  const carOpts = carsCache.map((car) =>
    `<option value="${car.id}" ${defaultCarId === car.id ? "selected" : ""}>${esc(car.make)} ${esc(car.model)} (${esc(car.plate)})</option>`
  ).join("");
  const staffOpts = `<option value="">— nieprzydzielone —</option>` +
    staffCache.map((s) => `<option value="${s.id}" ${r.staff_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  const selectedCar = carsCache.find((car) => car.id === defaultCarId);

  // Wyłącznie przy edycji istniejącej naprawy pobieramy pełne dane (z opisami, notatkami itd.)
  let repairTotals = { parts: 0, labor: 0, grand: 0 };
  if (existing?.id) {
    try {
      const full = await api("GET", `/api/v1/service/repairs/${existing.id}`);
      currentRepairItems = (full.items || []).map((item) => normalizeRepairItem(item));
      repairTotals = repairItemsTotals(currentRepairItems);
      // scal pełne dane z bazy z ewentualnym override (np. powrót z modala pozycji)
      Object.assign(r, full, formDataOverride || {});
    } catch {}
  } else {
    currentRepairItems = [];
  }

  const initialMileage = r.mileage_at_repair ?? selectedCar?.mileage ?? "";

  const html = `
    <form class="form-grid">
      <div class="form-error" hidden></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Samochód *</label>
          <select class="form-select" name="car_id" required>${carOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Mechanik</label>
          <select class="form-select" name="staff_id">${staffOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" name="status">
            <option value="received" ${r.status === "received" ? "selected" : ""}>Przyjęte</option>
            <option value="in_progress" ${r.status === "in_progress" ? "selected" : ""}>W toku</option>
            <option value="done" ${r.status === "done" ? "selected" : ""}>Gotowe</option>
            <option value="handed_over" ${r.status === "handed_over" ? "selected" : ""}>Wydane</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Przebieg (km)</label>
          <input class="form-input" name="mileage_at_repair" type="number" min="0" value="${esc(initialMileage)}" />
        </div>
      </div>
      <div class="form-group full">
        <label class="form-label">Opis usterki</label>
        <textarea class="form-textarea" name="fault_desc">${esc(r.fault_desc || "")}</textarea>
      </div>
      <div class="form-group full">
        <label class="form-label">Zakres prac</label>
        <textarea class="form-textarea" name="work_scope">${esc(r.work_scope || "")}</textarea>
      </div>
      <div class="form-group full">
        <label class="form-label">Notatki</label>
        <textarea class="form-textarea" name="notes">${esc(r.notes || "")}</textarea>
      </div>
      ${existing ? `
      <div class="items-summary-card">
        <h3 class="items-summary-heading">Rozliczenie</h3>
        <div class="items-summary-grid">
          <div class="items-summary-block">
            <div class="items-summary-label">Koszty</div>
            <div class="items-summary-totals">
              <span>Części: <strong>${fmtMoney(repairTotals.purchaseParts)}</strong></span>
              <span>Robocizna: <strong>${fmtMoney(repairTotals.purchaseLabor)}</strong></span>
              <span class="items-summary-grand">Razem: <strong>${fmtMoney(repairTotals.purchase)}</strong></span>
            </div>
          </div>
          <div class="items-summary-block items-summary-profit">
            <div class="items-summary-label">Dochód</div>
            <div class="items-summary-totals">
              <span>Części: <strong>${fmtMoney(repairTotals.parts - repairTotals.purchaseParts)}</strong></span>
              <span>Robocizna: <strong>${fmtMoney(repairTotals.labor - repairTotals.purchaseLabor)}</strong></span>
              <span class="items-summary-grand">Razem: <strong>${fmtMoney(repairTotals.grand - repairTotals.purchase)}</strong></span>
            </div>
          </div>
          <div class="items-summary-block">
            <div class="items-summary-label">Razem</div>
            <div class="items-summary-totals">
              <span>Części: <strong>${fmtMoney(repairTotals.parts)}</strong></span>
              <span>Robocizna: <strong>${fmtMoney(repairTotals.labor)}</strong></span>
              <span class="items-summary-grand">Razem: <strong>${fmtMoney(repairTotals.grand)}</strong></span>
            </div>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-block" data-open-repair-items="${existing.id}">Pozycje zlecenia</button>
      </div>` : `<p class="form-hint">Pozycje zlecenia dodasz po zapisaniu naprawy.</p>`}
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-modal-close>Anuluj</button>
        <button type="submit" class="btn btn-primary">Zapisz naprawę</button>
      </div>
    </form>`;

  openModal(existing ? "Edytuj naprawę" : "Nowa naprawa", html, async (fd) => {
    const data = Object.fromEntries(fd);
    ["mileage_at_repair"].forEach((k) => { data[k] = data[k] === "" ? null : Number(data[k]); });
    data.staff_id = data.staff_id || null;
    Object.keys(data).forEach((k) => data[k] === "" && (data[k] = null));

    if (existing) {
      await api("PATCH", `/api/v1/service/repairs/${existing.id}`, data);
      toast("Naprawa zaktualizowana");
    } else {
      await api("POST", "/api/v1/service/repairs", data);
      toast("Naprawa dodana");
    }
    await loadRepairs();
    refreshCounts();
  }, { wide: true });
}

/* ═══════════════════════════════════════════════
   PODGLĄD ZLECENIA (do wydruku)
   ═══════════════════════════════════════════════ */
function vatGroupsForPreview(items) {
  // Ceny w systemie są BRUTTO — wyciągamy VAT wstecz (backward VAT).
  const map = {};
  items.forEach((item) => {
    const rate = Number(item.vat_rate ?? 23);
    if (!map[rate]) map[rate] = { rate, net: 0, vat: 0, gross: 0 };
    const qty = Number(item.quantity || 0);
    const gross = qty * Number(item.unit_price || 0);
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    map[rate].net += net;
    map[rate].vat += vat;
    map[rate].gross += gross;
  });
  return Object.values(map).sort((a, b) => a.rate - b.rate);
}

function repairPreviewHtml(repair, car, owner) {
  const items = (repair.items || []).filter((it) => !it.__deleted);
  // Ceny są BRUTTO — suma brutto to po prostu suma wartości pozycji.
  const gross = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const vatGroups = vatGroupsForPreview(items);
  const totalVat = vatGroups.reduce((s, g) => s + g.vat, 0);
  const net = gross - totalVat;
  const docNo = repair.number != null ? `ZS/${String(repair.number).padStart(4, "0")}` : "—";

  return `
  <div class="preview-doc preview-print-area">
    <div class="preview-head">
      <img class="preview-logo" src="/service/tiles/logo.jpg" alt="" />
      <div>
        <h3>Zlecenie serwisowe nr ${esc(docNo)}</h3>
        <div class="preview-head-sub">
          Status: ${esc(statusLabel(repair.status))} ·
          Data przyjęcia: ${fmtDate(repair.received_at)}${repair.completed_at ? ` · Zakończenie: ${fmtDate(repair.completed_at)}` : ""}
        </div>
      </div>
      <div class="preview-num">
        ${esc(new Date().toLocaleDateString("pl-PL"))}
        <span>Data wystawienia</span>
      </div>
    </div>

    <div class="preview-grid">
      <div class="preview-block">
        <p class="preview-block-title">Właściciel pojazdu</p>
        <div class="preview-block-row"><span>Nazwa:</span><strong>${esc(customerName(owner || {}))}</strong></div>
        ${owner?.kind === "company" ? `<div class="preview-block-row"><span>NIP:</span>${esc(owner.tax_id || "—")}</div>` : ""}
        <div class="preview-block-row"><span>Telefon:</span>${esc(owner?.phone || "—")}</div>
        ${owner?.email ? `<div class="preview-block-row"><span>Email:</span>${esc(owner.email)}</div>` : ""}
        ${owner?.address ? `<div class="preview-block-row"><span>Adres:</span>${esc(owner.address)}</div>` : ""}
      </div>
      <div class="preview-block">
        <p class="preview-block-title">Dane pojazdu</p>
        <div class="preview-block-row"><span>Marka / model:</span><strong>${esc(car?.make || "—")} ${esc(car?.model || "")}</strong></div>
        <div class="preview-block-row"><span>Rok produkcji:</span>${esc(car?.year || "—")}</div>
        <div class="preview-block-row"><span>Nr rejestr.:</span>${esc(car?.plate || "—")}</div>
        ${car?.vin ? `<div class="preview-block-row"><span>VIN:</span>${esc(car.vin)}</div>` : ""}
        ${car?.color ? `<div class="preview-block-row"><span>Kolor:</span>${esc(car.color)}</div>` : ""}
        ${repair.mileage_at_repair != null ? `<div class="preview-block-row"><span>Przebieg:</span>${Number(repair.mileage_at_repair).toLocaleString("pl-PL")} km</div>` : (car?.mileage != null ? `<div class="preview-block-row"><span>Przebieg:</span>${car.mileage.toLocaleString("pl-PL")} km</div>` : "")}
      </div>
    </div>

    ${(repair.fault_desc || repair.work_scope) ? `
    <div class="preview-block" style="margin-bottom:16px;">
      ${repair.fault_desc ? `<p class="preview-block-title">Opis usterki</p><div class="preview-block-row" style="display:block;white-space:pre-wrap;">${esc(repair.fault_desc)}</div>` : ""}
      ${repair.work_scope ? `<p class="preview-block-title" style="margin-top:10px;">Zakres prac</p><div class="preview-block-row" style="display:block;white-space:pre-wrap;">${esc(repair.work_scope)}</div>` : ""}
    </div>` : ""}

    <div class="preview-table-wrap">
      <table class="preview-table">
        <thead>
          <tr>
            <th style="width:30px;">Lp.</th>
            <th>Nazwa</th>
            <th class="num">Ilość</th>
            <th class="num">Cena jedn. brutto</th>
            <th class="num">VAT</th>
            <th class="num">Wartość brutto</th>
          </tr>
        </thead>
        <tbody>
          ${items.length ? items.map((it, i) => {
            const val = Number(it.quantity || 0) * Number(it.unit_price || 0);
            return `<tr>
              <td>${i + 1}</td>
              <td>${esc(it.name || "—")}${it.sku ? `<br><span style="font-size:0.74rem;color:var(--muted);">SKU: ${esc(it.sku)}</span>` : ""}</td>
              <td class="num">${esc(it.quantity ?? 0)} ${esc(it.unit || "")}</td>
              <td class="num">${fmtMoney(it.unit_price || 0)}</td>
              <td class="num">${Number(it.vat_rate ?? 23)}%</td>
              <td class="num">${fmtMoney(val)}</td>
            </tr>`;
          }).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--muted);">Brak pozycji</td></tr>`}
        </tbody>
        <tfoot class="preview-tfoot">
          <tr>
            <td colspan="5" style="text-align:right;">Razem do zapłaty (brutto):</td>
            <td class="num">${fmtMoney(gross)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="preview-vat">
      <p class="preview-vat-title">Wyszczególnienie stawek VAT (kwota VAT w cenie)</p>
      <table class="preview-vat-table">
        <thead>
          <tr><th>Stawka VAT</th><th>Wartość netto</th><th>Kwota VAT</th><th>Wartość brutto</th></tr>
        </thead>
        <tbody>
          ${vatGroups.map((g) => `<tr>
            <td>${g.rate}%</td>
            <td>${fmtMoney(g.net)}</td>
            <td>${fmtMoney(g.vat)}</td>
            <td>${fmtMoney(g.gross)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="preview-sign">
      <div class="preview-sign-box">
        <div style="font-weight:600;color:var(--text);">Warsztat</div>
        <div class="line">podpis / pieczątka</div>
      </div>
      <div class="preview-sign-box">
        <div style="font-weight:600;color:var(--text);">Klient ${esc(customerName(owner || {}))}</div>
        <div class="line">podpis / pieczątka</div>
      </div>
    </div>
  </div>`;
}

async function openRepairPreview(repair) {
  // Pobierz pełne dane naprawy (z pozycjami) oraz powiązane auto i właściciela
  let full, car, owner;
  try {
    full = await api("GET", `/api/v1/service/repairs/${repair.id}`);
    if (!carsCache.length) carsCache = await api("GET", "/api/v1/service/cars");
    car = carsCache.find((c) => c.id === full.car_id);
    if (!customersCache.length) customersCache = await api("GET", "/api/v1/service/customers");
    owner = customersCache.find((c) => c.id === car?.customer_id);
  } catch (e) {
    toast("Nie udało się pobrać danych zlecenia: " + e.message);
    return;
  }

  const docHtml = repairPreviewHtml(full, car, owner);

  // Zbuduj modal z podglądem i przyciskiem drukowania
  const html = `
    <div class="preview-print-area">
      ${docHtml}
      <div class="form-actions preview-actions" style="margin-top:18px;">
        <button type="button" class="btn btn-ghost" data-modal-close>Zamknij</button>
        <button type="button" class="btn btn-primary" data-print-repair>Drukuj / PDF</button>
      </div>
    </div>`;

  // Najpierw ukryj duplikat w obszarze wydruku
  const printRoot = $("#print-root");
  printRoot.innerHTML = "";
  printRoot.hidden = true;

  openModal(`Podgląd zlecenia nr ${full.number != null ? "ZS/" + String(full.number).padStart(4, "0") : ""}`, html, null, { wide: true });
}

function doPrintRepair() {
  const modalBody = $("#modal-body");
  if (!modalBody) return;
  const src = modalBody.querySelector(".preview-doc");
  const printRoot = $("#print-root");
  if (!src || !printRoot) {
    window.print();
    return;
  }
  // Skopiuj treść podglądu do obszaru wydruku
  printRoot.innerHTML = src.outerHTML;
  printRoot.hidden = false;
  // Zamknij modal, aby nie był widoczny na wydruku
  closeModal();
  // Drukuj po załadowaniu obrazka (logo)
  const logo = printRoot.querySelector(".preview-logo") as HTMLImageElement | null;
  const waitLogo =
    logo && !logo.complete
      ? new Promise<void>((res) => {
          logo.onload = () => res();
          logo.onerror = () => res();
        })
      : Promise.resolve();
  requestAnimationFrame(() => {
    waitLogo.then(() => {
      window.print();
      // Po druku przywróć stan
      printRoot.hidden = true;
      printRoot.innerHTML = "";
    });
  });
}

/* ═══════════════════════════════════════════════
   DELEGACJA ZDARZEŃ
   ═══════════════════════════════════════════════ */
async function handleClick(e: Event) {
  const target = e.target as Element;
  // Otwórz kafelek
  const openTile = target.closest("[data-open]");
  if (openTile) {
    const view = openTile.dataset.open;
    if (view === "cars") carsFilterCustomer = null;
    if (view === "repairs") repairsFilterCar = null;
    showView(view);
    return;
  }

  const monthHead = target.closest("[data-toggle-month]");
  if (monthHead) {
    monthOpen.set(monthHead.getAttribute("data-toggle-month")!, monthHead.getAttribute("data-month-open") !== "1");
    renderRepairs(lastRepairsInput);
    return;
  }

  const viewCarsBtn = target.closest("[data-view-cars]");
  if (viewCarsBtn) {
    goToCustomerCars(viewCarsBtn.getAttribute("data-view-cars")!);
    return;
  }

  const viewRepairsBtn = target.closest("[data-view-repairs]");
  if (viewRepairsBtn) {
    goToCarRepairs(viewRepairsBtn.getAttribute("data-view-repairs")!);
    return;
  }

  if (target.closest("[data-clear-cars-filter]")) {
    carsFilterCustomer = null;
    showView("cars");
    return;
  }

  if (target.closest("[data-clear-repairs-filter]")) {
    repairsFilterCar = null;
    showView("repairs");
    return;
  }

  // Nowy (formularze)
  const actionBtn = target.closest("[data-action]");
  if (actionBtn) {
    const a = actionBtn.dataset.action;
    if (a === "customer-new") openCustomerForm();
    if (a === "car-new") openCarForm();
    if (a === "repair-new") openRepairForm();
    return;
  }

  const repairItemAdd = target.closest("[data-repair-item-add]");
  if (repairItemAdd) {
    currentRepairItems.push(normalizeRepairItem({}));
    renderRepairItemsContainer();
    return;
  }

  const repairItemDelete = target.closest("[data-repair-item-delete]");
  if (repairItemDelete) {
    const index = Number(repairItemDelete.dataset.repairItemDelete);
    if (!Number.isNaN(index)) {
      if (currentRepairItems[index]?.id) {
        currentRepairItems[index].__deleted = true;
      } else {
        currentRepairItems.splice(index, 1);
      }
      renderRepairItemsContainer();
    }
    return;
  }

  const openItems = target.closest("[data-open-repair-items]");
  if (openItems) {
    await openItemsModal(openItems.dataset.openRepairItems);
    return;
  }

  const cancelItems = target.closest("[data-repair-items-cancel]");
  if (cancelItems) {
    await reopenRepairFormFromBackup();
    return;
  }

  // Edytuj
  const editCust = target.closest("[data-edit-customer]");
  if (editCust) {
    const c = customersCache.find((x) => x.id === editCust.dataset.editCustomer);
    if (c) openCustomerForm(c);
    return;
  }
  const editCar = target.closest("[data-edit-car]");
  if (editCar) {
    const car = carsCache.find((x) => x.id === editCar.dataset.editCar);
    if (car) openCarForm(car);
    return;
  }
  const editRepair = target.closest("[data-edit-repair]");
  if (editRepair) {
    const r = repairsCache.find((x) => x.id === editRepair.dataset.editRepair);
    if (r) openRepairForm(r);
    return;
  }
  const previewRepair = target.closest("[data-preview-repair]");
  if (previewRepair) {
    const r = repairsCache.find((x) => x.id === previewRepair.dataset.previewRepair);
    if (r) openRepairPreview(r);
    return;
  }
  const printRepair = target.closest("[data-print-repair]");
  if (printRepair) {
    doPrintRepair();
    return;
  }

  // Usuń
  const delCust = target.closest("[data-del-customer]");
  if (delCust) {
    if (confirm("Usunąć klienta? Spowoduje to usunięcie jego samochodów i napraw.")) {
      try {
        await api("DELETE", `/api/v1/service/customers/${delCust.dataset.delCustomer}`);
        toast("Klient usunięty");
        await loadCustomers($("#customer-search").value);
        refreshCounts();
      } catch (err) { toast("Błąd: " + err.message); }
    }
    return;
  }
  const delCar = target.closest("[data-del-car]");
  if (delCar) {
    if (confirm("Usunąć samochód? Spowoduje to usunięcie jego napraw.")) {
      try {
        await api("DELETE", `/api/v1/service/cars/${delCar.dataset.delCar}`);
        toast("Samochód usunięty");
        await loadCars($("#car-search").value);
        refreshCounts();
      } catch (err) { toast("Błąd: " + err.message); }
    }
    return;
  }
  const delRepair = target.closest("[data-del-repair]");
  if (delRepair) {
    if (confirm("Usunąć naprawę?")) {
      try {
        await api("DELETE", `/api/v1/service/repairs/${delRepair.dataset.delRepair}`);
        toast("Naprawa usunięta");
        await loadRepairs();
        refreshCounts();
      } catch (err) { toast("Błąd: " + err.message); }
    }
    return;
  }

  // Modal close
  if (target.closest("[data-modal-close]")) {
    closeModal();
    return;
  }

}

function handleInput(e: Event) {
  const field = (e.target as HTMLElement).closest(".repair-item-field") as HTMLInputElement | null;
  if (!field) return;
  const index = Number(field.dataset.repairItemIndex);
  const prop = field.dataset.repairItemField;
  if (!Number.isNaN(index) && currentRepairItems[index]) {
    const value = field.type === "number" ? (field.value === "" ? "" : Number(field.value)) : field.value;
    updateRepairItemField(index, prop, value);
  }

}

function handleChange(e: Event) {
  const field = (e.target as HTMLElement).closest(".repair-item-field") as HTMLInputElement | null;
  if (!field) return;
  const index = Number(field.dataset.repairItemIndex);
  const prop = field.dataset.repairItemField;
  if (!Number.isNaN(index) && currentRepairItems[index]) {
    const value = field.type === "number" ? (field.value === "" ? "" : Number(field.value)) : field.value;
    updateRepairItemField(index, prop, value);
  }
}

function debounce(fn: (...args: any[]) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}


export function initServiceApp(root: HTMLElement, accessToken: string): () => void {
  mountCtx = { root, accessToken };

  root.addEventListener("click", (e) => { void handleClick(e); });
  root.addEventListener("input", handleInput);
  root.addEventListener("change", handleChange);
  const onPopState = (e: PopStateEvent) => {
    const view = (e.state as { view?: string } | null)?.view || "home";
    showView(view, false);
  };
  window.addEventListener("popstate", onPopState);
  const onServiceHome = () => {
    closeModal();
    showView("home", window.location.hash !== "#home");
  };
  window.addEventListener("service:home", onServiceHome);

  $("#customer-search")?.addEventListener("input", debounce((e: Event) => loadCustomers((e.target as HTMLInputElement).value), 350));
  $("#car-search")?.addEventListener("input", debounce((e: Event) => loadCars((e.target as HTMLInputElement).value), 350));
  $("#repair-search")?.addEventListener("input", debounce((e: Event) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    const filtered = repairsCache.filter((r) =>
      statusLabel(r.status).toLowerCase().includes(q) || r.status.toLowerCase().includes(q)
    );
    renderRepairs(filtered);
  }, 200));

  const hash = window.location.hash.replace("#", "");
  const valid = ["home", "customers", "cars", "repairs"];
  const initial = valid.includes(hash) ? hash : "home";
  history.replaceState({ view: initial }, "", initial === "home" ? "#home" : `#${initial}`);
  showView(initial, false);

  return () => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("service:home", onServiceHome);
    mountCtx = null;
  };
}
