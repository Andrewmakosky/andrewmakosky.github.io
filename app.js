(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var DRAFT_KEY = "checklist-draft-v2";
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
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var open;
      try { open = indexedDB.open("checklist", 1); } catch (e) { return reject(e); }
      open.onupgradeneeded = function () { open.result.createObjectStore("kv"); };
      open.onerror = function () { reject(open.error); };
      open.onsuccess = function () {
        var tx = open.result.transaction("kv", mode);
        var req = fn(tx.objectStore("kv"));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = function () { reject(tx.error); };
      };
    });
  }
  function savePhotos() {
    return idb("readwrite", function (s) { return s.put(photos, "photos"); }).catch(function () {});
  }
  function loadPhotos() {
    return idb("readonly", function (s) { return s.get("photos"); }).catch(function () { return null; });
  }

  // ---------- build the form ----------
  function itemId(i, j) { return "c" + i + "_" + j; }

  function build() {
    if (CFG.companyName) $("brandName").textContent = CFG.companyName;

    var sel = $("vehicleType");
    sel.innerHTML = '<option value="">Select…</option>';
    (CFG.vehicleTypes || []).forEach(function (t) {
      var o = document.createElement("option");
      o.textContent = t;
      sel.appendChild(o);
    });

    var root = $("checklist");
    (CFG.checklist || []).forEach(function (sec, i) {
      var card = document.createElement("section");
      card.className = "card";
      var h = document.createElement("h2");
      h.textContent = (i + 1) + ". " + sec.section;
      card.appendChild(h);

      sec.items.forEach(function (name, j) {
        var id = itemId(i, j);
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
          '<div class="photos" data-photos="' + id + '"></div>';
        item.querySelector(".item-name").textContent = name;
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
      sec.items.forEach(function (name, j) {
        out.push({ section: sec.section, name: name, id: itemId(i, j) });
      });
    });
    return out;
  }

  function valueOf(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
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
  function refresh() {
    var items = allItems();
    var done = 0;
    items.forEach(function (it) {
      var v = valueOf(it.id);
      if (v) done++;
      var row = form.querySelector('.item[data-id="' + it.id + '"]');
      row.querySelector(".item-note").hidden = v !== "Fail";
      if (v) row.classList.remove("missing");
    });
    $("progressText").textContent = done + " / " + items.length;
  }

  // ---------- drafts ----------
  function saveDraft() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      var key = el.name || el.id;
      if (!key || el.type === "file" || key.indexOf("op_") === 0) return;
      if (el.type === "radio") { if (el.checked) data[key] = el.value; }
      else if (el.type === "checkbox") data[key] = el.checked;
      else data[key] = el.value;
    });
    data.operators = getOperators();
    store(DRAFT_KEY, data);
    if ($("inspector").value.trim()) store(INSPECTOR_KEY, $("inspector").value.trim());
  }

  function restoreDraft() {
    var data = load(DRAFT_KEY);
    resetOperators(data && data.operators);
    if (data) {
      Array.prototype.forEach.call(form.elements, function (el) {
        var key = el.name || el.id;
        if (!key || !(key in data)) return;
        if (el.type === "radio") el.checked = data[key] === el.value;
        else if (el.type === "checkbox") el.checked = !!data[key];
        else el.value = data[key];
      });
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

    var opInputs = $("operators").querySelectorAll("input");
    var named = Array.prototype.filter.call(opInputs, function (i) { return i.value.trim(); });
    if (!named.length) {
      opInputs[0].classList.add("invalid");
      showError("Please enter at least one operator for this vehicle.", opInputs[0]);
      return false;
    }

    var req = [$("unit"), $("vehicleType")];
    for (var k = 0; k < req.length; k++) {
      if (!req[k].value.trim()) {
        req[k].classList.add("invalid");
        showError("Please fill in unit # and vehicle type.", req[k]);
        return false;
      }
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

    if (!valueOf("safe")) {
      showError("Please answer whether the vehicle is safe to operate.", form.querySelector('input[name="safe"]').closest(".field"));
      return false;
    }
    if (!$("inspector").value.trim()) {
      $("inspector").classList.add("invalid");
      showError("Please enter the name of the inspector.", $("inspector"));
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
    var safe = valueOf("safe");
    var unit = $("unit").value.trim();
    var inspector = $("inspector").value.trim();
    var operators = getOperators().filter(function (o) { return o.name; });
    var operatorNames = operators.map(function (o) { return o.name; }).join(", ");
    var company = CFG.companyName || "Fleet";
    var kind = safe === "No" ? "oos" : fails.length ? "issues" : "ok";
    var flag = kind === "oos" ? "OUT OF SERVICE" : kind === "issues" ? fails.length + " FAILED ITEM" + (fails.length > 1 ? "S" : "") : "ALL PASS";

    var details = [
      ["Unit / vehicle #", unit],
      ["Type", $("vehicleType").value],
      ["Operator" + (operators.length > 1 ? "s" : ""), operatorNames],
      ["Inspector", inspector],
      ["Date", when],
      ["Odometer / hours", $("odometer").value.trim()],
      ["Fuel level", $("fuel").value],
      ["Site / route", $("site").value.trim()],
      ["Safe to operate", safe],
    ];

    var sections = (CFG.checklist || []).map(function (sec, i) {
      return {
        name: (i + 1) + ". " + sec.section,
        items: sec.items.map(function (name, j) {
          var id = itemId(i, j);
          var result = valueOf(id);
          return {
            name: name,
            result: result,
            note: result === "Fail" ? form.elements[id + "_note"].value.trim() : "",
            photos: photos[id] || [],
          };
        }),
      };
    });

    // Plain-text summary for the email body.
    var L = [];
    L.push(company + " - Vehicle Inspection");
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
    var photoCount = Object.keys(photos).reduce(function (n, k) { return n + photos[k].length; }, 0);
    var licenseCount = operators.reduce(function (n, o) { return n + (photos[o.id] || []).length; }, 0);
    if (operators.length) L.push("License photos: " + licenseCount + " (in PDF)");
    var safeUnit = unit.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "vehicle";

    return {
      subject: "[" + flag + "] Unit " + unit + " inspection - " + inspector + " - " + now.toLocaleDateString(),
      summary: L.join("\n"),
      photoCount: photoCount,
      outOfService: kind !== "ok",
      filename: "Inspection_Unit-" + safeUnit + "_" + isoDate + ".pdf",
      pdfData: {
        company: company,
        status: { kind: kind, label: flag },
        details: details,
        safe: safe,
        sections: sections,
        notes: $("notes").value.trim(),
        notesPhotos: photos.notes || [],
        policy: CFG.policy || [],
        inspector: inspector,
        operators: operators.map(function (o) { return { name: o.name, photos: photos[o.id] || [] }; }),
        dateStr: when,
        footer: company + "  |  Unit " + unit + "  |  " + when,
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
        L.push("  " + (it.result === "Pass" ? "PASS" : it.result === "Fail" ? "FAIL" : "N/A ") + "  " + it.name);
      });
    });
    L.push("");
    L.push("Certified accurate by " + r.pdfData.inspector + ".");
    return L.join("\n");
  }

  // ---------- sending ----------
  function mailtoUrl(r, body) {
    return "mailto:" + encodeURIComponent(CFG.reportEmail || "").replace(/%2C/g, ",") +
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

  function sendAuto(r, pdf) {
    // text/plain avoids a CORS preflight, which Apps Script can't answer.
    return fetch(CFG.emailServiceUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        to: CFG.reportEmail,
        subject: r.subject,
        body: r.summary + "\n\nThe full inspection report is attached as a PDF.",
        filename: pdf.filename,
        pdfBase64: pdf.base64,
      }),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok || !j.ok) throw new Error(j.error || "Send failed");
      });
    });
  }

  function showDone(mode) {
    var r = last.report;
    $("formView").hidden = true;
    $("doneView").hidden = false;
    document.querySelector(".done").classList.toggle("warn", r.outOfService);

    var sharable = canSharePdf();
    var to = CFG.reportEmail || "";
    if (mode === "auto") {
      $("doneIcon").textContent = "✓";
      $("doneTitle").textContent = "Report sent";
      $("doneMsg").textContent = "The PDF report for unit " + $("unit").value.trim() + " has been emailed to the office.";
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
      $("recipientText").textContent = to;
      $("recipientBox").hidden = !to;
      $("sharePdfBtn").hidden = !sharable;
      $("mailtoBtn").hidden = false;
    }
    $("downloadBtn").className = "btn " + (mode !== "auto" && !sharable ? "primary" : "ghost");
    window.scrollTo(0, 0);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    saveDraft();
    var btn = $("submitBtn");
    btn.disabled = true;
    btn.textContent = "Creating report…";

    // Let the button repaint before the PDF work blocks the page.
    setTimeout(function () {
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

      if (CFG.emailServiceUrl && navigator.onLine !== false) {
        btn.textContent = "Sending…";
        sendAuto(r, pdf).then(function () {
          showDone("auto");
          clearForm(true);
        }).catch(function () {
          showDone("failed");
        }).then(function () {
          btn.disabled = false;
          btn.textContent = "Submit report";
        });
      } else {
        showDone(CFG.emailServiceUrl ? "failed" : "manual");
        btn.disabled = false;
        btn.textContent = "Submit report";
      }
    }, 50);
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
    refresh();
    saveDraft();
  });
  form.addEventListener("input", saveDraft);
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

  $("addOperatorBtn").addEventListener("click", function () {
    var row = addOperator();
    row.querySelector("input").focus();
    saveDraft();
  });

  $("allOkBtn").addEventListener("click", function () {
    allItems().forEach(function (it) {
      if (!valueOf(it.id)) form.querySelector('input[name="' + it.id + '"][value="Pass"]').checked = true;
    });
    refresh();
    saveDraft();
  });

  $("resetBtn").addEventListener("click", function () {
    if (confirm("Clear this checklist and all photos, and start over?")) clearForm();
  });

  $("newBtn").addEventListener("click", function () {
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

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
