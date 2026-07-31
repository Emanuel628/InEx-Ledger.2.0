"use strict";

const { findDefaultCategoryForRegion } = require("../api/utils/seedDefaultsForBusiness.js");
const { normalizeRuleValue } = require("./transactionMappingRuleService.js");
const { isAmbiguousRetailerText } = require("./merchantCategorizationBlocklists.js");

const MAX_HISTORY_ROWS = 4000;

// Degree-of-certainty gate for keyword-rule auto-mapping. A rule's score is a
// weighted count of keyword/provider-hint hits (see scoreRule): a single-word
// merchant-field hit scores 3, a multi-word merchant-field hit scores 4, and
// so on. MIN_SCORE_TO_AUTO_MAP is the floor a rule must clear before its
// category guess is ever applied — anything weaker is left for manual review
// (via the Imported fallback) instead of guessing. HIGH/MEDIUM_CONFIDENCE_SCORE
// only label how sure the applied guess is; they don't gate whether it applies.
const MIN_SCORE_TO_AUTO_MAP = 3;
const HIGH_CONFIDENCE_SCORE = 6;
const MEDIUM_CONFIDENCE_SCORE = 4;
const IMPORTED_CATEGORY_NAMES = {
  income: "Imported Income",
  expense: "Imported Expense"
};
const LOW_SIGNAL_HISTORY_KEYS = new Set([
  "payment",
  "deposit",
  "purchase",
  "transfer",
  "withdrawal",
  "debit",
  "credit",
  "online payment",
  "card payment",
  "bank transfer",
  "direct deposit",
  "thank you"
]);

const REVIEW_ONLY_PATTERNS = [
  /\bonline payment thank you\b/i,
  /\bcredit card payment\b/i,
  /\btransfer (to|from)\b/i,
  /\bpayment to card\b/i,
  /\bloan\b/i,
  /\baffirm\b/i,
  /\bafterpay\b/i,
  /\bklarna\b/i,
  /\bpayroll\b/i,
  /\bsalary\b/i,
  /\badp\b/i,
  /\bpaychex\b/i,
  /\birs tax refund\b/i,
  /\bcra tax refund\b/i,
  /\bcash[- ]back\b/i,
  /\bredemption\b/i,
  // Owner/shareholder equity movements are neither revenue nor an operating
  // expense -- they're capital activity. Guessing a P&L category for them
  // misstates the business's actual income and expenses.
  /\bowners? draw\b/i,
  /\bowner('?s)? contribution\b/i,
  /\bcapital contribution\b/i,
  /\bmember draw\b/i,
  /\bshareholder loan\b/i
];

// A refund, reversal, or chargeback is an adjustment to a PRIOR transaction,
// not a new independent event -- the merchant/description keyword rules that
// correctly categorize an original purchase or payout are not evidence about
// what a *reversal* of one should be. A positive amount from an expense
// merchant (e.g. "Home Depot Refund") must not become sales revenue just
// because it's a positive number; a reversed payout must not re-trigger the
// same income keyword that mapped the original payout. Route all of these to
// review with an accurate reason instead of guessing -- correlating a refund
// back to its original transaction's category is a real improvement but
// isn't reliable from text alone, so review is the honest fallback.
const REFUND_REVERSAL_PATTERNS = [
  /\brefund\b/i,
  /\breversal\b/i,
  /\breversed\b/i,
  /\bcredit memo\b/i,
  /\bchargeback\b/i,
  /\breturned payment\b/i,
  /\bpayment returned\b/i,
  /\breturned customer payment\b/i
];

// Broad government/tax descriptors are ambiguous by nature -- "IRS payment"
// alone could be personal or corporate income tax, a payroll-tax remittance,
// a penalty, an estimated-tax payment, or something else entirely. Guessing
// any single category for these is a confidently wrong answer. Only wording
// specific enough to identify a real, distinct business expense (business
// license, permit fee, property tax, vehicle registration -- see the Sales
// Tax / Business Tax & Licenses keyword lists) is allowed to auto-map.
const GOVERNMENT_TAX_AMBIGUOUS_PATTERNS = [
  /\birs\b/i,
  /\bcra\b/i,
  /\btreasury\b/i,
  /\brevenue canada\b/i,
  /\brevenu canada\b/i,
  /\brevenue department\b/i,
  /\bdepartment of revenue\b/i,
  /\bgovernment payment\b/i,
  /\bgovernment fee\b/i,
  /\bgovernment of canada\b/i,
  /\btax payment\b/i,
  /\btax remittance\b/i,
  /\bestimated tax\b/i
];

// Sales tax / GST / HST collected from customers and remitted to the
// government is money the business held in trust, not a deductible
// operating expense -- auto-mapping it to an expense category (e.g. "Sales
// Tax") would misstate it as ordinary P&L activity. This app has no
// liability-account concept to record it correctly, so even this
// unambiguous wording is preserved for review rather than guessed at.
const TAX_LIABILITY_REMITTANCE_PATTERNS = [
  /\bsales tax remittance\b/i,
  /\bgst payment\b/i,
  /\bhst payment\b/i,
  /\bgst\/hst payment\b/i,
  /\bgst remittance\b/i,
  /\bhst remittance\b/i
];

// A card issuer's name on a bank feed is virtually always a payment *to* the
// card (a transfer, not an expense), an interest/fee line, or -- rarely -- a
// branded café. None of those are Car & Truck, Software, or any other
// expense category, which is exactly how "Capital One Mobile Payment" used
// to score Car & Truck (see the `mobil` substring fix above): the issuer name
// alone shouldn't compete in keyword scoring at all. Require the issuer name
// AND a payment/autopay idiom together (rather than the issuer name alone)
// so this never hijacks a genuinely different rule, like "TD Insurance" /
// "RBC Insurance" / "BMO Insurance" business insurance products sold by the
// same banks' insurance arms. That AND requirement is exactly what makes it
// safe to include bare "td"/"rbc"/"bmo" tickers below (real statement text
// often reads "RBC BILL PAYMENT" with no "Royal Bank" spelled out) -- the
// ticker alone never fires without a payment idiom alongside it.
const CARD_ISSUER_PATTERNS = [
  /\bcapital ?one\b/i,
  /\bcap one\b/i,
  /\bchase\b/i,
  /\bjpmorgan chase\b/i,
  /\bamerican ?express\b/i,
  /\bamex\b/i,
  /\bciti(bank)?\b/i,
  /\bbank of america\b/i,
  /\bwells fargo\b/i,
  /\bdiscover card\b/i,
  /\bbarclaycard\b/i,
  /\bsynchrony\b/i,
  /\btd\b/i,
  /\brbc\b/i,
  /\bscotiabank\b/i,
  /\bbmo\b/i,
  /\bcibc\b/i,
  /\bus bank\b/i,
  /\bpnc bank\b/i
];

const CARD_PAYMENT_IDIOM_PATTERNS = [
  /\bautopay\b/i,
  /\bauto[ -]pay\b/i,
  /\bmobile payment\b/i,
  /\bmobile pmt\b/i,
  /\be[ -]?pay(ment)?\b/i,
  /\bweb pay\b/i,
  /\bcrd (cr )?payment\b/i,
  /\bcrd pmt\b/i,
  /\bcredit crd\b/i,
  /\bcrcard\b/i,
  /\bonline banking payment\b/i,
  /\bpre-?authorized\b/i,
  /\bpad payment\b/i,
  /\bthank you\b/i,
  /\bpayment\b/i,
  /\bpymt\b/i,
  /\bpmt\b/i
];

// P2P transfers (Interac e-Transfer, Zelle, Venmo) are frequently owner
// transfers, family/friends money, or unverified client payments on a small
// business feed -- not confirmed service revenue. Auto-posting them as
// Service Income inflates revenue, which is a real books error, not a
// convenience. Route them to review instead of guessing.
const INCOME_REVIEW_ONLY_PATTERNS = [
  /\binterac e[- ]?transfer\b/i,
  /\bzelle\b/i,
  /\bvenmo\b/i,
  /\bsettlement deposit\b/i
];

const CATEGORY_RULES = [
  {
    // Deliberately excludes bare processor names ("stripe", "paypal",
    // "square") and "billable" -- a payment processor's name alone doesn't
    // say whether the line is revenue, a processing fee, or a payout; the
    // more specific "X payout" keywords under Sales Revenue below carry the
    // real signal. "Billable" is generic invoice/memo language, not a
    // reliable income signal on its own.
    kind: "income",
    usCategory: "Service Income",
    caCategory: "Service Income",
    keywords: [
      "consulting fee", "consultant fee", "service fee", "freelance fee", "retainer fee",
      "project fee", "direct deposit client"
    ],
    providerHints: ["income", "service", "professional_services", "business_services"]
  },
  {
    kind: "income",
    usCategory: "Sales Revenue",
    caCategory: "Sales Revenue",
    keywords: [
      "shopify", "amazon seller", "etsy", "ebay sale", "point of sale", "store sale",
      "retail sale", "sales receipt", "product sale", "merchant payout",
      "stripe payout", "square payout", "paypal payout", "sq payout",
      "bulk sales", "sales payout", "order payout", "shop payout"
    ],
    providerHints: ["general_merchandise", "shopping", "retail", "sales"]
  },
  {
    kind: "income",
    usCategory: "Interest Income",
    caCategory: "Other Income",
    keywords: ["interest paid", "interest income", "bank interest", "savings interest"],
    providerHints: ["interest"]
  },
  {
    kind: "expense",
    usCategory: "Advertising & Marketing",
    caCategory: "Advertising",
    keywords: [
      "google ads", "google adwords", "facebook ads", "meta ads", "instagram ads",
      "tiktok ads", "linkedin ads", "bing ads", "mailchimp", "klaviyo",
      "activecampaign", "ad spend"
    ],
    providerHints: ["advertising", "marketing"]
  },
  {
    kind: "expense",
    usCategory: "Software & Subscriptions",
    caCategory: "Software & Subscriptions",
    keywords: [
      "adobe", "adobe systems", "photoshop", "github", "slack", "zoom", "dropbox",
      "google workspace", "notion", "figma", "canva", "aws", "digitalocean",
      "cloudflare", "twilio", "sendgrid", "openai", "chatgpt", "anthropic",
      "shopify"
    ],
    providerHints: ["software", "internet_software", "digital_goods"]
  },
  {
    kind: "expense",
    usCategory: "Phone & Internet",
    caCategory: "Phone & Internet",
    keywords: [
      "rogers", "bell canada", "telus", "fido", "koodo", "shaw", "videotron",
      "at&t", "att wireless", "verizon", "t-mobile", "tmobile", "comcast",
      "xfinity", "spectrum", "cox communication", "google fi", "internet service",
      "wireless service", "cell phone"
    ],
    providerHints: ["telecom", "utilities"]
  },
  {
    kind: "expense",
    usCategory: "Insurance",
    caCategory: "Insurance",
    keywords: [
      "allstate", "state farm", "geico", "progressive", "farmers insurance",
      "liberty mutual", "usaa", "intact insurance", "co-operators", "aviva",
      "insurance premium", "insurance payment"
    ],
    providerHints: ["insurance"]
  },
  {
    // Deliberately excludes general-merchandise/big-box retailers (Walmart,
    // Target, Costco, Canadian Tire, dollar stores, Best Buy, IKEA, London
    // Drugs, etc.) — same reasoning as Amazon.com elsewhere in this file:
    // these sell literally everything, so a purchase there is exactly as
    // likely to be personal (groceries, a TV) as a business supply run.
    // Guessing "Office Supplies" for a Walmart trip is a wrong, overconfident
    // answer, not a helpful one — leave those in Imported for manual review.
    // True hardware/home-improvement stores go to Repairs & Maintenance
    // instead (see below), since that's their more realistic business use.
    kind: "expense",
    usCategory: "Office Supplies",
    caCategory: "Office Supplies",
    keywords: [
      "staples", "office depot", "officemax", "uline", "printer ink", "printer paper",
      "stationery", "toner cartridge", "office supplies"
    ],
    providerHints: ["office_supplies"]
  },
  {
    // "restaurant"/"coffee"/"cafe"/"pizza"/"burger"/"meal"/"dining" are real
    // signal when they're literally in the merchant's own name (a business
    // called "Tony's Pizza" almost certainly is one) but too soft to trust
    // from the description alone, where a bank/Plaid category_guess hint
    // could otherwise combine with a bare mention to clear the auto-map
    // floor on very little real evidence. merchantOnlyKeywords below strips
    // their description-field credit while leaving merchant-field matches
    // (and all the named brands/multi-word phrases) untouched.
    kind: "expense",
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "restaurant", "coffee", "cafe", "pizza", "burger",
      "uber eats", "ubereats", "doordash", "skip the dishes", "grubhub",
      "client lunch", "business lunch", "meal", "dining"
    ],
    merchantOnlyKeywords: new Set(["restaurant", "coffee", "cafe", "pizza", "burger", "meal", "dining"]),
    providerHints: ["food", "restaurant", "dining"]
  },
  {
    kind: "expense",
    usCategory: "Travel",
    caCategory: "Travel",
    keywords: [
      "airbnb", "marriott", "hilton", "hyatt", "westjet", "air canada",
      "american airlines", "delta air", "united airlines", "expedia", "booking.com",
      "kayak", "hotel", "airfare", "flight", "business trip", "conference travel"
    ],
    providerHints: ["travel", "lodging", "airfare", "transportation"]
  },
  {
    // Bare "gas"/"fuel" are merchant-only for the same reason as the soft
    // Meals words above: real signal if it's the merchant's own name, too
    // soft to trust from the description alone.
    kind: "expense",
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "shell", "shell oil", "chevron", "esso", "petro canada", "gas station", "fuel", "gas",
      "jiffy lube", "valvoline", "autozone", "napa auto", "parking meter", "parking lot",
      "auto repair", "oil change"
    ],
    merchantOnlyKeywords: new Set(["gas", "fuel"]),
    providerHints: ["automotive", "gas", "fuel", "vehicle"]
  },
  {
    kind: "expense",
    usCategory: "Legal & Professional",
    caCategory: "Legal & Accounting Fees",
    keywords: [
      "accounting fee", "bookkeeping", "bookkeeper", "cpa fee", "lawyer fee",
      "legal fee", "professional fee", "law firm", "attorney", "accountant", "notary"
    ],
    providerHints: ["legal", "accounting", "professional_services"]
  },
  {
    // CA has no dedicated subcontract-labour line in the seeded chart, and
    // filing Upwork/Fiverr-style contractor payments under "Legal &
    // Accounting Fees" is a false categorization for T2125-style reporting.
    // "Other Expense" is the closest correct seeded bucket until a dedicated
    // category exists.
    kind: "expense",
    usCategory: "Contract Labor",
    caCategory: "Other Expense",
    keywords: [
      "upwork", "toptal", "99designs", "freelance payment", "contractor payment",
      "subcontractor", "contract labor"
    ],
    providerHints: ["contractor", "freelance", "labor"]
  },
  {
    kind: "expense",
    usCategory: "Bank Fees",
    caCategory: "Interest & Bank Charges",
    keywords: [
      "bank fee", "service fee", "monthly fee", "nsf fee", "overdraft fee",
      "wire fee", "atm fee"
    ],
    providerHints: ["bank_fees", "fees"]
  },
  {
    kind: "expense",
    usCategory: "Rent",
    caCategory: "Rent",
    keywords: ["monthly rent", "office rent"],
    providerHints: ["rent"]
  },
  {
    kind: "expense",
    usCategory: "Utilities",
    caCategory: "Utilities",
    keywords: [
      "hydro", "bc hydro", "enbridge", "atco gas", "fortis", "epcor", "alectra",
      "electric utility", "natural gas utility", "water utility", "sewage"
    ],
    providerHints: ["utilities", "electric", "water", "gas"]
  },
  {
    kind: "expense",
    // Deliberately excludes bare government/tax-authority mentions ("irs",
    // "cra", "revenue canada", "tax payment", "dmv", ...) and tax-remittance
    // wording ("sales tax remittance", "gst/hst payment") -- see
    // GOVERNMENT_TAX_AMBIGUOUS_PATTERNS and TAX_LIABILITY_REMITTANCE_PATTERNS
    // above for why those are routed to review instead of auto-mapped here.
    // Only wording specific enough to identify a real, distinct deductible
    // expense (a license, a permit, a property tax bill, a registration fee)
    // is trusted to auto-map.
    usCategory: "Sales Tax",
    caCategory: "Business Tax & Licenses",
    keywords: [
      "business license", "permit fee", "service ontario", "service canada",
      "property tax"
    ],
    providerHints: ["tax", "government"]
  }
];

const CATEGORY_RULE_EXPANSIONS = [
  {
    // Interac e-Transfer / Zelle / Venmo / settlement deposits are handled by
    // INCOME_REVIEW_ONLY_PATTERNS above (routed to review, not auto-mapped
    // here as Service Income) -- see that constant's comment for why.
    usCategory: "Service Income",
    caCategory: "Service Income",
    keywords: ["professional service income", "service income", "client fee"]
  },
  {
    // Bare "square" and the "sq " stub were dropped: fragile single-token
    // matches on a payment processor's name alone don't say whether a line is
    // revenue, a fee, or a subscription charge. "square payout" above already
    // covers the case that actually means revenue.
    usCategory: "Sales Revenue",
    caCategory: "Sales Revenue",
    keywords: ["shopify payments", "payment processor deposit"]
  },
  {
    usCategory: "Advertising & Marketing",
    caCategory: "Advertising",
    keywords: [
      "twitter ads", "x ads", "pinterest ads", "snapchat ads", "youtube ads",
      "constant contact", "hootsuite", "buffer", "sprout social", "semrush", "ahrefs"
    ]
  },
  {
    usCategory: "Software & Subscriptions",
    caCategory: "Software & Subscriptions",
    keywords: [
      "microsoft 365", "microsoft office", "amazon web services", "azure", "heroku",
      "google one", "hubspot", "salesforce", "quickbooks", "xero", "freshbooks",
      "wave apps", "wix", "squarespace", "godaddy", "namecheap", "membership renewal",
      "annual subscription", "monthly subscription"
    ]
  },
  {
    usCategory: "Phone & Internet",
    caCategory: "Phone & Internet",
    keywords: [
      "virgin mobile", "freedom mobile", "eastlink", "centurylink", "frontier comm",
      "windstream", "mint mobile", "visible wireless", "cellular service",
      "business internet", "business phone"
    ]
  },
  {
    usCategory: "Insurance",
    caCategory: "Insurance",
    keywords: [
      "nationwide ins", "aetna", "blue cross", "cigna", "united health", "sun life",
      "manulife", "canada life", "desjardins ins", "td insurance", "rbc insurance",
      "bmo insurance"
    ]
  },
  {
    usCategory: "Office Supplies",
    caCategory: "Office Supplies",
    keywords: [
      "office supply", "supplies restock", "office paper", "grand & toy",
      "bureau en gros", "reliable office supplies"
    ]
  },
  {
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "team lunch", "team dinner", "working lunch", "working dinner", "networking lunch",
      "breakfast meeting", "dinner meeting", "tim horton", "a&w restaurant", "harvey's",
      "boston pizza", "pizza pizza", "cactus club", "white spot", "swiss chalet", "the keg"
    ]
  },
  {
    usCategory: "Travel",
    caCategory: "Travel",
    keywords: [
      "southwest air", "spirit air", "jetblue", "frontier airlines", "alaska airlines",
      "porter airlines", "flair airlines", "sunwing", "holiday inn", "hampton inn",
      "doubletree", "residence inn", "best western", "motel 6", "super 8 motel", "comfort inn",
      "hotels.com", "priceline", "travelocity", "amtrak", "via rail", "greyhound bus",
      "lyft", "yellow cab", "taxicab", "rideshare", "airport parking"
    ]
  },
  {
    // "circle k", "wawa", and "kwik trip" removed -- convenience-store chains
    // where gas (if sold at all) is secondary; see AMBIGUOUS_RETAILERS. "mobil"
    // stays a real fuel-brand keyword, but only ever matches as an exact
    // token (see COMPACT_MATCH_DENYLIST) so it can't fire on "mobile"/
    // "T-Mobile"/"Capital One Mobile Payment".
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "bp gas station", "exxon", "mobil", "sunoco", "marathon gas", "speedway gas",
      "pilot flying", "loves travel stop", "petrocan",
      "husky gas", "ultramar", "irving oil", "advance auto",
      "o'reilly auto", "oreilly auto", "midas", "meineke", "firestone", "goodyear",
      "pep boys", "car wash"
    ]
  },
  {
    usCategory: "Legal & Professional",
    caCategory: "Legal & Accounting Fees",
    keywords: [
      "legal and accounting", "legal & accounting", "year-end bookkeeping",
      "quarterly bookkeeping", "monthly bookkeeping", "attorney fees", "lawyer",
      "cpa firm"
    ]
  },
  {
    usCategory: "Contract Labor",
    caCategory: "Other Expense",
    keywords: ["fiverr"]
  },
  {
    usCategory: "Bank Fees",
    caCategory: "Interest & Bank Charges",
    keywords: [
      "bank service fee", "banking fee", "account service fee", "monthly banking",
      "bank maintenance", "account maintenance fee", "service charge", "wire transfer fee",
      "foreign transaction", "returned item", "account fee", "stop payment fee", "insufficient funds"
    ]
  },
  {
    usCategory: "Rent",
    caCategory: "Rent",
    keywords: ["apartment rent"]
  },
  {
    usCategory: "Utilities",
    caCategory: "Utilities",
    keywords: ["union gas", "pge", "con edison", "national grid", "garbage collect"]
  },
  {
    usCategory: "Sales Tax",
    caCategory: "Business Tax & Licenses",
    keywords: ["vehicle registration"]
  }
];

CATEGORY_RULE_EXPANSIONS.forEach((expansion) => {
  const rule = CATEGORY_RULES.find((candidate) =>
    candidate.usCategory === expansion.usCategory &&
    candidate.caCategory === expansion.caCategory
  );
  if (rule) {
    rule.keywords.push(...expansion.keywords);
  }
});

// Major US/Canada brand coverage. These are the household names a first-time
// CSV import is most likely to contain, so getting them right up front is
// what actually reduces manual review volume for a new user's first import.
const MAJOR_BRAND_EXPANSIONS = [
  {
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "starbucks", "mcdonalds", "mcdonald's", "burger king", "wendys", "wendy's",
      "taco bell", "kfc", "kentucky fried chicken", "popeyes", "chick fil a", "chickfila",
      "subway", "chipotle", "panera", "panera bread", "dunkin", "dunkin donuts",
      "dairy queen", "sonic drive in", "jack in the box", "arbys", "hardees", "carls jr",
      "in n out", "five guys", "shake shack", "wingstop", "panda express",
      "jimmy johns", "jersey mikes", "firehouse subs", "qdoba", "del taco", "whataburger",
      "culvers", "raising canes", "olive garden", "applebees", "chilis",
      "outback steakhouse", "texas roadhouse", "red lobster", "ihop", "dennys",
      "waffle house", "cracker barrel", "buffalo wild wings", "papa johns",
      "dominos pizza", "little caesars", "pizza hut", "cold stone creamery",
      "baskin robbins", "krispy kreme", "peets coffee", "caribou coffee",
      "jamba juice", "smoothie king", "einstein bros bagels", "noodles company",
      "mr sub", "st hubert", "st-hubert", "m&m food market", "moxies", "milestones",
      "jack astors", "montanas", "kelseys", "east side marios", "freshii",
      "booster juice", "second cup", "coffee time", "country style", "robins donuts",
      "new york fries", "browns socialhouse", "original joe's", "joey restaurant",
      "coras breakfast", "eggsmart", "chatime", "wok box", "pita pit", "extreme pita"
    ]
  },
  {
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "76 gas station", "arco", "valero",
      "sams club fuel", "costco gas", "sinclair oil", "conoco", "phillips 66 gas",
      "co op gas", "coop gas", "mohawk gas", "fas gas", "canadian tire gas"
    ]
  },
  {
    usCategory: "Travel",
    caCategory: "Travel",
    keywords: [
      "uber", "orbitz", "tripadvisor", "vrbo", "sheraton", "ramada", "days inn",
      "la quinta", "red roof inn", "extended stay america", "choice hotels", "wyndham",
      "radisson", "fairmont hotel", "four seasons hotel", "delta hotels", "sunwing vacations",
      "westjet vacations", "greyhound", "national car rental", "alamo rent a car",
      "thrifty car rental", "budget rent a car", "enterprise rent a car", "hertz",
      "avis rent a car", "turo", "discount car rental"
    ]
  },
  {
    usCategory: "Software & Subscriptions",
    caCategory: "Software & Subscriptions",
    keywords: [
      "apple.com bill", "itunes", "google play", "gitlab", "bitbucket", "atlassian",
      "jira software", "zendesk", "intercom", "freshdesk", "docusign", "calendly",
      "asana", "trello", "monday.com", "1password", "lastpass", "nordvpn", "expressvpn",
      "midjourney", "canva pro", "box.com", "intuit", "adobe creative cloud"
    ]
  },
  {
    usCategory: "Advertising & Marketing",
    caCategory: "Advertising",
    keywords: [
      "yelp ads", "angi ads", "thumbtack", "mailerlite", "vistaprint",
      "google local services ads"
    ]
  },
  {
    usCategory: "Insurance",
    caCategory: "Insurance",
    keywords: [
      "hartford insurance", "chubb insurance", "travelers insurance", "hiscox",
      "next insurance", "biberk", "belairdirect", "economical insurance", "wawanesa"
    ]
  },
  {
    usCategory: "Phone & Internet",
    caCategory: "Phone & Internet",
    keywords: [
      "sprint", "cricket wireless", "boost mobile", "metropcs", "metro pcs",
      "us cellular", "consumer cellular", "chatr mobile", "public mobile", "lucky mobile"
    ]
  },
  {
    usCategory: "Utilities",
    caCategory: "Utilities",
    keywords: [
      "duke energy", "dominion energy", "xcel energy", "southern california edison",
      "pacific gas and electric", "pepco", "georgia power", "florida power light",
      "eversource", "ameren", "entergy", "nrg energy", "direct energy", "txu energy",
      "reliant energy", "hydro one", "hydro quebec", "saskpower", "manitoba hydro",
      "nova scotia power", "newfoundland power", "enmax", "toronto hydro"
    ]
  },
  {
    usCategory: "Contract Labor",
    caCategory: "Other Expense",
    keywords: ["freelancer.com", "guru.com"]
  }
];

MAJOR_BRAND_EXPANSIONS.forEach((expansion) => {
  const rule = CATEGORY_RULES.find((candidate) =>
    candidate.usCategory === expansion.usCategory &&
    candidate.caCategory === expansion.caCategory
  );
  if (rule) {
    rule.keywords.push(...expansion.keywords);
  }
});

CATEGORY_RULES.push({
  kind: "expense",
  usCategory: "Supplies",
  caCategory: "Delivery & Freight",
  keywords: [
    "fedex", "ups store", "ups shipping", "usps", "dhl", "canada post",
    "purolator", "canpar", "loomis express", "postage", "courier service"
  ],
  providerHints: ["shipping", "postage", "delivery"]
});

CATEGORY_RULES.push({
  // Hardware/home-improvement/tool retailers: a small business's realistic
  // use case for these stores is repairs, tools, and maintenance supplies,
  // not general office supplies — a distinct category from Office Supplies.
  kind: "expense",
  usCategory: "Repairs & Maintenance",
  caCategory: "Repairs & Maintenance",
  keywords: [
    "home depot", "lowes", "rona", "home hardware", "ace hardware",
    "true value hardware", "menards", "do it best", "harbor freight tools",
    "princess auto", "tsc stores", "repair service", "maintenance fee", "handyman service",
    "grainger", "global industrial", "msc industrial", "fastenal", "mcmaster carr"
  ],
  providerHints: ["repair", "maintenance", "hardware"]
});

// Second, larger coverage pass. Same rule: only unambiguous, clearly-business
// merchants get added — nothing here is the kind of place (groceries, general
// e-commerce) where a purchase could as easily be personal as business. That
// judgment call is what keeps the "Amazon.com" and "Costco" (bare, no aisle
// context) cases out of this list even though they're major brands.
const EXTENDED_BRAND_EXPANSIONS = [
  {
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "zaxbys", "bojangles", "churchs chicken", "el pollo loco", "long john silvers",
      "captain ds", "rallys", "checkers drive in", "white castle", "steak n shake",
      "fatburger", "wahlburgers", "smashburger", "freddys frozen custard", "culvers",
      "portillos", "pf changs", "cheesecake factory", "red robin", "tgi fridays",
      "ruby tuesday", "bob evans", "perkins restaurant", "village inn", "golden corral",
      "shoneys", "sizzler", "black angus steakhouse", "longhorn steakhouse",
      "bonefish grill", "carrabbas", "bahama breeze", "yard house", "bj's restaurant",
      "california pizza kitchen", "noodles and company", "chuys", "el torito",
      "baja fresh", "wahoos fish taco", "rubios", "corner bakery", "au bon pain",
      "pret a manger", "cosi", "potbelly", "which wich", "mcalisters deli",
      "schlotzskys", "blimpie", "quiznos", "togos", "beavertails", "mucho burrito",
      "manchu wok", "yogen fruz", "menchies", "marble slab creamery"
    ]
  },
  {
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "citgo",
      "discount tire", "big o tires", "les schwab", "mavis tire",
      "christian brothers automotive", "monro auto", "tires plus", "brakes plus",
      "tuffy auto", "grease monkey", "take 5 oil change", "kal tire", "ok tire",
      "mr lube", "active green ross", "speedy auto"
    ]
  },
  {
    usCategory: "Travel",
    caCategory: "Travel",
    keywords: [
      "sun country airlines", "breeze airways", "avelo airlines", "lynx air",
      "sixt rent a car", "zipcar", "silvercar", "drury hotels", "omni hotels",
      "loews hotels", "kimpton hotels", "st regis", "ritz carlton", "sonesta",
      "aloft hotels", "element hotels", "tru by hilton", "home2 suites",
      "candlewood suites", "staybridge suites", "homeaway", "agoda", "trivago",
      "skyscanner", "getaround", "park n fly", "407 etr", "sunpass", "fastrak",
      "ez pass", "e zpass"
    ]
  },
  {
    usCategory: "Software & Subscriptions",
    caCategory: "Software & Subscriptions",
    keywords: [
      "pipedrive", "clickup", "airtable", "miro", "loom", "zapier", "integromat",
      "make.com", "n8n.io", "segment", "mixpanel", "amplitude", "moz", "screaming frog",
      "later app", "sketch app", "invision", "webflow", "bigcommerce", "woocommerce",
      "magento", "netsuite", "workday hcm", "zoho", "zoho books", "zoho crm",
      "cisco webex", "gotomeeting", "ringcentral", "8x8", "vonage business",
      "grasshopper", "openphone", "aircall", "front app", "help scout", "livechat",
      "drift chat", "tidio", "crisp chat", "wistia", "descript", "otter.ai",
      "grammarly", "envato", "shutterstock", "getty images", "adobe stock", "istock",
      "bluehost", "hostgator", "siteground", "dreamhost", "wp engine", "kinsta",
      "vercel", "netlify", "render.com", "linode", "vultr", "google cloud platform",
      "ibm cloud", "bench accounting", "pilot.com bookkeeping"
      // Fintech expense-card/spend-management brands (Ramp, Brex, Divvy,
      // Bill.com, Expensify, Airbase) deliberately excluded: the card network
      // or platform name on a line doesn't say what was actually purchased --
      // same false-confidence problem as mapping "Capital One" to a spending
      // category.
    ]
  },
  {
    usCategory: "Advertising & Marketing",
    caCategory: "Advertising",
    keywords: [
      "taboola", "outbrain", "reddit ads", "nextdoor ads", "yext", "brightlocal",
      "podium", "birdeye", "omnisend", "sendinblue", "brevo", "drip email",
      "convertkit", "aweber", "getresponse", "campaign monitor", "icontact"
    ]
  },
  {
    usCategory: "Insurance",
    caCategory: "Insurance",
    keywords: [
      "american family insurance", "erie insurance", "auto owners insurance",
      "amica insurance", "metlife", "prudential insurance", "new york life",
      "northwestern mutual", "guardian life", "mutual of omaha", "colonial life",
      "aflac", "cna insurance", "zurich insurance", "aig insurance", "markel insurance",
      "beazley", "vouch insurance", "coalition insurance", "embroker",
      "definity insurance", "gore mutual", "peace hills insurance", "sonnet insurance",
      "td meloche monnex", "square one insurance"
    ]
  },
  {
    usCategory: "Phone & Internet",
    caCategory: "Phone & Internet",
    keywords: [
      "google fiber", "ziply fiber", "optimum altice", "rcn internet", "wow internet",
      "mediacom", "hargray", "tds telecom", "consolidated communications",
      "distributel", "teksavvy", "start.ca", "execulink", "cogeco"
    ]
  },
  {
    // Grainger/Fastenal/MSC Industrial/McMaster-Carr/Global Industrial moved
    // to Repairs & Maintenance below -- industrial MRO suppliers, not office
    // stationery (Schedule C "Office expense" is the wrong line for them).
    usCategory: "Office Supplies",
    caCategory: "Office Supplies",
    keywords: ["quill.com"]
  },
  {
    usCategory: "Utilities",
    caCategory: "Utilities",
    keywords: [
      "pseg", "avista utilities", "puget sound energy", "portland general electric",
      "idaho power", "tucson electric", "salt river project", "aps arizona public service",
      "el paso electric", "oncor", "centerpoint energy", "aep american electric power",
      "firstenergy", "ppl electric", "peco energy", "delmarva power", "bge baltimore gas",
      "consumers energy", "dte energy", "we energies", "alliant energy",
      "midamerican energy", "black hills energy", "hydro ottawa", "london hydro",
      "waterloo north hydro", "horizon utilities", "fortis alberta", "atco electric",
      "saskenergy", "just energy"
    ]
  },
  {
    usCategory: "Contract Labor",
    caCategory: "Other Expense",
    keywords: ["peopleperhour", "workmarket", "contra.com", "braintrust"]
  },
  {
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "wingstreet", "hooters", "twin peaks restaurant", "dave and busters",
      "chuck e cheese", "ihop express", "waffle house", "huddle house",
      "cracker barrel old country store", "boston market", "kfc canada",
      "a and w canada", "razzles", "dickeys barbecue pit", "sonny's bbq",
      "famous daves", "hard rock cafe", "rainforest cafe"
    ]
  },
  {
    usCategory: "Software & Subscriptions",
    caCategory: "Software & Subscriptions",
    keywords: [
      "typeform", "surveymonkey", "docsend", "pandadoc", "hellosign",
      "adobe sign", "smartsheet", "basecamp", "teamwork.com", "wrike",
      "float.com scheduling", "harvest time tracking", "toggl track", "clockify"
    ]
  },
  {
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "flying j travel", "ta travel centers", "petro stopping center",
      "wilco hess", "sheetz fuel"
    ]
  },
  {
    usCategory: "Legal & Professional",
    caCategory: "Legal & Accounting Fees",
    keywords: [
      "rocket lawyer", "legalzoom", "avvo", "clio legal", "mycase", "practicepanther",
      "lawpay", "upcounsel", "contractscounsel", "nolo.com"
    ]
  },
  {
    usCategory: "Rent",
    caCategory: "Rent",
    keywords: ["wework", "regus", "industrious coworking", "spaces coworking", "servcorp", "novel coworking", "common desk"]
  },
  {
    usCategory: "Sales Tax",
    caCategory: "Business Tax & Licenses",
    keywords: [
      "secretary of state filing fee", "business license renewal",
      "delaware franchise tax", "corporate registry fee", "wsib premium",
      "workers compensation board", "ei premium remittance", "cpp remittance"
    ]
  },
  {
    usCategory: "Supplies",
    caCategory: "Delivery & Freight",
    keywords: [
      "ontrac", "lasership", "estes express", "old dominion freight", "xpo logistics",
      "yrc freight", "r+l carriers", "saia ltl", "abf freight"
    ]
  },
  {
    usCategory: "Bank Fees",
    caCategory: "Interest & Bank Charges",
    keywords: [
      "returned check fee", "cashiers check fee", "money order fee",
      "safety deposit box fee", "clover processing", "toast pos fee", "helcim",
      "moneris", "global payments", "worldpay", "authorize.net", "elavon", "bambora"
    ]
  }
];

EXTENDED_BRAND_EXPANSIONS.forEach((expansion) => {
  const rule = CATEGORY_RULES.find((candidate) =>
    candidate.usCategory === expansion.usCategory &&
    candidate.caCategory === expansion.caCategory
  );
  if (rule) {
    rule.keywords.push(...expansion.keywords);
  }
});

function normalizeMappingText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\b(checkcard|pos|debit|credit|purchase|payment|online|withdrawal|transfer)\b/g, " ")
    .replace(/[#*x]{1,}\d+/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isImportedPlaceholderCategory(name) {
  return /^(imported income|imported expense)$/i.test(String(name || "").trim());
}

function isLowSignalHistoryKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return true;
  if (normalized.length < 5) return true;
  return LOW_SIGNAL_HISTORY_KEYS.has(normalized);
}

function buildCategoryLookup(categories = []) {
  const lookup = new Map();
  for (const category of categories) {
    if (!category?.id || !category?.name || !category?.kind) continue;
    const key = `${String(category.kind).toLowerCase()}::${String(category.name).trim().toLowerCase()}`;
    lookup.set(key, category);
  }
  return lookup;
}

function buildRuleIndex(rules = []) {
  const index = new Map();
  for (const rule of rules) {
    if (!rule?.category_name || !rule?.transaction_kind || !rule?.match_field || !rule?.match_value_normalized) continue;
    const key = `${String(rule.transaction_kind).toLowerCase()}::${String(rule.match_field).toLowerCase()}::${String(rule.match_value_normalized).trim()}`;
    index.set(key, rule);
  }
  return index;
}

function recordHistorySignal(targetMap, key, categoryName, kind) {
  if (!key || !categoryName || !kind) return;
  const scopedKey = `${kind}::${key}`;
  const bucket = targetMap.get(scopedKey) || new Map();
  bucket.set(categoryName, (bucket.get(categoryName) || 0) + 1);
  targetMap.set(scopedKey, bucket);
}

// A single past transaction is not a pattern -- it's one guess (possibly the
// user's own mistake, or a bad auto-map they never noticed) getting replayed
// forever on every future import of that merchant/description. Require at
// least two consistent prior assignments before history is trusted enough to
// drive a new categorization.
const MIN_HISTORY_WINNER_COUNT = 2;

function selectHistoryWinner(bucket) {
  if (!bucket || bucket.size === 0) return null;
  const ranked = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
  const [winnerName, winnerCount] = ranked[0];
  if (winnerCount < MIN_HISTORY_WINNER_COUNT) return null;
  const runnerUpCount = ranked[1]?.[1] || 0;
  if (runnerUpCount > 0 && winnerCount < runnerUpCount * 1.5) return null;
  return winnerName;
}

function buildHistoryIndex(rows = []) {
  const merchantHistory = new Map();
  const descriptionHistory = new Map();

  for (const row of rows) {
    const kind = String(row?.category_kind || "").toLowerCase();
    if (!row?.category_name || isImportedPlaceholderCategory(row.category_name)) continue;
    if (kind !== "income" && kind !== "expense") continue;
    const merchantKey = normalizeMappingText(row.merchant_name);
    const descriptionKey = normalizeMappingText(row.description);
    // Ambiguous multi-product retailers never get to teach the categorizer
    // through history either -- otherwise one wrong (or merely convenient)
    // save on a Walmart/Costco/7-Eleven-class merchant would silently
    // reinforce itself on every later import. An explicit saved mapping rule
    // is still the way to override these merchants on purpose.
    const isAmbiguousRetailer = isAmbiguousRetailerText(row.merchant_name, row.description);
    if (!isAmbiguousRetailer && !isLowSignalHistoryKey(merchantKey)) {
      recordHistorySignal(merchantHistory, merchantKey, row.category_name, kind);
    }
    if (!isAmbiguousRetailer && !isLowSignalHistoryKey(descriptionKey)) {
      recordHistorySignal(descriptionHistory, descriptionKey, row.category_name, kind);
    }
  }

  return { merchantHistory, descriptionHistory };
}

function pickRuleCategoryName(rule, region) {
  return String(region || "").toUpperCase() === "CA" ? rule.caCategory : rule.usCategory;
}

function resolveCanonicalCategoryTemplate(name, kind, region) {
  const matchedDefault = findDefaultCategoryForRegion(region, name, kind);
  if (matchedDefault) {
    return {
      color: matchedDefault.color || null,
      tax_map_us: matchedDefault.tax_map_us || null,
      tax_map_ca: matchedDefault.tax_map_ca || null
    };
  }

  const normalizedRegion = String(region || "").toUpperCase() === "CA" ? "CA" : "US";
  if (kind === "income") {
    return normalizedRegion === "CA"
      ? { color: "slate", tax_map_us: null, tax_map_ca: "other_income" }
      : { color: "slate", tax_map_us: "other_income", tax_map_ca: null };
  }

  return normalizedRegion === "CA"
    ? { color: "slate", tax_map_us: null, tax_map_ca: "other_expense" }
    : { color: "slate", tax_map_us: "other_expense", tax_map_ca: null };
}

function getImportedFallbackCategoryName(kind) {
  return kind === "income" ? IMPORTED_CATEGORY_NAMES.income : IMPORTED_CATEGORY_NAMES.expense;
}

function categoryExists(categoryLookup, kind, name) {
  return categoryLookup.has(`${kind}::${String(name || "").trim().toLowerCase()}`);
}

// Below this length, a keyword's despaced form is common enough to turn up
// by pure accident inside an unrelated word (e.g. "irs" inside "first", "cra"
// inside "aircraft", "gas" inside "Vegas", "esso" inside "espresso", "xero"
// inside "Xerox", "shaw" inside "shawarma", "att" inside "attorney", "mobil"
// inside "mobile"/"T-Mobile"). Below this floor we require a real word-boundary
// match (see containsTokenPhrase) instead of a raw substring scan; at or above
// it, a despaced/no-space substring match (for merchant text like "HOMEDEPOT"
// or "UBEREATS" that ran two keyword words together) is specific enough to
// trust without word boundaries.
const COMPACT_MATCH_MIN_LENGTH = 5;

// Single-word keywords whose despaced form is at or above
// COMPACT_MATCH_MIN_LENGTH but is still dangerously likely to appear inside
// an unrelated compound word -- "mobil" (meant for Exxon Mobil) is exactly
// 5 letters, so it slips through the compact-match floor and matches inside
// "mobile"/"T-Mobile"/"Capital One Mobile Payment". These keywords are only
// ever allowed to match as an exact whole token (see containsTokenPhrase),
// never via the no-space substring fallback.
const COMPACT_MATCH_DENYLIST = new Set(["mobil"]);

function tokenize(normalizedText) {
  return normalizedText ? normalizedText.split(" ").filter(Boolean) : [];
}

function containsTokenPhrase(textTokens, keywordTokens) {
  if (!keywordTokens.length || keywordTokens.length > textTokens.length) return false;
  for (let start = 0; start <= textTokens.length - keywordTokens.length; start++) {
    let matched = true;
    for (let offset = 0; offset < keywordTokens.length; offset++) {
      if (textTokens[start + offset] !== keywordTokens[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function normalizedContains(textTokens, compactText, keyword) {
  const normalizedKw = normalizeMappingText(keyword);
  if (!normalizedKw) return false;
  const keywordTokens = normalizedKw.split(" ").filter(Boolean);
  if (containsTokenPhrase(textTokens, keywordTokens)) return true;
  if (keywordTokens.length === 1 && COMPACT_MATCH_DENYLIST.has(keywordTokens[0])) return false;
  const compactKw = normalizedKw.replace(/\s+/g, "");
  return compactKw.length >= COMPACT_MATCH_MIN_LENGTH && compactText.includes(compactKw);
}

// A rule's score is the strongest single keyword hit it earns, not the sum
// of every keyword that happens to match. Summing let a handful of soft,
// unrelated words each add their own points and rack up a confidently-wrong
// score (e.g. a description containing "food", "meal", and "dining"
// separately used to out-score a real brand match) -- taking the max means
// a rule needs one genuinely strong signal, not a pile of weak ones.
//
// Provider-hint metadata (the bank/Plaid category_guess) is kept entirely
// separate from that keyword score: it earns at most one capped bonus
// (never one bonus per matching hint), and -- critically -- that bonus is
// only ever added on top of an already-independently-qualifying keyword
// score for the auto-map *decision* (see keywordScore vs score below). A
// provider hint can raise confidence once a rule already qualifies, or
// break a near-tie between two plausible rules, but it can never by itself
// (or combined with a single weak description-only word) manufacture a
// score that crosses the auto-map floor -- that would let a noisy bank
// category label auto-map a transaction with no real merchant/description
// evidence at all.
function scoreRule(rule, { merchantTokens, compactMerchant, descTokens, compactDescFull, providerHintText }) {
  let merchantBest = 0;
  let descBest = 0;
  let merchantStrong = false;
  const merchantOnly = rule.merchantOnlyKeywords;

  for (const keyword of rule.keywords || []) {
    const isMultiWord = keyword.includes(" ");
    const merchantHit = normalizedContains(merchantTokens, compactMerchant, keyword);
    if (merchantHit) {
      merchantBest = Math.max(merchantBest, isMultiWord ? 4 : 3);
      merchantStrong = true;
      continue;
    }
    // A handful of single-word keywords (soft meal words like "coffee"/
    // "pizza", or bare "gas"/"fuel") are real signal when they're the
    // merchant's own name, but too soft to trust from the description alone
    // -- a description-only hit combined with a provider-hint bonus could
    // otherwise clear the auto-map floor on very little evidence. These are
    // flagged per-rule via merchantOnlyKeywords and simply don't earn
    // description-field credit.
    if (merchantOnly && merchantOnly.has(keyword)) continue;
    if (normalizedContains(descTokens, compactDescFull, keyword)) {
      descBest = Math.max(descBest, isMultiWord ? 3 : 2);
    }
  }

  const keywordScore = Math.max(merchantBest, descBest);
  const providerHintMatched = (rule.providerHints || []).some((hint) => providerHintText.includes(hint));
  const hintBonus = providerHintMatched ? 2 : 0;

  return { score: keywordScore + hintBonus, keywordScore, merchantStrong };
}

function createTransactionCategorizer({ categories = [], region = "US", historyRows = [], mappingRules = [] } = {}) {
  const categoryLookup = buildCategoryLookup(categories);
  const { merchantHistory, descriptionHistory } = buildHistoryIndex(historyRows);
  const ruleIndex = buildRuleIndex(mappingRules);

  return function categorizeTransaction({
    type,
    description,
    merchantName,
    categoryGuess
  } = {}) {
    const kind = String(type || "").toLowerCase() === "income" ? "income" : "expense";
    const rawDescription = String(description || "");
    const rawMerchant = String(merchantName || "");
    const merchantKey = normalizeMappingText(rawMerchant);
    const descriptionKey = normalizeMappingText(rawDescription);
    const merchantRuleKey = normalizeRuleValue(rawMerchant);
    const descriptionRuleKey = normalizeRuleValue(rawDescription);
    const categoryGuessKey = normalizeRuleValue(categoryGuess);
    const haystack = `${rawMerchant} ${rawDescription} ${String(categoryGuess || "")}`.toLowerCase();
    const normalizedMerchant = normalizeMappingText(rawMerchant);
    const compactMerchant = normalizedMerchant.replace(/\s+/g, "");
    const merchantTokens = tokenize(normalizedMerchant);
    // Keyword matching only ever looks at the merchant and description fields
    // -- never categoryGuess. That field carries the bank/Plaid raw guess,
    // which is meant to inform providerHintText (below) through a dedicated,
    // narrower hint check; feeding its free text into the same keyword
    // matcher as the description let a bank label like "Food and Drink" fire
    // the same noisy single-word keywords a real description would.
    const normalizedDescFull = normalizeMappingText(`${rawMerchant} ${rawDescription}`);
    const compactDescFull = normalizedDescFull.replace(/\s+/g, "");
    const descTokens = tokenize(normalizedDescFull);
    const providerHintText = normalizeMappingText(categoryGuess);

    const explicitRule =
      ruleIndex.get(`${kind}::merchant_name::${merchantKey}`)
      || ruleIndex.get(`${kind}::merchant_name::${merchantRuleKey}`)
      || ruleIndex.get(`${kind}::category_guess::${categoryGuessKey}`)
      || ruleIndex.get(`${kind}::description::${descriptionKey}`)
      || ruleIndex.get(`${kind}::description::${descriptionRuleKey}`);
    if (explicitRule?.category_name && categoryExists(categoryLookup, kind, explicitRule.category_name)) {
      return {
        categoryName: explicitRule.category_name,
        reason: "mapping_rule",
        confidence: "high",
        ruleId: explicitRule.id || null
      };
    }

    // A refund/reversal/chargeback is an adjustment to a PRIOR transaction,
    // not new independent evidence -- checked before history or keyword
    // scoring so neither can use the original merchant's usual category (or
    // an income-side keyword an unrelated reversal happens to contain) to
    // guess at what is fundamentally a different kind of line. This also
    // covers the common case where a positive refund of an expense purchase
    // gets typed as "income" purely by sign, which would otherwise search
    // the wrong kind's history/rules entirely. Not kind-gated: a refund can
    // land on either side depending on how the bank/CSV signed it.
    if (REFUND_REVERSAL_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "refund_reversal_review",
        confidence: "low"
      };
    }

    // Ambiguous multi-product retailers (Walmart, Target, Costco, Sam's,
    // Canadian Tire, Best Buy, IKEA, and convenience-store/fuel hybrids like
    // 7-Eleven, Circle K, Wawa) never get an auto-mapped category or a
    // learned-history category -- only an explicit saved mapping rule (above)
    // can route them anywhere but Imported. A purchase at any of these is as
    // likely to be personal as business, so guessing is a confidently wrong
    // answer. The exception is an unambiguous fuel purchase (e.g. "Costco
    // Gas", "Sheetz Fuel"), which is allowed to fall through to normal scoring.
    if (kind === "expense" && isAmbiguousRetailerText(rawMerchant, rawDescription)) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "ambiguous_retailer",
        confidence: "low"
      };
    }

    const learnedMerchantCategory = selectHistoryWinner(merchantHistory.get(`${kind}::${merchantKey}`));
    if (learnedMerchantCategory && categoryExists(categoryLookup, kind, learnedMerchantCategory)) {
      return { categoryName: learnedMerchantCategory, reason: "merchant_history", confidence: "high" };
    }

    const learnedDescriptionCategory = selectHistoryWinner(descriptionHistory.get(`${kind}::${descriptionKey}`));
    if (learnedDescriptionCategory && categoryExists(categoryLookup, kind, learnedDescriptionCategory)) {
      return { categoryName: learnedDescriptionCategory, reason: "description_history", confidence: "medium" };
    }

    if (REVIEW_ONLY_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "review_only_pattern",
        confidence: "low"
      };
    }

    if (
      kind === "expense"
      && CARD_ISSUER_PATTERNS.some((pattern) => pattern.test(haystack))
      && CARD_PAYMENT_IDIOM_PATTERNS.some((pattern) => pattern.test(haystack))
    ) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "card_issuer_payment",
        confidence: "low"
      };
    }

    if (kind === "income" && INCOME_REVIEW_ONLY_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "p2p_review_pattern",
        confidence: "low"
      };
    }

    if (kind === "expense" && TAX_LIABILITY_REMITTANCE_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "tax_liability_review",
        confidence: "low"
      };
    }

    if (kind === "expense" && GOVERNMENT_TAX_AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return {
        categoryName: getImportedFallbackCategoryName(kind),
        reason: "government_tax_review",
        confidence: "low"
      };
    }

    let best = null;
    let secondBestScore = 0;
    for (const rule of CATEGORY_RULES) {
      if (rule.kind !== kind) continue;
      const { score, keywordScore, merchantStrong } = scoreRule(rule, { merchantTokens, compactMerchant, descTokens, compactDescFull, providerHintText });
      if (!best || score > best.score) {
        secondBestScore = best?.score || 0;
        best = { rule, score, keywordScore, merchantStrong };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    // A rule only gets to auto-map a category if its KEYWORD-ONLY score
    // (merchant or description evidence, before any provider-hint bonus)
    // clears this floor on its own, AND the full score (keyword + hint)
    // clearly beats every other rule (no near-ties). Gating on keywordScore
    // rather than the hint-inflated score is what keeps a provider hint from
    // ever manufacturing an auto-map by itself, or by combining with a
    // single weak description-only word -- the hint can still raise
    // confidence (see below) or help break a tie once a rule already
    // qualifies, but it can't be the reason a rule qualifies in the first
    // place. Below the floor, or in a near-tie between two plausible
    // categories, we don't guess — the transaction stays in the Imported
    // bucket for manual review instead of risking a confidently-wrong
    // category on a weak signal.
    const meetsConfidenceThreshold = best
      && best.keywordScore >= MIN_SCORE_TO_AUTO_MAP
      && best.score > secondBestScore;

    if (meetsConfidenceThreshold) {
      const categoryName = pickRuleCategoryName(best.rule, region);
      // A canonical rule's category name has to actually exist on this
      // business before it's applied. Categories are seeded once at signup;
      // if the business renamed or deleted the seeded category since then,
      // blindly returning the canonical name would either resurrect a
      // deleted category via auto-create or collide with a renamed chart of
      // accounts. Fall back to Imported instead.
      if (!categoryExists(categoryLookup, kind, categoryName)) {
        return {
          categoryName: getImportedFallbackCategoryName(kind),
          reason: "fallback_imported",
          confidence: "low"
        };
      }
      return {
        categoryName,
        reason: "canonical_rule",
        confidence: best.score >= HIGH_CONFIDENCE_SCORE
          ? "high"
          : best.score >= MEDIUM_CONFIDENCE_SCORE
            ? "medium"
            : "low"
      };
    }

    return {
      categoryName: getImportedFallbackCategoryName(kind),
      reason: "fallback_imported",
      confidence: "low"
    };
  };
}

async function buildBusinessTransactionCategorizer(pool, { businessId, region = "US" } = {}) {
  const [categoriesResult, historyResult, rulesResult] = await Promise.all([
    pool.query(
      `SELECT id, name, kind, color, tax_map_us, tax_map_ca, is_active
         FROM categories
        WHERE business_id = $1
          AND is_active = true`,
      [businessId]
    ),
    pool.query(
      `SELECT t.category_id,
              c.name AS category_name,
              c.kind AS category_kind,
              t.description,
              t.merchant_name
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1
          AND t.deleted_at IS NULL
          AND t.category_id IS NOT NULL
          AND c.is_active = true
          AND (
            COALESCE(t.import_source, '') = ''
            OR t.review_status IN ('ready', 'matched', 'locked')
          )
        ORDER BY t.date DESC, t.created_at DESC
        LIMIT $2`,
      [businessId, MAX_HISTORY_ROWS]
    ),
    pool.query(
      `SELECT r.id,
              r.transaction_kind,
              r.match_field,
              r.match_value_normalized,
              c.name AS category_name
         FROM transaction_mapping_rules r
         JOIN categories c ON c.id = r.category_id
        WHERE r.business_id = $1
          AND c.is_active = true`,
      [businessId]
    )
  ]);

  return createTransactionCategorizer({
    categories: categoriesResult.rows,
    region,
    historyRows: historyResult.rows,
    mappingRules: rulesResult.rows
  });
}

module.exports = {
  buildBusinessTransactionCategorizer,
  createTransactionCategorizer,
  resolveCanonicalCategoryTemplate,
  getImportedFallbackCategoryName,
  __private: {
    normalizeMappingText,
    buildHistoryIndex,
    selectHistoryWinner,
    buildCategoryLookup,
    buildRuleIndex
  }
};
