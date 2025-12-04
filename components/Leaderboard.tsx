import React from 'react';
import { User } from '../types';
import { AVATARS } from '../constants';

interface LeaderboardProps {
  currentUser: User;
  data: User[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ currentUser, data }) => {
  // Safe guard: Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];

  // Sort data desc by score. Filter out invalid users to prevent crashes.
  const sortedData = [...safeData]
    .filter(u => u && typeof u === 'object' && u.id)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <span>🏆</span> لوحة الصدارة
      </h2>

      <div className="space-y-3">
        {sortedData.map((user, index) => {
          // Extra safety check although filtered above
          if (!user) return null;

          const isMe = currentUser && user.id === currentUser.id;
          let rankColor = "bg-white border-slate-100";
          let badge = null;

          if (index === 0) {
            rankColor = "bg-yellow-50 border-yellow-400";
            badge = "🥇";
          } else if (index === 1) {
             rankColor = "bg-slate-50 border-slate-300";
             badge = "🥈";
          } else if (index === 2) {
             rankColor = "bg-orange-50 border-orange-300";
             badge = "🥉";
          }

          if (isMe) rankColor += " border-2 border-primary ring-2 ring-blue-100";

          // Safely access properties
          const displayName = user.name || "مستخدم مجهول";
          const displayId = user.id ? (user.id.length > 4 ? user.id.slice(-4) : user.id) : "####";
          const avatar = AVATARS[user.avatarId] || "👤";

          return (
            <div 
                key={user.id || index} 
                className={`flex items-center p-3 rounded-2xl shadow-sm border ${rankColor} transition-all`}
            >
              <div className="w-8 font-bold text-slate-400 text-center">{index + 1}</div>
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-2xl relative">
                {avatar}
                {badge && <span className="absolute -top-1 -right-1 text-xs">{badge}</span>}
              </div>
              <div className="flex-grow pr-4">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                    {displayName}
                    {isMe && <span className="text-[10px] bg-primary text-white px-2 rounded-full">أنا</span>}
                </div>
                <div className="text-xs text-slate-400 font-mono">{displayId}</div>
              </div>
              <div className="font-black text-xl text-primary">{user.score || 0}</div>
            </div>
          );
        })}
        {sortedData.length === 0 && (
            <div className="text-center text-slate-400 py-10">
                لا يوجد متسابقين حتى الآن
            </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;