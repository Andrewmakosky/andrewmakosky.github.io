(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var DRAFT_KEY = "checklist-draft-v6";
  var INSPECTOR_KEY = "checklist-inspector";
  var PHOTO_MAX = 1280;      // longest side, px
  var PHOTO_QUALITY = 0.7;   // JPEG quality

  var $ = function (id) { return document.getElementById(id); };
  var form = $("checkForm");
  var photos = {};           // { itemId | "notes": [{ id, data, w, h }] }
  var photoTarget = null;
  var last = null;           // { report, pdf }

  // ---------- storage (wrapped: private mode can throw) ----------
  function store(key, val) {
    try {
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* ignore */ }
  }
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  // Photos are too big for localStorage, so they go in IndexedDB.
  // Stores: "kv" (draft photos) and "reports" (saved reports with their PDFs).
  function idb(storeName, mode, fn) {
    return new Promise(function (resolve, reject) {
      var open;
      try { open = indexedDB.open("checklist", 2); } catch (e) { return reject(e); }
      open.onupgradeneeded = function () {
        var db = open.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("reports")) db.createObjectStore("reports", { keyPath: "id" });
      };
      open.onerror = function () { reject(open.error); };
      open.onsuccess = function () {
        var tx = open.result.transaction(storeName, mode);
        var req = fn(tx.objectStore(storeName));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = function () { reject(tx.error); };
      };
    });
  }
  function savePhotos() {
    return idb("kv", "readwrite", function (s) { return s.put(photos, "photos"); }).catch(function () {});
  }
  function loadPhotos() {
    return idb("kv", "readonly", function (s) { return s.get("photos"); }).catch(function () { return null; });
  }

  // ---------- saved reports ----------
  var MAX_SAVED = 200;
  var savedReports = [];

  function loadReports() {
    return idb("reports", "readonly", function (s) { return s.getAll(); }).then(function (list) {
      savedReports = (list || []).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      renderReports();
    }).catch(function () { renderReports(); });
  }

  function putReport(rec) {
    var i = savedReports.findIndex(function (x) { return x.id === rec.id; });
    if (i >= 0) savedReports[i] = rec; else savedReports.unshift(rec);
    var drop = savedReports.splice(MAX_SAVED);
    renderReports();
    return idb("reports", "readwrite", function (s) {
      drop.forEach(function (d) { s.delete(d.id); });
      return s.put(rec);
    }).catch(function () {});
  }

  function deleteReport(id) {
    savedReports = savedReports.filter(function (x) { return x.id !== id; });
    renderReports();
    return idb("reports", "readwrite", function (s) { return s.delete(id); }).catch(function () {});
  }

  var STATUS_TEXT = {
    sent: "✓ Emailed to the office",
    sending: "Sending…",
    failed: "✗ Not emailed automatically",
    manual: "Saved — email it from your phone",
  };

  function renderReports() {
    $("reportCount").textContent = savedReports.length ? savedReports.length : "";
    var list = savedReports.filter(matchesSearch);
    var box = $("reportList");
    box.innerHTML = "";
    $("reportEmpty").hidden = list.length > 0;
    $("reportEmpty").textContent = savedReports.length
      ? "No saved reports match your search."
      : "No reports yet. Reports appear here after you submit them.";

    list.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "report";
      el.innerHTML =
        '<div class="report-top"><div><div class="report-title"></div><div class="report-meta"></div></div>' +
        '<span class="badge"></span></div>' +
        '<div class="report-status"></div>' +
        '<div class="report-actions">' +
          '<a class="btn ghost" data-act="open">Open PDF</a>' +
          '<button type="button" class="btn ghost" data-act="share">Share</button>' +
          '<button type="button" class="btn ghost" data-act="resend">Resend</button>' +
          '<button type="button" class="btn ghost danger" data-act="delete">Delete</button>' +
        '</div>';
      el.querySelector(".report-title").textContent = "Unit " + r.unit + " — " + r.vehicleType;
      el.querySelector(".report-meta").textContent = [r.company, r.inspector, new Date(r.createdAt).toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
      })].filter(Boolean).join(" · ");
      var badge = el.querySelector(".badge");
      badge.textContent = r.result;
      badge.className = "badge " + r.kind;
      var st = el.querySelector(".report-status");
      st.textContent = STATUS_TEXT[r.status] || "";
      st.className = "report-status " + (r.status === "sent" ? "sent" : r.status === "failed" ? "unsent" : "");

      var open = el.querySelector('[data-act="open"]');
      open.addEventListener("click", function () {
        var url = URL.createObjectURL(r.blob);
        open.href = url;
        open.download = r.filename;
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      });
      var share = el.querySelector('[data-act="share"]');
      var file = fileFor(r);
      share.hidden = !(file && navigator.canShare && navigator.canShare({ files: [file] }));
      share.addEventListener("click", function () {
        navigator.share({ files: [file], title: r.subject, text: r.subject }).catch(function () {});
      });
      var resend = el.querySelector('[data-act="resend"]');
      resend.hidden = !CFG.emailServiceUrl;
      resend.addEventListener("click", function () {
        if (!confirm("Email this report to the office again?")) return;
        resendReport(r, resend);
      });
      el.querySelector('[data-act="delete"]').addEventListener("click", function () {
        if (confirm("Delete the saved report for unit " + r.unit + " from this phone?")) deleteReport(r.id);
      });
      box.appendChild(el);
    });
  }

  function fileFor(r) {
    try { return new File([r.blob], r.filename, { type: "application/pdf" }); } catch (e) { return null; }
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function resendReport(r, btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
    blobToBase64(r.blob).then(function (b64) {
      // Resend goes to the office list only, not to one-time contacts again.
      return sendAuto({ subject: r.subject, summary: r.summary, extraTo: [] }, { filename: r.filename, base64: b64 }, reportMeta(r));
    }).then(function () {
      r.status = "sent";
      putReport(r);
      alert("Report for unit " + r.unit + " was emailed to the office.");
    }).catch(function () {
      alert("Couldn't send right now. Check your connection and try again.");
      btn.disabled = false;
      btn.textContent = "Resend";
    });
  }

  // Ask the browser not to clear saved reports to free up space.
  function keepStorage() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  }

  // Details the email sender logs alongside the saved PDF.
  function reportMeta(rec) {
    return {
      createdAt: rec.createdAt, unit: rec.unit, company: rec.company, vehicleType: rec.vehicleType,
      result: rec.result, inspector: rec.inspector, kind: rec.kind,
    };
  }

  // ---------- shared reports (Google Drive archive, all devices) ----------
  var PASS_KEY = "checklist-passcode";
  var sharedReports = [];
  var sharedPdfs = {};   // id -> Blob, once opened

  function sharedGet(params) {
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(CFG.emailServiceUrl + "?" + q).then(function (res) { return res.json(); });
  }

  function setSharedState(state, msg) {
    var locked = state === "locked";
    $("unlockForm").hidden = !locked;
    $("sharedLock").hidden = locked || !load(PASS_KEY);
    $("sharedRefresh").hidden = locked;
    $("sharedError").hidden = !msg;
    $("sharedError").textContent = msg || "";
    if (state !== "ready") { $("sharedList").innerHTML = ""; $("sharedEmpty").hidden = state !== "loading"; }
    if (state === "loading") $("sharedEmpty").textContent = "Loading reports…";
  }

  function loadShared() {
    if (!CFG.emailServiceUrl) { $("sharedCard").hidden = true; return; }
    var pass = load(PASS_KEY);
    if (!pass) { setSharedState("locked"); return; }
    setSharedState("loading");
    sharedGet({ action: "list", passcode: pass }).then(function (j) {
      if (j.ok && Array.isArray(j.reports)) {
        sharedReports = j.reports;
        setSharedState("ready");
        renderShared();
      } else if (j.ok) {
        setSharedState("error", "The Google email sender needs the latest update before reports can be shared between devices.");
      } else if (/passcode/i.test(j.error || "")) {
        store(PASS_KEY, null);
        setSharedState("locked", j.error);
      } else {
        setSharedState("error", j.error || "Couldn't load the reports.");
      }
    }).catch(function () {
      setSharedState("error", "Couldn't reach the reports. Check your connection and tap Refresh.");
    });
  }

  function matchesSearch(r) {
    var q = $("reportSearch").value.trim().toLowerCase();
    return !q || [r.unit, r.company, r.inspector, r.vehicleType, r.result].join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function formatWhen(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderShared() {
    var list = sharedReports.filter(matchesSearch);
    var box = $("sharedList");
    box.innerHTML = "";
    $("sharedEmpty").hidden = list.length > 0;
    $("sharedEmpty").textContent = sharedReports.length ? "No reports match your search." : "No reports have been saved yet.";
    list.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "report";
      el.innerHTML =
        '<div class="report-top"><div><div class="report-title"></div><div class="report-meta"></div></div>' +
        '<span class="badge"></span></div>' +
        '<div class="report-actions"><button type="button" class="btn ghost">Open PDF</button></div>';
      el.querySelector(".report-title").textContent = "Unit " + r.unit + " — " + r.vehicleType;
      el.querySelector(".report-meta").textContent = [r.company, r.inspector, formatWhen(r.createdAt)].filter(Boolean).join(" · ");
      var badge = el.querySelector(".badge");
      badge.textContent = r.result;
      badge.className = "badge " + (r.kind || "ok");
      var btn = el.querySelector(".btn");
      btn.addEventListener("click", function () { openSharedPdf(r, btn); });
      box.appendChild(el);
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function openSharedPdf(r, btn) {
    var name = "Inspection_Unit-" + String(r.unit).replace(/[^A-Za-z0-9-]+/g, "-") + ".pdf";
    if (sharedPdfs[r.id]) { downloadBlob(sharedPdfs[r.id], name); return; }
    btn.disabled = true;
    btn.textContent = "Loading…";
    sharedGet({ action: "pdf", id: r.id, passcode: load(PASS_KEY) || "" }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "Couldn't open the PDF.");
      var bytes = atob(j.pdfBase64);
      var arr = new Uint8Array(bytes.length);
      for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      sharedPdfs[r.id] = new Blob([arr], { type: "application/pdf" });
      downloadBlob(sharedPdfs[r.id], j.filename || name);
    }).catch(function (err) {
      alert(err.message || "Couldn't open the PDF. Check your connection.");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Open PDF";
    });
  }

  // ---------- tabs ----------
  var newTabView = "formView";   // which screen the New inspection tab shows
  function showTab(tab) {
    var reports = tab === "reports";
    $("tabNew").classList.toggle("active", !reports);
    $("tabReports").classList.toggle("active", reports);
    $("reportsView").hidden = !reports;
    $("formView").hidden = reports || newTabView !== "formView";
    $("doneView").hidden = reports || newTabView !== "doneView";
    $("progressText").parentNode.style.visibility = reports ? "hidden" : "";
    if (reports) { renderReports(); loadShared(); }
    window.scrollTo(0, 0);
  }

  // ---------- build the form ----------
  function secNumber(sec, i) { return sec.number || String(i + 1); }
  function itemId(sec, i, j) { return "s" + secNumber(sec, i) + "_" + j; }

  // Sections and items marked onlyFor: "Truck" / "Machine" apply only to that category.
  function sectionActive(sec) {
    return !sec.onlyFor || sec.onlyFor === valueOf("vehicleCategory");
  }

  // Checklist items are a name, or { name, passInput, onlyFor }.
  // passInput asks for a value on Pass; onlyFor limits it to a category.
  function itemDef(x) { return typeof x === "string" ? { name: x } : x; }

  function build() {
    if (CFG.appTitle) $("brandName").textContent = CFG.appTitle;

    var cats = $("vehicleCategory");
    Object.keys(CFG.vehicleTypes || {}).forEach(function (c) {
      var l = document.createElement("label");
      l.innerHTML = '<input type="radio" name="vehicleCategory"><span></span>';
      l.querySelector("input").value = c;
      l.querySelector("span").textContent = c;
      cats.appendChild(l);
    });

    var root = $("checklist");
    (CFG.checklist || []).forEach(function (sec, i) {
      var card = document.createElement("section");
      card.className = "card";
      card.dataset.section = i;
      var h = document.createElement("h2");
      h.textContent = secNumber(sec, i) + ". " + sec.section;
      card.appendChild(h);

      sec.items.forEach(function (x, j) {
        var def = itemDef(x);
        var name = def.name;
        var id = itemId(sec, i, j);
        var item = document.createElement("div");
        item.className = "item";
        item.dataset.id = id;
        item.innerHTML =
          '<div class="item-head">' +
            '<div class="item-name"></div>' +
            '<button type="button" class="photo-btn" data-add-photo="' + id + '" aria-label="Add photo">📷<span class="count"></span></button>' +
          '</div>' +
          '<div class="seg" role="radiogroup">' +
            '<label><input type="radio" name="' + id + '" value="Pass"><span>Pass</span></label>' +
            '<label><input type="radio" name="' + id + '" value="Fail"><span>Fail</span></label>' +
            '<label><input type="radio" name="' + id + '" value="N/A"><span>N/A</span></label>' +
          '</div>' +
          '<div class="item-note" hidden>' +
            '<input name="' + id + '_note" placeholder="What failed?" aria-label="What failed?">' +
          '</div>' +
          (def.passContacts
            ? '<div class="item-pass" hidden><span class="label"></span>' +
                '<div class="contacts" data-contacts="' + id + '"></div>' +
                '<button type="button" class="btn ghost small" data-add-contact="' + id + '">+ Add additional contact information</button>' +
              '</div>'
            : def.passInput
            ? '<label class="item-pass" hidden><span class="label"></span>' +
                (def.passMultiline
                  ? '<textarea name="' + id + '_pass" rows="3" autocomplete="off"></textarea>'
                  : '<input name="' + id + '_pass" autocomplete="off" autocapitalize="characters">') +
              '</label>'
            : '') +
          '<div class="photos" data-photos="' + id + '"></div>';
        item.querySelector(".item-name").textContent = name;
        if (def.passInput) item.querySelector(".item-pass .label").textContent = def.passInput;
        if (def.passContacts) addContact(item.querySelector(".contacts"));
        item.querySelector(".seg").setAttribute("aria-label", name);
        item.querySelector(".photo-btn").setAttribute("aria-label", "Add photo: " + name);
        card.appendChild(item);
      });
      root.appendChild(card);
    });

    var pol = $("policy");
    (CFG.policy || []).forEach(function (t) {
      var p = document.createElement("p");
      p.textContent = t;
      pol.appendChild(p);
    });
    pol.hidden = !(CFG.policy || []).length;
  }

  function allItems() {
    var out = [];
    (CFG.checklist || []).forEach(function (sec, i) {
      if (!sectionActive(sec)) return;
      sec.items.forEach(function (x, j) {
        var def = itemDef(x);
        if (!sectionActive(def)) return;
        out.push({ section: sec.section, name: def.name, passInput: def.passInput, passContacts: def.passContacts, passInDetails: def.passInDetails, id: itemId(sec, i, j) });
      });
    });
    return out;
  }

  function valueOf(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  // ---------- contacts (name + number rows on some items) ----------
  function addContact(box, name, phone) {
    var row = document.createElement("div");
    row.className = "contact-row";
    row.innerHTML =
      '<input class="ct-name" name="ct_name" placeholder="Contact Name" aria-label="Contact name" autocomplete="off">' +
      '<input class="ct-phone" name="ct_phone" type="tel" inputmode="tel" placeholder="Contact Number" aria-label="Contact number" autocomplete="off">' +
      '<button type="button" class="op-remove" aria-label="Remove contact">×</button>';
    row.querySelector(".ct-name").value = name || "";
    row.querySelector(".ct-phone").value = phone || "";
    row.querySelector(".op-remove").addEventListener("click", function () {
      row.remove();
      updateContactButtons(box);
      saveDraft();
    });
    box.appendChild(row);
    updateContactButtons(box);
    return row;
  }

  function updateContactButtons(box) {
    var rows = box.querySelectorAll(".contact-row");
    rows.forEach(function (r) { r.querySelector(".op-remove").hidden = rows.length < 2; });
  }

  function contactBoxes() { return form.querySelectorAll("[data-contacts]"); }

  function getContacts(id) {
    var box = form.querySelector('[data-contacts="' + id + '"]');
    return Array.prototype.map.call(box.querySelectorAll(".contact-row"), function (r) {
      return { name: r.querySelector(".ct-name").value.trim(), phone: r.querySelector(".ct-phone").value.trim() };
    });
  }

  function resetContacts(saved) {
    contactBoxes().forEach(function (box) {
      var list = (saved && saved[box.dataset.contacts]) || [{}];
      box.innerHTML = "";
      list.forEach(function (c) { addContact(box, c.name, c.phone); });
    });
  }

  function contactsText(id) {
    return getContacts(id).filter(function (c) { return c.name || c.phone; })
      .map(function (c) { return c.name + " - " + c.phone; }).join("\n");
  }

  // ---------- operators ----------
  function newOpId() { return "op" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function addOperator(id, name) {
    id = id || newOpId();
    var row = document.createElement("div");
    row.className = "operator";
    row.dataset.op = id;
    row.innerHTML =
      '<div class="operator-row">' +
        '<input name="op_' + id + '" placeholder="Operator name" aria-label="Operator name" autocomplete="off">' +
        '<button type="button" class="op-remove" aria-label="Remove operator">×</button>' +
      '</div>' +
      '<div class="photos" data-photos="' + id + '"></div>' +
      '<button type="button" class="photo-btn wide" data-add-photo="' + id + '">📷 Add driver\'s license photo<span class="count"></span></button>';
    row.querySelector("input").value = name || "";
    row.querySelector(".op-remove").addEventListener("click", function () {
      var hasData = row.querySelector("input").value.trim() || (photos[id] && photos[id].length);
      if (hasData && !confirm("Remove this operator and their license photo?")) return;
      row.remove();
      if (photos[id]) { delete photos[id]; savePhotos(); }
      updateOperatorButtons();
      saveDraft();
    });
    $("operators").appendChild(row);
    renderPhotos(id);
    updateOperatorButtons();
    return row;
  }

  function updateOperatorButtons() {
    var rows = $("operators").querySelectorAll(".operator");
    rows.forEach(function (r) { r.querySelector(".op-remove").hidden = rows.length < 2; });
  }

  function getOperators() {
    return Array.prototype.map.call($("operators").querySelectorAll(".operator"), function (r) {
      return { id: r.dataset.op, name: r.querySelector("input").value.trim() };
    });
  }

  function resetOperators(list) {
    $("operators").innerHTML = "";
    (list && list.length ? list : [{}]).forEach(function (o) { addOperator(o.id, o.name); });
  }

  // ---------- photos ----------
  function renderPhotos(key) {
    var box = form.querySelector('[data-photos="' + key + '"]');
    if (!box) return;
    box.innerHTML = "";
    (photos[key] || []).forEach(function (ph) {
      var cell = document.createElement("div");
      cell.className = "photo";
      var img = document.createElement("img");
      img.src = ph.data;
      img.alt = "Photo";
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.setAttribute("aria-label", "Remove photo");
      del.addEventListener("click", function () {
        if (!confirm("Remove this photo?")) return;
        photos[key] = photos[key].filter(function (p) { return p.id !== ph.id; });
        if (!photos[key].length) delete photos[key];
        renderPhotos(key);
        savePhotos();
      });
      cell.appendChild(img);
      cell.appendChild(del);
      box.appendChild(cell);
    });
    var btn = form.querySelector('[data-add-photo="' + key + '"] .count');
    var n = photos[key] ? photos[key].length : 0;
    if (btn) btn.textContent = !n ? "" : btn.closest(".wide") ? " (" + n + ")" : " " + n;
  }

  function renderAllPhotos() {
    form.querySelectorAll("[data-photos]").forEach(function (box) { renderPhotos(box.dataset.photos); });
  }

  // Shrink to a sensible size so reports stay small enough to email.
  function processPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale);
        var h = Math.round(img.naturalHeight * scale);
        var c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), data: c.toDataURL("image/jpeg", PHOTO_QUALITY), w: w, h: h });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not read photo")); };
      img.src = url;
    });
  }

  function addPhotos(key, files) {
    var btn = form.querySelector('[data-add-photo="' + key + '"]');
    if (btn) btn.classList.add("busy");
    var jobs = Array.prototype.map.call(files, function (f) {
      return processPhoto(f).catch(function () { return null; });
    });
    return Promise.all(jobs).then(function (list) {
      list = list.filter(Boolean);
      if (!list.length) return;
      photos[key] = (photos[key] || []).concat(list);
      renderPhotos(key);
      savePhotos();
    }).then(function () {
      if (btn) btn.classList.remove("busy");
    });
  }

  // ---------- UI updates ----------
  // ---------- one-time extra recipients ----------
  var EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;

  function extraInputs() { return $("extraEmails").querySelectorAll("input"); }

  function showExtraRows() {
    var inputs = extraInputs();
    var last = 0;
    inputs.forEach(function (el, i) { if (el.value.trim()) last = i; });
    inputs.forEach(function (el, i) { if (i <= last) el.hidden = false; });
    updateAddEmailBtn();
  }

  function updateAddEmailBtn() {
    var hidden = Array.prototype.filter.call(extraInputs(), function (el) { return el.hidden; });
    $("addEmailBtn").hidden = !hidden.length;
  }

  // Valid, unique addresses not already on the office list.
  function extraEmails() {
    var office = (CFG.reportEmail || "").toLowerCase().split(",").map(function (a) { return a.trim(); });
    var out = [];
    extraInputs().forEach(function (el) {
      var a = el.value.trim().toLowerCase();
      if (a && office.indexOf(a) < 0 && out.indexOf(a) < 0) out.push(a);
    });
    return out;
  }

  // Fill the vehicle list for the chosen category (Truck / Machine),
  // keeping the current pick if it's still in the list.
  function populateTypes() {
    var cat = valueOf("vehicleCategory");
    var sel = $("vehicleType");
    var keep = sel.value;
    var list = (CFG.vehicleTypes || {})[cat] || [];
    sel.innerHTML = '<option value="">Select…</option>';
    list.forEach(function (t) {
      var o = document.createElement("option");
      o.textContent = t;
      sel.appendChild(o);
    });
    sel.value = list.indexOf(keep) >= 0 ? keep : "";
  }

  // Labels that change with Truck / Machine.
  function updateLabels() {
    var cat = valueOf("vehicleCategory");
    $("vehicleTypeLabel").textContent = (CFG.vehicleTypeLabels || {})[cat] || "Type of " + cat;
    $("vehicleOtherLabel").textContent = otherLabel();
    $("unitLabel").textContent = unitLabel();
  }

  function unitLabel() {
    return (CFG.unitLabels || {})[valueOf("vehicleCategory")] || "Unit / vehicle #";
  }

  function otherLabel() {
    return (CFG.vehicleOtherLabels || {})[valueOf("vehicleCategory")] || "Describe your vehicle";
  }

  function vehicleTypeText() {
    var cat = valueOf("vehicleCategory");
    var t = $("vehicleType").value;
    var other = $("vehicleOther").value.trim();
    return cat + ": " + (t === "Other" && other ? "Other - " + other : t);
  }

  function refresh() {
    updateLabels();
    $("vehicleTypeField").hidden = !valueOf("vehicleCategory");
    $("vehicleOtherField").hidden = $("vehicleTypeField").hidden || $("vehicleType").value !== "Other";
    (CFG.checklist || []).forEach(function (sec, i) {
      var card = form.querySelector('.card[data-section="' + i + '"]');
      card.hidden = !sectionActive(sec);
      sec.items.forEach(function (x, j) {
        card.querySelector('.item[data-id="' + itemId(sec, i, j) + '"]').hidden = !sectionActive(itemDef(x));
      });
    });
    var items = allItems();
    var done = 0;
    items.forEach(function (it) {
      var v = valueOf(it.id);
      if (v) done++;
      var row = form.querySelector('.item[data-id="' + it.id + '"]');
      row.querySelector(".item-note").hidden = v !== "Fail";
      if (it.passInput) row.querySelector(".item-pass").hidden = v !== "Pass";
      if (v) row.classList.remove("missing");
    });
    $("progressText").textContent = done + " / " + items.length;
  }

  // ---------- drafts ----------
  function saveDraft() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      var key = el.name || el.id;
      if (!key || el.type === "file" || key.indexOf("op_") === 0 || key.indexOf("ct_") === 0) return;
      if (el.type === "radio") { if (el.checked) data[key] = el.value; }
      else if (el.type === "checkbox") data[key] = el.checked;
      else data[key] = el.value;
    });
    data.operators = getOperators();
    data.contacts = {};
    contactBoxes().forEach(function (box) { data.contacts[box.dataset.contacts] = getContacts(box.dataset.contacts); });
    store(DRAFT_KEY, data);
    if ($("inspector").value.trim()) store(INSPECTOR_KEY, $("inspector").value.trim());
  }

  function restoreDraft() {
    var data = load(DRAFT_KEY);
    resetOperators(data && data.operators);
    resetContacts(data && data.contacts);
    if (data) {
      Array.prototype.forEach.call(form.elements, function (el) {
        var key = el.name || el.id;
        if (!key || !(key in data)) return;
        if (el.type === "radio") el.checked = data[key] === el.value;
        else if (el.type === "checkbox") el.checked = !!data[key];
        else el.value = data[key];
      });
      // The vehicle list only exists once a category is set.
      populateTypes();
      $("vehicleType").value = data.vehicleType || "";
    }
    if (!$("inspector").value) $("inspector").value = load(INSPECTOR_KEY) || "";
  }

  // ---------- validation ----------
  function showError(msg, focusEl) {
    var e = $("formError");
    e.textContent = msg;
    e.hidden = false;
    if (focusEl) {
      focusEl.scrollIntoView({ behavior: "smooth", block: "center" });
      if (focusEl.focus) setTimeout(function () { focusEl.focus({ preventScroll: true }); }, 300);
    }
  }

  function validate() {
    $("formError").hidden = true;
    form.querySelectorAll(".invalid").forEach(function (el) { el.classList.remove("invalid"); });

    if (!$("company").value.trim()) {
      $("company").classList.add("invalid");
      showError("Please enter the company.", $("company"));
      return false;
    }

    if (!valueOf("vehicleCategory")) {
      showError("Please choose Truck or Machine.", $("vehicleCategory"));
      return false;
    }

    var fields = [
      [$("vehicleType"), "Please choose the vehicle type."],
      [$("vehicleOther"), "Please " + otherLabel().charAt(0).toLowerCase() + otherLabel().slice(1) + ".", $("vehicleType").value === "Other"],
      [$("unit"), "Please enter the " + unitLabel().toLowerCase() + "."],
    ];
    for (var k = 0; k < fields.length; k++) {
      var f = fields[k];
      if (f.length > 2 && !f[2]) continue;
      if (!f[0].value.trim()) {
        f[0].classList.add("invalid");
        showError(f[1], f[0]);
        return false;
      }
    }

    var opInputs = $("operators").querySelectorAll("input");
    var named = Array.prototype.filter.call(opInputs, function (i) { return i.value.trim(); });
    if (!named.length) {
      opInputs[0].classList.add("invalid");
      showError("Please enter at least one vehicle operator.", opInputs[0]);
      return false;
    }

    var firstMissing = null, missing = 0;
    allItems().forEach(function (it) {
      var row = form.querySelector('.item[data-id="' + it.id + '"]');
      if (!valueOf(it.id)) {
        missing++;
        row.classList.add("missing");
        if (!firstMissing) firstMissing = row;
      }
    });
    if (firstMissing) {
      showError(missing + " checklist item" + (missing > 1 ? "s" : "") + " not answered.", firstMissing);
      return false;
    }

    var noNote = allItems().filter(function (it) {
      return valueOf(it.id) === "Fail" && !form.elements[it.id + "_note"].value.trim();
    })[0];
    if (noNote) {
      var input = form.elements[noNote.id + "_note"];
      input.classList.add("invalid");
      showError("Please describe what failed: " + noNote.name, input);
      return false;
    }

    var contactItems = allItems().filter(function (it) { return it.passContacts && valueOf(it.id) === "Pass"; });
    for (var c = 0; c < contactItems.length; c++) {
      var box = form.querySelector('[data-contacts="' + contactItems[c].id + '"]');
      var rows = box.querySelectorAll(".contact-row");
      var complete = 0;
      for (var r = 0; r < rows.length; r++) {
        var nm = rows[r].querySelector(".ct-name"), ph = rows[r].querySelector(".ct-phone");
        if (nm.value.trim() && ph.value.trim()) { complete++; continue; }
        if (nm.value.trim() || ph.value.trim()) {
          var empty = nm.value.trim() ? ph : nm;
          empty.classList.add("invalid");
          showError("Please enter both a contact name and number.", empty);
          return false;
        }
      }
      if (!complete) {
        rows[0].querySelector(".ct-name").classList.add("invalid");
        showError("Please add at least one contact for: " + contactItems[c].name, rows[0].querySelector(".ct-name"));
        return false;
      }
    }

    var noPassValue = allItems().filter(function (it) {
      return it.passInput && !it.passContacts && valueOf(it.id) === "Pass" && !form.elements[it.id + "_pass"].value.trim();
    })[0];
    if (noPassValue) {
      var passInput = form.elements[noPassValue.id + "_pass"];
      passInput.classList.add("invalid");
      showError("Please fill in: " + noPassValue.passInput, passInput);
      return false;
    }

    if (!valueOf("result")) {
      showError("Please choose the inspection result: Approved, Conditional Approval, or Rejected.", $("resultField"));
      return false;
    }
    if (!$("inspector").value.trim()) {
      $("inspector").classList.add("invalid");
      showError("Please enter the name of the inspector.", $("inspector"));
      return false;
    }
    var badEmail = Array.prototype.filter.call(extraInputs(), function (el) {
      return el.value.trim() && !EMAIL_RE.test(el.value.trim());
    })[0];
    if (badEmail) {
      badEmail.classList.add("invalid");
      showError("Please check this email address: " + badEmail.value.trim(), badEmail);
      return false;
    }
    if (!$("certify").checked) {
      showError("Please tick the box confirming the inspection.", $("certify"));
      return false;
    }
    return true;
  }

  // ---------- report ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function buildReport() {
    var now = new Date();
    var when = now.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    var isoDate = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    var items = allItems();
    var fails = items.filter(function (it) { return valueOf(it.id) === "Fail"; });
    var result = valueOf("result");
    var unit = $("unit").value.trim();
    var inspector = $("inspector").value.trim();
    var company = $("company").value.trim();
    var operators = getOperators().filter(function (o) { return o.name; });
    var operatorNames = operators.map(function (o) { return o.name; }).join(", ");
    var appName = CFG.companyName || "Fleet";
    var kind = result === "Rejected" ? "oos" : result === "Conditional Approval" ? "issues" : "ok";
    var flag = result.toUpperCase() +
      (fails.length ? " - " + fails.length + " FAILED ITEM" + (fails.length > 1 ? "S" : "") : "");

    var details = [
      ["Company", company],
      ["Vehicle type", vehicleTypeText()],
      [unitLabel(), unit],
      ["Vehicle operator" + (operators.length > 1 ? "s" : ""), operatorNames],
      ["Odometer", $("odometer").value.trim()],
      ["Site / route assigned", $("site").value.trim()],
      ["Inspector", inspector],
      ["Date", when],
      ["Inspection result", result === "Conditional Approval" ? result + " (approved pending repairs)" : result],
    ];
    // Values asked for on Pass (e.g. the GPS ID number) also go up top.
    items.forEach(function (it) {
      if (it.passInDetails && valueOf(it.id) === "Pass") details.push([it.passInput, form.elements[it.id + "_pass"].value.trim()]);
    });

    var sections = [];
    (CFG.checklist || []).forEach(function (sec, i) {
      if (!sectionActive(sec)) return;
      sections.push({
        name: secNumber(sec, i) + ". " + sec.section,
        items: sec.items.map(function (x, j) {
          var def = itemDef(x);
          if (!sectionActive(def)) return null;
          var id = itemId(sec, i, j);
          var result = valueOf(id);
          var passValue = !def.passInput || result !== "Pass" ? ""
            : def.passContacts ? contactsText(id)
            : form.elements[id + "_pass"].value.trim();
          return {
            name: def.name,
            result: result,
            note: result === "Fail" ? form.elements[id + "_note"].value.trim() : "",
            detail: !passValue ? "" : def.passContacts ? def.passInput + ":\n" + passValue : def.passInput + ": " + passValue,
            photos: photos[id] || [],
          };
        }).filter(Boolean),
      });
    });

    // Plain-text summary for the email body.
    var L = [];
    L.push(appName + " - Vehicle Inspection");
    L.push("");
    L.push("STATUS: " + flag);
    details.forEach(function (d) { if (d[1]) L.push(d[0] + ": " + d[1]); });
    if (fails.length) {
      L.push("");
      L.push("FAILED ITEMS");
      fails.forEach(function (it) {
        L.push("  x " + it.name + " - " + form.elements[it.id + "_note"].value.trim());
      });
    }
    if ($("notes").value.trim()) {
      L.push("");
      L.push("NOTES");
      L.push("  " + $("notes").value.trim());
    }
    // Only photos that end up in the report (not ones on hidden sections).
    var photoCount = ["vehicle", "notes"].concat(operators.map(function (o) { return o.id; }))
      .reduce(function (n, k) { return n + (photos[k] || []).length; }, 0) +
      sections.reduce(function (n, sec) {
        return n + sec.items.reduce(function (m, it) { return m + it.photos.length; }, 0);
      }, 0);
    var licenseCount = operators.reduce(function (n, o) { return n + (photos[o.id] || []).length; }, 0);
    if (operators.length) L.push("License photos: " + licenseCount + " (in PDF)");
    var safeUnit = unit.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "vehicle";

    return {
      subject: "[" + flag + "] Unit " + unit + (company ? " (" + company + ")" : "") + " inspection - " + inspector + " - " + now.toLocaleDateString(),
      summary: L.join("\n"),
      photoCount: photoCount,
      outOfService: kind !== "ok" || fails.length > 0,
      extraTo: extraEmails(),
      filename: "Inspection_Unit-" + safeUnit + "_" + isoDate + ".pdf",
      pdfData: {
        company: appName,
        status: { kind: kind, label: flag },
        details: details,
        result: result,
        sections: sections,
        notes: $("notes").value.trim(),
        notesPhotos: photos.notes || [],
        vehiclePhotos: photos.vehicle || [],
        policy: CFG.policy || [],
        inspector: inspector,
        operators: operators.map(function (o) { return { name: o.name, photos: photos[o.id] || [] }; }),
        dateStr: when,
        footer: appName + "  |  Unit " + unit + "  |  " + when,
        filename: "Inspection_Unit-" + safeUnit + "_" + isoDate + ".pdf",
      },
    };
  }

  // Full text version, used only when the PDF can't be attached.
  function fullText(r) {
    var L = [r.summary, "", "FULL CHECKLIST"];
    r.pdfData.sections.forEach(function (s) {
      L.push("");
      L.push("[" + s.name + "]");
      s.items.forEach(function (it) {
        L.push("  " + (it.result === "Pass" ? "PASS" : it.result === "Fail" ? "FAIL" : "N/A ") + "  " + it.name +
          (it.detail ? " (" + it.detail + ")" : ""));
      });
    });
    L.push("");
    L.push("Certified accurate by " + r.pdfData.inspector + ".");
    return L.join("\n");
  }

  // ---------- sending ----------
  function mailtoUrl(r, body) {
    var to = [CFG.reportEmail || ""].concat(r.extraTo || []).filter(Boolean).join(",");
    return "mailto:" + encodeURIComponent(to.replace(/\s+/g, "")).replace(/%2C/g, ",").replace(/%40/g, "@") +
      "?subject=" + encodeURIComponent(r.subject) +
      "&body=" + encodeURIComponent(body);
  }

  function pdfFile() {
    try {
      return new File([last.pdf.blob], last.pdf.filename, { type: "application/pdf" });
    } catch (e) { return null; }
  }

  function canSharePdf() {
    var f = pdfFile();
    return !!(f && navigator.canShare && navigator.canShare({ files: [f] }));
  }

  function sendAuto(r, pdf, meta) {
    // text/plain avoids a CORS preflight, which Apps Script can't answer.
    return fetch(CFG.emailServiceUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        to: CFG.reportEmail,
        extraTo: r.extraTo,
        subject: r.subject,
        body: r.summary + "\n\nThe full inspection report is attached as a PDF.",
        filename: pdf.filename,
        pdfBase64: pdf.base64,
        meta: meta || {},
      }),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok || !j.ok) throw new Error(j.error || "Send failed");
        return j;
      });
    });
  }

  function showDone(mode, result) {
    var r = last.report;
    newTabView = "doneView";
    $("formView").hidden = true;
    $("doneView").hidden = false;
    document.querySelector(".done").classList.toggle("warn", r.outOfService);

    var sharable = canSharePdf();
    var to = [CFG.reportEmail || ""].concat(r.extraTo).filter(Boolean).join(",");
    if (mode === "auto") {
      var extras = r.extraTo.join(", ");
      // An older email sender ignores extra addresses and doesn't report extraSent.
      var extrasMissed = r.extraTo.length && !(result && result.extraSent);
      $("doneIcon").textContent = "✓";
      $("doneTitle").textContent = "Report sent";
      $("doneMsg").textContent = "The PDF report for unit " + $("unit").value.trim() + " has been emailed to the office" +
        (!r.extraTo.length ? "." : extrasMissed
          ? ". It could NOT be sent to " + extras + " because the email sender needs an update. Use Save PDF to phone to send it yourself."
          : " and to " + extras + ".");
      $("recipientBox").hidden = true;
      $("sharePdfBtn").hidden = true;
      $("mailtoBtn").hidden = true;
    } else {
      $("doneIcon").textContent = "✉";
      $("doneTitle").textContent = mode === "failed" ? "Couldn't send automatically" : "Send your report";
      $("doneMsg").textContent = (mode === "failed" ? "No connection or the email service didn't respond. " : "") +
        (sharable
          ? "Tap Email PDF report, pick your email app, and send it to:"
          : "Save the PDF, then email it as an attachment to:");
      $("recipientText").textContent = to.split(",").map(function (a) { return a.trim(); }).join("\n");
      $("recipientBox").hidden = !to;
      $("sharePdfBtn").hidden = !sharable;
      $("mailtoBtn").hidden = false;
    }
    $("downloadBtn").className = "btn " + (mode !== "auto" && !sharable ? "primary" : "ghost");
    window.scrollTo(0, 0);
  }

  // Anything unexpected while submitting is shown instead of failing silently.
  function reportProblem(err) {
    var btn = $("submitBtn");
    btn.disabled = false;
    btn.textContent = "Submit report";
    if (!$("formView").hidden) {
      showError("Something went wrong: " + (err && err.message || err) +
        ". Please take a screenshot of this and send it to the office (app " + (window.APP_VERSION || "?") + ").");
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    try {
      submitReport();
    } catch (err) {
      reportProblem(err);
    }
  }

  function submitReport() {
    if (!validate()) return;
    saveDraft();
    var btn = $("submitBtn");
    btn.disabled = true;
    btn.textContent = "Creating report…";

    // Let the button repaint before the PDF work blocks the page.
    setTimeout(function () {
      try {
        createAndSend();
      } catch (err) {
        reportProblem(err);
      }
    }, 50);
  }

  function createAndSend() {
    var btn = $("submitBtn");
    var r = buildReport();
    var pdf;
    try {
      pdf = window.buildPdfReport(r.pdfData);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Submit report";
      showError("Couldn't create the PDF (" + err.message + "). Try removing some photos.");
      return;
    }
    last = { report: r, pdf: pdf };

    var rec = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      unit: $("unit").value.trim(),
      company: $("company").value.trim(),
      vehicleType: vehicleTypeText(),
      inspector: $("inspector").value.trim(),
      result: valueOf("result"),
      kind: r.pdfData.status.kind,
      subject: r.subject,
      summary: r.summary,
      extraTo: r.extraTo,
      filename: pdf.filename,
      blob: pdf.blob,
      status: "sending",
    };
    keepStorage();

    if (CFG.emailServiceUrl && navigator.onLine !== false) {
      btn.textContent = "Sending…";
      putReport(rec);
      sendAuto(r, pdf, reportMeta(rec)).then(function (result) {
        rec.status = "sent";
        putReport(rec);
        showDone("auto", result);
        clearForm(true);
      }).catch(function () {
        rec.status = "failed";
        putReport(rec);
        showDone("failed");
      }).then(function () {
        btn.disabled = false;
        btn.textContent = "Submit report";
      });
    } else {
      rec.status = CFG.emailServiceUrl ? "failed" : "manual";
      putReport(rec);
      showDone(CFG.emailServiceUrl ? "failed" : "manual");
      btn.disabled = false;
      btn.textContent = "Submit report";
    }
  }

  function clearForm(keepView) {
    var inspector = $("inspector").value;
    form.reset();
    $("inspector").value = inspector || load(INSPECTOR_KEY) || "";
    form.querySelectorAll(".missing, .invalid").forEach(function (el) {
      el.classList.remove("missing");
      el.classList.remove("invalid");
    });
    $("formError").hidden = true;
    store(DRAFT_KEY, null);
    photos = {};
    savePhotos();
    resetOperators();
    resetContacts();
    extraInputs().forEach(function (el, i) { el.hidden = i > 0; });
    updateAddEmailBtn();
    renderAllPhotos();
    refresh();
    if (!keepView) window.scrollTo(0, 0);
  }

  // ---------- wire up ----------
  build();
  restoreDraft();
  refresh();
  loadPhotos().then(function (p) {
    if (p && typeof p === "object") photos = p;
    renderAllPhotos();
  });

  form.addEventListener("change", function (e) {
    if (e.target.type === "file") return;
    if (e.target.name === "vehicleCategory") populateTypes();
    refresh();
    saveDraft();
  });
  form.addEventListener("input", function (e) {
    e.target.classList.remove("invalid");
    saveDraft();
  });
  form.addEventListener("submit", onSubmit);

  form.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add-photo]");
    if (!b) return;
    photoTarget = b.dataset.addPhoto;
    $("photoInput").value = "";
    $("photoInput").click();
  });
  $("photoInput").addEventListener("change", function () {
    if (photoTarget && this.files.length) addPhotos(photoTarget, this.files);
  });

  showExtraRows();
  $("addEmailBtn").addEventListener("click", function () {
    var next = Array.prototype.filter.call(extraInputs(), function (el) { return el.hidden; })[0];
    if (next) { next.hidden = false; next.focus(); }
    updateAddEmailBtn();
  });

  form.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add-contact]");
    if (!b) return;
    var row = addContact(form.querySelector('[data-contacts="' + b.dataset.addContact + '"]'));
    row.querySelector(".ct-name").focus();
    saveDraft();
  });

  $("addOperatorBtn").addEventListener("click", function () {
    var row = addOperator();
    row.querySelector("input").focus();
    saveDraft();
  });

  $("resetBtn").addEventListener("click", function () {
    if (confirm("Clear this checklist and all photos, and start over?")) clearForm();
  });

  $("newBtn").addEventListener("click", function () {
    newTabView = "formView";
    clearForm();
    $("doneView").hidden = true;
    $("formView").hidden = false;
    window.scrollTo(0, 0);
  });

  $("sharePdfBtn").addEventListener("click", function () {
    var f = pdfFile();
    if (!f) return;
    navigator.share({
      files: [f],
      title: last.report.subject,
      text: last.report.subject,
    }).catch(function () {});
  });

  $("downloadBtn").addEventListener("click", function () {
    var url = URL.createObjectURL(last.pdf.blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = last.pdf.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  });

  $("mailtoBtn").addEventListener("click", function () {
    location.href = mailtoUrl(last.report, fullText(last.report) +
      (last.report.photoCount ? "\n\n(" + last.report.photoCount + " photo(s) are in the PDF report.)" : ""));
  });

  $("copyBtn").addEventListener("click", function () {
    var t = CFG.reportEmail || "";
    var done = function () {
      $("copyBtn").textContent = "Copied";
      setTimeout(function () { $("copyBtn").textContent = "Copy"; }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
  });

  $("tabNew").addEventListener("click", function () { showTab("new"); });
  $("tabReports").addEventListener("click", function () { showTab("reports"); });
  $("reportSearch").addEventListener("input", function () { renderReports(); renderShared(); });
  $("unlockForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = $("passcodeInput").value.trim();
    if (!pass) return;
    store(PASS_KEY, pass);
    $("passcodeInput").value = "";
    loadShared();
  });
  $("sharedRefresh").addEventListener("click", loadShared);
  $("sharedLock").addEventListener("click", function () {
    store(PASS_KEY, null);
    sharedReports = [];
    sharedPdfs = {};
    setSharedState("locked");
  });
  loadReports();

  $("appVersion").textContent = "App version " + (window.APP_VERSION || "");

  // Surface unexpected errors (e.g. in a promise) rather than failing silently.
  window.addEventListener("unhandledrejection", function (e) { reportProblem(e.reason); });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
