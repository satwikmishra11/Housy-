import type { ChatLanguage } from '@housy/shared';
import type { Fact } from '@housy/shared';

export type BuyerIntent =
  | 'negotiation'
  | 'price_info'
  | 'human'
  | 'opt_out'
  | 'cancel_visit'
  | 'other';

export interface PreFilterResult {
  triggered: boolean;
  type?: 'opt_out' | 'human_requested' | 'price_ask' | 'cancel_visit';
  intent?: BuyerIntent;
  responseText?: string;
  language?: ChatLanguage;
  quickReplies?: string[];
  flagReason?: string;
}

export interface PostCheckResult {
  passed: boolean;
  reason?: 'banned_claim' | 'missing_fact' | 'grounding_failed' | 'low_confidence';
  details?: string;
}

/**
 * Detect language based on script and weighted lexicon.
 * 1. Script first (Devanagari -> hi, Gujarati -> gu).
 * 2. Weighted lexicon where words shared by Hindi and Gujarati-Latin score 0.
 * 3. Fallback to conversation language.
 */
export function detectLanguage(text: string, fallback: ChatLanguage = 'en'): ChatLanguage {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }

  // 1. Script first
  if (/[\u0900-\u097F]/.test(trimmed)) {
    return 'hi';
  }
  if (/[\u0A80-\u0AFF]/.test(trimmed)) {
    return 'gu';
  }

  // 2. Weighted Latin lexicon
  const lower = trimmed.toLowerCase();
  const tokens = lower.match(/[a-z]+/g) || [];

  // Words shared by Hindi and Gujarati Latin score 0
  const SHARED_TOKENS = new Set([
    'ghar',
    'bhai',
    'namaste',
    'haan',
    'ha',
    'na',
    'karo',
    'aaje',
    'dost',
    'saab',
    'babu',
    'chhe',
  ]);

  const HINDI_DISTINCT = new Set([
    'kya',
    'kaise',
    'kitna',
    'kitne',
    'chahiye',
    'batao',
    'bataye',
    'insan',
    'baat',
    'hoga',
    'hogi',
    'milega',
    'milegi',
    'mujhe',
    'mera',
    'meri',
    'mere',
    'nahi',
    'kyun',
    'yahan',
    'accha',
    'theek',
    'kripya',
    'dhanyawad',
    'daam',
    'keemat',
    'chhoot',
    'paisa',
    'paise',
    'karenge',
    'karna',
    'aapka',
    'aapki',
    'apna',
    'apne',
    'bhi',
  ]);

  const GUJARATI_DISTINCT = new Set([
    'kem',
    'tamaro',
    'tamari',
    'tamne',
    'tame',
    'chho',
    'karvi',
    'karvo',
    'manas',
    'sathe',
    'ketla',
    'ketli',
    'ochhu',
    'ochho',
    'kaale',
    'nathi',
    'aapone',
    'aapo',
    'su',
    'shu',
    'joye',
    'joie',
    'malshe',
    'aavvu',
    'kone',
    'leva',
    'karvanu',
    'maare',
    'aavu',
    'bhav',
    'che',
  ]);

  let hindiScore = 0;
  let gujaratiScore = 0;

  for (const token of tokens) {
    if (SHARED_TOKENS.has(token)) {
      continue;
    }
    if (HINDI_DISTINCT.has(token)) {
      hindiScore++;
    }
    if (GUJARATI_DISTINCT.has(token)) {
      gujaratiScore++;
    }
  }

  if (hindiScore > gujaratiScore) {
    return 'hi';
  }
  if (gujaratiScore > hindiScore) {
    return 'gu';
  }

  return fallback;
}

/**
 * Detect buyer intent:
 * - cancel_visit: explicitly requests cancellation of a site visit/appointment
 * - opt_out: explicit command/phrase to stop messages (never matches cancel visit)
 * - human: phrase-level request to speak with a human executive/agent
 * - negotiation: request for discount, reduction, deal, waiver, best/final price
 * - price_info: enquiry about pricing, cost, or loan rates without negotiation
 * - other: all general questions, bookings, amenities, etc.
 */
export function detectIntent(message: string, _lang: ChatLanguage = 'en'): BuyerIntent {
  const lower = message.toLowerCase().trim();

  // 1. CANCEL VISIT (must be checked before opt-out to avoid "cancel my visit" false opt-out)
  const isCancelVisit =
    /\b(cancel\s+(my\s+)?(visit|site\s*visit|appointment|booking|tour))\b/i.test(lower) ||
    /\b(cancel\s+the\s+visit)\b/i.test(lower) ||
    /\b(don't|do\s*not)\s*want\s*to\s*(visit|come)\b/i.test(lower) ||
    /\b(visit|appointment|booking)\s+(cancel|rad|radd|cancel\s*karni|cancel\s*karvi)\b/i.test(lower) ||
    /(विज़िट|विजिट|अपॉइंटमेंट|बुकिंग)\s*(रद्द|कैंसिल|कैंसल)/i.test(lower) ||
    /(વિઝિટ|મુલાકાત|એપોઇન્ટમેન્ટ|બુકિંગ)\s*(રદ|કેન્સલ)/i.test(lower);

  if (isCancelVisit) {
    return 'cancel_visit';
  }

  // 2. OPT-OUT
  const isOptOut =
    /^\s*stop\s*[.!]?$/i.test(lower) ||
    /\b(stop\s+(messaging|messages?|texts?|updates?|notifications?|calling|contacting))\b/i.test(lower) ||
    /\b(unsubscribe|opt\s*out|opt-out)\b/i.test(lower) ||
    /\b(don't|do\s*not)\s*(contact|message|text|call)\s*me\b/i.test(lower) ||
    /\b(remove|delete)\s+(my\s+)?(number|contact|phone|details)\b/i.test(lower) ||
    /\bstop\s+sending\s+(me\s+)?(messages?|texts?|updates?)\b/i.test(lower) ||
    /(संदेश|मैसेज)\s*बंद\s*करो/i.test(lower) ||
    /(मैसेज|संदेश|कॉल)\s*मत\s*(भेजो|करो)/i.test(lower) ||
    /(मुझे\s*)?संपर्क\s*मत\s*करो/i.test(lower) ||
    /\b(sandesh\s*band|message\s*mat\s*bhejo|sampark\s*mat\s*karo|band\s*karo\s*message)\b/i.test(lower) ||
    /(સંદેશ|મેસેજ)\s*બંધ\s*કરો/i.test(lower) ||
    /(મેસેજ|સંદેશ)\s*(ના|ન)?\s*મોકલો/i.test(lower) ||
    /(મારો\s*)?સંપર્ક\s*(ના|ન)?\s*કરો/i.test(lower) ||
    /\b(sandesh\s*bandh|message\s*na\s*moklo|sampark\s*na\s*karo)\b/i.test(lower);

  if (isOptOut) {
    return 'opt_out';
  }

  // 3. HUMAN REQUEST (phrase-level matches only, not isolated generic words)
  const isHuman =
    /\b(talk|speak)\s*(to|with)\s*(an?\s+|the\s+|your\s+)?(human|person|agent|representative|(sales\s*)?executive|salesperson|sales\s*person|manager|sales\s*manager|someone|real\s*person)\b/i.test(lower) ||
    /\b(call\s*me(\s+back)?|give\s*me\s*a\s*call|phone\s*me)\b/i.test(lower) ||
    /\bconnect\s*(me\s*)?(with|to)\s*(an?\s+|the\s+|your\s+)?(human|person|agent|representative|(sales\s*)?executive|sales\s*team|salesperson|sales\s*person|manager|sales\s*manager)\b/i.test(lower) ||
    /\b(human\s+(please|assistance)|transfer\s*(me\s*)?to\s*(an?\s+|the\s+|your\s+)?(human|agent|representative|(sales\s*)?executive|manager|sales\s*manager))\b/i.test(lower) ||
    /(इंसान|व्यक्ति|एग्जीक्यूटिव|प्रतिनिधि|मैनेजर|सेल्सपर्सन)\s*से\s*बात\s*(कराओ|करनी|करवाओ|करो)/i.test(lower) ||
    /(मुझे\s*)?(कॉल|फोन)\s*करो/i.test(lower) ||
    /\b(insan\s*se\s*baat|vyakti\s*se\s*baat|executive\s*se\s*baat|agent\s*se\s*baat|call\s*karo\s*mujhe|phone\s*karo|baat\s*karwao)\b/i.test(lower) ||
    /(માણસ|વ્યક્તિ|એક્ઝિક્યુટિવ|પ્રતિનિધિ|સેલ્સપર્સન)\s*સાથે\s*વાત\s*(કરાવો|કરવી|કરો)/i.test(lower) ||
    /(મને\s*)?કોલ\s*કરો/i.test(lower) ||
    /\b(manas\s*sathe\s*vaat|vyakti\s*sathe\s*vaat|executive\s*sathe\s*vaat|agent\s*sathe\s*vaat|call\s*karo\s*mane)\b/i.test(lower);

  if (isHuman) {
    return 'human';
  }

  // 4. NEGOTIATION (discounts, reduction, deals, waivers, concessions, % off, cashback, best/final price)
  const isNegotiation =
    /\b(discount\w*|negotiat\w*|bargain\w*|cashback|cash\s*back|waiv\w*|concession\w*)\b/i.test(lower) ||
    /\b\d*\s*%\s*(off|discount)\b/i.test(lower) ||
    /\b(percent|percentage)\s*(off|discount)\b/i.test(lower) ||
    /\b(final\s*price|best\s*price|last\s*price|cheaper\s*rate|lower\s*the\s*price)\b/i.test(lower) ||
    /\b(reduce\s*(the\s*price|it)?|can\s*you\s*reduce|lessen\s*the\s*price)\b/i.test(lower) ||
    /\bwaive\s*(the\s*)?(fee|fees|charges?|cost|registration|floor\s*rise)?\b/i.test(lower) ||
    /\b(special\s*discount|any\s*discount|good\s*discount|extra\s*discount|cashback\s*offer)\b/i.test(lower) ||
    /\b(special\s*offer|special\s*deal|festive\s*offer|festival\s*discount)\b/i.test(lower) ||
    /(रेट|भाव|दाम|कीमत|किराया)\s*(कम\s*करो|कम\s*कीजिए|कम\s*हो\s*सकता\s*है|कम\s*कर\s*दो|कम\s*करोगे)/i.test(lower) ||
    /(कुछ|थोड़ा)\s*कम\s*करो/i.test(lower) ||
    /(छूट|डिस्काउंट|ऑफर|रियायत|गुंजाइश)\s*(मिलेग[ाी]|दीजिए|कर\s*दो|दे\s*दो|होगी)/i.test(lower) ||
    /(छूट\s*कर\s*दो|छूट\s*करो|छूट\s*दे\s*दो|छूट\s*दीजिए|रियायत\s*कर\s*दो|रियायत\s*दीजिए)/i.test(lower) ||
    /(कम\s*हो\s*सकता\s*है|कम\s*कर\s*दो|कम\s*करोगे|कम\s*कीजिए)/i.test(lower) ||
    /(आखिरी|अंतिम|बेस्ट)\s*(कीमत|रेट|दाम|भाव|प्राइस)/i.test(lower) ||
    /(कुछ\s*गुंजाइश|कोई\s*रियायत|थोड़ी\s*रियायत)/i.test(lower) ||
    /\b(rate\s*kam|bhav\s*kam|daam\s*kam|kuch\s*kam|thoda\s*kam|discount\s*milega|kam\s*karo|kam\s*kar\s*do|chhoot\s*kar\s*do|chhut\s*kar\s*do|chhoot\s*de\s*do|chhut\s*de\s*do|last\s*rate|aakhiri\s*keemat|best\s*price\s*kya\s*hai|rihayat|gunjaish)\b/i.test(lower) ||
    /(भाव|ભાવમાં|કિંમત|કિંમતમાં)\s*(ઓછો?|ઓછી)\s*કરો/i.test(lower) ||
    /(ઓછું|ઓછો)\s*કરો\s*ભાવ/i.test(lower) ||
    /(ભાવ|ભાવમાં|કિંમત|કિંમતમાં)?\s*ઘટાડો/i.test(lower) ||
    /(કંઈક|થોડું)\s*(ઓછો?|ઘટાડો)/i.test(lower) ||
    /(ડિસ્કાઉન્ટ|ઓફર|છૂટ|છૂટછાટ|બાંધછોડ)\s*(મળશે|આપો|કરો)/i.test(lower) ||
    /(બાંધછોડ|છૂટછાટ)\s*(કરો|થઈ\s*શકે)/i.test(lower) ||
    /(છેલ્લો|અંતિમ|બેસ્ટ)\s*(ભાવ|પ્રાઈસ)/i.test(lower) ||
    /\b(bhav\s*ochho|ochhu\s*karo\s*bhav|ochhu\s*karo|bhav\s*ghatado|ghatado|kaink\s*ochhu|discount\s*malshe|chhut\s*malshe|chhut\s*aapo|bandhchhod|chhello\s*bhav|best\s*bhav)\b/i.test(lower);

  if (isNegotiation) {
    return 'negotiation';
  }

  // 5. PRICE INFO (informational price, cost, or home loan enquiry without negotiation)
  const isPriceInfo =
    /\b(price\s*range|price\s*of|cost\s*of|pricing(\s*of|\s*details)?)\b/i.test(lower) ||
    /\bwhat\s+is\s+the\s+(price|cost|rate)\b/i.test(lower) ||
    /\bhow\s+much\s+(is\s+it|does\s+it\s+cost|is\s+the|for\s+a)\b/i.test(lower) ||
    /\b(home\s*loan|interest)\s*rates?\b/i.test(lower) ||
    /\b(starting\s*price|base\s*price|cost\s*breakup|payment\s*plan)\b/i.test(lower) ||
    /(कीमत|रेट|दाम|खर्चा|भाव)\s*(क्या\s*है|बताओ|बताइए|कितना\s*है|कितनी\s*है|कितना|कितनी)/i.test(lower) ||
    /(कितने\s*का\s*है|कितना\s*खर्च|कितना\s*पड़ेगा|क्या\s*भाव\s*है|दाम\s*कितना)/i.test(lower) ||
    /(लोन\s*की\s*दर|ब्याज\s*दर)/i.test(lower) ||
    /\b(price\s*kya\s*hai|rate\s*kya\s*hai|kitne\s*ka\s*hai|kitna\s*kharch|daam\s*kitna(\s*hai)?|rate\s*kitna|loan\s*rate)\b/i.test(lower) ||
    /(કિંમત|ભાવ)\s*(શું\s*છે|કહો|કેટલો\s*છે|કેટલી\s*છે|કેટલો|કેટલી)/i.test(lower) ||
    /(કેટલાનું\s*છે|કેટલા\s*રૂપિયા|કેટલો\s*ખર્ચ|ભાવ\s*કેટલો)/i.test(lower) ||
    /(લોનનો\s*દર|વ્યાજ\s*દર)/i.test(lower) ||
    /\b(kimat\s*shu\s*che|bhav\s*shu\s*che|bhav\s*ketlo(\s*che)?|ketlanu\s*che|ketla\s*rupia|loan\s*no\s*dar|vyaj\s*no\s*dar)\b/i.test(lower);

  if (isPriceInfo) {
    return 'price_info';
  }

  return 'other';
}

/**
 * Deterministic pre-filter executed on incoming message BEFORE calling any LLM.
 */
export function runPreFilter(message: string, currentLang: ChatLanguage = 'en'): PreFilterResult {
  const lang = detectLanguage(message, currentLang);
  const intent = detectIntent(message, lang);

  if (intent === 'cancel_visit') {
    const responses: Record<ChatLanguage, string> = {
      en: 'You can review, reschedule, or cancel your site visit through your appointment card below.',
      hi: 'आप नीचे दिए गए अपॉइंटमेंट कार्ड के माध्यम से अपनी साइट विज़िट की समीक्षा, पुनर्निर्धारण या रद्द कर सकते हैं।',
      gu: 'તમે નીચે આપેલા એપોઇન્ટમેન્ટ કાર્ડ દ્વારા તમારી સાઇટ વિઝિટની સમીક્ષા, પુનઃશેડ્યૂલ અથવા રદ કરી શકો છો.',
    };
    return {
      triggered: true,
      type: 'cancel_visit',
      intent: 'cancel_visit',
      responseText: responses[lang] ?? responses.en,
      language: lang,
    };
  }

  if (intent === 'opt_out') {
    const responses: Record<ChatLanguage, string> = {
      en: 'You have been unsubscribed. You will not receive any further automated messages from us.',
      hi: 'आपको सदस्यता से हटा दिया गया है। आपको हमारी ओर से कोई और स्वचालित संदेश प्राप्त नहीं होगा।',
      gu: 'તમારું સબ્સ્ક્રિપ્શન રદ કરવામાં આવ્યું છે. તમને અમારા તરફથી કોઈ વધુ સ્વચાલિત સંદેશા પ્રાપ્ત થશે નહીં.',
    };
    return {
      triggered: true,
      type: 'opt_out',
      intent: 'opt_out',
      responseText: responses[lang] ?? responses.en,
      language: lang,
    };
  }

  if (intent === 'human') {
    const responses: Record<ChatLanguage, string> = {
      en: 'I have connected you with our sales team. A dedicated executive will reach out to you shortly.',
      hi: 'मैंने आपकी बात हमारी सेल्स टीम से जोड़ दी है। हमारे एक वरिष्ठ प्रतिनिधि जल्द ही आपसे संपर्क करेंगे।',
      gu: 'મેં તમને અમારી સેલ્સ ટીમ સાથે જોડી દીધા છે. અમારા એક પ્રતિનિધિ ટૂંક સમયમાં તમારો સંપર્ક કરશે.',
    };
    return {
      triggered: true,
      type: 'human_requested',
      intent: 'human',
      responseText: responses[lang] ?? responses.en,
      language: lang,
      flagReason: 'human_requested',
    };
  }

  if (intent === 'negotiation') {
    const responses: Record<ChatLanguage, string> = {
      en: 'Final pricing is confirmed by our sales team. Would you like me to connect you with an executive, or arrange a private site visit to review project options?',
      hi: 'अंतिम मूल्य और विशेष ऑफ़र की पुष्टि सीधे हमारी सेल्स टीम द्वारा की जाती है। क्या आप चाहेंगे कि मैं आपको हमारे प्रतिनिधि से जोड़ूं या साइट विज़िट निर्धारित करूं?',
      gu: 'અંતિમ કિંમત અને ઑફર્સની પુષ્ટિ સીધી અમારી સેલ્સ ટીમ દ્વારા કરવામાં આવે છે. શું તમે ઈચ્છો છો કે હું તમને અમારા પ્રતિનિધિ સાથે જોડું અથવા સાઇટ વિઝિટ ગોઠવું?',
    };
    const quickRepliesMap: Record<ChatLanguage, string[]> = {
      en: ['Connect with executive', 'Schedule a site visit'],
      hi: ['एग्जीक्यूटिव से बात करें', 'साइट विजिट बुक करें'],
      gu: ['એક્ઝિક્યુટિવ સાથે વાત કરો', 'સાઇટ વિઝિટ બુક કરો'],
    };
    return {
      triggered: true,
      type: 'price_ask',
      intent: 'negotiation',
      responseText: responses[lang] ?? responses.en,
      language: lang,
      quickReplies: quickRepliesMap[lang],
      flagReason: 'price_ask',
    };
  }

  return { triggered: false, intent };
}

/**
 * Return localized safe fallback string when fact is missing or checks fail.
 */
export function getLocalizedFallback(lang: ChatLanguage = 'en'): string {
  const fallbacks: Record<ChatLanguage, string> = {
    en: 'A member of our team will confirm this with you shortly.',
    hi: 'हमारी टीम का एक सदस्य जल्द ही आपसे इस बारे में पुष्टि करेगा।',
    gu: 'અમારી ટીમનો એક સભ્ય ટૂંક સમયમાં તમારી સાથે આની પુષ્ટિ કરશે.',
  };
  return fallbacks[lang] ?? fallbacks.en;
}

/**
 * Normalizes Devanagari numerals (०-९), Gujarati numerals (૦-૯),
 * and common numeric words (e.g. ek, do, teen, be, tran) into standard digits (0-9).
 */
export function normalizeNumerals(text: string): string {
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  const gujaratiDigits = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];

  let normalized = text;

  // 1. Normalize Devanagari script digits
  for (let i = 0; i <= 9; i++) {
    normalized = normalized.replaceAll(devanagariDigits[i]!, String(i));
  }

  // 2. Normalize Gujarati script digits
  for (let i = 0; i <= 9; i++) {
    normalized = normalized.replaceAll(gujaratiDigits[i]!, String(i));
  }

  // 3. Normalize common number words in BHK/quantity contexts
  const wordToDigitMap: Array<[RegExp, string]> = [
    [/\b(one|ek|एक|એક)\s*(bhk|bedroom|flat|unit|crore|cr|lakh|lac)\b/gi, '1 $2'],
    [/\b(two|do|दो|be|બે)\s*(bhk|bedroom|flat|unit|crore|cr|lakh|lac)\b/gi, '2 $2'],
    [/\b(three|teen|तीन|tran|ત્રણ)\s*(bhk|bedroom|flat|unit|crore|cr|lakh|lac)\b/gi, '3 $2'],
    [/\b(four|char|चार|ચાર)\s*(bhk|bedroom|flat|unit|crore|cr|lakh|lac)\b/gi, '4 $2'],
    [/\b(five|paanch|पांच|પાંચ)\s*(bhk|bedroom|flat|unit|crore|cr|lakh|lac)\b/gi, '5 $2'],
  ];

  for (const [pattern, replacement] of wordToDigitMap) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

/**
 * Extract numbers, currency amounts, and date integers from a text.
 */
export function extractNumericTokens(text: string): string[] {
  const normalized = normalizeNumerals(text);
  // Match integer or decimal numbers, e.g. "1200", "95", "1.2", "2026", "2", "3"
  const matches = normalized.match(/\b\d+(?:\.\d+)?\b/g);
  if (!matches) {
    return [];
  }
  return Array.from(new Set(matches));
}

/**
 * Comprehensive list of banned promotional, ROI, and speculative claims across English, Hindi, and Gujarati.
 */
export const BANNED_CLAIM_PATTERNS: RegExp[] = [
  // 1. Guarantees and assured financial returns
  /\b(guarantee|guaranteed|guarantees|assured\s*returns?|guaranteed\s*returns?|high\s*returns?)\b/i,
  /\b(roi|return\s+on\s+investment|rental\s*yield|rental\s*returns?)\b/i,
  // 2. Speculative appreciation & rising price claims
  /\b(price\s*will\s*rise|prices\s*will\s*(rise|increase|double|triple)|rates?\s*will\s*go\s*up|value\s*will\s*(double|triple|increase))\b/i,
  // 3. Safe investment / risk-free
  /\b(safe\s*investment|risk-?free(\s*investment)?|100%\s*safe)\b/i,
  // 4. Artificial urgency & FOMO ("selling fast")
  /\b(selling\s*fast|hurry|last\s*(few\s*)?units(\s*left)?|only\s*\d+\s*(units?\s*)?left|units?\s*(are\s*)?selling\s*(out|fast)?)\b/i,
  // 5. Superlatives
  /\b(best\s*price|lowest\s*price|cheapest\s*deal|limited\s*time\s*offer)\b/i,
  // 6. Hindi equivalents
  /गारंटी|सुनिश्चित\s*रिटर्न|रिटर्न\s*ऑन\s*इन्वेस्टमेंट|रेंटल\s*यील्ड|किराया\s*रिटर्न|कीमत\s*बढ़ेगी|भाव\s*बढ़ेगा|पैसे\s*दोगुने|सुरक्षित\s*निवेश|जोखिम\s*मुक्त|तेजी\s*से\s*बिक\s*रहा|जल्दी\s*करो|कुछ\s*ही\s*(यूनिट|फ्लैट)\s*बचे|बेस्ट\s*प्राइस|सबसे\s*सस्ता/i,
  /\b(bhav\s*badhega|keemat\s*badhegi|surakshit\s*nivesh|paisa\s*double|munafa\s*pakka)\b/i,
  // 7. Gujarati equivalents
  /ગેરંટી|ખાતરીપૂર્વકનું\s*વળતર|રોકાણ\s*પર\s*વળતર|ભાડાનું\s*વળતર|ભાવ\s*વધશે|કિંમત\s*વધશે|સુરક્ષિત\s*રોકાણ|ઝડપથી\s*વેચાઈ\s*રહ્યું|થોડા\s*જ\s*ફ્લેટ\s*બાકી|શ્રેષ્ઠ\s*કિંમત|સૌથી\s*સસ્તું/i,
  /\b(bhav\s*vadhshe|kimat\s*vadhshe|surakshit\s*rokan|zadapthi\s*vechay)\b/i,
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Verify post-checks on model reply:
 * 1. Confidence check against minimum threshold (0.70).
 * 2. Banned claims check (ROI, rental yield, price will rise, safe investment, selling fast, etc.).
 * 3. Cited Fact IDs verification.
 * 4. Grounding Check:
 *    - Any reply stating a property fact requires at least one cited fact.
 *    - Every number, amount, or date must appear in cited facts with strict token boundaries.
 */
export function verifyPostChecks(params: {
  replyText: string;
  citedFactIds: string[];
  activeFacts: Fact[];
  confidence?: number;
}): PostCheckResult {
  const { replyText, citedFactIds, activeFacts, confidence } = params;

  // 1. Confidence check
  if (confidence !== undefined && confidence < 0.7) {
    return {
      passed: false,
      reason: 'low_confidence',
      details: `Confidence score ${confidence} is below minimum threshold 0.70`,
    };
  }

  // 2. Banned claims check
  for (const pattern of BANNED_CLAIM_PATTERNS) {
    if (pattern.test(replyText)) {
      return {
        passed: false,
        reason: 'banned_claim',
        details: 'Reply contains banned promotional claim, speculative return, or financial guarantee',
      };
    }
  }

  // 3. Cited Fact IDs verification
  const activeFactMap = new Map(activeFacts.map((f) => [f.id, f]));
  const citedFacts: Fact[] = [];

  for (const id of citedFactIds) {
    const fact = activeFactMap.get(id);
    if (!fact) {
      return {
        passed: false,
        reason: 'missing_fact',
        details: `Cited fact ${id} does not exist or is not active`,
      };
    }
    citedFacts.push(fact);
  }

  const normalizedReply = normalizeNumerals(replyText);

  // 4. Property Fact Citation Requirement
  // If the reply mentions property specifications, it must cite at least one active fact
  const statesPropertyFact =
    /\b(\d+\s*bhk|carpet|sq\s*ft|square\s*feet|super\s*built|possession|rera|tower|floor|amenit|pool|gym|clubhouse|pricing|price|cost|lakh|crore|₹)\b/i.test(
      normalizedReply,
    );

  if (statesPropertyFact && citedFacts.length === 0) {
    return {
      passed: false,
      reason: 'grounding_failed',
      details: 'Reply states property specifications but cited no facts from active fact sheet',
    };
  }

  // 5. Strict Numeric Grounding Check with Token Boundaries
  const numbersInReply = extractNumericTokens(replyText);

  if (numbersInReply.length > 0) {
    if (citedFacts.length === 0) {
      return {
        passed: false,
        reason: 'grounding_failed',
        details: `Reply contains numbers (${numbersInReply.join(', ')}) but no facts were cited`,
      };
    }

    const factsCombinedText = citedFacts
      .map((f) => `${f.title} ${f.value}`)
      .join(' ')
      .toLowerCase();
    const factsNormalized = normalizeNumerals(factsCombinedText);

    for (const num of numbersInReply) {
      // Token boundary match: "5" must not match inside "2025" or "15"
      const tokenRegex = new RegExp(`(?:^|[^0-9a-zA-Z])${escapeRegex(num)}(?:$|[^0-9a-zA-Z])`, 'i');
      if (!tokenRegex.test(factsNormalized)) {
        return {
          passed: false,
          reason: 'grounding_failed',
          details: `Number/date token "${num}" from reply does not appear in cited facts`,
        };
      }
    }
  }

  return { passed: true };
}
