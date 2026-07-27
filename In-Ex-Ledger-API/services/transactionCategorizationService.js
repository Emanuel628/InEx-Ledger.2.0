"use strict";

const { findDefaultCategoryForRegion } = require("../api/utils/seedDefaultsForBusiness.js");
const { normalizeRuleValue } = require("./transactionMappingRuleService.js");

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
  /\bloan payment\b/i,
  /\baffirm\b/i,
  /\bafterpay\b/i,
  /\bklarna\b/i,
  /\bpayroll\b/i,
  /\bsalary\b/i,
  /\badp\b/i,
  /\bpaychex\b/i,
  /\birs tax refund\b/i,
  /\bcra tax refund\b/i,
  /\bcash back\b/i,
  /\bredemption\b/i
];

const CATEGORY_RULES = [
  {
    kind: "income",
    usCategory: "Service Income",
    caCategory: "Service Income",
    keywords: [
      "consulting fee", "consultant fee", "service fee", "freelance fee", "retainer fee",
      "project fee",
      "stripe", "paypal", "square", "direct deposit client", "billable"
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
      "bulk sales", "sales payout", "order payout", "shop payout", "payout"
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
      "activecampaign", "ad spend", "marketing"
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
      "subscription", "saas", "software", "shopify"
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
      "wireless service", "cell phone", "phone", "internet"
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
    providerHints: ["office_supplies", "general_merchandise"]
  },
  {
    kind: "expense",
    usCategory: "Meals",
    caCategory: "Meals & Entertainment",
    keywords: [
      "restaurant", "coffee", "cafe", "pizza", "burger",
      "uber eats", "ubereats", "doordash", "skip the dishes", "grubhub",
      "client lunch", "business lunch", "meal", "food", "dining"
    ],
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
    kind: "expense",
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "shell", "shell oil", "chevron", "esso", "petro canada", "gas station", "fuel", "gas",
      "jiffy lube", "valvoline", "autozone", "napa auto", "parking meter", "parking lot",
      "auto repair", "oil change", "vehicle"
    ],
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
    kind: "expense",
    usCategory: "Contract Labor",
    caCategory: "Legal & Accounting Fees",
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
    usCategory: "Sales Tax",
    caCategory: "Business Tax & Licenses",
    keywords: [
      "business license", "permit fee", "service ontario", "service canada",
      "sales tax remittance", "hst payment", "gst payment", "property tax"
    ],
    providerHints: ["tax", "government"]
  }
];

const CATEGORY_RULE_EXPANSIONS = [
  {
    usCategory: "Service Income",
    caCategory: "Service Income",
    keywords: [
      "professional service income", "service income", "client fee", "e-transfer",
      "interac e-transfer", "interac etransfer", "zelle", "venmo", "settlement deposit"
    ]
  },
  {
    usCategory: "Sales Revenue",
    caCategory: "Sales Revenue",
    keywords: ["shopify payments", "payment processor deposit", "square", "sq "]
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
    usCategory: "Car & Truck Expenses",
    caCategory: "Motor Vehicle",
    keywords: [
      "bp gas station", "exxon", "mobil", "sunoco", "marathon gas", "speedway gas",
      "circle k", "wawa", "pilot flying", "loves travel stop", "petrocan",
      "husky gas", "ultramar", "irving oil", "kwik trip", "advance auto",
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
    caCategory: "Legal & Accounting Fees",
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
    keywords: [
      "irs", "cra", "revenue canada", "revenu canada", "government fee",
      "vehicle registration", "tax payment remittance", "government of canada", "dmv"
    ]
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
      "76 gas station", "arco", "valero", "quiktrip", "caseys",
      "maverik", "sams club fuel", "costco gas", "sinclair oil", "conoco", "phillips 66 gas",
      "co op gas", "coop gas", "mohawk gas", "fas gas", "car wash", "canadian tire gas"
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
    caCategory: "Legal & Accounting Fees",
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
    "princess auto", "tsc stores", "repair service", "maintenance fee", "handyman service"
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
      "7 eleven", "kum go", "racetrac", "sheetz", "getgo", "stewarts shops",
      "cumberland farms", "kwik star", "citgo", "murphy usa", "murphy express",
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
      "make.com", "n8n", "segment", "mixpanel", "amplitude", "moz", "screaming frog",
      "later app", "sketch app", "invision", "webflow", "bigcommerce", "woocommerce",
      "magento", "netsuite", "workday hcm", "zoho", "zoho books", "zoho crm",
      "cisco webex", "gotomeeting", "ringcentral", "8x8", "vonage business",
      "grasshopper", "openphone", "aircall", "front app", "help scout", "livechat",
      "drift chat", "tidio", "crisp chat", "wistia", "descript", "otter.ai",
      "grammarly", "envato", "shutterstock", "getty images", "adobe stock", "istock",
      "bluehost", "hostgator", "siteground", "dreamhost", "wp engine", "kinsta",
      "vercel", "netlify", "render.com", "linode", "vultr", "google cloud platform",
      "ibm cloud", "bench accounting", "pilot.com bookkeeping", "bill.com",
      "expensify", "ramp card", "brex", "divvy card", "airbase"
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
    usCategory: "Office Supplies",
    caCategory: "Office Supplies",
    keywords: [
      "grainger", "quill.com", "global industrial", "msc industrial", "fastenal",
      "mcmaster carr"
    ]
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
    caCategory: "Legal & Accounting Fees",
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
      "loves country store", "flying j travel", "ta travel centers", "petro stopping center",
      "wilco hess", "rutters", "sheetz fuel", "royal farms"
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

function selectHistoryWinner(bucket) {
  if (!bucket || bucket.size === 0) return null;
  const ranked = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
  const [winnerName, winnerCount] = ranked[0];
  const runnerUpCount = ranked[1]?.[1] || 0;
  if (winnerCount === 1 && ranked.length > 1) return null;
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
    if (!isLowSignalHistoryKey(merchantKey)) {
      recordHistorySignal(merchantHistory, merchantKey, row.category_name, kind);
    }
    if (!isLowSignalHistoryKey(descriptionKey)) {
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

function normalizedContains(normalizedText, compactText, keyword) {
  const normalizedKw = normalizeMappingText(keyword);
  if (!normalizedKw) return false;
  const compactKw = normalizedKw.replace(/\s+/g, "");
  return normalizedText.includes(normalizedKw) || (compactKw && compactText.includes(compactKw));
}

function scoreRule(rule, { normalizedMerchant, compactMerchant, normalizedDescFull, compactDescFull, providerHintText }) {
  let score = 0;
  let merchantStrong = false;

  for (const keyword of rule.keywords || []) {
    const isMultiWord = keyword.includes(" ");
    const merchantHit = normalizedContains(normalizedMerchant, compactMerchant, keyword);
    if (merchantHit) {
      score += isMultiWord ? 4 : 3;
      merchantStrong = true;
    } else if (normalizedContains(normalizedDescFull, compactDescFull, keyword)) {
      score += isMultiWord ? 3 : 2;
    }
  }

  for (const hint of rule.providerHints || []) {
    if (providerHintText.includes(hint)) score += 2;
  }

  return { score, merchantStrong };
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
    const normalizedDescFull = normalizeMappingText(`${rawMerchant} ${rawDescription} ${String(categoryGuess || "")}`);
    const compactDescFull = normalizedDescFull.replace(/\s+/g, "");
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

    let best = null;
    let secondBestScore = 0;
    for (const rule of CATEGORY_RULES) {
      if (rule.kind !== kind) continue;
      const { score, merchantStrong } = scoreRule(rule, { normalizedMerchant, compactMerchant, normalizedDescFull, compactDescFull, providerHintText });
      if (!best || score > best.score) {
        secondBestScore = best?.score || 0;
        best = { rule, score, merchantStrong };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    // A rule only gets to auto-map a category if its keyword-match score clears
    // this floor AND clearly beats every other rule (no near-ties). Below the
    // floor, or in a near-tie between two plausible categories, we don't guess
    // — the transaction stays in the Imported bucket for manual review instead
    // of risking a confidently-wrong category on a weak signal.
    const meetsConfidenceThreshold = best
      && best.score >= MIN_SCORE_TO_AUTO_MAP
      && best.score > secondBestScore;

    if (meetsConfidenceThreshold) {
      const categoryName = pickRuleCategoryName(best.rule, region);
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
