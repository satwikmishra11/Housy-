import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { query } from '../src/db/index.js';
import {
  detectLanguage,
  detectIntent,
  verifyPostChecks,
  normalizeNumerals,
  extractNumericTokens,
  containsPriceWords,
  classifyIntentWithLLM,
  type BuyerIntent,
} from '../src/llm/guardrails.js';
import { chatService } from '../src/services/chat.service.js';
import { chatRepository } from '../src/repositories/chat.repository.js';
import { signMagicLinkToken } from '../src/auth/tokens.js';
import type { Fact } from '@housy/shared';

describe('Comprehensive Guardrails, Intents, Language, Grounding & Transcript Suite', () => {
  // ============================================================================
  // 1. TABLE-DRIVEN INTENT DETECTION (100+ PHRASES & FALSE POSITIVE TESTS)
  // ============================================================================
  describe('detectIntent() table-driven matrix', () => {
    const testCases: Array<{
      input: string;
      expected: BuyerIntent;
      desc: string;
    }> = [
      // --- NEGOTIATION (en / hi / gu / Hinglish / Gujlish) ---
      { input: 'What is your best price?', expected: 'negotiation', desc: 'best price request' },
      { input: 'Can I get a 10% discount on booking?', expected: 'negotiation', desc: 'discount percentage' },
      { input: 'Can you reduce it?', expected: 'negotiation', desc: 'can you reduce it' },
      { input: 'Please reduce the price of 2 BHK', expected: 'negotiation', desc: 'reduce the price' },
      { input: 'Will you waive the fee for registration?', expected: 'negotiation', desc: 'waive the fee' },
      { input: 'Can you waive the floor rise charges on booking?', expected: 'negotiation', desc: 'waive floor rise' },
      { input: 'Can you offer a concession on the down payment?', expected: 'negotiation', desc: 'concession phrasing' },
      { input: 'Are there any concessions available for early buyers?', expected: 'negotiation', desc: 'concessions available' },
      { input: 'Can I get 5% off if I pay in full?', expected: 'negotiation', desc: '% off phrase' },
      { input: 'Is there a 10 % off festive deal?', expected: 'negotiation', desc: 'spaced % off phrase' },
      { input: 'Give me 15% discount', expected: 'negotiation', desc: '% discount' },
      { input: 'What percentage off can you offer today?', expected: 'negotiation', desc: 'percentage off' },
      { input: 'Is there any cashback or special deal?', expected: 'negotiation', desc: 'cashback / deal' },
      { input: 'Do you provide cash back on early token payment?', expected: 'negotiation', desc: 'cash back separated' },
      { input: 'Any festive offer or special discount available?', expected: 'negotiation', desc: 'festive discount' },
      { input: 'I want a cheaper rate than 95 lakhs', expected: 'negotiation', desc: 'cheaper rate' },
      { input: 'kuch kam karo bhai', expected: 'negotiation', desc: 'hi/Hinglish kuch kam karo' },
      { input: 'rate thoda kam kar do', expected: 'negotiation', desc: 'hi/Hinglish rate kam kar do' },
      { input: 'छूट कर दो भाई', expected: 'negotiation', desc: 'hi छूट कर दो' },
      { input: 'कुछ छूट कर दो अगर आज बुक करें', expected: 'negotiation', desc: 'hi कुछ छूट कर दो' },
      { input: 'chhoot kar do thoda', expected: 'negotiation', desc: 'Hinglish chhoot kar do' },
      { input: 'chhut de do token pe', expected: 'negotiation', desc: 'Hinglish chhut de do' },
      { input: 'booking pe koi discount milega kya?', expected: 'negotiation', desc: 'hi/Hinglish discount milega' },
      { input: 'aakhiri keemat batao', expected: 'negotiation', desc: 'hi/Hinglish aakhiri keemat' },
      { input: '3 BHK ka daam kam ho sakta hai?', expected: 'negotiation', desc: 'hi daam kam' },
      { input: 'थोड़ी रियायत या छूट मिलेगी क्या? अगर आज फाइनल करें तो कुछ गुंजाइश है?', expected: 'negotiation', desc: 'hi negotiation with rihayat and gunjaish' },
      { input: 'ઓછું કરો ભાવ', expected: 'negotiation', desc: 'gu explicit ઓછું કરો ભાવ' },
      { input: 'ઓછું કરો ભાવ થોડો', expected: 'negotiation', desc: 'gu ઓછું કરો ભાવ થોડો' },
      { input: 'ભાવ ઘટાડો', expected: 'negotiation', desc: 'gu explicit ભાવ ઘટાડો' },
      { input: 'ભાવમાં ઘટાડો કરો જો આજે ટોકન આપું', expected: 'negotiation', desc: 'gu ભાવ ઘટાડો ટોકન' },
      { input: 'કિંમત ઘટાડો', expected: 'negotiation', desc: 'gu કિંમત ઘટાડો' },
      { input: 'bhav ochho karo', expected: 'negotiation', desc: 'gu Latin bhav ochho' },
      { input: 'ochhu karo bhav', expected: 'negotiation', desc: 'Gujlish ochhu karo bhav' },
      { input: 'bhav ghatado thodo', expected: 'negotiation', desc: 'Gujlish bhav ghatado' },
      { input: 'kaink ochhu karo ne', expected: 'negotiation', desc: 'gu kaink ochhu' },
      { input: 'rokhad payment par discount malshe?', expected: 'negotiation', desc: 'gu discount malshe' },
      { input: 'chhello bhav shu aapsho?', expected: 'negotiation', desc: 'gu chhello bhav' },
      { input: 'ભાવમાં થોડી બાંધછોડ કરો, જો આજે ટોકન આપું તો શું છૂટછાટ મળશે?', expected: 'negotiation', desc: 'gu negotiation with bandhchhod and chhutchhat' },

      // --- 40+ NEW NEGOTIATION PHRASES: WORD ORDER & INFLECTIONS (gu / hi / Hinglish) ---
      // Gujarati word-order variations & inflections
      { input: 'ઓછો કરો ભાવ', expected: 'negotiation', desc: 'gu inverted: ochho karo bhav' },
      { input: 'ઓછો ભાવ કરો ભાઈ', expected: 'negotiation', desc: 'gu inverted: ochho bhav karo' },
      { input: 'કરો ભાવ ઓછો થોડો', expected: 'negotiation', desc: 'gu verb-first: karo bhav ochho' },
      { input: 'ભાવમાં થોડું ઓછું કરો ને', expected: 'negotiation', desc: 'gu inflection: bhav ma thodu ochhu karo ne' },
      { input: 'કિંમતમાં કંઈક ઘટાડો કરશો?', expected: 'negotiation', desc: 'gu inflection: kimat ma kaink ghatado karsho' },
      { input: 'ભાવ ઓછો કરી આપો', expected: 'negotiation', desc: 'gu inflection: bhav ochho kari aapo' },
      { input: 'ઘટાડો ભાવ', expected: 'negotiation', desc: 'gu inverted: ghatado bhav' },
      { input: 'ભાવ થોડો ઉતારો', expected: 'negotiation', desc: 'gu inflection: bhav thodo utaro' },
      { input: 'કંઈક સસ્તું કરી આપો', expected: 'negotiation', desc: 'gu inflection: kaink sastu kari aapo' },
      { input: 'આજે ટોકન આપું તો ભાવ ઓછો થશે?', expected: 'negotiation', desc: 'gu inflection: bhav ochho thashe' },
      { input: 'કિંમત થોડી ઓછી કરો', expected: 'negotiation', desc: 'gu inflection: kimat thodi ochhi karo' },
      { input: 'રેટ કંઈક ઘટાડી આપો', expected: 'negotiation', desc: 'gu inflection: rate kaink ghatadi aapo' },

      // Hindi word-order variations & inflections
      { input: 'कम करो भाव', expected: 'negotiation', desc: 'hi inverted: kam karo bhav' },
      { input: 'कम कर दो रेट', expected: 'negotiation', desc: 'hi inverted: kam kar do rate' },
      { input: 'कम भाव करो भाई', expected: 'negotiation', desc: 'hi inverted: kam bhav karo' },
      { input: 'करो भाव कम थोड़ा', expected: 'negotiation', desc: 'hi verb-first: karo bhav kam' },
      { input: 'दाम थोड़ा कम कीजिए', expected: 'negotiation', desc: 'hi inflection/polite: daam thoda kam kijiye' },
      { input: 'कम दाम में मिलेगा क्या?', expected: 'negotiation', desc: 'hi inverted with modifier: kam daam me milega kya' },
      { input: 'कीमत कम कर दोगे क्या?', expected: 'negotiation', desc: 'hi inflection: keemat kam kar doge kya' },
      { input: 'रेट घटा दीजिए थोड़ा', expected: 'negotiation', desc: 'hi inflection: rate ghata dijiye thoda' },
      { input: 'कुछ तो सस्ता करो', expected: 'negotiation', desc: 'hi standalone: kuch to sasta karo' },
      { input: 'रेट में थोड़ी ढील दो', expected: 'negotiation', desc: 'hi idiom: rate me thodi dheel do' },
      { input: 'दाम में कोई रियायत कर दो', expected: 'negotiation', desc: 'hi inflection: daam me koi rihayat kar do' },
      { input: 'अगर आज फाइनल करें तो रेट कम करोगे?', expected: 'negotiation', desc: 'hi inflection future: rate kam karoge' },

      // Hinglish / Gujlish word-order variations & inflections
      { input: 'kam karo rate', expected: 'negotiation', desc: 'Hinglish inverted: kam karo rate' },
      { input: 'kam karo bhav', expected: 'negotiation', desc: 'Hinglish inverted: kam karo bhav' },
      { input: 'kam kar do daam thoda', expected: 'negotiation', desc: 'Hinglish inverted: kam kar do daam' },
      { input: 'ochho karo bhav please', expected: 'negotiation', desc: 'Gujlish inverted: ochho karo bhav' },
      { input: 'ochho bhav karo', expected: 'negotiation', desc: 'Gujlish inverted: ochho bhav karo' },
      { input: 'karo bhav ochho thodu', expected: 'negotiation', desc: 'Gujlish verb-first: karo bhav ochho' },
      { input: 'ghatado bhav thodo', expected: 'negotiation', desc: 'Gujlish inverted: ghatado bhav' },
      { input: 'rate thoda kam kijiye please', expected: 'negotiation', desc: 'Hinglish polite: rate thoda kam kijiye' },
      { input: 'price thoda kam karoge?', expected: 'negotiation', desc: 'Hinglish price kam karoge' },
      { input: 'kam rate me mil sakta hai?', expected: 'negotiation', desc: 'Hinglish kam rate me mil sakta hai' },
      { input: 'thoda discount de do na', expected: 'negotiation', desc: 'Hinglish thoda discount de do' },
      { input: 'kaink ochhu kari aapo bhai', expected: 'negotiation', desc: 'Gujlish kaink ochhu kari aapo' },

      // --- PRICE INFO (NOT NEGOTIATION, INCLUDING CRITICAL FALSE POSITIVES) ---
      { input: 'what is the maintenance cost?', expected: 'price_info', desc: 'false positive check: maintenance cost' },
      { input: 'what are the monthly maintenance charges?', expected: 'price_info', desc: 'false positive check: maintenance charges' },
      { input: 'maintenance charge kitna padega?', expected: 'price_info', desc: 'false positive check: hi maintenance charge' },
      { input: 'what is the home loan rate?', expected: 'price_info', desc: 'false positive check: home loan rate' },
      { input: 'loan rate kya chal raha hai?', expected: 'price_info', desc: 'false positive check: hi loan rate' },
      { input: 'What is the bank loan interest rate?', expected: 'price_info', desc: 'false positive check: bank interest rate' },
      { input: 'rate per person kitna hai?', expected: 'price_info', desc: 'false positive check: rate per person' },
      { input: 'what is the per-person ticket for site visit?', expected: 'price_info', desc: 'false positive check: per-person ticket' },
      { input: 'per person cost kitna hai?', expected: 'price_info', desc: 'false positive check: per person cost' },
      { input: 'rate per sq ft kya hai?', expected: 'price_info', desc: 'false positive check: rate per sq ft' },
      { input: 'what is the rate per square foot?', expected: 'price_info', desc: 'false positive check: rate per square foot' },
      { input: 'square feet ka rate kitna hai?', expected: 'price_info', desc: 'false positive check: sq ft rate hi' },
      { input: 'does maintenance fee include gym and clubhouse?', expected: 'price_info', desc: 'false positive check: maintenance fee inclusions' },
      { input: 'maintenance ketlu che per month?', expected: 'price_info', desc: 'false positive check: gu maintenance ketlu' },
      { input: '3 BHK का दाम कितना है', expected: 'price_info', desc: 'hi 3 BHK ka daam kitna hai' },
      { input: '3 BHK का दाम कितना', expected: 'price_info', desc: 'hi दाम कितना without hai' },
      { input: 'दाम कितना है 2 BHK का?', expected: 'price_info', desc: 'hi inverted daam kitna hai' },
      { input: 'रेट कितना है Project 1 का', expected: 'price_info', desc: 'hi rate kitna hai' },
      { input: 'भाव कितना है', expected: 'price_info', desc: 'hi bhav kitna hai' },
      { input: 'daam kitna hai 3 BHK flat ka?', expected: 'price_info', desc: 'Hinglish daam kitna hai' },
      { input: 'daam kitna', expected: 'price_info', desc: 'Hinglish bare daam kitna' },
      { input: 'rate kitna hai?', expected: 'price_info', desc: 'Hinglish rate kitna hai' },
      { input: 'What is the price range of a 3 BHK?', expected: 'price_info', desc: 'price range enquiry' },
      { input: 'What is the cost of 2 BHK apartment?', expected: 'price_info', desc: 'cost of 2 BHK' },
      { input: 'home loan rate', expected: 'price_info', desc: 'home loan rate enquiry' },
      { input: 'What is the interest rate from approved banks?', expected: 'price_info', desc: 'bank interest rate' },
      { input: 'how much is it', expected: 'price_info', desc: 'how much is it' },
      { input: 'how much does it cost for a 3 BHK?', expected: 'price_info', desc: 'how much does it cost' },
      { input: 'starting price of Project 1', expected: 'price_info', desc: 'starting price' },
      { input: 'What are the pricing details?', expected: 'price_info', desc: 'pricing details' },
      { input: '3 BHK kitne ka hai?', expected: 'price_info', desc: 'hi kitne ka hai' },
      { input: '2 BHK ki price kya hai bataye', expected: 'price_info', desc: 'hi price kya hai' },
      { input: 'loan rate kya chal raha hai?', expected: 'price_info', desc: 'hi loan rate' },
      { input: 'ભાવ કેટલો છે 2 BHK નો?', expected: 'price_info', desc: 'gu bhav ketlo che' },
      { input: 'ભાવ કેટલો', expected: 'price_info', desc: 'gu bhav ketlo without che' },
      { input: 'કિંમત કેટલી છે', expected: 'price_info', desc: 'gu kimat ketli che' },
      { input: 'kimat shu che 2 BHK ni?', expected: 'price_info', desc: 'gu kimat shu che' },
      { input: 'bhav ketlo che', expected: 'price_info', desc: 'Gujlish bhav ketlo che' },
      { input: 'ketla rupia thashe 3 BHK na?', expected: 'price_info', desc: 'gu ketla rupia' },
      { input: 'loan no dar shu che?', expected: 'price_info', desc: 'gu loan no dar' },

      // --- CANCEL VISIT ---
      { input: 'I want to cancel my visit', expected: 'cancel_visit', desc: 'cancel my visit' },
      { input: 'cancel visit', expected: 'cancel_visit', desc: 'cancel visit direct' },
      { input: 'Cancel my appointment please', expected: 'cancel_visit', desc: 'cancel appointment' },
      { input: 'Cancel booking for Saturday', expected: 'cancel_visit', desc: 'cancel booking' },
      { input: "I don't want to visit anymore", expected: 'cancel_visit', desc: "don't want to visit" },
      { input: 'visit cancel karni hai', expected: 'cancel_visit', desc: 'hi visit cancel karni hai' },
      { input: 'meri site visit radd karo', expected: 'cancel_visit', desc: 'hi visit radd karo' },
      { input: 'अपॉइंटमेंट रद्द करो', expected: 'cancel_visit', desc: 'hi appointment radd karo' },
      { input: 'appointment cancel karvi che', expected: 'cancel_visit', desc: 'gu appointment cancel' },
      { input: 'visit rad karo', expected: 'cancel_visit', desc: 'gu visit rad karo' },

      // --- OPT-OUT ---
      { input: 'stop messages', expected: 'opt_out', desc: 'stop messages' },
      { input: 'STOP', expected: 'opt_out', desc: 'standalone STOP' },
      { input: 'Please unsubscribe me from updates', expected: 'opt_out', desc: 'unsubscribe me' },
      { input: "don't contact me again", expected: 'opt_out', desc: "don't contact me" },
      { input: 'remove my number from your list', expected: 'opt_out', desc: 'remove my number' },
      { input: 'stop sending me texts', expected: 'opt_out', desc: 'stop sending texts' },
      { input: 'संदेश बंद करो', expected: 'opt_out', desc: 'hi sandesh band karo' },
      { input: 'मुझे कोई मैसेज मत भेजो', expected: 'opt_out', desc: 'hi message mat bhejo' },
      { input: 'sandesh band karo', expected: 'opt_out', desc: 'hi Latin sandesh band' },
      { input: 'સંદેશ બંધ કરો', expected: 'opt_out', desc: 'gu sandesh bandh' },
      { input: 'મને મેસેજ ના મોકલો', expected: 'opt_out', desc: 'gu message na moklo' },
      { input: 'sandesh bandh karo', expected: 'opt_out', desc: 'gu Latin sandesh bandh' },

      // --- HUMAN REQUEST ---
      { input: 'I want to talk to a human', expected: 'human', desc: 'talk to a human' },
      { input: 'Please connect me to a person', expected: 'human', desc: 'connect to a person' },
      { input: 'Speak to an agent immediately', expected: 'human', desc: 'speak to an agent' },
      { input: 'Can I speak with a sales executive?', expected: 'human', desc: 'speak with sales executive' },
      { input: 'call me back on my phone', expected: 'human', desc: 'call me back' },
      { input: 'human please', expected: 'human', desc: 'human please' },
      { input: 'connect me with your sales manager', expected: 'human', desc: 'connect with manager' },
      { input: 'mujhe kisi insan se baat karni hai', expected: 'human', desc: 'hi insan se baat' },
      { input: 'sales executive se baat karwao', expected: 'human', desc: 'hi executive se baat' },
      { input: 'mane koi manas sathe vaat karavi che', expected: 'human', desc: 'gu manas sathe vaat' },
      { input: 'call karo mane', expected: 'human', desc: 'gu call karo mane' },

      // --- FALSE POSITIVE PROTECTION (MUST BE 'OTHER', NOT HUMAN, OPT-OUT, OR NEGOTIATION) ---
      { input: 'Which executive is assigned to my file?', expected: 'other', desc: 'isolated executive word' },
      { input: 'Is there an agent available at the project site?', expected: 'other', desc: 'isolated agent query' },
      { input: 'Who is the sales manager for Project 1?', expected: 'other', desc: 'isolated manager query' },
      { input: 'How many persons can visit the flat?', expected: 'other', desc: 'isolated person word' },
      { input: 'Can a person with a wheelchair access the lift?', expected: 'other', desc: 'wheelchair access' },
      { input: 'I want to cancel my visit', expected: 'cancel_visit', desc: 'never treated as opt_out' },
      { input: 'Tell me about the clubhouse and amenities', expected: 'other', desc: 'amenities enquiry' },
      { input: 'When is possession expected for Tower A?', expected: 'other', desc: 'possession enquiry' },
      { input: 'Can I see the 3 BHK floor plan?', expected: 'other', desc: 'floor plan enquiry' },
      { input: 'Where is the site located on SG Highway?', expected: 'other', desc: 'location query' },
      { input: 'What is the RERA registration number?', expected: 'other', desc: 'RERA query' },
      { input: 'Are there 4 BHK penthouse units available?', expected: 'other', desc: 'penthouse query' },
      { input: 'Is visitor parking provided in the basement?', expected: 'other', desc: 'parking query' },
      { input: 'How many towers are currently under construction?', expected: 'other', desc: 'construction status' },
      { input: 'My brother visited last month and loved the swimming pool', expected: 'other', desc: 'past visit narration' },
    ];

    for (const tc of testCases) {
      it(`correctly detects intent "${tc.expected}" for: "${tc.input}" (${tc.desc})`, () => {
        expect(detectIntent(tc.input)).toBe(tc.expected);
      });
    }

    it('containsPriceWords() identifies price tokens across en, hi, gu, and Hinglish', () => {
      expect(containsPriceWords('3 BHK ka daam kitna hai?')).toBe(true);
      expect(containsPriceWords('ભાવ કેટલો છે?')).toBe(true);
      expect(containsPriceWords('Can we discuss pricing and rate?')).toBe(true);
      expect(containsPriceWords('Is there any cost for parking?')).toBe(true);
      expect(containsPriceWords('કિંમત શું છે?')).toBe(true);
      expect(containsPriceWords('What is the clubhouse timing?')).toBe(false);
      expect(containsPriceWords('Hello how are you?')).toBe(false);
    });

    it('classifyIntentWithLLM() fallback accurately categorizes ambiguous negotiation vs informational queries', async () => {
      // Negotiation fallback
      const negFallback = await classifyIntentWithLLM('This flat is too expensive, can we adjust the budget?');
      expect(negFallback).toBe('negotiation');

      // Price info fallback
      const priceFallback = await classifyIntentWithLLM('Tell me the breakup of the payment plan');
      expect(priceFallback).toBe('price_info');

      // Other fallback
      const otherFallback = await classifyIntentWithLLM('Where is the swimming pool located?');
      expect(otherFallback).toBe('other');
    });
  });

  // ============================================================================
  // 2. LANGUAGE DETECTION (SCRIPT FIRST & WEIGHTED LEXICON)
  // ============================================================================
  describe('detectLanguage() script and weighted lexicon tests', () => {
    it('detects English when Latin sentence has no Hindi/Gujarati markers', () => {
      expect(detectLanguage('Hello, what luxury residences are available?')).toBe('en');
    });

    it('detects Hindi via Devanagari script regardless of words', () => {
      expect(detectLanguage('नमस्ते, मुझे ३ बीएचके के बारे में बताएं')).toBe('hi');
    });

    it('detects Gujarati via Gujarati script', () => {
      expect(detectLanguage('નમસ્તે, મારે ૨ બીએચકે ઘર ખરીદવું છે')).toBe('gu');
    });

    it('correctly detects Hinglish with "ghar" as Hindi (resolving Defect #4)', () => {
      // Defect #4: "ghar" is in both languages; weighted lexicon must score "ghar" as 0,
      // allowing "mujhe" and "chahiye" to score for Hindi.
      expect(detectLanguage('mujhe ghar chahiye')).toBe('hi');
      expect(detectLanguage('bhai ghar kitne me milega bataye')).toBe('hi');
      expect(detectLanguage('mera ghar kab milega?')).toBe('hi');
    });

    it('correctly detects Gujarati Latin with "ghar" as Gujarati', () => {
      expect(detectLanguage('tamne ghar joye che kem cho')).toBe('gu');
      expect(detectLanguage('mane aaje ghar leva mate vaat karvi che')).toBe('gu');
    });

    it('falls back to conversation language when only shared or neutral words are provided', () => {
      expect(detectLanguage('ghar', 'en')).toBe('en');
      expect(detectLanguage('bhai namaste', 'hi')).toBe('hi');
    });
  });

  // ============================================================================
  // 3. GROUNDING: NUMERAL NORMALIZATION & TOKEN BOUNDARY MATCHING
  // ============================================================================
  describe('Grounding & Numeric Normalization', () => {
    it('normalizes Devanagari and Gujarati numerals to standard digits', () => {
      expect(normalizeNumerals('२ BHK')).toBe('2 BHK');
      expect(normalizeNumerals('३ BHK')).toBe('3 BHK');
      expect(normalizeNumerals('૧.૨ કરોડ')).toBe('1.2 કરોડ');
      expect(normalizeNumerals('૯૫ લાખ')).toBe('95 લાખ');
    });

    it('extracts normalized numeric tokens', () => {
      const tokens = extractNumericTokens('प्रोजेक्ट में २ और ३ BHK हैं, कीमत ९५ लाख से १.२ करोड़ है');
      expect(tokens).toContain('2');
      expect(tokens).toContain('3');
      expect(tokens).toContain('95');
      expect(tokens).toContain('1.2');
    });

    it('enforces token boundaries so substring numbers do not falsely match (Defect #5)', () => {
      const activeFacts: Fact[] = [
        {
          id: 'fact-possession',
          projectId: 'p1',
          category: 'possession',
          title: 'Possession Date',
          value: 'Expected by December 2025',
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Reply contains "5" (e.g. 5 towers). In facts, only "2025" exists.
      // Substring check would falsely match "5" in "2025". Token boundary MUST reject it!
      const checkResult = verifyPostChecks({
        replyText: 'We have 5 exclusive towers in Project 1.',
        citedFactIds: ['fact-possession'],
        activeFacts,
        confidence: 0.9,
      });

      expect(checkResult.passed).toBe(false);
      expect(checkResult.reason).toBe('grounding_failed');
      expect(checkResult.details).toContain('token "5"');
    });

    it('rejects replies stating property facts without citing active facts', () => {
      const activeFacts: Fact[] = [
        {
          id: 'fact-bhk',
          projectId: 'p1',
          category: 'specification',
          title: 'Apartment Types',
          value: '2 and 3 BHK Luxury Residences',
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const checkWithoutCitations = verifyPostChecks({
        replyText: 'We offer spacious 3 BHK apartments with 1180 sq ft carpet area.',
        citedFactIds: [], // Missing required citation
        activeFacts,
        confidence: 0.95,
      });

      expect(checkWithoutCitations.passed).toBe(false);
      expect(checkWithoutCitations.reason).toBe('grounding_failed');
    });

    it('enforces that answer_type="fact" must cite at least one active fact server-side', () => {
      const activeFacts: Fact[] = [
        {
          id: 'fact-sample',
          projectId: 'p1',
          category: 'pricing',
          title: 'Pricing',
          value: 'Starts at ₹95 Lakh',
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = verifyPostChecks({
        replyText: 'Yes, we are delighted to assist you with our residences.',
        citedFactIds: [],
        activeFacts,
        answerType: 'fact',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toBe('missing_fact');
      expect(result.details).toContain('Answer type "fact" must cite at least one active fact');
    });

    it('rejects uncited amenity claim: "rooftop cinema and helipad"', () => {
      const activeFacts: Fact[] = [
        {
          id: 'fact-amenities',
          projectId: 'p1',
          category: 'amenities',
          title: 'Clubhouse Amenities',
          value: 'Swimming pool, gymnasium, landscaped gardens',
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Even if classified as conversational, stating property details/amenities without citations must fail
      const resultConversational = verifyPostChecks({
        replyText: 'Our project features an exclusive rooftop cinema and helipad for private arrivals.',
        citedFactIds: [],
        activeFacts,
        answerType: 'conversational',
      });
      expect(resultConversational.passed).toBe(false);
      expect(resultConversational.reason).toBe('grounding_failed');

      // Also fails if answer_type="fact" without citations
      const resultFact = verifyPostChecks({
        replyText: 'Our project features an exclusive rooftop cinema and helipad for private arrivals.',
        citedFactIds: [],
        activeFacts,
        answerType: 'fact',
      });
      expect(resultFact.passed).toBe(false);
      expect(resultFact.reason).toBe('missing_fact');
    });

    it('enforces contextual grounding: rejects "Possession is in 2025" against "Launched 2025"', () => {
      const facts: Fact[] = [
        {
          id: 'fact-launch',
          projectId: 'p1',
          category: 'timeline',
          title: 'Project Launch',
          value: 'Launched in 2025 with RERA approval',
          status: 'active',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Reply claims possession is 2025, but cited fact only states launched in 2025
      const checkResult = verifyPostChecks({
        replyText: 'Possession is in 2025.',
        citedFactIds: ['fact-launch'],
        activeFacts: facts,
        answerType: 'fact',
      });

      expect(checkResult.passed).toBe(false);
      expect(checkResult.reason).toBe('grounding_failed');
      expect(checkResult.details).toContain('unit/label context');

      // Matching against fact that actually states possession by 2025 succeeds
      const matchingFact: Fact = {
        id: 'fact-possession',
        projectId: 'p1',
        category: 'timeline',
        title: 'Possession Timeline',
        value: 'Possession by December 2025',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const checkValid = verifyPostChecks({
        replyText: 'Possession is in 2025.',
        citedFactIds: ['fact-possession'],
        activeFacts: [matchingFact],
        answerType: 'fact',
      });
      expect(checkValid.passed).toBe(true);
    });

    it('rejects number-in-wrong-context (e.g. 795 sq ft carpet area claimed as 795 Lakhs)', () => {
      const specFact: Fact = {
        id: 'fact-carpet',
        projectId: 'p1',
        category: 'specification',
        title: '2 BHK Carpet Area',
        value: 'Carpet area of 795 sq ft',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = verifyPostChecks({
        replyText: 'The 2 BHK apartment costs 795 Lakhs.',
        citedFactIds: ['fact-carpet'],
        activeFacts: [specFact],
        answerType: 'fact',
      });

      expect(result.passed).toBe(false);
      expect(result.reason).toBe('grounding_failed');
      expect(result.details).toContain('currency');
    });

    it('verifies grounding with Devanagari numerals (०-९)', () => {
      const timelineFact: Fact = {
        id: 'fact-poss-2027',
        projectId: 'p1',
        category: 'timeline',
        title: 'पजेशन समयसीमा',
        value: 'पजेशन २०२७ में निर्धारित है',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mismatch: २०२५ (2025) vs २०२७ (2027)
      const mismatch = verifyPostChecks({
        replyText: 'पजेशन २०२५ में मिलेगा।',
        citedFactIds: ['fact-poss-2027'],
        activeFacts: [timelineFact],
        answerType: 'fact',
      });
      expect(mismatch.passed).toBe(false);
      expect(mismatch.reason).toBe('grounding_failed');

      // Valid match: २०२७ (2027) matches timeline fact
      const validMatch = verifyPostChecks({
        replyText: 'पजेशन २०२७ में मिलेगा।',
        citedFactIds: ['fact-poss-2027'],
        activeFacts: [timelineFact],
        answerType: 'fact',
      });
      expect(validMatch.passed).toBe(true);

      // Devanagari numerals in price and BHK
      const priceFact: Fact = {
        id: 'fact-price-hi',
        projectId: 'p1',
        category: 'pricing',
        title: 'मूल्य सूची',
        value: '२ BHK की कीमत ९५ लाख से शुरू है',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const validPrice = verifyPostChecks({
        replyText: '२ BHK का मूल्य ९५ लाख है।',
        citedFactIds: ['fact-price-hi'],
        activeFacts: [priceFact],
        answerType: 'fact',
      });
      expect(validPrice.passed).toBe(true);
    });

    it('verifies grounding with Gujarati numerals (૦-૯)', () => {
      const guFact: Fact = {
        id: 'fact-gu-price',
        projectId: 'p1',
        category: 'pricing',
        title: 'કિંમત યાદી',
        value: '૨ BHK ની કિંમત ૯૫ લાખ છે',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Valid Gujarati match
      const valid = verifyPostChecks({
        replyText: '૨ BHK ની કિંમત ૯૫ લાખ છે.',
        citedFactIds: ['fact-gu-price'],
        activeFacts: [guFact],
        answerType: 'fact',
      });
      expect(valid.passed).toBe(true);

      // Invalid: 3 BHK claimed at 95 Lakh
      const invalid = verifyPostChecks({
        replyText: '૩ BHK ની કિંમત ૯૫ લાખ છે.',
        citedFactIds: ['fact-gu-price'],
        activeFacts: [guFact],
        answerType: 'fact',
      });
      expect(invalid.passed).toBe(false);
      expect(invalid.reason).toBe('grounding_failed');
    });

    it('verifies grounding with mixed-language replies (Hinglish/Gujlish)', () => {
      const priceFact: Fact = {
        id: 'f-price',
        projectId: 'p1',
        category: 'pricing',
        title: 'Pricing',
        value: '2 BHK starting price ₹95 Lakh',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const timelineFact: Fact = {
        id: 'f-time',
        projectId: 'p1',
        category: 'timeline',
        title: 'Possession Date',
        value: 'Possession scheduled for December 2027',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mixed Hinglish: 2 BHK starting price ₹95 Lakh hai aur possession December 2027 mein milega
      const mixedHinglish = verifyPostChecks({
        replyText: '2 BHK starting price ₹95 Lakh hai aur possession December 2027 mein milega.',
        citedFactIds: ['f-price', 'f-time'],
        activeFacts: [priceFact, timelineFact],
        answerType: 'fact',
      });
      expect(mixedHinglish.passed).toBe(true);

      // Mixed Gujlish with hallucinated possession 2025
      const mixedHallucinated = verifyPostChecks({
        replyText: '2 BHK price ₹95 Lakh che and possession 2025 ma thashe.',
        citedFactIds: ['f-price', 'f-time'],
        activeFacts: [priceFact, timelineFact],
        answerType: 'fact',
      });
      expect(mixedHallucinated.passed).toBe(false);
      expect(mixedHallucinated.reason).toBe('grounding_failed');
    });
  });

  // ============================================================================
  // 4. EXPANDED BANNED CLAIMS MATRIX (ROI, RENTAL YIELD, PRICE WILL RISE, ETC.)
  // ============================================================================
  describe('verifyPostChecks() expanded banned claims matrix', () => {
    const dummyFacts: Fact[] = [
      {
        id: 'f1',
        projectId: 'p1',
        category: 'pricing',
        title: 'Price Range',
        value: '₹65 Lakh to ₹1.2 Crore',
        status: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const bannedClaims = [
      'We offer guaranteed returns of 12% on all investments.',
      'High ROI is assured for early buyers.',
      'You will get an attractive rental yield of 8% annually.',
      'Invest now because the price will rise drastically next year.',
      'Prices will increase right after RERA phase 2.',
      'This property is a 100% safe investment with zero risk.',
      'Hurry, apartments are selling fast in Tower A.',
      'Only 2 units left, hurry before bookings close!',
      'Units are selling out fast today.',
      'सुनिश्चित रिटर्न मिलेगा आपको इस प्रोजेक्ट में।',
      'कीमत बढ़ेगी अगले महीने से।',
      'सुरक्षित निवेश की गारंटी है।',
      'bhav badhega agle mahine pakka.',
      'ખાતરીપૂર્વકનું વળતર મળશે આ રોકાણ પર.',
      'ભાવ વધશે થોડા જ દિવસોમાં.',
      'ઝડપથી વેચાઈ રહ્યું છે જલ્દી કરો.',
    ];

    for (const claim of bannedClaims) {
      it(`rejects banned claim: "${claim}"`, () => {
        const result = verifyPostChecks({
          replyText: claim,
          citedFactIds: ['f1'],
          activeFacts: dummyFacts,
          confidence: 0.9,
        });
        expect(result.passed).toBe(false);
        expect(result.reason).toBe('banned_claim');
      });
    }
  });

  // ============================================================================
  // 5. TRANSCRIPT PERSISTENCE & OPT-OUT / RE-CONSENT INTEGRATION
  // ============================================================================
  describe('Transcript Persistence & Opt-Out / Re-Consent Lifecycle', () => {
    let testProjectId: string;

    beforeAll(async () => {
      const proj = await query<{ id: string }>('SELECT id FROM projects LIMIT 1');
      testProjectId = proj.rows[0]!.id;
    });

    afterAll(async () => {
      await query(`DELETE FROM leads WHERE email LIKE '%@guardrail-test.com'`);
    });

    it('persists assistant reply to messages table when human request is triggered (Defect #7)', async () => {
      const start = await chatService.startChat({
        language: 'en',
        projectId: testProjectId,
        source: 'website',
      });

      const reply = await chatService.sendMessage({
        conversationId: start.conversationId,
        message: 'Please connect me with a human executive',
        language: 'en',
      });

      expect(reply.isHandoff).toBe(true);

      // Verify DB persistence of assistant reply in messages table
      const messages = await chatRepository.getMessages(start.conversationId);
      const assistantReplies = messages.filter((m) => m.role === 'assistant');

      // Must have greeting + handoff reply
      expect(assistantReplies.length).toBeGreaterThanOrEqual(2);
      const lastMessage = assistantReplies[assistantReplies.length - 1]!;
      expect(lastMessage.content).toBe(reply.text);
    });

    it('allows buyer to continue chatting after opting out (Defect #8 & Requirement G)', async () => {
      const start = await chatService.startChat({
        language: 'en',
        projectId: testProjectId,
        source: 'website',
      });

      // 1. Opt out via chat
      const optOutReply = await chatService.sendMessage({
        conversationId: start.conversationId,
        message: 'STOP',
        language: 'en',
      });
      expect(optOutReply.text).toContain('unsubscribed');

      // 2. Send follow-up question - MUST NOT be blocked with a canned rejection!
      const followUpReply = await chatService.sendMessage({
        conversationId: start.conversationId,
        message: 'What is the price range of a 3 BHK?',
        language: 'en',
      });

      // Buyer receives real response, not blocked canned reply
      expect(followUpReply.text).not.toContain('You have unsubscribed from automated messages');
    });

    it('supports re-consent via POST /api/visits/manage/:token/re-consent', async () => {
      // 1. Create a test lead
      const leadRes = await query<{ id: string }>(
        `INSERT INTO leads (name, email, source, consent_status, opted_out_at, wants)
         VALUES ('Optout Tester', 'test@guardrail-test.com', 'website', 'withdrawn', NOW(), '2 BHK')
         RETURNING id`,
      );
      const leadId = leadRes.rows[0]!.id;

      // 2. Generate a magic link token
      const token = await signMagicLinkToken({
        leadId,
        bookingId: '00000000-0000-0000-0000-000000000000',
        purpose: 'manage_visit',
      });

      // 3. Call re-consent endpoint
      const res = await request(app)
        .post(`/api/visits/manage/${token}/re-consent`)
        .set('X-Housy-Client', 'test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // 4. Verify in DB that opted_out_at is cleared and consent_status is granted
      const checkRes = await query<{ opted_out_at: string | null; consent_status: string }>(
        `SELECT opted_out_at, consent_status FROM leads WHERE id = $1`,
        [leadId],
      );
      expect(checkRes.rows[0]!.opted_out_at).toBeNull();
      expect(checkRes.rows[0]!.consent_status).toBe('granted');
    });
  });
});
