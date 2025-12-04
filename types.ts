export enum View {
  AUTH = 'AUTH',
  HOME = 'HOME',
  LIVE_QUIZ = 'LIVE_QUIZ',
  QR_HUNT = 'QR_HUNT',
  LEADERBOARD = 'LEADERBOARD',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  phone: string;
  avatarId: number;
  score: number;
  isAdmin: boolean;
  tripCode: string;
}

export enum QuestionType {
  TEXT = 'TEXT',
  AUDIO = 'AUDIO',
  VERSE = 'VERSE'
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  type: QuestionType;
  mediaUrl?: string; // For audio
  points: number;
  difficulty?: string; // Added field
  context?: string; // Added field for "Context/To Whom"
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarId: number;
  score: number;
}