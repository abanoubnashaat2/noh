import React, { useState } from 'react';
import { User, View } from '../types';
import { TRIP_CODE_VALID, AVATARS, ADMIN_CODE } from '../constants';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [step, setStep] = useState<'PHONE' | 'DETAILS'>('PHONE');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [error, setError] = useState('');

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 8) {
      setError('يرجى إدخال رقم هاتف صحيح');
      return;
    }
    setError('');
    setStep('DETAILS');
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Admin Override
    if (code === ADMIN_CODE) {
      onLogin({
        id: 'admin-' + Date.now(),
        name: 'القائد',
        phone,
        avatarId: 0,
        score: 0,
        isAdmin: true,
        tripCode: code
      });
      return;
    }

    if (code.toUpperCase() !== TRIP_CODE_VALID) {
      setError('كود الرحلة غير صحيح');
      return;
    }

    if (name.length < 3) {
      setError('الاسم يجب أن يكون 3 أحرف على الأقل');
      return;
    }

    // Create User
    const newUser: User = {
      id: 'user-' + Date.now(),
      name,
      phone,
      avatarId: selectedAvatar,
      score: 0,
      isAdmin: false,
      tripCode: code
    };

    // Simulate "Single Session" by clearing old local storage
    localStorage.removeItem('noah_user_session');
    
    onLogin(newUser);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-b from-primary to-blue-900 text-white p-6">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-xl">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">⚓</div>
          <h1 className="text-3xl font-bold mb-2">سفينة نوح</h1>
          <p className="text-blue-200">رحلة إلى العمق</p>
        </div>

        {error && (
          <div className="bg-red-500/80 text-white p-3 rounded-xl mb-6 text-center text-sm">
            {error}
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-6">
            <div>
              <label className="block text-sm mb-2 text-blue-200">رقم الهاتف</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/20 border border-blue-300/30 rounded-xl px-4 py-3 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="01xxxxxxxxx"
                dir="ltr"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-secondary hover:bg-yellow-400 text-blue-900 font-bold py-3 rounded-xl transition-all transform hover:scale-105"
            >
              متابعة
            </button>
          </form>
        ) : (
          <form onSubmit={handleFinalSubmit} className="space-y-6">
             <div>
              <label className="block text-sm mb-2 text-blue-200">كود الرحلة</label>
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full bg-white/20 border border-blue-300/30 rounded-xl px-4 py-3 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-secondary text-center tracking-widest uppercase"
                placeholder="******"
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-blue-200">اسمك</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/20 border border-blue-300/30 rounded-xl px-4 py-3 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="الاسم الثلاثي"
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-blue-200">اختر صورة رمزية</label>
              <div className="flex flex-wrap gap-2 justify-center">
                {AVATARS.map((emoji, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(idx)}
                    className={`text-2xl w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      selectedAvatar === idx ? 'bg-secondary scale-110' : 'bg-white/10 hover:bg-white/30'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-secondary hover:bg-yellow-400 text-blue-900 font-bold py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg"
            >
              دخول السفينة
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;