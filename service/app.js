"use strict";

/* ═══════════════════════════════════════════════
   AUTKA.PL — Obsługa serwisowa
   ═══════════════════════════════════════════════ */

const API_BASE = window.__AUTKA_PHOTOS_API_URL__ || "http://localhost:8010";

/* ──────────── Token autoryzacji (jak panel wideo) ──────────── */
function getToken() {
  const urlToken = new URLSearchParams(window.location.search).get("token");
  if (urlToken) {
    sessionStorage.setItem("serviceToken", urlToken);
    return urlToken;
  }
  return sessionStorage.getItem("serviceToken");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = `http://localhost:3010/login?callbackUrl=/service`;
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
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
function showView(name) {
  $$(".view").forEach((v) => (v.hidden = true));
  const view = $(`#view-${name}`);
  if (view) view.hidden = false;
  if (name === "home") refreshCounts();
  if (name === "customers") loadCustomers();
  if (name === "cars") loadCars();
  if (name === "repairs") loadRepairs();
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
        <button class="btn btn-ghost btn-sm" data-edit-customer="${c.id}">Edytuj</button>
        <button class="btn btn-danger btn-sm" data-del-customer="${c.id}">Usuń</button>
      </div>
    </div>
  `).join("");
}

/* ═══════════════════════════════════════════════
   SAMOCHODY
   ═══════════════════════════════════════════════ */
let carsCache = [];

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
  if (!items.length) {
    list.innerHTML = `<div class="list-empty">Brak samochodów. Dodaj pierwszy pojazd przyciskiem powyżej.</div>`;
    return;
  }
  list.innerHTML = items.map((car) => {
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
        <button class="btn btn-ghost btn-sm" data-edit-car="${car.id}">Edytuj</button>
        <button class="btn btn-danger btn-sm" data-del-car="${car.id}">Usuń</button>
      </div>
    </div>`;
  }).join("");
}

/* ═══════════════════════════════════════════════
   NAPRAWY
   ═══════════════════════════════════════════════ */
let repairsCache = [];

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

function renderRepairs(items) {
  const list = $("#repair-list");
  if (!items.length) {
    list.innerHTML = `<div class="list-empty">Brak napraw. Dodaj pierwsze zlecenie przyciskiem powyżej.</div>`;
    return;
  }
  list.innerHTML = items.map((r) => {
    const car = carsCache.find((c) => c.id === r.car_id);
    return `
    <div class="list-item">
      <div class="list-item-main">
        <p class="list-item-title">${car ? `${esc(car.make)} ${esc(car.model)} (${esc(car.plate)})` : "Auto usunięte"}</p>
        <div class="list-item-meta">
          <span class="badge badge-${r.status}">${statusLabel(r.status)}</span>
          <span>📅 Przyjęto: ${fmtDate(r.received_at)}</span>
          ${r.completed_at ? `<span>✓ Zakończono: ${fmtDate(r.completed_at)}</span>` : ""}
          ${r.grand_total ? `<span>💰 ${fmtMoney(r.grand_total)}</span>` : ""}
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-ghost btn-sm" data-edit-repair="${r.id}">Edytuj</button>
        <button class="btn btn-danger btn-sm" data-del-repair="${r.id}">Usuń</button>
      </div>
    </div>`;
  }).join("");
}

/* ═══════════════════════════════════════════════
   FORMULARZE (w modalach)
   ═══════════════════════════════════════════════ */
function openModal(title, html, onSubmit) {
  $("#modal-title").textContent = title;
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

async function openRepairForm(existing = null) {
  // doładuj zależności
  try {
    if (!carsCache.length) carsCache = await api("GET", "/api/v1/service/cars");
    staffCache = await api("GET", "/api/v1/service/staff");
  } catch {}

  if (!carsCache.length) {
    toast("Najpierw dodaj samochód");
    return;
  }
  const r = existing || {};
  const carOpts = carsCache.map((car) =>
    `<option value="${car.id}" ${r.car_id === car.id ? "selected" : ""}>${esc(car.make)} ${esc(car.model)} (${esc(car.plate)})</option>`
  ).join("");
  const staffOpts = `<option value="">— nieprzydzielone —</option>` +
    staffCache.map((s) => `<option value="${s.id}" ${r.staff_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");

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
          <input class="form-input" name="mileage_at_repair" type="number" min="0" value="${esc(r.mileage_at_repair ?? "")}" />
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
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-modal-close>Anuluj</button>
        <button type="submit" class="btn btn-primary">Zapisz naprawę</button>
      </div>
    </form>
    ${existing ? `<p class="form-hint" style="margin-top:14px">Pozycje zlecenia (części/usługi) zarządzaj po otwarciu naprawy.</p>` : ""}`;

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
  });
}

/* ═══════════════════════════════════════════════
   DELEGACJA ZDARZEŃ
   ═══════════════════════════════════════════════ */
document.addEventListener("click", async (e) => {
  const target = e.target;

  // Otwórz kafelek
  const openTile = target.closest("[data-open]");
  if (openTile) {
    showView(openTile.dataset.open);
    return;
  }

  // Wróć
  const backBtn = target.closest("[data-back]");
  if (backBtn) {
    showView(backBtn.dataset.back);
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
});

/* ──────────── Wyszukiwarki (debounce) ──────────── */
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

$("#customer-search")?.addEventListener("input", debounce((e) => loadCustomers(e.target.value), 350));
$("#car-search")?.addEventListener("input", debounce((e) => loadCars(e.target.value), 350));
$("#repair-search")?.addEventListener("input", debounce((e) => {
  const q = e.target.value.toLowerCase();
  const filtered = repairsCache.filter((r) =>
    statusLabel(r.status).toLowerCase().includes(q) || r.status.toLowerCase().includes(q)
  );
  renderRepairs(filtered);
}, 200));

/* ──────────── Init ──────────── */
if (!getToken()) {
  window.location.href = `http://localhost:3010/login?callbackUrl=/service`;
} else {
  showView("home");
}
