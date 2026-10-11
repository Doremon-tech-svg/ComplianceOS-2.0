import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const localized = z.object({ hi: z.string().min(1), en: z.string().min(1), hinglish: z.string().min(1) });
const optionSchema = z.object({ id: z.string().min(1), value: z.any(), label: localized });
const QuestionSchema = z.object({
  id: z.string().min(1), field: z.string().min(1), kind: z.enum(['single', 'multi', 'yes_no', 'band', 'free']),
  text: localized, why: localized, tier: z.enum(['core', 'extended']), sensitivity: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  options: z.array(optionSchema).optional(),
  placeholder: localized.optional(),
  validation: z.object({ minLength: z.number().optional(), maxLength: z.number().optional() }).optional(),
  askOnlyIf: z.object({ field: z.string(), eq: z.any() }).optional(),
});
const BankSchema = z.object({ reviewStatus: z.literal('NEEDS_NATIVE_REVIEW'), questions: z.array(QuestionSchema).min(1) });

const bankUrl = new URL('./questions.json', import.meta.url);
export const QUESTION_BANK = BankSchema.parse(JSON.parse(await readFile(fileURLToPath(bankUrl), 'utf8')));
export const QUESTIONS = QUESTION_BANK.questions;
export const QUESTION_BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));

function validateUniqueness(bank) {
  const ids = bank.questions.map((question) => question.id);
  if (new Set(ids).size !== ids.length) throw new Error('ARIA question ids must be unique');
  for (const question of bank.questions) {
    if (question.kind === 'free') continue;
    const optionIds = question.options.map((option) => option.id);
    if (!optionIds.includes('unsure')) throw new Error(`Question ${question.id} must include an unsure option`);
    if (new Set(optionIds).size !== optionIds.length) throw new Error(`Question ${question.id} has duplicate option ids`);
  }
  return bank;
}

validateUniqueness(QUESTION_BANK);

export async function loadQuestionBank(filePath = fileURLToPath(bankUrl)) {
  return validateUniqueness(BankSchema.parse(JSON.parse(await readFile(path.resolve(filePath), 'utf8'))));
}
