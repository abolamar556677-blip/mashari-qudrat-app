export const ERROR_REASONS = {
  'ف': 'فهم',
  'ق': 'قانون',
  'ح': 'حساب',
  'س': 'استعجال',
  'و': 'وقت',
  'خ': 'خيار'
};

export const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
export const VALID_TYPES = new Set(['quantitative', 'verbal']);

export function normalizeQuestionType(type, section) {
  if (type === 'quantitative') return 'quantitative';
  if (type === 'verbal') return 'verbal';
  if (!type && section === 'كمي') return 'quantitative';
  if (!type && section === 'لفظي') return 'verbal';
  return null;
}

export function typeLabel(type) {
  return type === 'quantitative' ? 'كمي' : 'لفظي';
}

export function normalizeChoices(choices) {
  if (Array.isArray(choices)) return choices.map((choice) => String(choice ?? '').trim());
  if (choices && typeof choices === 'object') {
    return ['A', 'B', 'C', 'D'].map((key) => String(choices[key] ?? '').trim());
  }
  return [];
}

export function normalizeCorrectAnswer(correctAnswer, choices) {
  const raw = String(correctAnswer ?? '').trim();
  const letterIndex = { A: 0, B: 1, C: 2, D: 3 }[raw.toUpperCase()];
  if (letterIndex !== undefined) return choices[letterIndex] || '';
  return raw;
}

export function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function validateAndNormalizeQuestion(raw, source = 'ملف مستورد') {
  const errors = [];
  const id = String(raw?.id ?? '').trim();
  const type = normalizeQuestionType(raw?.type, raw?.section);
  const question = String(raw?.question ?? '').trim();
  const choices = normalizeChoices(raw?.choices);
  const correctAnswer = normalizeCorrectAnswer(raw?.correctAnswer ?? raw?.correct_answer ?? raw?.answer, choices);
  const explanation = String(raw?.explanation ?? '').trim();
  const difficulty = String(raw?.difficulty ?? '').trim();

  if (!id) errors.push('id مفقود');
  if (!type) errors.push('type غير صالح ولا يوجد section صالح');
  if (!question) errors.push('question فارغ');
  if (choices.length !== 4) errors.push('choices يجب أن تحتوي 4 خيارات بالضبط');
  if (choices.some((choice) => !choice)) errors.push('يوجد خيار فارغ');
  if (!correctAnswer) errors.push('correctAnswer مفقود');
  if (correctAnswer && !choices.includes(correctAnswer)) errors.push('correctAnswer غير موجود حرفيًا داخل choices');
  if (!explanation) errors.push('explanation فارغ');
  if (!VALID_DIFFICULTIES.has(difficulty)) errors.push('difficulty يجب أن يكون easy أو medium أو hard');

  if (errors.length) return { question: null, errors };

  return {
    errors: [],
    question: {
      id,
      type,
      section: typeLabel(type),
      skill: raw.skill || raw.category || 'عام',
      category: raw.category || raw.skill || 'عام',
      difficulty,
      question,
      choices,
      correctAnswer,
      explanation,
      source: raw.source || source,
      page: raw.page || null,
      tags: Array.isArray(raw.tags) ? raw.tags : []
    }
  };
}

export const sampleQuestions = [
  {
    id: 'DEMO-Q-001',
    section: 'كمي',
    skill: 'النسبة المئوية',
    difficulty: 'easy',
    question: 'إذا كان 20% من عدد يساوي 18، فما العدد؟',
    choices: ['60', '80', '90', '120'],
    correctAnswer: '90',
    explanation: 'نقسم 18 على 0.20 فيكون الناتج 90.',
    tags: ['نسبة']
  },
  {
    id: 'DEMO-Q-002',
    type: 'quantitative',
    skill: 'المتوسط',
    difficulty: 'medium',
    question: 'متوسط خمسة أعداد يساوي 12، فما مجموعها؟',
    choices: ['48', '50', '60', '72'],
    correctAnswer: '60',
    explanation: 'المجموع = المتوسط × عدد القيم = 12 × 5 = 60.',
    tags: ['متوسط']
  },
  {
    id: 'DEMO-V-001',
    section: 'لفظي',
    skill: 'المرادفات',
    difficulty: 'easy',
    question: 'ما مرادف كلمة: وجيز؟',
    choices: ['قصير', 'بعيد', 'غامض', 'كبير'],
    correctAnswer: 'قصير',
    explanation: 'الوجيز هو المختصر أو القصير.',
    tags: ['مرادف']
  },
  {
    id: 'DEMO-V-002',
    type: 'verbal',
    skill: 'التناظر اللفظي',
    difficulty: 'medium',
    question: 'قلم : كتابة = فرشاة : ؟',
    choices: ['رسم', 'قراءة', 'قياس', 'قطع'],
    correctAnswer: 'رسم',
    explanation: 'القلم أداة للكتابة، والفرشاة أداة للرسم.',
    tags: ['تناظر']
  }
];
