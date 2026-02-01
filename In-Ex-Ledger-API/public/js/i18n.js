const LANGUAGES = ['en', 'es', 'fr'];

const LANGUAGE_LABELS = {
  en: 'English',
  es: 'Espa\u00F1ol',
  fr: 'Fran\u00E7ais'
};

function normalizeLanguage(code) {
  if (!code || typeof code !== 'string') {
    return 'en';
  }

  const normalized = code.toLowerCase();
  return LANGUAGES.includes(normalized) ? normalized : 'en';
}

function getStoredLanguage() {
  return normalizeLanguage(localStorage.getItem('lb_language'));
}

function getCurrentLanguage() {
  return window.LUNA_LANGUAGE || getStoredLanguage();
}

function setCurrentLanguage(lang) {
  const normalized = normalizeLanguage(lang);
  localStorage.setItem('lb_language', normalized);
  window.LUNA_LANGUAGE = normalized;
  applyTranslations(normalized);
  console.log('[i18n] language:', normalized);
  return normalized;
}

function t(key) {
  const lang = getCurrentLanguage();
  const translations = TRANSLATIONS[lang] || TRANSLATIONS.en || {};
  return translations[key] || (TRANSLATIONS.en && TRANSLATIONS.en[key]) || key;
}

function applyTranslations(languageOverride) {
  const language = normalizeLanguage(languageOverride || getCurrentLanguage());
  window.LUNA_LANGUAGE = language;
  localStorage.setItem('lb_language', language);

  const nodes = document.querySelectorAll('[data-i18n]');
  nodes.forEach((node) => {
    if (node.id === 'passwordMatchMessage') {
      return;
    }
    const key = node.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      node.value = text;
    } else {
      node.textContent = text;
    }
  });

  const placeholderNodes = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderNodes.forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const text = t(key);
    if (typeof node.placeholder !== 'undefined') {
      node.placeholder = text;
    }
  });

  console.log('[i18n] language:', language);
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('lunaLanguageChanged', { detail: language })
    );
  }
}

function populateLanguageOptions(selectElement) {
  if (!selectElement) return;

  const existingOptions = new Map();
  Array.from(selectElement.options).forEach((option) => {
    existingOptions.set(option.value, option);
  });

  LANGUAGES.forEach((code) => {
    let option = existingOptions.get(code);
    if (!option) {
      option = document.createElement('option');
      option.value = code;
      selectElement.appendChild(option);
    }
    option.textContent = LANGUAGE_LABELS[code] || code;
    option.selected = code === getCurrentLanguage();
    existingOptions.delete(code);
  });

  existingOptions.forEach((option) => option.remove());
}

window.LUNA_I18N = {
  LANGUAGES,
  LANGUAGE_LABELS,
  t,
  applyTranslations,
  populateLanguageOptions,
  setCurrentLanguage
};

window.t = t;
window.applyTranslations = applyTranslations;
window.populateLanguageOptions = populateLanguageOptions;
window.setCurrentLanguage = setCurrentLanguage;
window.LUNA_LANGUAGE_LABELS = LANGUAGE_LABELS;

window.LUNA_LANGUAGE = window.LUNA_LANGUAGE || getCurrentLanguage();

const TRANSLATIONS = {
  en: {
    nav_transactions: 'Transactions',
    nav_accounts: 'Accounts',
    nav_categories: 'Categories',
    nav_receipts: 'Receipts',
    nav_exports: 'Exports',
    nav_settings: 'Settings',
    nav_pricing: 'Pricing',
    nav_sign_in: 'Sign in',
    nav_create_account: 'Create account',
    landing_hero_title: 'Track your 1099 money without the headache',
    landing_hero_subtitle:
      'A simple, calm ledger for freelancers and contractors to track income & expenses and export clean records for tax time.',
    landing_start_trial: 'Start free trial',
    landing_sign_in: 'Sign in',
    landing_what_it_does: 'What it does',
    landing_feature_income: 'Track income & expenses',
    landing_feature_income_subline:
      'Log your work money, purchases, and write-offs in one clean place.',
    landing_feature_tax: 'Stay tax-ready',
    landing_feature_tax_subline:
      'Keep your records organized so tax time is fast, simple, and stress-free.',
    landing_feature_export: 'Export for your CPA',
    landing_feature_export_subline:
      'Generate a CSV your accountant can actually use.',
    landing_included_title: "What's included in V1 (today)",
    landing_included_item1: 'Account creation & sign-in',
    landing_included_item2: 'Transaction ledger (income & expenses)',
    landing_included_item3: 'Basic organization built for 1099 workers',
    landing_included_item4: 'CSV export for tax prep',
    landing_included_item5: '30-day free trial (then choose a plan)',
    landing_coming_title: "What's coming in V2",
    landing_coming_subline:
      'V2 adds automation and power features without losing the calm simplicity.',
    landing_coming_item1: 'Bank sync (automatic imports)',
    landing_coming_item2: 'Smarter categorization suggestions',
    landing_coming_item3: 'Receipt capture improvements',
    landing_coming_item4: 'More exports & reports',
    landing_coming_item5: 'Multi-business support',
    landing_coming_item6: 'Bookkeeper/CPA access',
    login_title: 'Sign in',
    login_submit: 'Sign in',
    login_email_label: 'Email address',
    login_password_label: 'Password',
    login_toggle_show_password: 'Show password',
    login_need_account: "Don't have an account?",
    login_create_account: 'Create one',
    register_title: 'Create your account',
    register_submit: 'Create account',
    register_email_label: 'Email address',
    register_password_label: 'Password',
    register_confirm_password_label: 'Confirm password',
    register_region_label: 'Region',
    register_language_label: 'Language',
    register_password_help:
      'Password must include 8+ characters, an uppercase letter, a number, and a symbol.',
    register_show_password: 'Show password',
    register_consent_prefix: 'I agree to the ',
    register_consent_terms: 'Terms',
    register_consent_and: ' and ',
    register_consent_privacy: 'Privacy Policy',
    register_consent_suffix: '.',
    register_existing_account: 'Already have an account?',
    register_sign_in: 'Sign in',
    register_strength_label_weak: 'Weak',
    register_strength_label_good: 'Good',
    register_strength_label_strong: 'Strong',
    register_password_match_success: 'Passwords match.',
    register_password_match_error: 'Passwords do not match.',
    register_consent_error:
      'You must agree to the Terms and Privacy Policy to continue.',
    register_alert_fill_fields: 'Please fill out all fields.',
    register_alert_valid_email: 'Please enter a valid email address.',
    register_alert_password_length: 'Password must be at least 8 characters.',
    register_alert_password_strength:
      'Please create a strong password and ensure both fields match.',
    region_us: 'United States',
    region_ca: 'Canada',
    transactions_hero_title: 'Estimated Tax Owed (YTD)',
    transactions_subline_label: 'Suggested monthly set-aside:',
    transactions_hero_subline:
      'Based on your income minus expenses so far this year.',
    transactions_upsell_title: 'Unlock Real-Time Tax Estimates',
    transactions_upsell_body:
      'Upgrade to V1 to see your live estimated tax owed and monthly set-aside.',
    transactions_upsell_cta: 'Upgrade to V1',
    transactions_section_title: 'Transactions',
    transactions_section_description:
      'This page records business activity in the ledger.',
    title_record_tx: 'Record a Transaction',
    label_tx_type: 'Transaction type',
    opt_expense: 'Expense',
    opt_income: 'Income',
    transaction_type_income: 'Income',
    transaction_type_expense: 'Expense',
    transaction_label_date: 'Date',
    transaction_label_description: 'Description',
    transaction_label_account: 'Account',
    transaction_label_category: 'Category',
    transaction_label_amount: 'Amount',
    transaction_button_save: 'Save transaction',
    transactions_recorded: 'Recorded transactions',
    transactions_recorded_blurb:
      'Transactions entered for the selected ledger period appear here.',
    transactions_table_date: 'Date',
    transactions_table_description: 'Description',
    transactions_table_account: 'Account',
    transactions_table_category: 'Category',
    transactions_table_amount: 'Amount',
    transactions_kpi_total_income: 'Total Income',
    transactions_kpi_total_expenses: 'Total Expenses',
    transactions_kpi_net_profit: 'Net Profit',
    transactions_search_placeholder: 'Search transactions',
    transactions_filter_all_categories: 'All categories',
    transactions_add_transaction_button: '+ Add New',
    transactions_intent_income: '+ Add Income',
    transactions_intent_expense: '+ Add Expense',
    transactions_empty: 'No transactions yet.',
    receipts_title: 'Receipts',
    receipts_description:
      'Receipts can be uploaded and attached to transactions.',
    receipts_tier_notice_title:
      'You need InEx Ledger V1 to upload receipts.',
    receipts_tier_notice_cta: 'Upgrade now',
    receipts_upload_legend: 'Upload receipt',
    receipts_label_file: 'Receipt file',
    receipts_label_notes: 'Notes (optional)',
    receipts_button_upload: 'Upload receipt',
    receipts_dropzone_message: 'Drag & drop receipt file or click to upload',
    receipts_uploaded_title: 'Uploaded receipts',
    receipts_uploaded_blurb:
      'Uploaded receipts are listed here and can be attached to transactions.',
    receipts_table_filename: 'Filename',
    receipts_table_uploaded: 'Uploaded date',
    receipts_table_attached: 'Attached to transaction',
    receipts_empty_title: 'No receipts yet',
    receipts_empty_body:
      'Upload a receipt and link it to a transaction.',
    accounts_title: 'Accounts',
    accounts_description:
      'Where your business money lives. Create separate buckets for checking, savings, cash, or credit.',
    accounts_add: 'Add account',
    accounts_form_legend: 'Add account',
    accounts_label_name: 'Account name',
    accounts_label_type: 'Account type',
    accounts_button_save: 'Save account',
    accounts_no_accounts: 'No accounts yet. Add one to get started.',
    accounts_in_use:
      'This account cannot be deleted because it is in use.',
    categories_title: 'Categories',
    categories_description:
      'Organize transactions into income or expense groups for export accuracy.',
    categories_add: 'Add category',
    categories_form_legend: 'Add category',
    categories_label_name: 'Category name',
    categories_label_type: 'Type',
    categories_type_income: 'Income',
    categories_type_expense: 'Expense',
    categories_button_save: 'Save category',
    categories_income_title: 'Income categories',
    categories_expense_title: 'Expense categories',
    categories_no_income: 'No income categories yet.',
    categories_no_expense: 'No expense categories yet.',
    categories_in_use:
      'This category cannot be deleted because it is in use.',
    exports_title: 'Exports',
    exports_description:
      'Export your business records for review, filing, or sharing with a CPA.',
    exports_history_title: 'Export history',
    exports_history_blurb:
      'Generated exports for the selected business appear here.',
    exports_no_history: 'No exports yet.',
    exports_history_range_label: 'Range:',
    exports_history_exported_on: 'Exported on',
    exports_history_download_label: 'Download',
    exports_error_dates_required:
      'Fill in a start date and end date before exporting.',
    exports_error_dates_order:
      'Start date must be before or equal to end date.',
    exports_form_legend: 'Select reporting period',
    exports_label_start: 'Start date',
    exports_label_end: 'End date',
    exports_button_csv: 'Export CSV',
    mileage_title: 'Record a trip',
    mileage_subtext_us: 'Using miles (U.S. default). Change in Settings if needed.',
    mileage_subtext_ca: 'Using kilometers (Canada default). Change in Settings if needed.',
    mileage_label_date: 'Date',
    mileage_label_purpose: 'Purpose',
    mileage_label_destination_optional: 'Destination (optional)',
    mileage_label_miles: 'Miles',
    mileage_label_odo_start: 'Odometer start',
    mileage_label_odo_end: 'Odometer end',
    mileage_label_kilometers: 'Kilometers',
    mileage_label_calc_km: 'Calculated distance: {{value}} km',
    mileage_table_date: 'Date',
    mileage_table_purpose: 'Purpose',
    mileage_table_destination: 'Destination',
    mileage_table_miles: 'Miles',
    mileage_table_odo_start: 'Start Odometer',
    mileage_table_odo_end: 'End Odometer',
    mileage_table_km: 'Kilometers',
    mileage_table_actions: 'Actions',
    mileage_button_add: 'Add mileage',
    mileage_button_delete: 'Delete',
    mileage_error_required_fields: 'Date and purpose are required.',
    mileage_error_miles_required: 'Enter the number of miles.',
    mileage_error_odometer_required: 'Enter valid odometer readings.',
    mileage_error_odometer_order: 'Odometer end must be greater than or equal to start.',
    mileage_empty: 'No mileage logged yet.',
    settings_title: 'Settings',
    settings_business_title: 'Business',
    settings_intro:
      'Manage your business information, security, and preferences.',
    settings_link_business_profile: 'Business profile',
    settings_link_security: 'Security',
    settings_link_legal: 'Legal & policies',
    settings_tax_identifiers_title: 'Tax identifiers',
    settings_ein_hint: 'EIN (USA) identifies your business for tax filings.',
    settings_account_title: 'Account',
    settings_sign_out: 'Sign out',
    settings_region_language_title: 'Language & Region',
    settings_detected_label: 'You were detected as:',
    settings_region_label: 'Region',
    settings_language_label: 'Language',
    settings_region_save_button: 'Save region',
    settings_region_saved: 'Region updated.',
    appearance_title: 'Appearance',
    settings_dark_mode_label: 'Dark mode',
    appearance_toggle: 'Use light mode',
    unit_metric_label: 'Use Metric (kilometers)',
    unit_metric_help: 'If off, distances are recorded in miles.',
    settings_units_label: 'Units',
    settings_units_toggle_label: 'Metric (km) / Imperial (mi)',
    privacy_title: 'Privacy',
    privacy_download_button: 'Download my data',
    privacy_opt_out_label: 'Opt out of data sharing',
    privacy_terms_accepted: 'Terms accepted:',
    status_yes: 'Yes',
    status_no: 'No',
    settings_save_changes: 'Save changes',
    settings_changes_saved: 'Settings updated.',
    settings_business_ids_saved: 'Business IDs saved',
    upgrade_title: 'Upgrade to InEx Ledger V1',
    upgrade_free_heading: 'Upgrade to InEx Ledger V1',
    upgrade_free_intro:
      'Go beyond the free tier with the features you need to keep clean books.',
    upgrade_benefit_receipts: 'Receipts',
    upgrade_benefit_csv: 'CSV exports',
    upgrade_benefit_filters: 'Date filters',
    upgrade_benefit_recurring: 'Recurring transactions',
    upgrade_benefit_tax: 'Real-time tax estimates',
    upgrade_cta: 'View subscription options',
    upgrade_v1_banner_title: 'You are on InEx Ledger V1.',
    upgrade_v1_banner_body:
      'Future releases will add optional bank syncing and smarter automation.',
    upgrade_footer_note: 'InEx Ledger - V1 Beta - 2026',
    subscription_title: 'Subscription'
  },
  es: {
    nav_transactions: 'Transacciones',
    nav_accounts: 'Cuentas',
    nav_categories: 'CategorÃ­as',
    nav_receipts: 'Recibos',
    nav_exports: 'Exportaciones',
    nav_settings: 'ConfiguraciÃ³n',
    nav_pricing: 'Precios',
    nav_sign_in: 'Iniciar sesiÃ³n',
    nav_create_account: 'Crear cuenta',
    landing_hero_title: 'Controla tu dinero 1099 sin dolor de cabeza',
    landing_hero_subtitle:
      'Un libro mayor sencillo y tranquilo para freelancers y contratistas que registra ingresos, gastos y exporta registros limpios para impuestos.',
    landing_start_trial: 'Comenzar prueba gratuita',
    landing_sign_in: 'Iniciar sesiÃ³n',
    landing_what_it_does: 'QuÃ© hace',
    landing_feature_income: 'Registra ingresos y gastos',
    landing_feature_income_subline:
      'Anota tus ingresos, compras y deducciones en un solo lugar limpio.',
    landing_feature_tax: 'Mantente listo para impuestos',
    landing_feature_tax_subline:
      'MantÃ©n tus registros organizados para que la temporada de impuestos sea rÃ¡pida y sin estrÃ©s.',
    landing_feature_export: 'Exporta para tu contador',
    landing_feature_export_subline:
      'Genera un CSV que tu contador realmente pueda usar.',
    landing_included_title: 'QuÃ© incluye V1 (hoy)',
    landing_included_item1: 'CreaciÃ³n de cuenta e inicio de sesiÃ³n',
    landing_included_item2: 'Libro de transacciones (ingresos y gastos)',
    landing_included_item3: 'OrganizaciÃ³n bÃ¡sica para trabajadores 1099',
    landing_included_item4: 'ExportaciÃ³n CSV para impuestos',
    landing_included_item5: 'Prueba gratuita de 30 dÃ­as',
    landing_coming_title: 'QuÃ© viene en V2',
    landing_coming_subline:
      'V2 aÃ±ade automatizaciÃ³n y potencia sin perder la calma.',
    landing_coming_item1: 'SincronizaciÃ³n bancaria (importaciones automÃ¡ticas)',
    landing_coming_item2: 'Sugerencias inteligentes de categorÃ­as',
    landing_coming_item3: 'Mejoras en captura de recibos',
    landing_coming_item4: 'MÃ¡s exportaciones e informes',
    landing_coming_item5: 'Soporte multiempresas',
    landing_coming_item6: 'Acceso para contadores',
    login_title: 'Iniciar sesiÃ³n',
    login_submit: 'Iniciar sesiÃ³n',
    login_email_label: 'Correo electrÃ³nico',
    login_password_label: 'ContraseÃ±a',
    login_toggle_show_password: 'Mostrar contraseÃ±a',
    login_need_account: 'Â¿AÃºn no tienes cuenta?',
    login_create_account: 'Crear una',
    register_title: 'Crea tu cuenta',
    register_submit: 'Crear cuenta',
    register_email_label: 'Correo electrÃ³nico',
    register_password_label: 'ContraseÃ±a',
    register_confirm_password_label: 'Confirmar contraseÃ±a',
    register_region_label: 'RegiÃ³n',
    register_language_label: 'Idioma',
    register_password_help:
      'La contraseÃ±a debe tener al menos 8 caracteres, incluir una mayÃºscula, un nÃºmero y un sÃ­mbolo.',
    register_show_password: 'Mostrar contraseÃ±a',
    register_consent_prefix: 'Acepto los ',
    register_consent_terms: 'TÃ©rminos',
    register_consent_and: ' y la ',
    register_consent_privacy: 'PolÃ­tica de privacidad',
    register_consent_suffix: '.',
    register_existing_account: 'Â¿Ya tienes cuenta?',
    register_sign_in: 'Iniciar sesiÃ³n',
    register_strength_label_weak: 'DÃ©bil',
    register_strength_label_good: 'Bueno',
    register_strength_label_strong: 'Fuerte',
    register_password_match_success: 'Las contraseÃ±as coinciden.',
    register_password_match_error: 'Las contraseÃ±as no coinciden.',
    register_consent_error:
      'Debes aceptar los tÃ©rminos y la polÃ­tica para continuar.',
    register_alert_fill_fields: 'Completa todos los campos.',
    register_alert_valid_email: 'Introduce un correo vÃ¡lido.',
    register_alert_password_length:
      'La contraseÃ±a debe tener al menos 8 caracteres.',
    register_alert_password_strength:
      'Crea una contraseÃ±a fuerte que coincida en ambos campos.',
    region_us: 'Estados Unidos',
    region_ca: 'CanadÃ¡',
    transactions_hero_title: 'EstimaciÃ³n de impuestos adeudados (YTD)',
    transactions_subline_label: 'Ahorro mensual sugerido:',
    transactions_hero_subline:
      'Basado en tus ingresos menos gastos hasta ahora este aÃ±o.',
    transactions_upsell_title: 'Activa estimaciones fiscales en vivo',
    transactions_upsell_body:
      'Actualiza a V1 para ver tu impuesto estimado y el ahorro mensual.',
    transactions_upsell_cta: 'Actualiza a V1',
    transactions_section_title: 'Transacciones',
    transactions_section_description:
      'Esta pÃ¡gina registra la actividad del negocio.',
    title_record_tx: 'Registra una transacciÃ³n',
    label_tx_type: 'Tipo de transacciÃ³n',
    opt_expense: 'Gasto',
    opt_income: 'Ingreso',
    transaction_type_income: 'Ingreso',
    transaction_type_expense: 'Gasto',
    transaction_label_date: 'Fecha',
    transaction_label_description: 'DescripciÃ³n',
    transaction_label_account: 'Cuenta',
    transaction_label_category: 'CategorÃ­a',
    transaction_label_amount: 'Monto',
    transaction_button_save: 'Guardar transacciÃ³n',
    transactions_recorded: 'Transacciones registradas',
    transactions_recorded_blurb:
      'Las transacciones ingresadas aparecen aquÃ­.',
    transactions_table_date: 'Fecha',
    transactions_table_description: 'DescripciÃ³n',
    transactions_table_account: 'Cuenta',
    transactions_table_category: 'CategorÃ­a',
    transactions_table_amount: 'Monto',
    transactions_kpi_total_income: 'Ingresos totales',
    transactions_kpi_total_expenses: 'Gastos totales',
    transactions_kpi_net_profit: 'Ganancia neta',
    transactions_search_placeholder: 'Buscar transacciones',
    transactions_filter_all_categories: 'Todas las categorías',
    transactions_add_transaction_button: '+ Agregar transacción',
    transactions_intent_income: '+ Agregar ingreso',
    transactions_intent_expense: '+ Agregar gasto',
    transactions_empty: 'AÃºn no hay transacciones.',
    receipts_title: 'Recibos',
    receipts_description:
      'Puedes subir recibos y vincularlos a transacciones.',
    receipts_tier_notice_title:
      'Necesitas InEx Ledger V1 para subir recibos.',
    receipts_tier_notice_cta: 'Actualiza ahora',
    receipts_upload_legend: 'Subir recibo',
    receipts_label_file: 'Archivo del recibo',
    receipts_label_notes: 'Notas (opcional)',
    receipts_button_upload: 'Subir recibo',
    receipts_dropzone_message: 'Arrastra y suelta el archivo del recibo o haz clic para subirlo',
    receipts_uploaded_title: 'Recibos subidos',
    receipts_uploaded_blurb:
      'Los recibos subidos aparecen aquÃ­ y pueden vincularse a transacciones.',
    receipts_table_filename: 'Archivo',
    receipts_table_uploaded: 'Fecha de subida',
    receipts_table_attached: 'Vinculado a una transacciÃ³n',
    receipts_empty_title: 'Sin recibos aÃºn',
    receipts_empty_body:
      'Sube un recibo y vincÃºlalo a una transacciÃ³n.',
    accounts_title: 'Cuentas',
    accounts_description:
      'Donde vive el dinero de tu negocio. Crea cuentas separadas para corriente, ahorro, efectivo o crÃ©dito.',
    accounts_add: 'Agregar cuenta',
    accounts_form_legend: 'Agregar cuenta',
    accounts_label_name: 'Nombre de cuenta',
    accounts_label_type: 'Tipo de cuenta',
    accounts_button_save: 'Guardar cuenta',
    accounts_no_accounts: 'AÃºn no hay cuentas. Agrega una para comenzar.',
    accounts_in_use:
      'Esta cuenta no se puede eliminar porque estÃ¡ en uso.',
    categories_title: 'CategorÃ­as',
    categories_description:
      'Organiza transacciones en grupos de ingresos o gastos para mayor precisiÃ³n en los informes.',
    categories_add: 'Agregar categorÃ­a',
    categories_form_legend: 'Agregar categorÃ­a',
    categories_label_name: 'Nombre de categorÃ­a',
    categories_label_type: 'Tipo',
    categories_type_income: 'Ingreso',
    categories_type_expense: 'Gasto',
    categories_button_save: 'Guardar categorÃ­a',
    categories_income_title: 'CategorÃ­as de ingreso',
    categories_expense_title: 'CategorÃ­as de gasto',
    categories_no_income: 'AÃºn no hay categorÃ­as de ingreso.',
    categories_no_expense: 'AÃºn no hay categorÃ­as de gasto.',
    categories_in_use:
      'Esta categorÃ­a no se puede eliminar porque estÃ¡ en uso.',
    exports_title: 'Exportaciones',
    exports_description:
      'Exporta tus registros comerciales para revisiÃ³n, presentaciÃ³n o compartir con tu contador.',
    exports_history_title: 'Historial de exportaciones',
    exports_history_blurb: 'Los archivos exportados aparecen aquÃ­.',
    exports_no_history: 'AÃºn no hay exportaciones.',
    exports_history_range_label: 'Rango:',
    exports_history_exported_on: 'Exportado el',
    exports_history_download_label: 'Descargar',
    exports_error_dates_required:
      'Completa las fechas antes de exportar.',
    exports_error_dates_order:
      'La fecha inicial debe ser anterior o igual a la final.',
    exports_form_legend: 'Selecciona el periodo',
    exports_label_start: 'Fecha inicial',
    exports_label_end: 'Fecha final',
    exports_button_csv: 'Exportar CSV',
    mileage_title: 'Registrar un viaje',
    mileage_subtext_us: 'Usando millas (predeterminado en EE. UU.). Puedes cambiarlo en ConfiguraciÃ³n.',
    mileage_subtext_ca: 'Usando kilÃ³metros (predeterminado en CanadÃ¡). Puedes cambiarlo en ConfiguraciÃ³n.',
    mileage_label_date: 'Fecha',
    mileage_label_purpose: 'PropÃ³sito',
    mileage_label_destination_optional: 'Destino (opcional)',
    mileage_label_miles: 'Millas',
    mileage_label_odo_start: 'OdÃ³metro inicial',
    mileage_label_odo_end: 'OdÃ³metro final',
    mileage_label_kilometers: 'KilÃ³metros',
    mileage_label_calc_km: 'Distancia calculada: {{value}} km',
    mileage_table_date: 'Fecha',
    mileage_table_purpose: 'PropÃ³sito',
    mileage_table_destination: 'Destino',
    mileage_table_miles: 'Millas',
    mileage_table_odo_start: 'OdÃ³metro inicial',
    mileage_table_odo_end: 'OdÃ³metro final',
    mileage_table_km: 'KilÃ³metros',
    mileage_table_actions: 'Acciones',
    mileage_button_add: 'Agregar viaje',
    mileage_button_delete: 'Eliminar',
    mileage_error_required_fields: 'Fecha y propÃ³sito son obligatorios.',
    mileage_error_miles_required: 'Ingresa el nÃºmero de millas.',
    mileage_error_odometer_required: 'Proporciona lecturas de odÃ³metro vÃ¡lidas.',
    mileage_error_odometer_order: 'El odÃ³metro final debe ser mayor o igual al inicial.',
    mileage_empty: 'AÃºn no hay viajes registrados.',
    settings_title: 'ConfiguraciÃ³n',
    settings_business_title: 'Negocio',
    settings_intro:
      'Administra tu informaciÃ³n empresarial, seguridad y preferencias.',
    settings_link_business_profile: 'Perfil del negocio',
    settings_link_security: 'Seguridad',
    settings_link_legal: 'Legal y polÃ­ticas',
    settings_tax_identifiers_title: 'Identificadores fiscales',
    settings_ein_hint: 'El EIN (EE. UU.) identifica a tu empresa para las declaraciones fiscales.',
    settings_account_title: 'Cuenta',
    settings_sign_out: 'Cerrar sesiÃ³n',
    settings_region_language_title: 'Idioma y regiÃ³n',
    settings_detected_label: 'Se te detecta como:',
    settings_region_label: 'RegiÃ³n',
    settings_language_label: 'Idioma',
    settings_region_save_button: 'Guardar regiÃ³n',
    settings_region_saved: 'RegiÃ³n actualizada.',
    appearance_title: 'Apariencia',
    settings_dark_mode_label: 'Modo oscuro',
    appearance_toggle: 'Usar modo claro',
    unit_metric_label: 'Usar sistema mÃ©trico (kilÃ³metros)',
    unit_metric_help: 'Si estÃ¡ desactivado, las distancias se registran en millas.',
    settings_units_label: 'Unidades',
    settings_units_toggle_label: 'MÃ©trico (km) / Imperial (mi)',
    privacy_title: 'Privacidad',
    privacy_download_button: 'Descargar mis datos',
    privacy_opt_out_label: 'Opta por no compartir datos',
    privacy_terms_accepted: 'TÃ©rminos aceptados:',
    status_yes: 'SÃ­',
    status_no: 'No',
    settings_save_changes: 'Guardar cambios',
    settings_changes_saved: 'ConfiguraciÃ³n guardada.',
    settings_business_ids_saved: 'Identificadores guardados',
    upgrade_title: 'Actualiza a InEx Ledger V1',
    upgrade_free_heading: 'Actualiza a InEx Ledger V1',
    upgrade_free_intro:
      'Ve mÃ¡s allÃ¡ del plan gratuito con las funciones necesarias para mantener tus libros limpios.',
    upgrade_benefit_receipts: 'Recibos',
    upgrade_benefit_csv: 'Exportaciones CSV',
    upgrade_benefit_filters: 'Filtros de fecha',
    upgrade_benefit_recurring: 'Transacciones recurrentes',
    upgrade_benefit_tax: 'Estimaciones fiscales en tiempo real',
    upgrade_cta: 'Ver opciones de suscripciÃ³n',
    upgrade_v1_banner_title: 'EstÃ¡s en InEx Ledger V1.',
    upgrade_v1_banner_body:
      'Las futuras versiones aÃ±adirÃ¡n sincronizaciÃ³n bancaria opcional y automatizaciones mÃ¡s inteligentes.',
    upgrade_footer_note: 'InEx Ledger - V1 Beta - 2026',
    subscription_title: 'SuscripciÃ³n'
  },
  fr: {
    nav_transactions: 'Transactions',
    nav_accounts: 'Comptes',
    nav_categories: 'CatÃ©gories',
    nav_receipts: 'ReÃ§us',
    nav_exports: 'Exports',
    nav_settings: 'ParamÃ¨tres',
    nav_pricing: 'Tarifs',
    nav_sign_in: 'Connexion',
    nav_create_account: 'CrÃ©er un compte',
    landing_hero_title: 'Suivez votre argent 1099 sans stress',
    landing_hero_subtitle:
      'Un grand livre apaisant pour indÃ©pendants et contractuels qui suit les revenus, dÃ©penses et crÃ©e des dossiers propres pour la saison fiscale.',
    landing_start_trial: 'Commencer lâ€™essai gratuit',
    landing_sign_in: 'Connexion',
    landing_what_it_does: 'Ce que nous faisons',
    landing_feature_income: 'Suivi des revenus et dÃ©penses',
    landing_feature_income_subline:
      'Enregistrez vos revenus, achats et dÃ©ductions en un seul endroit clair.',
    landing_feature_tax: 'PrÃ©parez-vous pour les impÃ´ts',
    landing_feature_tax_subline:
      'Gardez vos dossiers organisÃ©s pour une saison fiscale sereine.',
    landing_feature_export: 'Exportez pour votre comptable',
    landing_feature_export_subline:
      'GÃ©nÃ©rez un CSV que votre comptable peut utiliser.',
    landing_included_title: 'Ce que propose V1 (aujourdâ€™hui)',
    landing_included_item1: 'CrÃ©ation de compte et connexion',
    landing_included_item2: 'Grand livre des transactions (revenus et dÃ©penses)',
    landing_included_item3: 'Organisation simple pour les travailleurs 1099',
    landing_included_item4: 'Export CSV pour la prÃ©paration fiscale',
    landing_included_item5: 'Essai gratuit de 30 jours',
    landing_coming_title: 'Ce qui arrive dans V2',
    landing_coming_subline:
      'V2 ajoute de lâ€™automatisation et de la puissance sans perdre sa simplicitÃ©.',
    landing_coming_item1:
      'Synchronisation bancaire (importations automatiques)',
    landing_coming_item2: 'Suggestions intelligentes de catÃ©gories',
    landing_coming_item3: 'AmÃ©liorations de la capture de reÃ§us',
    landing_coming_item4: 'Plus dâ€™exports et de rapports',
    landing_coming_item5: 'Support multi-entreprises',
    landing_coming_item6: 'AccÃ¨s comptable',
    login_title: 'Connexion',
    login_submit: 'Connexion',
    login_email_label: 'Courriel',
    login_password_label: 'Mot de passe',
    login_toggle_show_password: 'Afficher le mot de passe',
    login_need_account: 'Vous nâ€™avez pas de compte ?',
    login_create_account: 'CrÃ©er un compte',
    register_title: 'CrÃ©ez votre compte',
    register_submit: 'CrÃ©er un compte',
    register_email_label: 'Courriel',
    register_password_label: 'Mot de passe',
    register_confirm_password_label: 'Confirmez le mot de passe',
    register_region_label: 'RÃ©gion',
    register_language_label: 'Langue',
    register_password_help:
      'Le mot de passe doit comporter au moins 8 caractÃ¨res, une majuscule, un chiffre et un symbole.',
    register_show_password: 'Afficher le mot de passe',
    register_consent_prefix: 'Jâ€™accepte les ',
    register_consent_terms: 'Conditions',
    register_consent_and: ' et la ',
    register_consent_privacy: 'Politique de confidentialitÃ©',
    register_consent_suffix: '.',
    register_existing_account: 'DÃ©jÃ  un compte ?',
    register_sign_in: 'Connexion',
    register_strength_label_weak: 'Faible',
    register_strength_label_good: 'Moyen',
    register_strength_label_strong: 'Fort',
    register_password_match_success: 'Les mots de passe correspondent.',
    register_password_match_error: 'Les mots de passe ne correspondent pas.',
    register_consent_error:
      'Vous devez accepter les conditions et la politique pour continuer.',
    register_alert_fill_fields: 'Remplissez tous les champs.',
    register_alert_valid_email: 'Saisissez une adresse courriel valide.',
    register_alert_password_length:
      'Le mot de passe doit contenir au moins 8 caractÃ¨res.',
    register_alert_password_strength:
      'CrÃ©ez un mot de passe fort et concordant.',
    region_us: 'Ã‰tats-Unis',
    region_ca: 'Canada',
    transactions_hero_title: 'ImpÃ´t estimÃ© dÃ» (YTD)',
    transactions_subline_label: 'Provision mensuelle suggÃ©rÃ©e :',
    transactions_hero_subline:
      'BasÃ© sur vos revenus moins vos dÃ©penses depuis le dÃ©but de lâ€™annÃ©e.',
    transactions_upsell_title: 'DÃ©verrouillez les estimations fiscales en temps rÃ©el',
    transactions_upsell_body:
      'Passez Ã  V1 pour voir lâ€™impÃ´t estimÃ© et la provision mensuelle.',
    transactions_upsell_cta: 'Passez Ã  V1',
    transactions_section_title: 'Transactions',
    transactions_section_description:
      'Cette page consigne lâ€™activitÃ© commerciale.',
    title_record_tx: 'Enregistrez une transaction',
    label_tx_type: 'Type de transaction',
    opt_expense: 'DÃ©pense',
    opt_income: 'Revenu',
    transaction_type_income: 'Revenu',
    transaction_type_expense: 'DÃ©pense',
    transaction_label_date: 'Date',
    transaction_label_description: 'Description',
    transaction_label_account: 'Compte',
    transaction_label_category: 'CatÃ©gorie',
    transaction_label_amount: 'Montant',
    transaction_button_save: 'Enregistrer la transaction',
    transactions_recorded: 'Transactions enregistrÃ©es',
    transactions_recorded_blurb:
      'Les transactions saisies apparaissent ici.',
    transactions_table_date: 'Date',
    transactions_table_description: 'Description',
    transactions_table_account: 'Compte',
    transactions_table_category: 'CatÃ©gorie',
    transactions_table_amount: 'Montant',
    transactions_kpi_total_income: 'Revenus totaux',
    transactions_kpi_total_expenses: 'Dépenses totales',
    transactions_kpi_net_profit: 'Bénéfice net',
    transactions_search_placeholder: 'Rechercher des transactions',
    transactions_filter_all_categories: 'Toutes les catégories',
    transactions_add_transaction_button: '+ Ajouter une transaction',
    transactions_intent_income: '+ Ajouter un revenu',
    transactions_intent_expense: '+ Ajouter une dépense',
    transactions_empty: 'Aucune transaction pour le moment.',
    receipts_title: 'ReÃ§us',
    receipts_description:
      'Vous pouvez tÃ©lÃ©verser des reÃ§us et les lier Ã  des transactions.',
    receipts_tier_notice_title:
      'Vous avez besoin de InEx Ledger V1 pour tÃ©lÃ©verser des reÃ§us.',
    receipts_tier_notice_cta: 'Passez Ã  V1',
    receipts_upload_legend: 'TÃ©lÃ©verser un reÃ§u',
    receipts_label_file: 'Fichier du reÃ§u',
    receipts_label_notes: 'Notes (facultatif)',
    receipts_button_upload: 'TÃ©lÃ©verser un reÃ§u',
    receipts_dropzone_message: 'Faites glisser le fichier du reçu ou cliquez pour le téléverser',
    receipts_uploaded_title: 'ReÃ§us tÃ©lÃ©versÃ©s',
    receipts_uploaded_blurb:
      'Les reÃ§us tÃ©lÃ©versÃ©s sont listÃ©s ici et peuvent Ãªtre liÃ©s Ã  des transactions.',
    receipts_table_filename: 'Fichier',
    receipts_table_uploaded: 'Date du tÃ©lÃ©versement',
    receipts_table_attached: 'LiÃ© Ã  une transaction',
    receipts_empty_title: 'Pas encore de reÃ§us',
    receipts_empty_body:
      'TÃ©lÃ©versez un reÃ§u et liez-le Ã  une transaction.',
    accounts_title: 'Comptes',
    accounts_description:
      'Lâ€™argent de votre entreprise vit ici. CrÃ©ez des comptes chÃ¨ques, Ã©pargne, espÃ¨ces ou crÃ©dit.',
    accounts_add: 'Ajouter un compte',
    accounts_form_legend: 'Ajouter un compte',
    accounts_label_name: 'Nom du compte',
    accounts_label_type: 'Type de compte',
    accounts_button_save: 'Enregistrer le compte',
    accounts_no_accounts: 'Pas encore de comptes. Ajoutez-en un.',
    accounts_in_use: 'Impossible de supprimer un compte utilisÃ©.',
    categories_title: 'CatÃ©gories',
    categories_description:
      'Organisez les transactions en revenus ou dÃ©penses pour des exports prÃ©cis.',
    categories_add: 'Ajouter une catÃ©gorie',
    categories_form_legend: 'Ajouter une catÃ©gorie',
    categories_label_name: 'Nom de la catÃ©gorie',
    categories_label_type: 'Type',
    categories_type_income: 'Revenu',
    categories_type_expense: 'Dépense',
    categories_button_save: 'Enregistrer la catÃ©gorie',
    categories_income_title: 'CatÃ©gories de revenu',
    categories_expense_title: 'CatÃ©gories de dÃ©pense',
    categories_no_income: 'Pas encore de catÃ©gories de revenu.',
    categories_no_expense: 'Pas encore de catÃ©gories de dÃ©pense.',
    categories_in_use:
      'Cette catÃ©gorie est utilisÃ©e et ne peut pas Ãªtre supprimÃ©e.',
    exports_title: 'Exports',
    exports_description:
      'Exportez vos dossiers pour rÃ©vision, dÃ©claration ou partage avec votre comptable.',
    exports_history_title: 'Historique des exports',
    exports_history_blurb:
      'Les exports gÃ©nÃ©rÃ©s pour lâ€™entreprise apparaissent ici.',
    exports_no_history: 'Pas encore dâ€™exports.',
    exports_history_range_label: 'PÃ©riode :',
    exports_history_exported_on: 'ExportÃ© le',
    exports_history_download_label: 'TÃ©lÃ©charger',
    exports_error_dates_required:
      'ComplÃ©tez une date de dÃ©but et de fin avant dâ€™exporter.',
    exports_error_dates_order:
      'La date de dÃ©but doit Ãªtre antÃ©rieure ou Ã©gale Ã  la date de fin.',
    exports_form_legend: 'Choisissez la pÃ©riode',
    exports_label_start: 'Date de dÃ©but',
    exports_label_end: 'Date de fin',
    exports_button_csv: 'Exporter CSV',
    mileage_title: 'Enregistrer un trajet',
    mileage_subtext_us: 'Utilisation des miles (par dÃ©faut aux Ã‰tats-Unis). Vous pouvez changer dans ParamÃ¨tres.',
    mileage_subtext_ca: 'Utilisation des kilomÃ¨tres (par dÃ©faut au Canada). Vous pouvez changer dans ParamÃ¨tres.',
    mileage_label_date: 'Date',
    mileage_label_purpose: 'Motif',
    mileage_label_destination_optional: 'Destination (facultatif)',
    mileage_label_miles: 'Miles',
    mileage_label_odo_start: 'OdomÃ¨tre dÃ©part',
    mileage_label_odo_end: 'OdomÃ¨tre fin',
    mileage_label_kilometers: 'KilomÃ¨tres',
    mileage_label_calc_km: 'Distance calculÃ©e : {{value}} km',
    mileage_table_date: 'Date',
    mileage_table_purpose: 'Motif',
    mileage_table_destination: 'Destination',
    mileage_table_miles: 'Miles',
    mileage_table_odo_start: 'OdomÃ¨tre dÃ©part',
    mileage_table_odo_end: 'OdomÃ¨tre fin',
    mileage_table_km: 'KilomÃ¨tres',
    mileage_table_actions: 'Actions',
    mileage_button_add: 'Ajouter un trajet',
    mileage_button_delete: 'Supprimer',
    mileage_error_required_fields: 'Date et motif sont requis.',
    mileage_error_miles_required: 'Saisissez le nombre de miles.',
    mileage_error_odometer_required: 'Indiquez des relevÃ©s d\'odomÃ¨tre valides.',
    mileage_error_odometer_order: 'L\'odomÃ¨tre final doit Ãªtre supÃ©rieur ou Ã©gal au dÃ©part.',
    mileage_empty: 'Aucun trajet enregistrÃ© pour le moment.',
    settings_title: 'ParamÃ¨tres',
    settings_business_title: 'Entreprise',
    settings_intro:
      'GÃ©rez votre entreprise, votre sÃ©curitÃ© et vos prÃ©fÃ©rences.',
    settings_link_business_profile: 'Profil entreprise',
    settings_link_security: 'SÃ©curitÃ©',
    settings_link_legal: 'Juridique et politiques',
    settings_tax_identifiers_title: 'Identifiants fiscaux',
    settings_ein_hint: 'L\'EIN (Etats-Unis) identifie votre entreprise pour les declarations fiscales.',
    settings_account_title: 'Compte',
    settings_sign_out: 'DÃ©connexion',
    settings_region_language_title: 'Langue et rÃ©gion',
    settings_detected_label: 'DÃ©tectÃ© comme :',
    settings_region_label: 'RÃ©gion',
    settings_language_label: 'Langue',
    settings_region_save_button: 'Enregistrer la rÃ©gion',
    settings_region_saved: 'RÃ©gion mise Ã  jour.',
    appearance_title: 'Apparence',
    settings_dark_mode_label: 'Mode sombre',
    appearance_toggle: 'Utiliser le mode clair',
    unit_metric_label: 'Utiliser le systÃ¨me mÃ©trique (kilomÃ¨tres)',
    unit_metric_help: 'Si dÃ©sactivÃ©, les distances sont enregistrÃ©es en miles.',
    settings_units_label: 'UnitÃ©s',
    settings_units_toggle_label: 'MÃ©trique (km) / ImpÃ©rial (mi)',
    privacy_title: 'ConfidentialitÃ©',
    privacy_download_button: 'TÃ©lÃ©charger mes donnÃ©es',
    privacy_opt_out_label: 'Refuser le partage des donnÃ©es',
    privacy_terms_accepted: 'Conditions acceptÃ©es :',
    status_yes: 'Oui',
    status_no: 'Non',
    settings_save_changes: 'Enregistrer les modifications',
    settings_changes_saved: 'ParamÃ¨tres enregistrÃ©s.',
    settings_business_ids_saved: 'Identifiants enregistrÃ©s',
    upgrade_title: 'Passez Ã  InEx Ledger V1',
    upgrade_free_heading: 'Passez Ã  InEx Ledger V1',
    upgrade_free_intro:
      'Ajoutez les fonctionnalitÃ©s premium dont vous avez besoin pour garder les livres propres.',
    upgrade_benefit_receipts: 'ReÃ§us',
    upgrade_benefit_csv: 'Exports CSV',
    upgrade_benefit_filters: 'Filtres de date',
    upgrade_benefit_recurring: 'Transactions rÃ©currentes',
    upgrade_benefit_tax: 'Estimations fiscales en temps rÃ©el',
    upgrade_cta: 'Voir les options de souscription',
    upgrade_v1_banner_title: 'Vous Ãªtes sur InEx Ledger V1.',
    upgrade_v1_banner_body:
      'Les prochaines versions ajouteront une synchronisation bancaire optionnelle et des automatisations plus intelligentes.',
    upgrade_footer_note: 'InEx Ledger - V1 Beta - 2026',
    subscription_title: 'Abonnement'
  }
};
