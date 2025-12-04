import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import { View, User, Question, QuestionType } from './types';
import { LIVE_QUESTIONS, WHO_SAID_IT_QUESTIONS, MOCK_LEADERBOARD } from './constants';
import LiveGame from './components/LiveGame';
import { QRScanner } from './components/SoloZone';
import Leaderboard from './components/Leaderboard';
import { BottomNav, TopBar } from './components/Navigation';
import { db, isConfigured, saveManualConfig, clearManualConfig, signIn } from './firebase';
import { ref, onValue, set, update, push, child } from "firebase/database";

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>(View.AUTH);
  
  // Game State
  const [score, setScore] = useState(0);
  const [activeLiveQuestion, setActiveLiveQuestion] = useState<Question | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<User[]>(MOCK_LEADERBOARD);
  
  // Connection & Diagnostics State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [authStatus, setAuthStatus] = useState<'loading' | 'success' | 'error' | 'none'>('loading');
  const [authErrorMessage, setAuthErrorMessage] = useState('');

  // Setup Modal State
  const [showSetup, setShowSetup] = useState(!isConfigured);
  const [configInput, setConfigInput] = useState('');
  const [setupError, setSetupError] = useState('');
  
  // Admin State
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
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [justSentId, setJustSentId] = useState<string | null>(null);

  // Load user from local storage
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
  // FIREBASE CONNECTION & SYNC
  // ---------------------------------------------------------
  useEffect(() => {
    if (!db) return;

    const initConnection = async () => {
        // 1. Authenticate
        const { user: authUser, error } = await signIn();
        if (authUser) {
            setAuthStatus('success');
        } else {
            setAuthStatus('error');
            setAuthErrorMessage(error || "Unknown Auth Error");
            // If auth error is "operation-not-allowed", tell user to enable Anonymous Auth
            if (error && error.includes('operation-not-allowed')) {
                 setConnectionError("يجب تفعيل 'Anonymous Auth' في Firebase Console");
            }
        }

        // 2. Monitor Connection Status
        const connectedRef = ref(db, ".info/connected");
        onValue(connectedRef, (snap) => {
            const connected = snap.val() === true;
            setIsConnected(connected);
            if(connected) {
                // If previously had a connection error related to net, clear it
                if (connectionError.includes('اتصال')) setConnectionError('');
            }
        });

        // 3. Listen for Active Question
        const questionRef = ref(db, 'activeQuestion');
        onValue(questionRef, (snapshot) => {
            const data = snapshot.val();
            setActiveLiveQuestion(data || null);
            setConnectionError(''); // Clear error on successful read
        }, (error) => {
            console.error("Error reading question:", error);
            if (error.message.includes('permission_denied')) {
                setConnectionError("⛔ القواعد (Rules) تمنع القراءة. اجعلها true.");
            } else {
                setConnectionError("فشل القراءة: " + error.message);
            }
        });

        // 4. Listen for Leaderboard
        const usersRef = ref(db, 'users');
        onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                // Sanitize data: Ensure items have id and name
                const usersList = Object.values(data).filter((u: any) => u && typeof u === 'object' && u.id && u.name) as User[];
                setLeaderboardData(usersList);
                
                // Sync Score
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
    };

    initConnection();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Re-run when user logs in/out

  // Persist Questions (Admin Local Only)
  useEffect(() => {
    localStorage.setItem('noah_questions_v1', JSON.stringify(questionsList));
  }, [questionsList]);

  // Handle Firebase Config Submission
  const handleConfigSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setSetupError('');
      try {
        const firstBrace = configInput.indexOf('{');
        const lastBrace = configInput.lastIndexOf('}');
        
        if(firstBrace === -1 || lastBrace === -1) {
            if (configInput.includes('postgres')) {
                throw new Error("⚠️ هذا رابط PostgresSQL ولا يعمل مع هذا التطبيق.");
            }
            throw new Error("لم يتم العثور على كود JSON صحيح.");
        }
        
        const jsonStr = configInput.substring(firstBrace, lastBrace + 1);
        const config = JSON.parse(jsonStr);
        
        if(!config.apiKey || !config.databaseURL) {
             throw new Error("الكود ينقصه apiKey أو databaseURL");
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
    
    // Sync User to Firebase (if connected)
    if (db) {
        set(ref(db, 'users/' + u.id), u).catch(err => {
            console.error("Login Sync Error", err);
            // Don't block login, but log error
        });
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
    
    if (user) {
        const updatedUser = { ...user, score: newScore };
        setUser(updatedUser);
        localStorage.setItem('noah_user_session', JSON.stringify(updatedUser));

        if (db) {
            update(ref(db, 'users/' + user.id), { score: newScore });
        } else {
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
      let q = questionsList.find(x => x.id === qId);
      if (!q) q = WHO_SAID_IT_QUESTIONS.find(x => x.id === qId);
      
      if (q) {
          // Sanitize: Firebase doesn't like 'undefined'.
          const cleanQ = JSON.parse(JSON.stringify(q));
          
          if (db) {
            set(ref(db, 'activeQuestion'), cleanQ)
              .then(() => console.log("Question sent successfully"))
              .catch((err) => {
                  alert("خطأ في الإرسال: " + err.message + "\nتأكد أن القواعد (Rules) تسمح بالكتابة.");
              });
          } else {
             setActiveLiveQuestion(q);
          }
          setJustSentId(qId);
          setTimeout(() => setJustSentId(null), 1500);
      }
  };

  const closeLiveQuestion = () => {
      if (db) set(ref(db, 'activeQuestion'), null);
      else setActiveLiveQuestion(null);
  };

  // Test Write Function for Diagnostics
  const testDbWrite = () => {
      if (!db) return;
      set(ref(db, 'test_connection'), { timestamp: Date.now(), status: 'OK' })
        .then(() => alert("✅ الكتابة ناجحة! قاعدة البيانات تعمل."))
        .catch((err) => alert("❌ فشل الكتابة:\n" + err.message + "\n\nالحل: اذهب إلى Firebase Console > Realtime Database > Rules واجعل .write: true"));
  };

  // CRUD & Modal Logic
  const resetForm = () => {
    setQuestionForm({ id: '', text: '', options: ['', '', '', ''], correctIndex: 0, type: QuestionType.TEXT, points: 100, difficulty: 'متوسط' });
    setIsEditing(false);
  };
  const handleEditClick = (q: Question) => { setQuestionForm(q); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleDeleteClick = (id: string) => { setDeleteTargetId(id); setShowDeleteModal(true); };
  const confirmDelete = () => {
    if (deleteTargetId) {
      setQuestionsList(prev => prev.filter(q => q.id !== deleteTargetId));
      if (isEditing && questionForm.id === deleteTargetId) resetForm();
    }
    setShowDeleteModal(false);
    setDeleteTargetId(null);
  };
  const cancelDelete = () => { setShowDeleteModal(false); setDeleteTargetId(null); };
  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (questionForm.id) setQuestionsList(prev => prev.map(q => q.id === questionForm.id ? questionForm : q));
    else { const newQ = { ...questionForm, id: 'custom-' + Date.now() }; setQuestionsList(prev => [newQ, ...prev]); }
    resetForm();
  };
  const handleOptionChange = (idx: number, val: string) => {
    const newOpts = [...questionForm.options]; newOpts[idx] = val; setQuestionForm({ ...questionForm, options: newOpts });
  };
  const handleResetQuestions = () => {
    if(window.confirm('هل تريد استعادة الأسئلة الافتراضية؟')) { setQuestionsList(LIVE_QUESTIONS); localStorage.removeItem('noah_questions_v1'); }
  }

  // Setup Screen
  if (showSetup) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-6">
                    <div className="text-4xl mb-2">⚙️</div>
                    <h2 className="text-xl font-bold text-slate-800">إعداد قاعدة البيانات</h2>
                </div>
                <form onSubmit={handleConfigSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Config Object</label>
                        <textarea value={configInput} onChange={e => setConfigInput(e.target.value)} placeholder={'Example: { apiKey: "...", databaseURL: "..." }'} className="w-full h-32 p-3 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-primary outline-none" dir="ltr" />
                    </div>
                    {setupError && <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100">{setupError}</div>}
                    <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-sky-600 transition">حفظ واتصال 🚀</button>
                    <button type="button" onClick={() => setShowSetup(false)} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition mt-2">رجوع</button>
                </form>
            </div>
        </div>
      );
  }

  const renderContent = () => {
    if (showQR) {
        return <QRScanner onScan={(data) => { alert(`تم مسح الكود: ${data} - حصلت على 50 نقطة!`); handleScoreUpdate(50); setShowQR(false); }} onClose={() => setShowQR(false)} />;
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

             {/* Connection Error Banner */}
             {connectionError && (
                 <div className="bg-red-500 text-white p-3 rounded-xl flex items-center gap-2 text-sm shadow-md animate-pulse">
                    <span className="text-2xl">⚠️</span>
                    <div className="flex flex-col">
                        <span className="font-bold">مشكلة في الاتصال</span>
                        <span className="text-[10px]">{connectionError}</span>
                    </div>
                 </div>
             )}
             
             {!isConnected && !connectionError && isConfigured && (
                 <div className="bg-yellow-500 text-white p-3 rounded-xl flex items-center gap-2 text-sm shadow-md">
                    <span>📡</span>
                    <span>جارِ الاتصال بالخادم...</span>
                 </div>
             )}

             {activeLiveQuestion && (
                <div onClick={() => setView(View.LIVE_QUIZ)} className="bg-red-500 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse cursor-pointer border-2 border-red-400">
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
                </button>
             </div>
             
             <button onClick={() => setView(View.LEADERBOARD)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 mt-2">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">🏆</span>
                    <div className="text-right">
                        <span className="font-bold text-slate-700 block">لوحة الصدارة</span>
                    </div>
                </div>
                <span className="text-slate-400">←</span>
             </button>
          </div>
        );
      case View.LIVE_QUIZ:
        return <LiveGame question={activeLiveQuestion} onAnswer={handleScoreUpdate} onPlaySound={playFeedbackSound} />;
      case View.LEADERBOARD:
        return <Leaderboard currentUser={user!} data={leaderboardData} />;
      case View.ADMIN:
        return (
            <div className="p-4 relative pb-20">
                {/* Diagnostics Panel */}
                <div className="bg-slate-100 p-4 rounded-xl mb-6 border border-slate-200">
                    <h3 className="font-bold mb-3 text-slate-700">🔍 تشخيص الاتصال (Diagnostics)</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className={`p-2 rounded ${isConnected ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                             اتصال الخادم: {isConnected ? 'متصل ✅' : 'مقطوع ❌'}
                        </div>
                        <div className={`p-2 rounded ${authStatus === 'success' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                             المصادقة: {authStatus === 'success' ? 'تمت ✅' : 'فشلت ❌'}
                        </div>
                    </div>
                    
                    {authStatus === 'error' && (
                        <div className="bg-red-50 text-red-600 p-2 rounded text-[10px] mb-2 border border-red-200">
                             خطأ المصادقة: {authErrorMessage}.<br/>
                             <b>الحل:</b> اذهب لـ Firebase Console > Build > Authentication > Sign-in method وفعّل "Anonymous".
                        </div>
                    )}

                    <button 
                        onClick={testDbWrite}
                        className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-slate-700"
                    >
                        اختبار كتابة (Test Write)
                    </button>
                    <p className="text-[10px] text-slate-500 mt-2 text-center">
                        إذا فشل الاختبار، تأكد أن القواعد (Rules) هي .write: true
                    </p>
                    <button onClick={() => setShowSetup(true)} className="text-[10px] text-blue-500 underline mt-2 w-full text-center">
                        تغيير إعدادات الرابط
                    </button>
                </div>
                
                {showDeleteModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl border border-slate-100">
                            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">حذف السؤال؟</h3>
                            <div className="flex gap-3 mt-4">
                                <button onClick={cancelDelete} className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700">لا</button>
                                <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl font-bold bg-red-500 text-white">نعم</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">لوحة تحكم القائد</h2>
                    <button onClick={handleResetQuestions} className="text-[10px] text-red-400 underline">استعادة الافتراضي</button>
                </div>
                
                {/* Editor Form */}
                <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-8">
                    <h3 className="font-bold text-lg mb-3 text-primary">{isEditing ? '✏️ تعديل سؤال' : '➕ إضافة سؤال جديد'}</h3>
                    <form onSubmit={handleSaveQuestion} className="space-y-3">
                        <div>
                            <input type="text" required value={questionForm.text} onChange={e => setQuestionForm({...questionForm, text: e.target.value})} className="w-full border p-2 rounded-lg mt-1 focus:ring-2 focus:ring-primary outline-none" placeholder="نص السؤال..." />
                        </div>
                        <div className="flex gap-2">
                            <input type="number" required value={questionForm.points} onChange={e => setQuestionForm({...questionForm, points: parseInt(e.target.value)})} className="w-1/2 border p-2 rounded-lg mt-1" placeholder="النقاط" />
                            <select value={questionForm.difficulty} onChange={e => setQuestionForm({...questionForm, difficulty: e.target.value})} className="w-1/2 border p-2 rounded-lg mt-1 bg-white">
                                <option value="سهل">سهل</option>
                                <option value="متوسط">متوسط</option>
                                <option value="صعب">صعب</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {questionForm.options.map((opt, idx) => (
                                <div key={idx} className="relative">
                                     <input type="radio" name="correctIdx" checked={questionForm.correctIndex === idx} onChange={() => setQuestionForm({...questionForm, correctIndex: idx})} className="absolute top-3 left-2" />
                                     <input type="text" required value={opt} onChange={e => handleOptionChange(idx, e.target.value)} className={`w-full border p-2 pl-6 rounded-lg mt-1 text-sm ${questionForm.correctIndex === idx ? 'border-green-500 bg-green-50' : ''}`} placeholder={`خيار ${idx + 1}`} />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="submit" className="flex-1 bg-primary text-white py-2 rounded-lg font-bold">{isEditing ? 'حفظ' : 'إضافة'}</button>
                            {isEditing && <button type="button" onClick={resetForm} className="bg-slate-200 px-4 rounded-lg">إلغاء</button>}
                        </div>
                    </form>
                </div>
                
                <h3 className="font-bold text-lg mb-3">⚡ أسئلة المسابقة</h3>
                <div className="space-y-3 mb-8">
                    {questionsList.map(q => (
                        <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="flex-grow">
                                    <span className="font-bold text-slate-800 block">{q.text}</span>
                                    <span className="text-xs text-green-600 font-bold">الإجابة: {q.options[q.correctIndex]}</span>
                                </div>
                                <div className="flex flex-col gap-2 ml-2">
                                    <button onClick={() => handleEditClick(q)} className="text-slate-400 hover:text-blue-500">✏️</button>
                                    <button onClick={() => handleDeleteClick(q.id)} className="text-red-300 hover:text-red-500">🗑️</button>
                                </div>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button onClick={() => triggerLiveQuestion(q.id)} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${justSentId === q.id ? "bg-green-500 text-white" : "bg-primary text-white"}`}>
                                    {justSentId === q.id ? "تم الإرسال!" : "إرسال 🚀"}
                                </button>
                                {activeLiveQuestion?.id === q.id && <button onClick={closeLiveQuestion} className="px-4 bg-red-100 text-red-600 rounded-xl text-sm font-bold">إيقاف</button>}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t pt-6">
                     <h3 className="font-bold mb-2">إدارة المستخدمين</h3>
                     <p className="text-xs text-slate-400">عدد المتصلين: {leaderboardData.length}</p>
                     {isConfigured && <button onClick={clearManualConfig} className="text-[10px] text-red-400 underline mt-2">Reset Config</button>}
                </div>
            </div>
        );
      default:
        return <div className="p-4">الصفحة قيد الإنشاء</div>;
    }
  };

  if (!user) return <Auth onLogin={handleLogin} />;

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <TopBar user={user} onLogout={handleLogout} score={score} isConnected={isConnected} />
      <div className="flex-grow overflow-y-auto no-scrollbar">
        {renderContent()}
      </div>
      <BottomNav currentView={view} user={user} onChangeView={setView} onLogout={handleLogout} />
    </div>
  );
};

export default App;