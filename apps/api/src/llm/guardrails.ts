import type { ChatLanguage } from '@housy/shared';
import type { Fact } from '@housy/shared';

export interface PreFilterResult {
  triggered: boolean;
  type?: 'opt_out' | 'human_requested' | 'price_ask';
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
 * Detect language based on script and common linguistic keywords.
 */
export function detectLanguage(text: string, fallback: ChatLanguage = 'en'): ChatLanguage {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }

  // 1. Devanagari script for Hindi
  if (/[\u0900-\u097F]/.test(trimmed)) {
    return 'hi';
  }

  // 2. Gujarati script
  if (/[\u0A80-\u0AFF]/.test(trimmed)) {
    return 'gu';
  }

  // 3. Hinglish / Gujarati Latin keywords
  const lower = trimmed.toLowerCase();
  const gujaratiKeywords = /\b(kem|tamaro|tamne|chho|karvi|manas|sathe|ghar|ketla|ochhu|aaje|kaale|nathi|aapone)\b/i;
  const hindiKeywords = /\b(kya|kaise|kitna|kitne|chahiye|batao|bataye|ghar|kam|karo|insan|baat|hai|hoga|milega|mujhe|mera)\b/i;

  if (gujaratiKeywords.test(lower)) {
    return 'gu';
  }
  if (hindiKeywords.test(lower)) {
    return 'hi';
  }

  return fallback;
}

/**
 * Deterministic pre-filter executed on incoming message BEFORE calling any LLM.
 */
export function runPreFilter(message: string, currentLang: ChatLanguage = 'en'): PreFilterResult {
  const lang = detectLanguage(message, currentLang);
  const lower = message.toLowerCase().trim();

  // 1. OPT-OUT FILTER
  const optOutPattern =
    /\b(stop|unsubscribe|cancel|optout|opt-out)\b|बंद\s*करो|रोक\s*दो|हटाओ|संदेश\s*बंद|\b(band karo|rok do|mat bhejo|sandesh band)\b|બંધ\s*કરો|રોકો|સંદેશ\s*બંધ|\b(bandh karo|rokvo)\b/i;

  if (optOutPattern.test(lower)) {
    const responses: Record<ChatLanguage, string> = {
      en: 'You have been unsubscribed. You will not receive any further automated messages from us.',
      hi: 'आपको सदस्यता से हटा दिया गया है। आपको हमारी ओर से कोई और स्वचालित संदेश प्राप्त नहीं होगा।',
      gu: 'તમારું સબ્સ્ક્રિપ્શન રદ કરવામાં આવ્યું છે. તમને અમારા તરફથી કોઈ વધુ સ્વચાલિત સંદેશા પ્રાપ્ત થશે નહીં.',
    };
    return {
      triggered: true,
      type: 'opt_out',
      responseText: responses[lang] ?? responses.en,
      language: lang,
    };
  }

  // 2. HUMAN REQUEST FILTER
  const humanPattern =
    /\b(human|agent|person|representative|executive|manager|call me|speak to|talk to|talk with)\b|इंसान\s*से|व्यक्ति\s*से|बात\s*कराओ|बात\s*करनी|कॉल\s*करो|फोन\s*करो|\b(insan|vyakti|baat karao|baat karni|call karo|phone karo)\b|માણસ\s*સાથે|વ્યક્તિ\s*સાથે|વાત\s*કરવી|વાત\s*કરાવો|કોલ\s*કરો|\b(manas|sathe vaat|vaat karvi)\b/i;

  if (humanPattern.test(lower)) {
    const responses: Record<ChatLanguage, string> = {
      en: 'I have connected you with our sales team. A dedicated executive will reach out to you shortly.',
      hi: 'मैंने आपकी बात हमारी सेल्स टीम से जोड़ दी है। हमारे एक वरिष्ठ प्रतिनिधि जल्द ही आपसे संपर्क करेंगे।',
      gu: 'મેં તમને અમારી સેલ્સ ટીમ સાથે જોડી દીધા છે. અમારા એક પ્રતિનિધિ ટૂંક સમયમાં તમારો સંપર્ક કરશે.',
    };
    return {
      triggered: true,
      type: 'human_requested',
      responseText: responses[lang] ?? responses.en,
      language: lang,
      flagReason: 'human_requested',
    };
  }

  // 3. PRICE / DISCOUNT / NEGOTIATION FILTER
  const pricePattern =
    /\b(price|pricing|cost|rate|discount|negotiat|bargain|deal|offer|final price|last price|bhav|discount milega|kuch kam)\b|कीमत|भाव|दाम|छूट|डिस्काउंट|कितने का|कितना|कम करो|\b(kitna|kitne|bhav|daam|kimat|keemat|chhoot|kam|discount)\b|કિંમત|ભાવ|ડિસ્કાઉન્ટ|કેટલા|ઓછું કરો|છૂટ|\b(kimat|bhav|ketla|ochhu)\b/i;

  if (pricePattern.test(lower)) {
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
      responseText: responses[lang] ?? responses.en,
      language: lang,
      quickReplies: quickRepliesMap[lang],
      flagReason: 'price_ask',
    };
  }

  return { triggered: false };
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
 * Verify post-checks on model reply (banned claims, fact existence, number/date grounding, confidence).
 */
export function verifyPostChecks(params: {
  replyText: string;
  citedFactIds: string[];
  activeFacts: Fact[];
  confidence: number;
}): PostCheckResult {
  const { replyText, citedFactIds, activeFacts, confidence } = params;

  // 1. Confidence check
  if (confidence < 0.7) {
    return {
      passed: false,
      reason: 'low_confidence',
      details: `Confidence score ${confidence} is below minimum threshold 0.70`,
    };
  }

  // 2. Banned claims check
  const bannedPatterns =
    /\b(guarantee|guaranteed|guarantees|assured returns?|appreciation|best price|lowest price|limited offer|limited time offer)\b|गारंटी|सुनिश्चित रिटर्न|बेस्ट प्राइस|सीमित ऑफर|ગેરંટી|ખાતરીપૂર્વકનું વળતર|શ્રેષ્ઠ કિંમત|મર્યાદિત ઓફર/i;

  if (bannedPatterns.test(replyText)) {
    return {
      passed: false,
      reason: 'banned_claim',
      details: 'Reply contains banned promotional claim or financial guarantee',
    };
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

  // 4. Grounding Check: Every number, amount or date in the reply must appear in cited facts
  // Extract numeric tokens: e.g. 12, 3.5, 4500, 95L, 1.2, 2026, 3 BHK
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

    for (const num of numbersInReply) {
      // Normalize number representation (e.g. "1,200" -> "1200")
      const cleanNum = num.replace(/,/g, '').toLowerCase();
      const factsClean = factsCombinedText.replace(/,/g, '');

      if (!factsClean.includes(cleanNum)) {
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

/**
 * Extract numbers, currency amounts, and year/date integers from a text.
 */
function extractNumericTokens(text: string): string[] {
  // Matches standalone integers/floats, currency amounts with or without symbols
  // Examples: "1,180", "95", "1.2", "2026", "2", "3"
  const matches = text.match(/\b\d+(?:[.,]\d+)?\b/g);
  if (!matches) {
    return [];
  }

  // Filter out trivial 1-character single counts if not relevant, or keep all numbers
  // Strict rule: "every number, amount or date in the reply must appear in the cited facts"
  return Array.from(new Set(matches));
}
