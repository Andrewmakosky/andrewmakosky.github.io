(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var DRAFT_KEY = "checklist-draft-v1";
  var DRIVER_KEY = "checklist-driver";

  var $ = function (id) { return document.getElementById(id); };
  var form = $("checkForm");
  var lastReport = null;

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

  // ---------- build the form ----------
  function slug(s, i, j) { return "c" + i + "_" + j; }

  function build() {
    if (CFG.companyName) {
      $("brandName").textContent = CFG.companyName;
    }

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
      h.textContent = sec.section;
      card.appendChild(h);

      sec.items.forEach(function (name, j) {
        var id = slug(name, i, j);
        var item = document.createElement("div");
        item.className = "item";
        item.dataset.id = id;
        item.innerHTML =
          '<div class="item-name"></div>' +
          '<div class="seg" role="radiogroup">' +
            '<label><input type="radio" name="' + id + '" value="OK"><span>OK</span></label>' +
            '<label><input type="radio" name="' + id + '" value="Fail"><span>Problem</span></label>' +
            '<label><input type="radio" name="' + id + '" value="N/A"><span>N/A</span></label>' +
          '</div>' +
          '<div class="item-note" hidden>' +
            '<input name="' + id + '_note" placeholder="What\'s wrong?" aria-label="Problem details">' +
          '</div>';
        item.querySelector(".item-name").textContent = name;
        item.querySelector(".seg").setAttribute("aria-label", name);
        card.appendChild(item);
      });
      root.appendChild(card);
    });
  }

  function allItems() {
    var out = [];
    (CFG.checklist || []).forEach(function (sec, i) {
      sec.items.forEach(function (name, j) {
        out.push({ section: sec.section, name: name, id: slug(name, i, j) });
      });
    });
    return out;
  }

  function valueOf(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
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
      if (!el.name && !el.id) return;
      var key = el.name || el.id;
      if (el.type === "radio") { if (el.checked) data[key] = el.value; }
      else if (el.type === "checkbox") data[key] = el.checked;
      else data[key] = el.value;
    });
    store(DRAFT_KEY, data);
    if ($("driver").value.trim()) store(DRIVER_KEY, $("driver").value.trim());
  }

  function restoreDraft() {
    var data = load(DRAFT_KEY);
    if (data) {
      Array.prototype.forEach.call(form.elements, function (el) {
        var key = el.name || el.id;
        if (!key || !(key in data)) return;
        if (el.type === "radio") el.checked = data[key] === el.value;
        else if (el.type === "checkbox") el.checked = !!data[key];
        else el.value = data[key];
      });
    }
    if (!$("driver").value) $("driver").value = load(DRIVER_KEY) || "";
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

    var req = [$("driver"), $("unit"), $("vehicleType")];
    for (var k = 0; k < req.length; k++) {
      if (!req[k].value.trim()) {
        req[k].classList.add("invalid");
        showError("Please fill in name, unit # and vehicle type.", req[k]);
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
      showError("Please describe the problem with: " + noNote.name, input);
      return false;
    }

    if (!valueOf("safe")) {
      showError("Please answer whether the vehicle is safe to operate.", form.querySelector('input[name="safe"]').closest(".field"));
      return false;
    }
    if (!$("certify").checked) {
      showError("Please tick the box confirming the inspection.", $("certify"));
      return false;
    }
    return true;
  }

  // ---------- report ----------
  function buildReport() {
    var now = new Date();
    var when = now.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    var items = allItems();
    var fails = items.filter(function (it) { return valueOf(it.id) === "Fail"; });
    var safe = valueOf("safe");
    var unit = $("unit").value.trim();
    var flag = safe === "No" ? "OUT OF SERVICE" : (fails.length ? fails.length + " ISSUE" + (fails.length > 1 ? "S" : "") : "ALL OK");

    var L = [];
    L.push((CFG.companyName || "Fleet") + " — Vehicle Inspection");
    L.push("");
    L.push("STATUS: " + flag);
    L.push("Safe to operate: " + safe);
    L.push("");
    L.push("Unit:      " + unit);
    L.push("Type:      " + $("vehicleType").value);
    L.push("Driver:    " + $("driver").value.trim());
    L.push("Date:      " + when);
    if ($("odometer").value.trim()) L.push("Odo/Hours: " + $("odometer").value.trim());
    if ($("fuel").value) L.push("Fuel:      " + $("fuel").value);
    if ($("site").value.trim()) L.push("Site:      " + $("site").value.trim());
    L.push("");

    if (fails.length) {
      L.push("PROBLEMS FOUND");
      fails.forEach(function (it) {
        L.push("  ✗ " + it.name + " — " + form.elements[it.id + "_note"].value.trim());
      });
      L.push("");
    }
    if ($("notes").value.trim()) {
      L.push("NOTES");
      L.push("  " + $("notes").value.trim());
      L.push("");
    }

    L.push("FULL CHECKLIST");
    var current = null;
    items.forEach(function (it) {
      if (it.section !== current) {
        current = it.section;
        L.push("");
        L.push("[" + current + "]");
      }
      var v = valueOf(it.id);
      var mark = v === "OK" ? "✓ OK " : v === "Fail" ? "✗ FAIL" : "– N/A";
      L.push("  " + mark + "  " + it.name);
    });
    L.push("");
    L.push("Certified accurate by " + $("driver").value.trim() + ".");

    return {
      subject: "[" + flag + "] Unit " + unit + " inspection — " + $("driver").value.trim() + " — " + now.toLocaleDateString(),
      body: L.join("\n"),
      outOfService: safe === "No" || fails.length > 0,
    };
  }

  // ---------- sending ----------
  function mailtoUrl(r) {
    return "mailto:" + encodeURIComponent(CFG.reportEmail || "").replace(/%2C/g, ",") +
      "?subject=" + encodeURIComponent(r.subject) +
      "&body=" + encodeURIComponent(r.body);
  }

  function sendAuto(r) {
    return fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: CFG.web3formsAccessKey,
        subject: r.subject,
        from_name: (CFG.companyName || "Fleet") + " Checklist",
        message: r.body,
      }),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok || !j.success) throw new Error(j.message || "Send failed");
      });
    });
  }

  function showDone(mode, r) {
    $("formView").hidden = true;
    $("doneView").hidden = false;
    var card = document.querySelector(".done");
    card.classList.toggle("warn", r.outOfService);
    $("shareBtn").hidden = !navigator.share;
    if (mode === "auto") {
      $("doneTitle").textContent = "Report sent";
      $("doneMsg").textContent = "The report for unit " + $("unit").value.trim() + " has been emailed to the office.";
      $("resendBtn").hidden = true;
    } else {
      $("doneTitle").textContent = "Almost done — press Send";
      $("doneMsg").textContent = "Your email app has opened with the report filled in. Press Send there to deliver it. If it didn't open, tap the button below.";
      $("resendBtn").hidden = false;
    }
    window.scrollTo(0, 0);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    saveDraft();
    var r = buildReport();
    lastReport = r;
    var btn = $("submitBtn");

    if (CFG.web3formsAccessKey && navigator.onLine !== false) {
      btn.disabled = true;
      btn.textContent = "Sending…";
      sendAuto(r).then(function () {
        showDone("auto", r);
        clearForm(true);
      }).catch(function () {
        // Fall back to the email app so the report is never lost.
        location.href = mailtoUrl(r);
        showDone("mail", r);
      }).then(function () {
        btn.disabled = false;
        btn.textContent = "Submit report";
      });
    } else {
      location.href = mailtoUrl(r);
      showDone("mail", r);
    }
  }

  function clearForm(keepDone) {
    var driver = $("driver").value;
    form.reset();
    $("driver").value = driver || load(DRIVER_KEY) || "";
    form.querySelectorAll(".missing, .invalid").forEach(function (el) {
      el.classList.remove("missing");
      el.classList.remove("invalid");
    });
    $("formError").hidden = true;
    store(DRAFT_KEY, null);
    refresh();
    if (!keepDone) window.scrollTo(0, 0);
  }

  // ---------- wire up ----------
  build();
  restoreDraft();
  refresh();

  form.addEventListener("change", function () { refresh(); saveDraft(); });
  form.addEventListener("input", saveDraft);
  form.addEventListener("submit", onSubmit);

  $("allOkBtn").addEventListener("click", function () {
    allItems().forEach(function (it) {
      if (!valueOf(it.id)) form.querySelector('input[name="' + it.id + '"][value="OK"]').checked = true;
    });
    refresh();
    saveDraft();
  });

  $("resetBtn").addEventListener("click", function () {
    if (confirm("Clear this checklist and start over?")) clearForm();
  });

  $("newBtn").addEventListener("click", function () {
    clearForm();
    $("doneView").hidden = true;
    $("formView").hidden = false;
    window.scrollTo(0, 0);
  });

  $("resendBtn").addEventListener("click", function () {
    if (lastReport) location.href = mailtoUrl(lastReport);
  });

  $("shareBtn").addEventListener("click", function () {
    if (lastReport && navigator.share) {
      navigator.share({ title: lastReport.subject, text: lastReport.body }).catch(function () {});
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
