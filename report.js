// Builds the PDF inspection report with jsPDF.
// window.buildPdfReport(data) -> { blob, base64, filename }
(function () {
  "use strict";

  var BRAND = [11, 61, 99];
  var INK = [20, 28, 36];
  var MUTED = [96, 110, 124];
  var LINE = [214, 221, 229];
  var COLORS = {
    Pass: { fg: [24, 110, 52], bg: [227, 244, 232] },
    Fail: { fg: [180, 35, 24], bg: [253, 232, 230] },
    "N/A": { fg: [90, 107, 123], bg: [233, 238, 243] },
  };
  var STATUS = {
    ok: { fg: [255, 255, 255], bg: [31, 122, 58] },
    issues: { fg: [255, 255, 255], bg: [196, 98, 16] },
    oos: { fg: [255, 255, 255], bg: [180, 35, 24] },
  };

  // The built-in PDF fonts only cover basic Latin characters.
  function clean(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
  }

  window.buildPdfReport = function (d) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "pt", format: "letter" });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 40;
    var CW = W - M * 2;
    var BOTTOM = H - 46;
    var y = 0;

    function color(c, kind) {
      if (kind === "fill") doc.setFillColor(c[0], c[1], c[2]);
      else if (kind === "draw") doc.setDrawColor(c[0], c[1], c[2]);
      else doc.setTextColor(c[0], c[1], c[2]);
    }
    function font(style, size) {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    }
    function ensure(h) {
      if (y + h > BOTTOM) {
        doc.addPage();
        y = M;
      }
    }
    function lines(text, width) {
      return doc.splitTextToSize(clean(text), width);
    }
    function lineH(size) { return size * 1.25; }

    // ---- header band ----
    color(BRAND, "fill");
    doc.rect(0, 0, W, 78, "F");
    color([255, 255, 255]);
    font("bold", 18);
    doc.text(clean(d.company), M, 34);
    font("normal", 11);
    doc.text("Vehicle Inspection Report", M, 54);

    var st = STATUS[d.status.kind];
    font("bold", 12);
    var label = clean(d.status.label);
    var bw = doc.getTextWidth(label) + 24;
    color(st.bg, "fill");
    doc.roundedRect(W - M - bw, 25, bw, 26, 5, 5, "F");
    color(st.fg);
    doc.text(label, W - M - bw / 2, 42, { align: "center" });
    y = 100;

    // ---- details grid ----
    var colW = CW / 2;
    for (var i = 0; i < d.details.length; i += 2) {
      ensure(34);
      for (var k = 0; k < 2 && i + k < d.details.length; k++) {
        var x = M + k * colW;
        font("normal", 9);
        color(MUTED);
        doc.text(clean(d.details[i + k][0]).toUpperCase(), x, y);
        font("bold", 12);
        color(INK);
        doc.text(lines(d.details[i + k][1] || "-", colW - 12)[0], x, y + 15);
      }
      y += 34;
    }

    // ---- problems summary ----
    var fails = [];
    d.sections.forEach(function (s) {
      s.items.forEach(function (it) { if (it.result === "Fail") fails.push(it); });
    });
    if (fails.length || d.safe === "No") {
      var body = [];
      if (d.safe === "No") body.push({ text: "Driver marked this vehicle NOT SAFE to operate.", bold: true });
      fails.forEach(function (it) {
        body.push({ text: "- " + it.name + (it.note ? ": " + it.note : ""), bold: false });
      });
      font("normal", 11);
      var wrapped = body.map(function (b) { return { lines: lines(b.text, CW - 24), bold: b.bold }; });
      var boxH = 30 + wrapped.reduce(function (n, b) { return n + b.lines.length * lineH(11); }, 0);
      ensure(boxH + 10);
      color(COLORS.Fail.bg, "fill");
      color(COLORS.Fail.fg, "draw");
      doc.setLineWidth(1);
      doc.roundedRect(M, y, CW, boxH, 6, 6, "FD");
      font("bold", 11);
      color(COLORS.Fail.fg);
      doc.text("PROBLEMS FOUND", M + 12, y + 18);
      var yy = y + 34;
      wrapped.forEach(function (b) {
        font(b.bold ? "bold" : "normal", 11);
        color(INK);
        doc.text(b.lines, M + 12, yy);
        yy += b.lines.length * lineH(11);
      });
      y += boxH + 18;
    } else {
      y += 4;
    }

    // ---- photos helper ----
    function drawPhotos(photos, indent) {
      if (!photos || !photos.length) return;
      var gap = 8;
      var perRow = 3;
      var cellW = (CW - indent - gap * (perRow - 1)) / perRow;
      var cellH = cellW * 0.75;
      for (var p = 0; p < photos.length; p += perRow) {
        ensure(cellH + gap);
        for (var q = 0; q < perRow && p + q < photos.length; q++) {
          var ph = photos[p + q];
          var scale = Math.min(cellW / ph.w, cellH / ph.h);
          var w = ph.w * scale, h = ph.h * scale;
          var cx = M + indent + q * (cellW + gap);
          color([240, 243, 246], "fill");
          doc.rect(cx, y, cellW, cellH, "F");
          try {
            doc.addImage(ph.data, "JPEG", cx + (cellW - w) / 2, y + (cellH - h) / 2, w, h, undefined, "FAST");
          } catch (e) { /* skip unreadable image */ }
        }
        y += cellH + gap;
      }
      y += 12; // clear the next line's text, which sits above its baseline
    }

    // ---- full checklist ----
    var PILL = 44;
    var TEXT_X = M + PILL + 10;
    var TEXT_W = CW - PILL - 10;
    d.sections.forEach(function (s) {
      ensure(48);
      y += 6;
      font("bold", 12);
      color(BRAND);
      doc.text(clean(s.name).toUpperCase(), M, y);
      color(LINE, "draw");
      doc.setLineWidth(0.8);
      doc.line(M, y + 5, W - M, y + 5);
      y += 20;

      s.items.forEach(function (it) {
        font("normal", 10.5);
        var tl = lines(it.name, TEXT_W);
        var nl = it.note ? (font("italic", 10), lines("Note: " + it.note, TEXT_W)) : [];
        var h = Math.max(16, tl.length * lineH(10.5)) + nl.length * lineH(10) + 6;
        ensure(h);

        var c = COLORS[it.result] || COLORS["N/A"];
        color(c.bg, "fill");
        doc.roundedRect(M, y - 10, PILL, 15, 3, 3, "F");
        font("bold", 8.5);
        color(c.fg);
        doc.text(it.result.toUpperCase(), M + PILL / 2, y + 0.5, { align: "center" });

        font(it.result === "Fail" ? "bold" : "normal", 10.5);
        color(INK);
        doc.text(tl, TEXT_X, y);
        y += tl.length * lineH(10.5);
        if (nl.length) {
          font("italic", 10);
          color(COLORS.Fail.fg);
          doc.text(nl, TEXT_X, y);
          y += nl.length * lineH(10);
        }
        y += 6;
        drawPhotos(it.photos, PILL + 10);
      });
      y += 4;
    });

    // ---- notes ----
    if (d.notes || (d.notesPhotos && d.notesPhotos.length)) {
      ensure(40);
      y += 6;
      font("bold", 12);
      color(BRAND);
      doc.text("NOTES", M, y);
      color(LINE, "draw");
      doc.line(M, y + 5, W - M, y + 5);
      y += 20;
      if (d.notes) {
        font("normal", 10.5);
        color(INK);
        var notes = lines(d.notes, CW);
        notes.forEach(function (ln) {
          ensure(lineH(10.5));
          doc.text(ln, M, y);
          y += lineH(10.5);
        });
        y += 6;
      }
      drawPhotos(d.notesPhotos, 0);
    }

    // ---- policy + certification ----
    font("normal", 9.5);
    var pol = (d.policy || []).map(function (p) { return lines(p, CW - 24); });
    var polH = pol.reduce(function (n, l) { return n + l.length * lineH(9.5) + 6; }, 0);
    if (pol.length) {
      ensure(polH + 22);
      y += 8;
      color([244, 246, 248], "fill");
      doc.roundedRect(M, y, CW, polH + 14, 6, 6, "F");
      var py = y + 18;
      color(MUTED);
      pol.forEach(function (l) {
        doc.text(l, M + 12, py);
        py += l.length * lineH(9.5) + 6;
      });
      y += polH + 28;
    }

    ensure(40);
    y += 8;
    font("bold", 11);
    color(INK);
    doc.text("Inspection certified accurate by " + clean(d.driver), M, y);
    font("normal", 10);
    color(MUTED);
    doc.text(clean(d.dateStr), M, y + 15);

    // ---- footers ----
    var pages = doc.getNumberOfPages();
    for (var pg = 1; pg <= pages; pg++) {
      doc.setPage(pg);
      font("normal", 8.5);
      color(MUTED);
      doc.text(clean(d.footer), M, H - 24);
      doc.text("Page " + pg + " of " + pages, W - M, H - 24, { align: "right" });
    }

    var uri = doc.output("datauristring");
    return {
      blob: doc.output("blob"),
      base64: uri.slice(uri.indexOf(",") + 1),
      filename: d.filename,
    };
  };
})();
