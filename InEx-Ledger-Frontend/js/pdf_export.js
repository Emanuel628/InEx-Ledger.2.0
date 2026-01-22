class PdfCanvas {
  constructor() {
    this.commands = ["BT"];
  }

  text(x, y, text, size = 11) {
    const formattedX = Number.isFinite(x) ? x.toFixed(2) : "0.00";
    const formattedY = Number.isFinite(y) ? y.toFixed(2) : "0.00";
    this.commands.push(`/F1 ${size} Tf`);
    this.commands.push(`1 0 0 1 ${formattedX} ${formattedY} Tm`);
    this.commands.push(`${pdfHex(text)} Tj`);
  }

  addFooter(pageNumber, totalPages) {
    const footerText = `Page ${pageNumber} of ${totalPages}`;
    this.text(260, 30, footerText, 9);
  }

  build() {
    return [...this.commands, "ET"].join("\n");
  }
}

function buildPdfExport(options) {
  const {
    transactions = [],
    accounts = [],
    categories = [],
    receipts = [],
    mileage = [],
    startDate = "",
    endDate = "",
    exportLang = "en",
    currency = "USD",
    legalName = "",
    businessName = "",
    operatingName = "",
    taxId = "",
    naics = "",
    region = "us"
  } = options;

  const labels = getPdfLabels(exportLang);
  const totals = calculateTotals(transactions);
  const categoryPages = buildCategoryPages(
    transactions,
    categories,
    currency,
    labels
  );
  const transactionPages = buildTransactionPages(
    transactions,
    accounts,
    categories,
    currency,
    labels
  );
  const receiptsPages = buildReceiptsPages(receipts, transactions, labels);
  const mileagePages = buildMileagePage(mileage, labels);

  const canvases = [
    buildIdentityPage({
      labels,
      totals,
      currency,
      legalName,
      operatingName,
      taxId,
      naics,
      businessName,
      startDate,
      endDate
    }),
    ...categoryPages,
    ...transactionPages,
    ...receiptsPages,
    ...mileagePages
  ];

  const totalPages = canvases.length;
  const pageContents = canvases.map((canvas, index) => {
    canvas.addFooter(index + 1, totalPages);
    return canvas.build();
  });

  return createPdfBytes(pageContents);
}

function buildIdentityPage(data) {
  const {
    labels,
    totals,
    currency,
    legalName,
    operatingName,
    taxId,
    naics,
    businessName,
    startDate,
    endDate
  } = data;

  const canvas = new PdfCanvas();
  let y = 760;
  canvas.text(40, y, labels.report_title, 20);
  y -= 32;
  canvas.text(
    40,
    y,
    `${labels.legal_name}: ${legalName || businessName || "—"}`,
    11
  );
  y -= 18;
  canvas.text(40, y, `${labels.business_name}: ${operatingName || "—"}`, 11);
  y -= 18;
  canvas.text(40, y, `${labels.tax_id}: ${taxId || "—"}`, 11);
  y -= 18;
  canvas.text(
    40,
    y,
    `${labels.business_activity_code}: ${naics || "—"}`,
    11
  );
  y -= 18;
  canvas.text(
    40,
    y,
    `${labels.reporting_period}: ${startDate} – ${endDate}`,
    11
  );
  y -= 18;
  canvas.text(40, y, `${labels.currency}: ${currency}`, 11);

  let summaryY = 680;
  const summaryX = 360;
  canvas.text(
    summaryX,
    summaryY,
    `${labels.total_income}: ${formatCurrencyForPdf(totals.income, currency)}`,
    11
  );
  summaryY -= 18;
  canvas.text(
    summaryX,
    summaryY,
    `${labels.total_expenses}: ${formatCurrencyForPdf(totals.expenses, currency)}`,
    11
  );
  summaryY -= 18;
  canvas.text(
    summaryX,
    summaryY,
    `${labels.net_profit}: ${formatCurrencyForPdf(totals.netProfit, currency)}`,
    11
  );
  summaryY -= 18;
  canvas.text(
    summaryX,
    summaryY,
    `${labels.estimated_tax}: ${formatCurrencyForPdf(totals.estimatedTax, currency)}`,
    11
  );
  summaryY -= 22;
  canvas.text(summaryX, summaryY, labels.estimated_tax_disclaimer, 9);

  return canvas;
}

function buildCategoryPages(transactions, categories, currency, labels) {
  const categoryMap = mapByKey(categories, "id");
  const breakdown = {};
  transactions.forEach((txn) => {
    const type = txn.type === "income" ? "income" : "expense";
    if (type !== "expense") {
      return;
    }

    const category = categoryMap[txn.categoryId];
    const label = (category?.taxLabel || "").trim() || "Unmapped";
    const amountValue = Math.abs(Number(txn.amount) || 0);
    breakdown[label] = (breakdown[label] || 0) + amountValue;
  });

  const entries = Object.entries(breakdown)
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);

  if (entries.length === 0) {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16);
    canvas.text(
      40,
      720,
      "No expense data available for this reporting period.",
      11
    );
    return [canvas];
  }

  const rowsPerPage = 28;
  const chunks = chunkArray(entries, rowsPerPage);
  return chunks.map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.category_breakdown_title, 16);
    canvas.text(40, 730, "Tax Label", 11);
    canvas.text(320, 730, "Total Amount", 11);
    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.label, 10);
      canvas.text(
        320,
        y,
        formatCurrencyForPdf(row.amount, currency),
        10
      );
      y -= 16;
    });
    return canvas;
  });
}

function buildTransactionPages(transactions, accounts, categories, currency, labels) {
  const accountMap = mapByKey(accounts, "id");
  const categoryMap = mapByKey(categories, "id");
  const sorted = transactions
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  if (sorted.length === 0) {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.transaction_log_title, 16);
    canvas.text(40, 720, "No transactions recorded for this period.", 11);
    return [canvas];
  }

  const rows = sorted.map((txn) => {
    const category = categoryMap[txn.categoryId];
    const accountName = accountMap[txn.accountId]?.name || "-";
    const categoryName = category?.name || "-";
    const type =
      txn.type || (category?.type === "income" ? "income" : "expense");
    return {
      date: txn.date || "",
      description: truncateText(txn.description || "-", 28),
      typeLabel: type === "income" ? "Income" : "Expense",
      account: truncateText(accountName, 18),
      category: truncateText(categoryName, 18),
      amount: formatCurrencyForPdf(Math.abs(Number(txn.amount) || 0), currency),
      receipt: txn.receiptId || txn.receipt_id ? "Yes" : "No"
    };
  });

  const rowsPerPage = 24;
  const chunks = chunkArray(rows, rowsPerPage);
  return chunks.map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.transaction_log_title, 16);
    const headerY = 730;
    canvas.text(40, headerY, "Date", 11);
    canvas.text(110, headerY, "Description", 11);
    canvas.text(280, headerY, "Type", 11);
    canvas.text(340, headerY, "Account", 11);
    canvas.text(420, headerY, "Category", 11);
    canvas.text(500, headerY, "Amount", 11);
    canvas.text(560, headerY, "Receipt", 11);

    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.date, 10);
      canvas.text(110, y, row.description, 10);
      canvas.text(280, y, row.typeLabel, 10);
      canvas.text(340, y, row.account, 10);
      canvas.text(420, y, row.category, 10);
      canvas.text(500, y, row.amount, 10);
      canvas.text(560, y, row.receipt, 10);
      y -= 16;
    });

    return canvas;
  });
}

function buildReceiptsPages(receipts, transactions, labels) {
  const txMap = mapByKey(transactions, "id");
  const filtered = receipts
    .map((receipt) => {
      const txnId =
        receipt.transaction_id || receipt.transactionId || receipt.txnId;
      if (!txnId || !txMap[txnId]) {
        return null;
      }
      const txn = txMap[txnId];
      return {
        receiptId: receipt.id || receipt.receipt_id || "",
        txDate: txn.date || "",
        txDescription: truncateText(txn.description || "-", 30),
        fileName:
          receipt.filename || receipt.displayName || receipt.name || "—"
      };
    })
    .filter(Boolean);

  if (filtered.length === 0) {
    return [];
  }

  const rowsPerPage = 22;
  const chunks = chunkArray(filtered, rowsPerPage);
  return chunks.map((chunk) => {
    const canvas = new PdfCanvas();
    canvas.text(40, 760, labels.receipts_index_title, 16);
    const headerY = 730;
    canvas.text(40, headerY, "Receipt ID", 11);
    canvas.text(160, headerY, "Tx Date", 11);
    canvas.text(260, headerY, "Tx Description", 11);
    canvas.text(460, headerY, "File Name", 11);

    let y = 708;
    chunk.forEach((row) => {
      canvas.text(40, y, row.receiptId, 10);
      canvas.text(160, y, row.txDate, 10);
      canvas.text(260, y, row.txDescription, 10);
      canvas.text(460, y, row.fileName, 10);
      y -= 16;
    });

    return canvas;
  });
}

function buildMileagePage(mileage, labels) {
  if (!Array.isArray(mileage) || mileage.length === 0) {
    return [];
  }

  const totalMiles = mileage
    .filter((record) => record.unit === "miles")
    .reduce((sum, record) => sum + Math.abs(Number(record.miles) || 0), 0);
  const totalKilometers = mileage
    .filter((record) => record.unit === "km")
    .reduce((sum, record) => sum + Math.abs(Number(record.kilometers) || 0), 0);
  const totalDistance = mileage.reduce((sum, record) => {
    const start = Number(record.odoStart);
    const end = Number(record.odoEnd);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return sum + Math.abs(end - start);
    }
    return sum;
  }, 0);
  const semanticBusinessDistance = totalKilometers;
  const businessPercent =
    totalDistance > 0
      ? (semanticBusinessDistance / totalDistance) * 100
      : null;

  const canvas = new PdfCanvas();
  canvas.text(40, 760, labels.mileage_summary_title, 16);
  let y = 720;
  if (totalMiles > 0) {
    canvas.text(
      40,
      y,
      `Total business miles: ${formatDistance(totalMiles)} mi`,
      11
    );
    y -= 18;
  }
  if (totalKilometers > 0) {
    canvas.text(
      40,
      y,
      `Total business kilometers: ${formatDistance(totalKilometers)} km`,
      11
    );
    y -= 18;
  }
  if (businessPercent !== null) {
    canvas.text(40, y, `Business %: ${businessPercent.toFixed(1)}%`, 11);
    y -= 18;
  }
  y -= 12;
  canvas.text(40, y, labels.mileage_note_csv, 10);

  return [canvas];
}

function calculateTotals(transactions) {
  let income = 0;
  let expenses = 0;
  transactions.forEach((txn) => {
    const amount = Math.abs(Number(txn.amount) || 0);
    if (txn.type === "income") {
      income += amount;
    } else {
      expenses += amount;
    }
  });
  const netProfit = income - expenses;
  const estimatedTax = Math.max(0, netProfit) * 0.25;
  return { income, expenses, netProfit, estimatedTax };
}

function formatCurrencyForPdf(value, currency) {
  const formatter = new Intl.NumberFormat(
    currency === "CAD" ? "en-CA" : "en-US",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
  return formatter.format(Number(value) || 0);
}

function formatDistance(value) {
  return Number(value || 0).toFixed(2);
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function mapByKey(items, key) {
  return (items || []).reduce((acc, item) => {
    if (item && item[key]) {
      acc[item[key]] = item;
    }
    return acc;
  }, {});
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function pdfHex(text) {
  const normalized = String(text || "");
  let hex = "FEFF";
  for (const char of normalized) {
    const code = char.codePointAt(0);
    hex += code.toString(16).padStart(4, "0");
  }
  return `<${hex.toUpperCase()}>`;
}

function createPdfBytes(pageContents) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageEntries = [];
  let nextId = 4;

  pageContents.forEach((content) => {
    const contentId = nextId++;
    const pageId = nextId++;
    pageEntries.push({ contentId, pageId, content });
  });

  const catalog = buildObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pagesBody = `<< /Type /Pages /Count ${pageEntries.length} /Kids [${pageEntries
    .map((entry) => `${entry.pageId} 0 R`)
    .join(" ")}] >>`;
  const pages = buildObject(2, pagesBody);
  const font = buildObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  objects.push(catalog, pages, font);

  pageEntries.forEach((entry) => {
    const length = encoder.encode(entry.content).length;
    const streamBody = `<< /Length ${length} >>\nstream\n${entry.content}\nendstream`;
    objects.push(buildObject(entry.contentId, streamBody));
    const resourceBody = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${entry.contentId} 0 R >>`;
    objects.push(buildObject(entry.pageId, resourceBody));
  });

  const parts = ["%PDF-1.3\n"];
  let offset = encoder.encode(parts[0]).length;
  const offsets = [0];

  objects.forEach((obj) => {
    offsets.push(offset);
    parts.push(obj);
    offset += encoder.encode(obj).length;
  });

  const xrefStart = offset;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((value) => {
    parts.push(`${String(value).padStart(10, "0")} 00000 n \n`);
  });

  parts.push(
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefStart}\n`,
    "%%EOF"
  );

  const pdfString = parts.join("");
  return encoder.encode(pdfString);
}

function buildObject(id, body) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

window.buildPdfExport = buildPdfExport;