import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import { View, User, Question, QuestionType } from './types';
import { LIVE_QUESTIONS, WHO_SAID_IT_QUESTIONS, MOCK_LEADERBOARD } from './constants';
import LiveGame from './components/LiveGame';
import { QRScanner } from './components/SoloZone';
import Leaderboard from './components/Leaderboard';
import { BottomNav, TopBar } from './components/Navigation';
import { db, isConfigured, saveManualConfig, clearManualConfig } from './firebase';
import { ref, onValue, set, update, push, child } from "firebase/database";

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>(View.AUTH);
  
  // Game State
  const [score, setScore] = useState(0);
  const [activeLiveQuestion, setActiveLiveQuestion] = useState<Question | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<User[]>(MOCK_LEADERBOARD);
  
  // Setup Modal State
  const [showSetup, setShowSetup] = useState(!isConfigured);
  const [configInput, setConfigInput] = useState('');
  const [setupError, setSetupError] = useState('');
  
  // Admin State for Dynamic Questions with Persistence
  const [questionsList, setQuestionsList] = useState<Question[]>(() => {
    try {
      const saved = localStorage.getItem('noah_questions_v1');
      return saved ? JSON.parse(saved) : LIVE_QUESTIONS;
    } catch (e) {
      return LIVE_QUESTIONS;
    }
  });

  const [isEditing, setIsEditing] = useState(false);
  const [questionForm, setQuestionForm] = useState<Question>({
    id: '',
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط'
  });
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // UI State
  const [showQR, setShowQR] = useState(false);
  const [justSentId, setJustSentId] = useState<string | null>(null);

  // Load user from local storage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('noah_user_session');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      setScore(parsed.score);
      setView(View.HOME);
    }
  }, []);

  // ---------------------------------------------------------
  // REAL-TIME SYNC LOGIC (FIREBASE)
  // ---------------------------------------------------------
  useEffect(() => {
    if (!db) return;

    // 1. Listen for Active Question Changes
    const questionRef = ref(db, 'activeQuestion');
    const unsubscribeQuestion = onValue(questionRef, (snapshot) => {
        const data = snapshot.val();
        setActiveLiveQuestion(data || null);
    });

    // 2. Listen for Leaderboard/Users Changes
    const usersRef = ref(db, 'users');
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const usersList = Object.values(data) as User[];
            setLeaderboardData(usersList);
            
            // Sync my own score if it changed externally
            if (user) {
                const myData = usersList.find(u => u.id === user.id);
                if (myData && myData.score !== score) {
                    setScore(myData.score);
                    const updatedLocal = { ...user, score: myData.score };
                    localStorage.setItem('noah_user_session', JSON.stringify(updatedLocal));
                    setUser(updatedLocal);
                }
            }
        } else {
             setLeaderboardData(MOCK_LEADERBOARD);
        }
    });

    return () => {
        unsubscribeQuestion();
        unsubscribeUsers();
    };
  }, [user]); // user dependency ensures logic runs after login if needed

  // Persist Questions (Admin Local Only)
  useEffect(() => {
    localStorage.setItem('noah_questions_v1', JSON.stringify(questionsList));
  }, [questionsList]);

  // Handle Firebase Config Submission
  const handleConfigSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setSetupError('');
      
      try {
        // Try to find JSON object in input
        const firstBrace = configInput.indexOf('{');
        const lastBrace = configInput.lastIndexOf('}');
        
        if(firstBrace === -1 || lastBrace === -1) {
            // Maybe they pasted just the Postgres URL?
            if (configInput.includes('postgres')) {
                throw new Error("⚠️ هذا رابط PostgresSQL ولا يعمل مع هذا التطبيق. نحن نحتاج Firebase.");
            }
            throw new Error("لم يتم العثور على كود JSON صحيح.");
        }
        
        const jsonStr = configInput.substring(firstBrace, lastBrace + 1);
        const config = JSON.parse(jsonStr);
        
        if(!config.apiKey || !config.databaseURL) {
             throw new Error("الكود ينقصه apiKey أو databaseURL");
        }
        
        if (config.databaseURL.includes('postgres')) {
             throw new Error("⚠️ لا يمكن استخدام رابط Postgres في خانة databaseURL.");
        }

        saveManualConfig(config);
      } catch (err: any) {
          setSetupError(err.message || "خطأ في قراءة الكود");
      }
  };

  const handleLogin = (u: User) => {
    setUser(u);
    setScore(u.score);
    localStorage.setItem('noah_user_session', JSON.stringify(u));
    setView(View.HOME);
    
    // Sync User to Firebase
    if (db) {
        set(ref(db, 'users/' + u.id), u).catch(err => console.error("Login Sync Error", err));
    } else {
        // Fallback for local leaderboard
        if (!leaderboardData.find(x => x.id === u.id)) {
            setLeaderboardData(prev => [...prev, u]);
        }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('noah_user_session');
    setUser(null);
    setView(View.AUTH);
  };

  const handleScoreUpdate = (points: number) => {
    const newScore = score + points;
    setScore(newScore);
    
    // Update local
    if (user) {
        const updatedUser = { ...user, score: newScore };
        setUser(updatedUser);
        localStorage.setItem('noah_user_session', JSON.stringify(updatedUser));

        // Update Firebase
        if (db) {
            update(ref(db, 'users/' + user.id), { score: newScore });
        } else {
            // Local fallback
            setLeaderboardData(prev => prev.map(u => u.id === user.id ? updatedUser : u));
        }
    }
  };

  const playFeedbackSound = (type: 'correct' | 'wrong') => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  };

  // ADMIN FUNCTIONS
  const triggerLiveQuestion = (qId: string) => {
      // Check local dynamic list first, then static fallback
      let q = questionsList.find(x => x.id === qId);
      if (!q) {
          q = WHO_SAID_IT_QUESTIONS.find(x => x.id === qId);
      }
      
      if (q) {
          // Push to Firebase
          if (db) {
            set(ref(db, 'activeQuestion'), q);
          } else {
             // Fallback
             setActiveLiveQuestion(q);
             localStorage.setItem('noah_active_question_data', JSON.stringify(q));
          }
          
          // Trigger Animation
          setJustSentId(qId);
          setTimeout(() => setJustSentId(null), 1500);
      }
  };

  const closeLiveQuestion = () => {
      if (db) {
          set(ref(db, 'activeQuestion'), null);
      } else {
          setActiveLiveQuestion(null);
          localStorage.removeItem('noah_active_question_data');
      }
  };

  // Question Management Logic
  const resetForm = () => {
    setQuestionForm({
      id: '',
      text: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      type: QuestionType.TEXT,
      points: 100,
      difficulty: 'متوسط'
    });
    setIsEditing(false);
  };

  const handleEditClick = (q: Question) => {
    setQuestionForm(q);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
      setQuestionsList(prev => prev.filter(q => q.id !== deleteTargetId));
      
      if (isEditing && questionForm.id === deleteTargetId) {
        resetForm();
      }
    }
    setShowDeleteModal(false);
    setDeleteTargetId(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTargetId(null);
  }

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (questionForm.id) {
        setQuestionsList(prev => prev.map(q => q.id === questionForm.id ? questionForm : q));
    } else {
        const newQ = { ...questionForm, id: 'custom-' + Date.now() };
        setQuestionsList(prev => [newQ, ...prev]);
    }
    resetForm();
  };

  const handleOptionChange = (idx: number, val: string) => {
    const newOpts = [...questionForm.options];
    newOpts[idx] = val;
    setQuestionForm({ ...questionForm, options: newOpts });
  };

  const handleResetQuestions = () => {
    if(window.confirm('هل تريد استعادة الأسئلة الافتراضية؟')) {
        setQuestionsList(LIVE_QUESTIONS);
        localStorage.removeItem('noah_questions_v1');
    }
  }

  // Render Setup Screen
  if (showSetup) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-6">
                    <div className="text-4xl mb-2">⚙️</div>
                    <h2 className="text-xl font-bold text-slate-800">إعداد قاعدة البيانات</h2>
                    <p className="text-slate-500 text-sm mt-1">التطبيق يحتاج للربط مع Firebase ليعمل أونلاين</p>
                </div>

                <form onSubmit={handleConfigSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                             إعدادات Firebase (Config Object)
                        </label>
                        <textarea
                            value={configInput}
                            onChange={e => setConfigInput(e.target.value)}
                            placeholder={'Example: { apiKey: "...", databaseURL: "..." }'}
                            className="w-full h-32 p-3 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-primary outline-none"
                            dir="ltr"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            يمكنك الحصول عليها من إعدادات المشروع في Firebase Console.
                        </p>
                    </div>

                    {setupError && (
                        <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100">
                            {setupError}
                        </div>
                    )}

                    <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-sky-600 transition">
                        حفظ واتصال 🚀
                    </button>
                    
                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-300 text-xs">أو</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    <button 
                        type="button" 
                        onClick={() => setShowSetup(false)}
                        className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
                    >
                        تجربة بدون إنترنت (Offline Mode)
                    </button>
                </form>
            </div>
        </div>
      );
  }

  // Render Main Content
  const renderContent = () => {
    if (showQR) {
        return <QRScanner onScan={(data) => {
            alert(`تم مسح الكود: ${data} - حصلت على 50 نقطة!`);
            handleScoreUpdate(50);
            setShowQR(false);
        }} onClose={() => setShowQR(false)} />;
    }

    switch (view) {
      case View.HOME:
        return (
          <div className="p-4 flex flex-col gap-4 h-full content-start">
             <div className="bg-gradient-to-r from-primary to-blue-500 rounded-2xl p-6 text-white shadow-lg mb-2 relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 text-9xl opacity-20">🚢</div>
                <h2 className="text-2xl font-bold mb-2">مرحباً {user?.name}</h2>
                <p className="opacity-90">استعد للمسابقة المباشرة!</p>
             </div>

             {activeLiveQuestion && (
                <div 
                    onClick={() => setView(View.LIVE_QUIZ)}
                    className="bg-red-500 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse cursor-pointer border-2 border-red-400"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">⚡</span>
                        <div className="flex flex-col">
                            <span className="font-bold">سؤال مباشر نشط!</span>
                            <span className="text-xs text-red-100">اضغط للدخول الآن</span>
                        </div>
                    </div>
                    <span className="bg-white text-red-600 px-3 py-1 rounded-full text-xs font-bold">دخول</span>
                </div>
             )}

             <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setView(View.LIVE_QUIZ)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 hover:bg-slate-50 transition-all active:scale-95 relative overflow-hidden">
                    <span className="text-5xl mb-2">⚡</span>
                    <span className="font-bold text-slate-700 text-lg">المسابقة</span>
                    <span className="text-xs text-slate-400">أسئلة مباشرة</span>
                </button>

                <button onClick={() => setShowQR(true)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 hover:bg-slate-50 transition-all active:scale-95">
                    <span className="text-5xl mb-2">📸</span>
                    <span className="font-bold text-slate-700 text-lg">صائد الكنوز</span>
                    <span className="text-xs text-slate-400">امسح الكود واكسب</span>
                </button>
             </div>
             
             <button onClick={() => setView(View.LEADERBOARD)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 mt-2">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">🏆</span>
                    <div className="text-right">
                        <span className="font-bold text-slate-700 block">لوحة الصدارة</span>
                        <span className="text-xs text-slate-400">شاهد ترتيبك الحالي</span>
                    </div>
                </div>
                <span className="text-slate-400">←</span>
             </button>

             {!isConfigured && (
                 <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex justify-between items-center">
                     <span className="text-xs text-yellow-800">⚠️ وضع الأوفلاين (محلي فقط)</span>
                     <button onClick={() => setShowSetup(true)} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-bold">إعداد</button>
                 </div>
             )}
          </div>
        );
      case View.LIVE_QUIZ:
        return <LiveGame question={activeLiveQuestion} onAnswer={handleScoreUpdate} onPlaySound={playFeedbackSound} />;
      case View.LEADERBOARD:
        return <Leaderboard currentUser={user!} data={leaderboardData} />;
      case View.ADMIN:
        return (
            <div className="p-4 relative pb-20">
                {!isConfigured && (
                    <div className="mb-4 bg-red-100 border border-red-300 text-red-800 p-4 rounded-xl text-center">
                        <h3 className="font-bold mb-1">⚠️ وضع غير متصل</h3>
                        <p className="text-xs mb-2">
                            أنت تعمل في الوضع المحلي. الأسئلة لن تصل لأحد.
                        </p>
                        <button onClick={() => setShowSetup(true)} className="text-xs bg-white border border-red-200 px-3 py-1 rounded font-bold shadow-sm">
                            ربط قاعدة البيانات
                        </button>
                    </div>
                )}
                
                {/* Delete Modal Code ... */}
                {showDeleteModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl border border-slate-100">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-red-500">
                                🗑️
                            </div>
                            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">حذف السؤال؟</h3>
                            <p className="text-sm text-center text-slate-500 mb-6 leading-relaxed">
                                هل أنت متأكد من رغبتك في حذف هذا السؤال؟ <br/>
                                <span className="text-red-400 text-xs">لا يمكن التراجع عن هذا الإجراء.</span>
                            </p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={cancelDelete} 
                                    className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                                >
                                    لا
                                </button>
                                <button 
                                    onClick={confirmDelete} 
                                    className="flex-1 py-2.5 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200 transition-colors"
                                >
                                    نعم
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">لوحة تحكم القائد</h2>
                    <button onClick={handleResetQuestions} className="text-[10px] text-red-400 underline">استعادة الافتراضي</button>
                </div>
                
                {/* Question Editor Form */}
                <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-8">
                    <h3 className="font-bold text-lg mb-3 text-primary">
                        {isEditing ? '✏️ تعديل سؤال' : '➕ إضافة سؤال جديد'}
                    </h3>
                    <form onSubmit={handleSaveQuestion} className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500">نص السؤال</label>
                            <input 
                                type="text" 
                                required
                                value={questionForm.text} 
                                onChange={e => setQuestionForm({...questionForm, text: e.target.value})}
                                className="w-full border p-2 rounded-lg mt-1 focus:ring-2 focus:ring-primary outline-none" 
                                placeholder="اكتب السؤال هنا..." 
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="w-1/2">
                                <label className="text-xs font-bold text-slate-500">النقاط</label>
                                <input 
                                    type="number" 
                                    required
                                    value={questionForm.points} 
                                    onChange={e => setQuestionForm({...questionForm, points: parseInt(e.target.value)})}
                                    className="w-full border p-2 rounded-lg mt-1 focus:ring-2 focus:ring-primary outline-none" 
                                />
                            </div>
                            <div className="w-1/2">
                                <label className="text-xs font-bold text-slate-500">الصعوبة</label>
                                <select 
                                    value={questionForm.difficulty} 
                                    onChange={e => setQuestionForm({...questionForm, difficulty: e.target.value})}
                                    className="w-full border p-2 rounded-lg mt-1 bg-white"
                                >
                                    <option value="سهل">سهل</option>
                                    <option value="متوسط">متوسط</option>
                                    <option value="صعب">صعب</option>
                                </select>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            {questionForm.options.map((opt, idx) => (
                                <div key={idx}>
                                     <label className="text-[10px] font-bold text-slate-400 flex justify-between">
                                        خيار {idx + 1}
                                        <input 
                                            type="radio" 
                                            name="correctIdx" 
                                            checked={questionForm.correctIndex === idx}
                                            onChange={() => setQuestionForm({...questionForm, correctIndex: idx})}
                                        />
                                     </label>
                                     <input 
                                        type="text"
                                        required
                                        value={opt}
                                        onChange={e => handleOptionChange(idx, e.target.value)}
                                        className={`w-full border p-2 rounded-lg mt-1 text-sm ${questionForm.correctIndex === idx ? 'border-green-500 bg-green-50' : ''}`}
                                        placeholder={`الإجابة ${idx + 1}`}
                                     />
                                </div>
                            ))}
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                            <button type="submit" className="flex-1 bg-primary text-white py-2 rounded-lg font-bold hover:bg-sky-600 transition">
                                {isEditing ? 'حفظ التعديلات' : 'إضافة للقائمة'}
                            </button>
                            {isEditing && (
                                <button type="button" onClick={resetForm} className="bg-slate-200 text-slate-600 px-4 rounded-lg font-bold">
                                    إلغاء
                                </button>
                            )}
                        </div>
                    </form>
                </div>
                
                {/* Speed Quiz Section */}
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    ⚡ أسئلة المسابقة (Speed Quiz)
                </h3>
                <div className="space-y-3 mb-8">
                    {questionsList.map(q => (
                        <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="flex-grow">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                            q.difficulty === 'سهل' ? 'bg-green-100 text-green-700' :
                                            q.difficulty === 'متوسط' ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {q.difficulty}
                                        </span>
                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{q.points} نقطة</span>
                                    </div>
                                    <span className="font-bold text-slate-800 block text-lg">{q.text}</span>
                                    <div className="text-xs text-slate-500 mt-1">الإجابة: <span className="text-green-600 font-bold">{q.options[q.correctIndex]}</span></div>
                                </div>
                                <div className="flex flex-col gap-2 ml-2">
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditClick(q);
                                        }} 
                                        className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-all shadow-sm" 
                                        title="تعديل"
                                    >
                                        ✏️
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteClick(q.id);
                                        }} 
                                        className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-all shadow-sm" 
                                        title="حذف"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button 
                                    onClick={() => triggerLiveQuestion(q.id)} 
                                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 transform ${
                                        justSentId === q.id ? "bg-green-500 text-white scale-95 shadow-inner" : "bg-primary hover:bg-sky-600 text-white shadow-md hover:shadow-lg"
                                    }`}
                                >
                                    {justSentId === q.id ? "تم الإرسال! ✓" : "إرسال للمتسابقين 🚀"}
                                </button>
                                {activeLiveQuestion?.id === q.id && (
                                    <button onClick={closeLiveQuestion} className="px-4 bg-red-100 text-red-600 rounded-xl text-sm font-bold shadow-sm">إيقاف</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Who Said It Section */}
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2 mt-8 border-t pt-4">
                    🗣️ من القائل؟ (ثابتة)
                </h3>
                <div className="space-y-3 mb-8">
                    {WHO_SAID_IT_QUESTIONS.map(q => (
                        <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-3">
                             <div className="flex justify-between items-start">
                                <div className="flex-grow">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                            q.difficulty === 'سهل' ? 'bg-green-100 text-green-700' :
                                            q.difficulty === 'متوسط' ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {q.difficulty}
                                        </span>
                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{q.points} نقطة</span>
                                    </div>
                                    <span className="font-bold text-slate-800 block text-lg">"{q.text}"</span>
                                    <div className="text-xs text-slate-500 mt-1">القائل: <span className="text-green-600 font-bold">{q.options[q.correctIndex]}</span> {q.context && <span className="text-slate-400">({q.context})</span>}</div>
                                </div>
                             </div>
                            
                            <div className="flex gap-2 w-full">
                                <button 
                                    onClick={() => triggerLiveQuestion(q.id)} 
                                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 transform ${
                                        justSentId === q.id ? "bg-green-500 text-white scale-95 shadow-inner" : "bg-secondary hover:bg-amber-500 text-white shadow-md hover:shadow-lg"
                                    }`}
                                >
                                    {justSentId === q.id ? "تم الإرسال! ✓" : "إرسال للمتسابقين 🚀"}
                                </button>
                                {activeLiveQuestion?.id === q.id && (
                                    <button onClick={closeLiveQuestion} className="px-4 bg-red-100 text-red-600 rounded-xl text-sm font-bold shadow-sm">إيقاف</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t pt-6">
                     <h3 className="font-bold mb-2">إدارة المستخدمين</h3>
                     <p className="text-xs text-slate-400">عدد المتصلين: {leaderboardData.length}</p>
                     {isConfigured && (
                        <button onClick={clearManualConfig} className="text-[10px] text-red-400 underline mt-2">
                             فصل قاعدة البيانات (Reset Config)
                        </button>
                     )}
                </div>
            </div>
        );
      default:
        return <div className="p-4">الصفحة قيد الإنشاء</div>;
    }
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <TopBar user={user} onLogout={handleLogout} score={score} />
      <div className="flex-grow overflow-y-auto no-scrollbar">
        {renderContent()}
      </div>
      <BottomNav currentView={view} user={user} onChangeView={setView} onLogout={handleLogout} />
    </div>
  );
};

export default App;