"use strict";
/**
 * i18nFix.js — applies all i18n corrections to public/js/i18n.js
 *
 * Issues fixed:
 *  EN: add missing keys transactions_type_income / transactions_type_expense
 *  ES: untranslated "Basic" → "Básico" everywhere; missing accents in onboarding_guide_*,
 *      settings_tips_*, subscription_pro_badge; two drift-fix typos
 *  FR: untranslated "Basic" → "Basique" everywhere; missing accents in onboarding guide,
 *      onboarding_step_4, onboarding_guide_step_prefix, settings_tips_*, settings_ein_hint,
 *      exports_history_deleted drift fix
 */

const fs = require("fs");
const path = require("path");

const filePath = path.resolve(__dirname, "../public/js/i18n.js");
let src = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

// Helper: replace exactly one occurrence; throws if not found or ambiguous
function r(from, to) {
  const idx = src.indexOf(from);
  if (idx === -1) throw new Error("PATTERN NOT FOUND:\n" + from.slice(0, 120));
  const second = src.indexOf(from, idx + 1);
  if (second !== -1) throw new Error("PATTERN NOT UNIQUE:\n" + from.slice(0, 120));
  src = src.slice(0, idx) + to + src.slice(idx + from.length);
}

// ── EN: add missing keys after transaction_type_expense ───────────────────
r(
  `    transaction_type_income: 'Income',
    transaction_type_expense: 'Expense',`,
  `    transaction_type_income: 'Income',
    transaction_type_expense: 'Expense',
    transactions_type_income: 'Income',
    transactions_type_expense: 'Expense',`
);

// ── ES: add missing keys ──────────────────────────────────────────────────
r(
  `    transaction_type_income: 'Ingreso',
    transaction_type_expense: 'Gasto',`,
  `    transaction_type_income: 'Ingreso',
    transaction_type_expense: 'Gasto',
    transactions_type_income: 'Ingreso',
    transactions_type_expense: 'Gasto',`
);

// ── ES: subscription_pro_badge missing accent ─────────────────────────────
r(`subscription_pro_badge: 'Mas popular',`, `subscription_pro_badge: 'Más popular',`);

// ── ES: "Basic" → "Básico" everywhere in es block ────────────────────────
r(`    subscription_starter_title: 'Basic',
    subscription_starter_price: '$0 / mes',
    subscription_starter_1: 'Libro básico',
    subscription_starter_2: 'Hasta 50 transacciones / mes',
    subscription_starter_3: 'Exportación CSV',
    subscription_starter_note: 'Incluye un negocio. Puedes volver a Basic en cualquier momento.',
    subscription_starter_cta: 'Seleccionar Basic',`,
  `    subscription_starter_title: 'Básico',
    subscription_starter_price: '$0 / mes',
    subscription_starter_1: 'Libro básico',
    subscription_starter_2: 'Hasta 50 transacciones / mes',
    subscription_starter_3: 'Exportación CSV',
    subscription_starter_note: 'Incluye un negocio. Puedes volver a Básico en cualquier momento.',
    subscription_starter_cta: 'Seleccionar Básico',`
);

r(`    subscription_free_confirm_title: '¿Cambiar a Basic?',
    subscription_free_confirm_body_generic: 'Este negocio pasará a Basic.',
    subscription_free_confirm_body_trial: 'Cambiar a Basic terminará ahora la prueba Pro de este negocio.',
    subscription_free_confirm_body_paid: 'Cambiar a Basic detendrá la renovación. Mantendrás el acceso Pro hasta {date}.',
    subscription_free_confirm_action: 'Confirmar Basic',
    subscription_free_selection_success: 'Se guardó la selección de Basic.',
    subscription_free_pending: 'Basic programado',`,
  `    subscription_free_confirm_title: '¿Cambiar a Básico?',
    subscription_free_confirm_body_generic: 'Este negocio pasará a Básico.',
    subscription_free_confirm_body_trial: 'Cambiar a Básico terminará ahora la prueba Pro de este negocio.',
    subscription_free_confirm_body_paid: 'Cambiar a Básico detendrá la renovación. Mantendrás el acceso Pro hasta {date}.',
    subscription_free_confirm_action: 'Confirmar Básico',
    subscription_free_selection_success: 'Se guardó la selección de Básico.',
    subscription_free_pending: 'Básico programado',`
);

r(`    sub_mgmt_badge_free: 'Basic',
    sub_mgmt_badge_canceling: 'Cancelando',`,
  `    sub_mgmt_badge_free: 'Básico',
    sub_mgmt_badge_canceling: 'Cancelando',`
);

r(`    sub_mgmt_free_desc: 'Estás en el plan Basic.',`, `    sub_mgmt_free_desc: 'Estás en el plan Básico.',`);

// ── ES: onboarding_guide_* missing accents ────────────────────────────────
r(
  `    onboarding_intro_guided: 'Cuentanos lo basico y te guiaremos por la configuracion inicial.',`,
  `    onboarding_intro_guided: 'Cuéntanos lo básico y te guiaremos por la configuración inicial.',`
);
r(
  `    onboarding_guide_kicker: 'Configuracion de cuenta nueva',`,
  `    onboarding_guide_kicker: 'Configuración de cuenta nueva',`
);
r(
  `    onboarding_guide_back: 'Atras',`,
  `    onboarding_guide_back: 'Atrás',`
);
r(
  `    onboarding_guide_skip: 'Omitir configuracion',`,
  `    onboarding_guide_skip: 'Omitir configuración',`
);
r(
  `    onboarding_guide_categories_title: 'Agrega algunas categorias primero',`,
  `    onboarding_guide_categories_title: 'Agrega algunas categorías primero',`
);
r(
  `    onboarding_guide_categories_body: 'Empieza con las categorias de ingresos y gastos que mas usaras al principio.',`,
  `    onboarding_guide_categories_body: 'Empieza con las categorías de ingresos y gastos que más usarás al principio.',`
);
r(
  `    onboarding_guide_categories_point_1: 'Agrega solo las categorias que realmente usaras ahora.',`,
  `    onboarding_guide_categories_point_1: 'Agrega solo las categorías que realmente usarás ahora.',`
);
r(
  `    onboarding_guide_categories_point_2: 'Podras ajustarlas o ampliar la lista cuando entren transacciones reales.',`,
  `    onboarding_guide_categories_point_2: 'Podrás ajustarlas o ampliar la lista cuando entren transacciones reales.',`
);
r(
  `    onboarding_guide_categories_helper: 'Intenta crear dos o tres categorias practicas y luego continua.',`,
  `    onboarding_guide_categories_helper: 'Intenta crear dos o tres categorías prácticas y luego continúa.',`
);
r(
  `    onboarding_guide_categories_add: 'Agregar categoria',`,
  `    onboarding_guide_categories_add: 'Agregar categoría',`
);
r(
  `    onboarding_guide_accounts_body: 'Configura las cuentas bancarias, tarjetas, efectivo o prestamos donde caeran tus transacciones.',`,
  `    onboarding_guide_accounts_body: 'Configura las cuentas bancarias, tarjetas, efectivo o préstamos donde caerán tus transacciones.',`
);
r(
  `    onboarding_guide_accounts_point_2: 'Usa nombres claros para que la conciliacion sea mas facil despues.',`,
  `    onboarding_guide_accounts_point_2: 'Usa nombres claros para que la conciliación sea más fácil después.',`
);
r(
  `    onboarding_guide_transactions_helper: 'Despues de agregar algunas operaciones, finaliza la configuracion y sigue desde el libro diario.',`,
  `    onboarding_guide_transactions_helper: 'Después de agregar algunas operaciones, finaliza la configuración y sigue desde el libro diario.',`
);
r(
  `    onboarding_guide_transactions_add: 'Agregar transaccion',`,
  `    onboarding_guide_transactions_add: 'Agregar transacción',`
);

// ── ES: settings_tips missing accents ────────────────────────────────────
r(
  `    settings_tips_title: 'Reiniciar configuracion guiada',`,
  `    settings_tips_title: 'Reiniciar configuración guiada',`
);
r(
  `    settings_tips_desc: 'Restablece el recorrido de categorias, cuentas, transacciones y consejos de las paginas.',`,
  `    settings_tips_desc: 'Restablece el recorrido de categorías, cuentas, transacciones y consejos de las páginas.',`
);

// ── ES: drift fix typos ───────────────────────────────────────────────────
r(
  `    exports_history_delete_error: 'No se pudo eliminar la exportacion.',`,
  `    exports_history_delete_error: 'No se pudo eliminar la exportación.',`
);
r(
  `    exports_history_deleted: 'Exportacion eliminada.',`,
  `    exports_history_deleted: 'Exportación eliminada.',`
);

// ── FR: add missing keys ──────────────────────────────────────────────────
r(
  `    transaction_type_income: 'Revenu',
    transaction_type_expense: 'Dépense',`,
  `    transaction_type_income: 'Revenu',
    transaction_type_expense: 'Dépense',
    transactions_type_income: 'Revenu',
    transactions_type_expense: 'Dépense',`
);

// ── FR: "Basic" → "Basique" everywhere in fr block ───────────────────────
r(
  `    subscription_starter_title: 'Basic',
    subscription_starter_price: '0 $ / mois',`,
  `    subscription_starter_title: 'Basique',
    subscription_starter_price: '0 $ / mois',`
);

r(
  `    subscription_starter_note: 'Une entreprise incluse. Vous pouvez revenir à Basic à tout moment.',
    subscription_starter_cta: 'Choisir Basic',`,
  `    subscription_starter_note: 'Une entreprise incluse. Vous pouvez revenir à Basique à tout moment.',
    subscription_starter_cta: 'Choisir Basique',`
);

// Split into individual lines due to curly apostrophes (U+2019) in body_trial and body_paid
r(
  `    subscription_free_confirm_title: 'Passer à Basic ?',`,
  `    subscription_free_confirm_title: 'Passer à Basique ?',`
);
r(
  `    subscription_free_confirm_body_generic: 'Cette entreprise passera à Basic.',`,
  `    subscription_free_confirm_body_generic: 'Cette entreprise passera à Basique.',`
);
r(
  `    subscription_free_confirm_body_trial: 'Passer à Basic mettra fin immédiatement à l’essai Pro pour cette entreprise.',`,
  `    subscription_free_confirm_body_trial: 'Passer à Basique mettra fin immédiatement à l’essai Pro pour cette entreprise.',`
);
r(
  `    subscription_free_confirm_body_paid: 'Passer à Basic arrêtera le renouvellement. Vous conserverez l’accès Pro jusqu’au {date}.',`,
  `    subscription_free_confirm_body_paid: 'Passer à Basique arrêtera le renouvellement. Vous conserverez l’accès Pro jusqu’au {date}.',`
);
r(
  `    subscription_free_confirm_action: 'Confirmer Basic',`,
  `    subscription_free_confirm_action: 'Confirmer Basique',`
);
r(
  `    subscription_free_selection_success: 'La sélection Basic a été enregistrée.',`,
  `    subscription_free_selection_success: 'La sélection Basique a été enregistrée.',`
);
r(
  `    subscription_free_pending: 'Basic programmé',`,
  `    subscription_free_pending: 'Basique programmé',`
);

r(
  `    sub_mgmt_badge_free: 'Basic',
    sub_mgmt_badge_canceling: 'Annulation',`,
  `    sub_mgmt_badge_free: 'Basique',
    sub_mgmt_badge_canceling: 'Annulation',`
);

r(`    sub_mgmt_free_desc: 'Vous êtes sur le plan Basic.',`, `    sub_mgmt_free_desc: 'Vous êtes sur le plan Basique.',`);

// ── FR: onboarding_step_4 missing accent ─────────────────────────────────
r(
  `    onboarding_step_4: 'Configuration guidee',`,
  `    onboarding_step_4: 'Configuration guidée',`
);

// ── FR: onboarding_guide_step_prefix missing accent ──────────────────────
r(
  `    onboarding_guide_step_prefix: 'Etape',`,
  `    onboarding_guide_step_prefix: 'Étape',`
);

// ── FR: onboarding_guide_* missing accents ────────────────────────────────
r(
  `    onboarding_guide_categories_title: 'Ajoutez d abord quelques categories',`,
  `    onboarding_guide_categories_title: 'Ajoutez d\'abord quelques catégories',`
);
r(
  `    onboarding_guide_categories_body: 'Commencez par les categories de revenus et de depenses que vous utiliserez le plus souvent.',`,
  `    onboarding_guide_categories_body: 'Commencez par les catégories de revenus et de dépenses que vous utiliserez le plus souvent.',`
);
r(
  `    onboarding_guide_categories_point_1: 'Ajoutez seulement les categories dont vous avez besoin maintenant.',`,
  `    onboarding_guide_categories_point_1: 'Ajoutez seulement les catégories dont vous avez besoin maintenant.',`
);
r(
  `    onboarding_guide_categories_point_2: 'Vous pourrez affiner ou elargir la liste apres vos vraies transactions.',`,
  `    onboarding_guide_categories_point_2: 'Vous pourrez affiner ou élargir la liste après vos vraies transactions.',`
);
r(
  `    onboarding_guide_categories_helper: 'Creez deux ou trois categories utiles, puis continuez.',`,
  `    onboarding_guide_categories_helper: 'Créez deux ou trois catégories utiles, puis continuez.',`
);
r(
  `    onboarding_guide_categories_add: 'Ajouter une categorie',`,
  `    onboarding_guide_categories_add: 'Ajouter une catégorie',`
);
r(
  `    onboarding_guide_accounts_body: 'Configurez les comptes bancaires, cartes, especes ou prets ou vos transactions doivent etre enregistrees.',`,
  `    onboarding_guide_accounts_body: 'Configurez les comptes bancaires, cartes, espèces ou prêts où vos transactions doivent être enregistrées.',`
);
r(
  `    onboarding_guide_transactions_title: 'Enregistrez vos premieres transactions',`,
  `    onboarding_guide_transactions_title: 'Enregistrez vos premières transactions',`
);
r(
  `    onboarding_guide_transactions_body: 'Une fois les categories et les comptes en place, saisissez quelques operations reelles pour demarrer proprement.',`,
  `    onboarding_guide_transactions_body: 'Une fois les catégories et les comptes en place, saisissez quelques opérations réelles pour démarrer proprement.',`
);
r(
  `    onboarding_guide_transactions_point_1: 'Essayez d ajouter au moins un revenu et une depense.',`,
  `    onboarding_guide_transactions_point_1: 'Essayez d\'ajouter au moins un revenu et une dépense.',`
);
r(
  `    onboarding_guide_transactions_point_2: 'Choisissez le bon compte et la bonne categorie pour chaque ecriture afin de garder des rapports propres.',`,
  `    onboarding_guide_transactions_point_2: 'Choisissez le bon compte et la bonne catégorie pour chaque écriture afin de garder des rapports propres.',`
);
r(
  `    onboarding_guide_transactions_helper: 'Apres quelques ecritures, terminez la configuration et continuez depuis le grand livre.',`,
  `    onboarding_guide_transactions_helper: 'Après quelques écritures, terminez la configuration et continuez depuis le grand livre.',`
);

// ── FR: settings_tips missing accents ────────────────────────────────────
r(
  `    settings_tips_title: 'Redemarrer la configuration guidee',`,
  `    settings_tips_title: 'Redémarrer la configuration guidée',`
);
r(
  `    settings_tips_desc: 'Reinitialise le parcours des categories, des comptes, des transactions et les conseils des pages.',`,
  `    settings_tips_desc: 'Réinitialise le parcours des catégories, des comptes, des transactions et les conseils des pages.',`
);
r(
  `    settings_tips_cta: 'Redemarrer le parcours',`,
  `    settings_tips_cta: 'Redémarrer le parcours',`
);

// ── FR: settings_ein_hint missing accents ────────────────────────────────
r(
  `    settings_ein_hint: 'L\\'EIN (Etats-Unis) identifie votre entreprise pour les declarations fiscales.',`,
  `    settings_ein_hint: 'L\\'EIN (États-Unis) identifie votre entreprise pour les déclarations fiscales.',`
);

// ── FR: drift fix typo ───────────────────────────────────────────────────
r(
  `    exports_history_deleted: 'Exportation supprimee.',`,
  `    exports_history_deleted: 'Exportation supprimée.',`
);

fs.writeFileSync(filePath, src, "utf8");
console.log("✅ All fixes applied successfully.");
