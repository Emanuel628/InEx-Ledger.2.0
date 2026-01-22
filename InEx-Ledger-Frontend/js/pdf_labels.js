const _PDF_LABELS = {
  en: {
    report_title: "Business export summary",
    legal_name: "Legal business name",
    business_name: "Operating name (DBA)",
    tax_id: "Tax ID",
    reporting_period: "Reporting period",
    business_activity_code: "Business activity code",
    currency: "Currency",
    total_income: "Total income",
    total_expenses: "Total expenses",
    net_profit: "Net profit",
    estimated_tax: "Estimated tax (25%)",
    estimated_tax_disclaimer: "Estimate only — not tax advice.",
    category_breakdown_title: "Category breakdown",
    transaction_log_title: "Transaction ledger",
    receipts_index_title: "Receipts index",
    mileage_summary_title: "Mileage summary",
    mileage_note_csv: "Full detailed mileage log available in CSV export."
  },
  es: {
    report_title: "Informe de exportación",
    legal_name: "Nombre legal de la empresa",
    business_name: "Nombre comercial (DBA)",
    tax_id: "Identificación fiscal",
    reporting_period: "Periodo reportado",
    business_activity_code: "Código de actividad",
    currency: "Moneda",
    total_income: "Ingresos totales",
    total_expenses: "Gastos totales",
    net_profit: "Utilidad neta",
    estimated_tax: "Impuesto estimado (25%)",
    estimated_tax_disclaimer: "Solo estimado — no constituye consejo fiscal.",
    category_breakdown_title: "Desglose por categoría",
    transaction_log_title: "Registro de transacciones",
    receipts_index_title: "Índice de recibos",
    mileage_summary_title: "Resumen de kilometraje",
    mileage_note_csv:
      "El registro completo de kilometraje está disponible en el CSV."
  },
  fr: {
    report_title: "Rapport d’exportation",
    legal_name: "Raison sociale",
    business_name: "Nom commercial (DBA)",
    tax_id: "ID fiscal",
    reporting_period: "Période couverte",
    business_activity_code: "Code d’activité",
    currency: "Devise",
    total_income: "Revenus totaux",
    total_expenses: "Dépenses totales",
    net_profit: "Bénéfice net",
    estimated_tax: "Impôt estimé (25 %)",
    estimated_tax_disclaimer: "Estimation uniquement — pas un conseil fiscal.",
    category_breakdown_title: "Répartition par catégorie",
    transaction_log_title: "Journal des transactions",
    receipts_index_title: "Index des reçus",
    mileage_summary_title: "Résumé du kilométrage",
    mileage_note_csv:
      "Le journal complet du kilométrage est disponible dans l’export CSV."
  }
};

function getPdfLabels(lang) {
  if (!lang || !_PDF_LABELS[lang]) {
    return _PDF_LABELS.en;
  }
  return _PDF_LABELS[lang];
}