import React from 'react';
import { View, User } from '../types';
import { AVATARS } from '../constants';

interface NavProps {
  currentView: View;
  user: User;
  onChangeView: (v: View) => void;
  onLogout: () => void;
}

export const TopBar: React.FC<{ user: User, onLogout: () => void, score: number }> = ({ user, onLogout, score }) => (
    <div className="bg-white px-4 py-3 shadow-sm flex justify-between items-center z-10 sticky top-0">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center border border-blue-200">
                {AVATARS[user.avatarId] || "😐"}
            </div>
            <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700">{user.name}</span>
                <span className="text-[10px] text-slate-400">سفينة نوح</span>
            </div>
        </div>
        <div className="flex items-center gap-3">
             <div className="bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                 <span className="font-black text-secondary text-sm">{score} نقطة</span>
             </div>
             <button onClick={onLogout} className="text-red-400 hover:text-red-600">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                 </svg>
             </button>
        </div>
    </div>
);

export const BottomNav: React.FC<NavProps> = ({ currentView, onChangeView, user }) => {
  const items = [
    { id: View.HOME, label: 'الرئيسية', icon: '🏠' },
    { id: View.LEADERBOARD, label: 'الترتيب', icon: '🏆' },
    { id: View.LIVE_QUIZ, label: 'المباشر', icon: '⚡' },
    // Removed Solo Games Tab
  ];

  if (user.isAdmin) {
      items.push({ id: View.ADMIN, label: 'أدمن', icon: '⚙️' });
  }

  return (
    <div className="bg-white border-t border-slate-200 pb-safe pt-2 px-2 flex justify-around items-center sticky bottom-0 z-20">
      {items.map((item) => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChangeView(item.id)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all duration-300 ${isActive ? 'text-primary -translate-y-2' : 'text-slate-400'}`}
          >
            <span className={`text-2xl mb-1 ${isActive ? 'scale-125' : ''}`}>{item.icon}</span>
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};