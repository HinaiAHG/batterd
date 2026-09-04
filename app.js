/* ============================================================
   BATTERD — shared partner ledger + purchase tracker
   Online (Supabase): live sync, photo storage, AI receipt scan.
   ============================================================ */

(function () {
  "use strict";

  const CFG = window.BATTERD_CONFIG || {};
  const PARTNERS = CFG.PARTNERS || [];
  const CATEGORIES = CFG.CATEGORIES || [];
  const PUR_CATS = CFG.PURCHASE_CATEGORIES || [];
  const PUR_STATUSES = CFG.PURCHASE_STATUSES || [];
  const BUCKET = "receipts";

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
  const partner = (id) => PARTNERS.find((p) => p.id === id) || {};
  const partnerName = (id) => partner(id).name || id;
  const partnerColor = (id) => partner(id).color || "var(--brand)";
  const categoryName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || id;
  const purCatName = (id) => (PUR_CATS.find((c) => c.id === id) || {}).name || id;
  const status = (id) => PUR_STATUSES.find((s) => s.id === id) || { name: id, color: "#8a94a6" };

  const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const fmtMoney = (n) => nf.format(Number(n) || 0);
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
  };
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  // Official Omani Rial symbol (Central Bank of Oman).
  const RIAL_PATH = "M 60.05 261.94 L 98.55 192.21 L 230.20 191.90 C 228.88 142.98 247.16 83.29 279.20 45.75 C 318.23 0.00 376.41 22.47 415.27 55.84 C 420.17 60.04 434.50 72.86 434.29 78.52 L 408.30 177.87 C 377.58 143.70 338.13 105.87 287.70 114.30 C 278.21 115.89 265.40 124.91 260.51 133.13 C 248.36 153.56 273.55 178.35 287.23 191.89 L 656.01 191.89 L 617.18 261.94 L 356.08 261.94 C 367.28 271.51 383.15 280.37 396.75 286.32 C 403.88 289.45 431.12 299.97 437.15 299.97 L 596.10 299.97 L 557.27 370.03 L 0.00 370.03 L 39.03 299.97 L 284.23 299.97 L 256.20 261.94 Z M 60.05 261.94";
  const RIAL_SVG = `<svg class="omr" viewBox="0 0 656 370" role="img" aria-label="OMR"><path d="${RIAL_PATH}"/></svg>`;
  const moneyInner = (n) => {
    const neg = Number(n) < 0;
    return `${neg ? '<span class="neg-sign">−</span>' : ''}<span class="omr-wrap">${RIAL_SVG}</span><span class="amt">${fmtMoney(Math.abs(Number(n) || 0))}</span>`;
  };
  const moneyHTML = (n) => `<span class="money">${moneyInner(n)}</span>`;
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // ---------- Supabase ----------
  const sb = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

  // ---------- state ----------
  let currentUser = localStorage.getItem("batterd_user") || null;
  let expenses = [];
  let purchases = [];
  let view = "expenses";
  let fCat = "all", fPartner = "all", fStatus = "all";
  let editExpId = null, editPurId = null;

  if (CFG.BUSINESS_NAME) { $("#who-biz-name").textContent = CFG.BUSINESS_NAME; $("#biz-name").textContent = CFG.BUSINESS_NAME; }

  // ---------- who screen ----------
  function renderWho() {
    const w = $("#who-buttons"); w.innerHTML = "";
    PARTNERS.forEach((p) => {
      const b = el("button");
      b.style.setProperty("--pc", p.color);
      const d = el("span", "pdot"); d.style.background = p.color; b.appendChild(d);
      b.appendChild(document.createTextNode(p.name + (p.role ? "  ·  " + p.role : "")));
      b.onclick = () => { currentUser = p.id; localStorage.setItem("batterd_user", p.id); showApp(); };
      w.appendChild(b);
    });
  }
  function showWho() { $("#app").classList.add("hidden"); $("#who-screen").classList.remove("hidden"); renderWho(); }

  // ---------- app shell ----------
  function showApp() {
    $("#who-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    const pill = $("#who-pill"); pill.innerHTML = "";
    const d = el("span", "pdot"); d.style.background = partnerColor(currentUser); pill.appendChild(d);
    pill.appendChild(document.createTextNode(partnerName(currentUser)));
    pill.style.color = partnerColor(currentUser); pill.style.borderColor = partnerColor(currentUser);
    pill.onclick = showWho;
    buildExpenseForm(); buildPurchaseForm(); buildFilters();
    setView(view);
    loadAll();
  }

  // ---------- tabs ----------
  $$("#tabs .tab").forEach((t) => (t.onclick = () => setView(t.dataset.view)));
  function setView(v) {
    view = v;
    $$("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    ["expenses", "purchases", "dashboard"].forEach((name) =>
      $("#view-" + name).classList.toggle("hidden", name !== v));
    if (v === "dashboard") renderDashboard();
    window.scrollTo(0, 0);
  }

  // ---------- forms ----------
  function fillSelect(sel, items, placeholder) {
    sel.innerHTML = "";
    if (placeholder) { const o = el("option"); o.value = ""; o.textContent = placeholder; sel.appendChild(o); }
    items.forEach((it) => { const o = el("option"); o.value = it.id; o.textContent = it.name; sel.appendChild(o); });
  }
  function buildExpenseForm() {
    fillSelect($("#e-category"), CATEGORIES, "— choose category —");
    fillSelect($("#e-partner"), PARTNERS, null);
    $("#e-partner").value = currentUser;
  }
  function buildPurchaseForm() {
    fillSelect($("#p-category"), PUR_CATS, "— choose —");
    fillSelect($("#p-status"), PUR_STATUSES, null);
  }
  function buildFilters() {
    const cf = $("#filter-category"); cf.innerHTML = "";
    [{ id: "all", name: "All categories" }, ...CATEGORIES].forEach((c) => {
      const chip = el("button", "chip" + (fCat === c.id ? " active" : ""));
      chip.textContent = c.name;
      chip.onclick = () => { fCat = c.id; buildFilters(); renderExpenses(); };
      cf.appendChild(chip);
    });
    const sf = $("#filter-status"); sf.innerHTML = "";
    [{ id: "all", name: "All" }, ...PUR_STATUSES].forEach((s) => {
      const chip = el("button", "chip" + (fStatus === s.id ? " active" : ""));
      chip.textContent = s.name;
      if (s.id !== "all") chip.style.setProperty("--pc", s.color);
      chip.onclick = () => { fStatus = s.id; buildFilters(); renderPurchases(); };
      sf.appendChild(chip);
    });
  }

  // ============================================================
  //  EXPENSES
  // ============================================================
  function totalSpent() { return expenses.reduce((s, e) => s + Number(e.amount), 0); }

  function renderExpenseTotals() {
    const wrap = $("#totals"); wrap.innerHTML = "";
    const total = totalSpent();
    PARTNERS.forEach((p) => {
      const paid = expenses.filter((e) => e.partner === p.id).reduce((s, e) => s + Number(e.amount), 0);
      const count = expenses.filter((e) => e.partner === p.id).length;
      const fair = (p.equity || 0) * total;
      const bal = paid - fair; // + owed to them, - they owe
      const active = fPartner === p.id;
      const c = el("div", "total-card" + (active ? " active" : ""));
      c.style.setProperty("--pc", p.color);
      c.innerHTML =
        `<div class="tc-label">${esc(p.name)} · ${Math.round((p.equity || 0) * 100)}%</div>` +
        `<div class="tc-value money">${moneyInner(paid)}</div>` +
        `<div class="tc-count">${count} item${count === 1 ? "" : "s"}</div>` +
        `<div class="tc-bal ${bal >= 0 ? "pos" : "neg"}">${bal >= 0 ? "owed " : "owes "}${moneyHTML(Math.abs(bal))}</div>`;
      c.onclick = () => { fPartner = fPartner === p.id ? "all" : p.id; renderExpenseTotals(); renderExpenses(); };
      wrap.appendChild(c);
    });
    const g = el("div", "total-card grand" + (fPartner === "all" ? " active" : ""));
    g.innerHTML =
      `<div class="tc-label">Total spent</div>` +
      `<div class="tc-value money">${moneyInner(total)}</div>` +
      `<div class="tc-count">${expenses.length} expenses</div>`;
    g.onclick = () => { fPartner = "all"; renderExpenseTotals(); renderExpenses(); };
    wrap.appendChild(g);
  }

  function renderSettle() {
    const box = $("#settle"); box.innerHTML = "";
    const total = totalSpent();
    if (!expenses.length) return;
    const bals = PARTNERS.map((p) => ({
      p, bal: expenses.filter((e) => e.partner === p.id).reduce((s, e) => s + Number(e.amount), 0) - (p.equity || 0) * total,
    }));
    // minimal transfers: debtors -> creditors
    const debt = bals.filter((b) => b.bal < -0.005).map((b) => ({ id: b.p.id, name: b.p.name, amt: -b.bal })).sort((a, b) => b.amt - a.amt);
    const cred = bals.filter((b) => b.bal > 0.005).map((b) => ({ id: b.p.id, name: b.p.name, amt: b.bal })).sort((a, b) => b.amt - a.amt);
    const moves = [];
    let i = 0, j = 0;
    const D = debt.map((x) => ({ ...x })), C = cred.map((x) => ({ ...x }));
    while (i < D.length && j < C.length) {
      const m = Math.min(D[i].amt, C[j].amt);
      moves.push({ from: D[i], to: C[j], amt: m });
      D[i].amt -= m; C[j].amt -= m;
      if (D[i].amt < 0.005) i++;
      if (C[j].amt < 0.005) j++;
    }
    let html = `<div class="settle-card"><h3>Settle up <span class="settle-note">to equal each partner’s equity share</span></h3>`;
    if (!moves.length) {
      html += `<div class="settle-clear">✅ Everyone is square with their equity share.</div>`;
    } else {
      html += `<div class="settle-moves">`;
      moves.forEach((m) => {
        html += `<div class="settle-move">` +
          `<span class="sm-from" style="color:${partnerColor(m.from.id)}">${esc(m.from.name)}</span>` +
          `<span class="sm-arrow">→</span>` +
          `<span class="sm-to" style="color:${partnerColor(m.to.id)}">${esc(m.to.name)}</span>` +
          `<span class="sm-amt">${moneyHTML(m.amt)}</span></div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    box.innerHTML = html;
  }

  function filteredExpenses() {
    return expenses.filter((e) => {
      if (fPartner !== "all" && e.partner !== fPartner) return false;
      if (fCat !== "all" && e.category !== fCat) return false;
      return true;
    });
  }
  function renderExpenses() {
    const list = $("#expenses-list"); const rows = filteredExpenses();
    list.innerHTML = "";
    $("#expenses-empty").classList.toggle("hidden", rows.length > 0);
    rows.forEach((e) => list.appendChild(expenseRow(e)));
  }
  function expenseRow(e) {
    const row = el("div", "receipt");
    row.onclick = (ev) => { if (ev.target.classList.contains("receipt-thumb")) return; openExpense(e); };
    const amt = el("div", "receipt-amount"); amt.innerHTML = moneyHTML(e.amount); row.appendChild(amt);
    if (e.photo_url) {
      const img = el("img", "receipt-thumb"); img.src = e.photo_url; img.alt = "receipt"; img.loading = "lazy";
      img.onclick = () => openLightbox(e.photo_url);
      row.appendChild(img);
    }
    const main = el("div", "receipt-main");
    const top = el("div", "receipt-top");
    const cat = el("span", "receipt-cat"); cat.textContent = categoryName(e.category);
    const dt = el("span", "receipt-date"); dt.textContent = "📅 " + fmtDate(e.expense_date);
    top.append(cat, dt);
    const meta = el("div", "receipt-meta");
    const who = el("span", "receipt-who"); who.style.color = partnerColor(e.partner);
    const d = el("span", "pdot"); d.style.background = partnerColor(e.partner); who.appendChild(d);
    who.appendChild(document.createTextNode(partnerName(e.partner)));
    meta.appendChild(who);
    if (e.reimbursed) { const b = el("span", "badge-reimb"); b.textContent = "reimbursed"; meta.appendChild(b); }
    main.append(top, meta);
    if (e.description) { const dsc = el("div", "receipt-note"); dsc.textContent = e.description; main.appendChild(dsc); }
    if (e.note) { const n = el("div", "receipt-subnote"); n.textContent = e.note; main.appendChild(n); }
    row.appendChild(main);
    return row;
  }

  // ---------- expense modal ----------
  const expModal = $("#expense-modal");
  function openExpenseNew() {
    editExpId = null;
    $("#expense-form").reset(); buildExpenseForm();
    $("#expense-modal .modal-head h2").textContent = "New expense";
    $("#e-date").value = todayISO();
    $("#e-photo-preview").classList.add("hidden");
    $("#e-analyze-status").classList.add("hidden");
    $("#expense-error").classList.add("hidden");
    delBtn("exp").style.display = "none";
    expModal.classList.remove("hidden");
  }
  function openExpense(e) {
    editExpId = e.id;
    $("#expense-form").reset(); buildExpenseForm();
    $("#expense-modal .modal-head h2").textContent = "Edit expense";
    $("#e-amount").value = e.amount;
    $("#e-date").value = e.expense_date;
    $("#e-category").value = e.category;
    $("#e-partner").value = e.partner;
    $("#e-desc").value = e.description || "";
    $("#e-note").value = e.note || "";
    $("#e-reimbursed").checked = !!e.reimbursed;
    $("#e-photo-preview").classList.toggle("hidden", !e.photo_url);
    if (e.photo_url) $("#e-photo-preview-img").src = e.photo_url;
    $("#e-analyze-status").classList.add("hidden");
    $("#expense-error").classList.add("hidden");
    delBtn("exp").style.display = "";
    expModal.classList.remove("hidden");
  }
  function delBtn(kind) {
    // ensure a delete button exists in the expense modal actions
    let b = $("#expense-del-btn");
    if (!b) {
      b = el("button", "btn-ghost btn-danger"); b.id = "expense-del-btn"; b.type = "button"; b.textContent = "Delete";
      const actions = $("#expense-modal .modal-actions");
      actions.insertBefore(b, actions.firstChild);
      b.onclick = deleteExpense;
    }
    return b;
  }
  $$("[data-close-exp]").forEach((b) => (b.onclick = () => expModal.classList.add("hidden")));
  $("#add-expense-btn").onclick = openExpenseNew;

  $("#e-photo").onchange = (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) { $("#e-photo-preview").classList.add("hidden"); return; }
    $("#e-photo-preview-img").src = URL.createObjectURL(f);
    $("#e-photo-preview").classList.remove("hidden");
    analyzeReceipt(f);
  };
  const fileToB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
  function setAnalyze(kind, text) {
    const box = $("#e-analyze-status");
    if (!kind) { box.classList.add("hidden"); return; }
    box.className = "analyze-status " + kind;
    box.innerHTML = (kind === "loading" ? '<span class="spin"></span>' : "") + `<span>${esc(text)}</span>`;
  }
  async function analyzeReceipt(file) {
    if (!sb) return;
    setAnalyze("loading", "Reading the receipt with AI…");
    try {
      const b64 = await fileToB64(file);
      const { data, error } = await sb.functions.invoke("analyze-receipt", {
        body: { image: b64, media_type: file.type || "image/jpeg", categories: CATEGORIES, today: todayISO() },
      });
      if (error) throw new Error(error.message);
      if (!data || data.error) throw new Error((data && data.error) || "failed");
      const r = data.result || {};
      if (typeof r.amount === "number" && r.amount > 0) $("#e-amount").value = r.amount;
      if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) $("#e-date").value = r.date;
      if (r.category && CATEGORIES.some((c) => c.id === r.category)) $("#e-category").value = r.category;
      if (r.merchant && !$("#e-desc").value) $("#e-desc").value = r.merchant;
      setAnalyze("ok", "Extracted — please review.");
    } catch (err) { console.error(err); setAnalyze("err", "Couldn’t auto-read — enter details manually."); }
  }

  $("#expense-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const errBox = $("#expense-error"); errBox.classList.add("hidden");
    const btn = $("#expense-submit");
    const rec = {
      partner: $("#e-partner").value,
      amount: parseFloat($("#e-amount").value),
      category: $("#e-category").value,
      expense_date: $("#e-date").value,
      description: $("#e-desc").value.trim() || null,
      note: $("#e-note").value.trim() || null,
      reimbursed: $("#e-reimbursed").checked,
    };
    const file = $("#e-photo").files[0] || null;
    if (isNaN(rec.amount) || !rec.expense_date || !rec.category || !rec.partner) {
      errBox.textContent = "Please fill amount, date, category and payer."; errBox.classList.remove("hidden"); return;
    }
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      let photoFailed = false;
      if (file) {
        try {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${rec.expense_date}_${rec.partner}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const up = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });
          if (up.error) throw up.error;
          rec.photo_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          rec.photo_path = path;
        } catch (e2) { console.warn("photo upload failed", e2); photoFailed = true; }
      }
      let error;
      if (editExpId) ({ error } = await sb.from("expenses").update(rec).eq("id", editExpId));
      else ({ error } = await sb.from("expenses").insert(rec));
      if (error) throw error;
      expModal.classList.add("hidden");
      await reload();
      if (photoFailed) alert("Saved, but the photo failed to upload.");
    } catch (err) { console.error(err); errBox.textContent = "Save failed: " + (err.message || err); errBox.classList.remove("hidden"); }
    finally { btn.disabled = false; btn.textContent = "Save"; }
  };
  async function deleteExpense() {
    if (!editExpId || !confirm("Delete this expense?")) return;
    const { error } = await sb.from("expenses").delete().eq("id", editExpId);
    if (error) { alert("Delete failed: " + error.message); return; }
    expModal.classList.add("hidden"); await reload();
  }

  // ============================================================
  //  PURCHASES
  // ============================================================
  const purTotal = (p) => (Number(p.quantity) || (p.unit_cost ? 1 : 0)) * (Number(p.unit_cost) || 0);

  function renderPurchaseTotals() {
    const wrap = $("#purchase-totals"); wrap.innerHTML = "";
    const active = PUR_STATUSES.filter((s) => s.id !== "cancelled");
    active.forEach((s) => {
      const rows = purchases.filter((p) => p.status === s.id);
      const sum = rows.reduce((a, p) => a + purTotal(p), 0);
      const isActive = fStatus === s.id;
      const c = el("div", "total-card" + (isActive ? " active" : ""));
      c.style.setProperty("--pc", s.color);
      c.innerHTML = `<div class="tc-label">${esc(s.name)}</div><div class="tc-value money">${moneyInner(sum)}</div><div class="tc-count">${rows.length} item${rows.length === 1 ? "" : "s"}</div>`;
      c.onclick = () => { fStatus = fStatus === s.id ? "all" : s.id; buildFilters(); renderPurchaseTotals(); renderPurchases(); };
      wrap.appendChild(c);
    });
    const committed = purchases.filter((p) => p.status !== "cancelled").reduce((a, p) => a + purTotal(p), 0);
    const g = el("div", "total-card grand" + (fStatus === "all" ? " active" : ""));
    g.innerHTML = `<div class="tc-label">Total committed</div><div class="tc-value money">${moneyInner(committed)}</div><div class="tc-count">${purchases.length} orders</div>`;
    g.onclick = () => { fStatus = "all"; buildFilters(); renderPurchaseTotals(); renderPurchases(); };
    wrap.appendChild(g);
  }
  function renderPurchases() {
    const list = $("#purchases-list"); list.innerHTML = "";
    const rows = purchases.filter((p) => fStatus === "all" || p.status === fStatus);
    $("#purchases-empty").classList.toggle("hidden", rows.length > 0);
    rows.forEach((p) => list.appendChild(purchaseRow(p)));
  }
  function purchaseRow(p) {
    const row = el("div", "purchase");
    row.onclick = () => openPurchase(p);
    const st = status(p.status);
    const total = purTotal(p);
    const left = el("div", "purchase-main");
    const top = el("div", "purchase-top");
    const item = el("span", "purchase-item"); item.textContent = p.item;
    const badge = el("span", "status-badge"); badge.textContent = st.name; badge.style.background = st.color;
    top.append(item, badge);
    const meta = el("div", "purchase-meta");
    const bits = [];
    bits.push(purCatName(p.category));
    if (p.supplier) bits.push(p.supplier);
    if (p.quantity) bits.push(`${fmtMoney(p.quantity)} × ${moneyHTMLtext(p.unit_cost)}`);
    meta.innerHTML = bits.map(esc).join(" · ");
    left.append(top, meta);
    if (p.order_date || p.delivery_date) {
      const dates = el("div", "purchase-dates");
      dates.textContent = [p.order_date ? "ordered " + fmtDate(p.order_date) : "", p.delivery_date ? "→ delivery " + fmtDate(p.delivery_date) : ""].filter(Boolean).join("  ");
      left.appendChild(dates);
    }
    if (p.note) { const n = el("div", "receipt-subnote"); n.textContent = p.note; left.appendChild(n); }
    const right = el("div", "purchase-total"); right.innerHTML = moneyHTML(total);
    row.append(right, left);
    return row;
  }
  function moneyHTMLtext(n) { return fmtMoney(n) + " OMR"; }

  const purModal = $("#purchase-modal");
  function openPurchaseNew() {
    editPurId = null; $("#purchase-form").reset(); buildPurchaseForm();
    $("#purchase-modal .modal-head h2").textContent = "New purchase";
    $("#p-status").value = "researching";
    $("#purchase-error").classList.add("hidden");
    $$("[data-del-pur]").forEach((b) => (b.style.display = "none"));
    purModal.classList.remove("hidden");
  }
  function openPurchase(p) {
    editPurId = p.id; $("#purchase-form").reset(); buildPurchaseForm();
    $("#purchase-modal .modal-head h2").textContent = "Edit purchase";
    $("#p-item").value = p.item; $("#p-category").value = p.category; $("#p-status").value = p.status;
    $("#p-supplier").value = p.supplier || ""; $("#p-qty").value = p.quantity ?? ""; $("#p-unit").value = p.unit_cost ?? "";
    $("#p-order-date").value = p.order_date || ""; $("#p-delivery-date").value = p.delivery_date || "";
    $("#p-note").value = p.note || "";
    $("#purchase-error").classList.add("hidden");
    $$("[data-del-pur]").forEach((b) => (b.style.display = ""));
    purModal.classList.remove("hidden");
  }
  $$("[data-close-pur]").forEach((b) => (b.onclick = () => purModal.classList.add("hidden")));
  $$("[data-del-pur]").forEach((b) => (b.onclick = deletePurchase));
  $("#add-purchase-btn").onclick = openPurchaseNew;

  $("#purchase-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const errBox = $("#purchase-error"); errBox.classList.add("hidden");
    const rec = {
      item: $("#p-item").value.trim(),
      category: $("#p-category").value,
      status: $("#p-status").value,
      supplier: $("#p-supplier").value.trim() || null,
      quantity: $("#p-qty").value === "" ? null : parseFloat($("#p-qty").value),
      unit_cost: $("#p-unit").value === "" ? null : parseFloat($("#p-unit").value),
      order_date: $("#p-order-date").value || null,
      delivery_date: $("#p-delivery-date").value || null,
      note: $("#p-note").value.trim() || null,
    };
    if (!rec.item || !rec.category || !rec.status) { errBox.textContent = "Please fill item, category and status."; errBox.classList.remove("hidden"); return; }
    const btn = $("#purchase-submit"); btn.disabled = true; btn.textContent = "Saving…";
    try {
      let error;
      if (editPurId) ({ error } = await sb.from("purchases").update(rec).eq("id", editPurId));
      else ({ error } = await sb.from("purchases").insert(rec));
      if (error) throw error;
      purModal.classList.add("hidden"); await reload();
    } catch (err) { console.error(err); errBox.textContent = "Save failed: " + (err.message || err); errBox.classList.remove("hidden"); }
    finally { btn.disabled = false; btn.textContent = "Save"; }
  };
  async function deletePurchase() {
    if (!editPurId || !confirm("Delete this purchase?")) return;
    const { error } = await sb.from("purchases").delete().eq("id", editPurId);
    if (error) { alert("Delete failed: " + error.message); return; }
    purModal.classList.add("hidden"); await reload();
  }

  // ============================================================
  //  DASHBOARD
  // ============================================================
  const PALETTE = ["#e0245e", "#4a90d9", "#2a9d8f", "#d99a3c", "#7a5ea8", "#3fae9c", "#c77d3a", "#8a9a3b", "#5d7a8c", "#d16b54", "#9b59b6"];
  function donutSVG(segments, centerTop) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    const r = 62, C = 2 * Math.PI * r, cx = 85, cy = 85, sw = 32; let acc = 0, arcs = "";
    segments.forEach((seg) => { const f = seg.value / total;
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}" stroke-dasharray="${f * C} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 ${cx} ${cy})"/>`; acc += f; });
    return `<svg class="donut" viewBox="0 0 170 170"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>${arcs}<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="800">${esc(centerTop)}</text></svg>`;
  }
  function renderDashboard() {
    const body = $("#dash-body");
    if (!expenses.length && !purchases.length) { body.innerHTML = `<div class="dash-empty">No data yet.</div>`; return; }
    const total = totalSpent();
    let html = "";
    html += `<div class="dash-grid3">` +
      `<div class="dcard dstat"><div class="dlabel">Total spent</div><div class="dval">${moneyHTML(total)}</div></div>` +
      `<div class="dcard dstat"><div class="dlabel">Expenses</div><div class="dval">${expenses.length}</div></div>` +
      `<div class="dcard dstat"><div class="dlabel">Purchase pipeline</div><div class="dval">${moneyHTML(purchases.filter(p => p.status !== "cancelled").reduce((a, p) => a + purTotal(p), 0))}</div></div>` +
      `</div>`;

    // paid vs fair share
    const maxP = Math.max(...PARTNERS.map((p) => expenses.filter((e) => e.partner === p.id).reduce((s, e) => s + Number(e.amount), 0)), (total || 1) * 0.25, 1);
    html += `<div class="dcard"><h3>Paid vs fair share (by equity)</h3>`;
    PARTNERS.forEach((p) => {
      const paid = expenses.filter((e) => e.partner === p.id).reduce((s, e) => s + Number(e.amount), 0);
      const fair = (p.equity || 0) * total;
      html += `<div class="hbar-row"><div class="hbar-name">${esc(p.name)}</div>` +
        `<div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(0, (paid / maxP) * 100)}%;background:${p.color}"></div>` +
        `<div class="hbar-marker" style="left:${Math.min(100, (fair / maxP) * 100)}%" title="fair share"></div></div>` +
        `<div class="hbar-val">${moneyHTML(paid)}</div></div>`;
    });
    html += `<div class="hbar-legend">▏ marker = fair share for their equity</div></div>`;

    // category donut
    const catMap = {}; expenses.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount); });
    const cats = Object.keys(catMap).map((id) => ({ id, name: categoryName(id), sum: catMap[id] })).filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
    cats.forEach((c, i) => (c.color = PALETTE[i % PALETTE.length]));
    if (cats.length) {
      html += `<div class="dcard"><h3>Spend by category</h3><div class="donut-wrap">` + donutSVG(cats.map((c) => ({ value: c.sum, color: c.color })), fmtMoney(total)) + `<div class="legend">`;
      cats.forEach((c) => { const pct = total ? Math.round((c.sum / total) * 100) : 0;
        html += `<div class="legend-row"><span class="legend-dot" style="background:${c.color}"></span><span class="legend-name">${esc(c.name)}</span><span class="legend-val">${moneyHTML(c.sum)}</span><span class="legend-pct">${pct}%</span></div>`; });
      html += `</div></div></div>`;
    }

    // purchase pipeline
    if (purchases.length) {
      html += `<div class="dcard"><h3>Purchase pipeline</h3>`;
      const maxA = Math.max(...PUR_STATUSES.map((s) => purchases.filter((p) => p.status === s.id).reduce((a, p) => a + purTotal(p), 0)), 1);
      PUR_STATUSES.forEach((s) => {
        const rows = purchases.filter((p) => p.status === s.id); if (!rows.length) return;
        const sum = rows.reduce((a, p) => a + purTotal(p), 0);
        html += `<div class="hbar-row"><div class="hbar-name">${esc(s.name)} (${rows.length})</div><div class="hbar-track"><div class="hbar-fill" style="width:${(sum / maxA) * 100}%;background:${s.color}"></div></div><div class="hbar-val">${moneyHTML(sum)}</div></div>`;
      });
      html += `</div>`;
    }
    body.innerHTML = html;
  }

  // ---------- lightbox ----------
  function openLightbox(url) { $("#lightbox-img").src = url; $("#lightbox").classList.remove("hidden"); }
  $$("[data-lb-close]").forEach((b) => (b.onclick = () => $("#lightbox").classList.add("hidden")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { expModal.classList.add("hidden"); purModal.classList.add("hidden"); $("#lightbox").classList.add("hidden"); } });

  // ---------- data / realtime ----------
  async function loadAll() {
    if (!sb) { $("#loading-state").classList.add("hidden"); return; }
    await reload();
    $("#loading-state").classList.add("hidden");
    subscribe();
  }
  async function reload() {
    if (!sb) return;
    const [ex, pu] = await Promise.all([
      sb.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("purchases").select("*").order("created_at", { ascending: false }),
    ]);
    if (ex.error) { console.error(ex.error); alert("Load failed: " + ex.error.message); return; }
    expenses = ex.data || [];
    purchases = pu.data || [];
    renderExpenseTotals(); renderSettle(); renderExpenses();
    renderPurchaseTotals(); renderPurchases();
    if (view === "dashboard") renderDashboard();
  }
  let subscribed = false;
  function subscribe() {
    if (!sb || subscribed) return; subscribed = true;
    sb.channel("batterd-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, reload)
      .subscribe();
  }

  // ---------- boot ----------
  if (currentUser && PARTNERS.some((p) => p.id === currentUser)) showApp(); else showWho();
})();
