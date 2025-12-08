
export enum View {
  AUTH = 'AUTH',
  HOME = 'HOME',
  LIVE_QUIZ = 'LIVE_QUIZ',
  SPIN_WHEEL = 'SPIN_WHEEL', // Replaced QR_HUNT
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
  TEXT = 'TEXT', // Multiple Choice
  INPUT = 'INPUT', // Direct Text Answer (New)
  AUDIO = 'AUDIO',
  VERSE = 'VERSE'
}

export interface Question {
  id: string;
  text: string;
  options: string[]; // Used for TEXT type
  correctIndex: number; // Used for TEXT type
  correctAnswerText?: string; // Used for INPUT type
  type: QuestionType;
  mediaUrl?: string; // For audio
  points: number;
  difficulty?: string;
  context?: string; 
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarId: number;
  score: number;
}

export interface AdminMessage {
  id: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface AdminCommand {
  text: string;
  timestamp: number;
  type: 'alert' | 'judgment'; 
}
