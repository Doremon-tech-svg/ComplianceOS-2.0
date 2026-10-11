import { z } from 'zod';
import { json as groqJson } from '../../../services/groq.js';
import { ProfileFieldKeySchema } from '../../../contracts/aria.js';
import { QUESTIONS } from '../questionBank/loader.js';
import { ageBandFromAge, bandFromAmount, employeesBandFromCount, parseCount, parseIndianNumber, yearsBandFromYears } from './bands.js';
import { EXTRACT_SYSTEM_PROMPT, EXTRACT_USER_PROMPT } from '../prompts/extractSlots.js';

const ExtractSchema = z.object({
  updates: z.array(z.object({
    field: ProfileFieldKeySchema,
    value: z.any().nullable(),
    rawPhrase: z.string().optional(),
    confidence: z.number().min(0).max(1),
    quote: z.string().min(1),
  })),
  language: z.enum(['hi', 'en', 'hinglish']).optional(),
});

const bankValues = new Map(QUESTIONS.map((question) => [question.field, new Set((question.options ?? []).map((option) => option.value).filter((value) => value !== null))]));
const allowed = new Set([...bankValues.keys(), 'gstin', 'udyamNumber']);

export function normalizeEvidenceText(value) {
  return String(value || '').normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('hi-IN');
}

export function sanitizeForLlm(text) {
  return String(text || '')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gu, (match) => `XXXX-XXXX-${match.replace(/\D/g, '').slice(-4)}`)
    .replace(/(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])/giu, '[REDACTED PAN]')
    .replace(/\b(?:otp|one[- ]time password)\s*(?:is|:|=)?\s*[A-Z0-9]{4,8}\b/giu, '[REDACTED OTP]')
    .replace(/\bpassword\s*(?:is|:|=)\s*\S+/giu, '[REDACTED PASSWORD]');
}

function validValue(field, value) {
  if (value === null || value === undefined) return false;
  if (field === 'state' || field === 'district' || field === 'gstin' || field === 'udyamNumber') return typeof value === 'string' && value.trim().length > 0;
  if (field === 'turnoverBand') return bankValues.get(field)?.has(value) || false;
  return bankValues.get(field)?.has(value) || false;
}

export async function extractSlots(text, options = {}) {
  if (!String(text || '').trim()) return { updates: [], llmTokens: 0, language: options.language || 'hinglish' };
  const schema = ExtractSchema;
  const allowedValues = Object.fromEntries([...allowed].map((field) => [field, [...(bankValues.get(field) || [])]]));
  const userPrompt = EXTRACT_USER_PROMPT(sanitizeForLlm(text), allowedValues);
  const caller = options.groqJson || ((targetSchema, system, user, config) => groqJson(targetSchema, system, user, config));
  // One repair attempt is delegated to the shared JSON adapter.
  let result;
  try {
    result = await caller(schema, EXTRACT_SYSTEM_PROMPT, userPrompt, { maxTokens: 500 });
  } catch {
    return { updates: [], llmTokens: 0, language: options.language || 'hinglish' };
  }

  const updates = [];
  for (const item of result.data?.updates || []) {
    if (!allowed.has(item.field) || !normalizeEvidenceText(text).includes(normalizeEvidenceText(item.quote))) continue;
    let value = item.value;
    if (item.field === 'turnoverBand') {
      const amount = parseIndianNumber(item.rawPhrase || item.quote);
      if (!amount) continue;
      value = bandFromAmount(amount.rupees);
    } else if (item.field === 'ownerAgeBand') {
      const age = parseCount(item.rawPhrase || item.quote);
      if (age === null) continue;
      value = ageBandFromAge(age);
    } else if (item.field === 'employeesBand') {
      const count = parseCount(item.rawPhrase || item.quote);
      if (count === null) continue;
      value = employeesBandFromCount(count);
    } else if (item.field === 'yearsInBusiness') {
      const years = parseCount(item.rawPhrase || item.quote);
      if (years === null) continue;
      value = yearsBandFromYears(years);
    }
    if (!validValue(item.field, value)) continue;
    const confidence = options.via === 'voice'
      ? Math.min(item.confidence, options.asrConfidence ?? 1)
      : item.confidence;
    updates.push({ field: item.field, value, rawPhrase: item.rawPhrase, confidence, quote: item.quote });
  }
  return { updates, llmTokens: result.tokens || 0, language: result.data?.language || options.language || 'hinglish' };
}
