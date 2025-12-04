import { Question, QuestionType, User } from './types';

export const APP_NAME = "سفينة نوح";
export const TRIP_CODE_VALID = "852456";
export const ADMIN_CODE = "ADMIN123";

// Avatars (using emojis or placeholder images)
export const AVATARS = [
  "👨‍✈️", "👩‍✈️", "🦁", "🕊️", "⚓", "🌊", "⛪", "🕯️"
];

// Live Questions for Speed Quiz
export const LIVE_QUESTIONS: Question[] = [
  {
    id: 'sq1',
    text: 'ما هو عدد أسفار العهد الجديد؟',
    options: ['39', '27', '66', '40'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'سهل'
  },
  {
    id: 'sq2',
    text: 'من هو التلميذ الذي مشى على الماء مع المسيح؟',
    options: ['يوحنا', 'بطرس', 'يعقوب', 'أندراوس'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'سهل'
  },
  {
    id: 'sq3',
    text: 'ما هي أقصر آية في الكتاب المقدس؟',
    options: ['افرحوا', 'بكى يسوع', 'صلوا', 'الله محبة'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط'
  },
  {
    id: 'sq4',
    text: 'في أي مدينة ولد السيد المسيح؟',
    options: ['الناصرة', 'أورشليم', 'بيت لحم', 'الجليل'],
    correctIndex: 2,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'سهل'
  },
  {
    id: 'sq5',
    text: 'كم سنة عاش متوشالح (أكبر معمر في الكتاب)؟',
    options: ['900 سنة', '950 سنة', '1000 سنة', '969 سنة'],
    correctIndex: 3,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'صعب'
  },
  {
    id: 'sq6',
    text: 'من هو النبي الذي ابتلعه الحوت؟',
    options: ['دانيال', 'إرميا', 'يونان', 'أيوب'],
    correctIndex: 2,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'سهل'
  },
  {
    id: 'sq7',
    text: 'ما هو السفر الذي يقع في منتصف الكتاب المقدس تماماً؟',
    options: ['الأمثال', 'المزامير', 'إشعياء', 'التكوين'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط'
  }
];

// Who Said It Questions
export const WHO_SAID_IT_QUESTIONS: Question[] = [
  {
    id: 'ws1',
    text: 'أحقا قال الله لا تأكلا من كل شجر الجنة؟',
    options: ['آدم', 'حواء', 'الحية', 'قايين'],
    correctIndex: 2,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'سهل',
    context: 'لحواء'
  },
  {
    id: 'ws2',
    text: 'ربي وإلهي',
    options: ['بطرس', 'يوحنا', 'توما', 'مجدلية'],
    correctIndex: 2,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'سهل',
    context: 'للمسيح بعد القيامة'
  },
  {
    id: 'ws3',
    text: 'بقليل تقنعني أن أصير مسيحياً',
    options: ['فستوس', 'الملك أغريباس', 'هيرودس', 'قيصر'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط',
    context: 'لبولس الرسول'
  },
  {
    id: 'ws4',
    text: 'ينبغي أن ذلك يزيد وأني أنا أنقص',
    options: ['يوحنا المعمدان', 'يوحنا الرسول', 'بطرس', 'أندراوس'],
    correctIndex: 0,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط',
    context: 'عن المسيح'
  },
  {
    id: 'ws5',
    text: 'يا رب لا تحسب لهم هذه الخطية',
    options: ['يسوع', 'اسطفانوس', 'بولس', 'يعقوب'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط',
    context: 'وهو يُرجم'
  },
  {
    id: 'ws6',
    text: 'لأنني أعلم بمن آمنت',
    options: ['بطرس', 'بولس الرسول', 'يوحنا', 'تيموثاوس'],
    correctIndex: 1,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'صعب',
    context: 'لتيموثاوس'
  }
];

// Mock Leaderboard
export const MOCK_LEADERBOARD: User[] = [
  { id: 'u2', name: 'مارينا', phone: '012...', avatarId: 1, score: 450, isAdmin: false, tripCode: TRIP_CODE_VALID },
  { id: 'u3', name: 'بيتر', phone: '010...', avatarId: 2, score: 380, isAdmin: false, tripCode: TRIP_CODE_VALID },
  { id: 'u4', name: 'كيرلس', phone: '015...', avatarId: 4, score: 320, isAdmin: false, tripCode: TRIP_CODE_VALID },
  { id: 'u5', name: 'مريم', phone: '011...', avatarId: 3, score: 290, isAdmin: false, tripCode: TRIP_CODE_VALID },
];