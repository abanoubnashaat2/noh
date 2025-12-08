import React, { useState, useEffect, useRef } from 'react';
import Auth from './components/Auth';
import { View, User, Question, QuestionType, AdminMessage, AdminCommand } from './types';
import { LIVE_QUESTIONS, WHO_SAID_IT_QUESTIONS, MOCK_LEADERBOARD, TRIP_CODE_VALID } from './constants';
import LiveGame from './components/LiveGame';
import SpinWheel from './components/SpinWheel';
import Leaderboard from './components/Leaderboard';
import { BottomNav, TopBar } from './components/Navigation';
import { db, isConfigured, saveManualConfig, clearManualConfig, signIn } from './firebase';
import { ref, onValue, set, update, push, remove } from "firebase/database";

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>(View.AUTH);
  
  // Game State
  const [score, setScore] = useState(0);
  const [activeLiveQuestion, setActiveLiveQuestion] = useState<Question | null>(null);
  const [activeCommand, setActiveCommand] = useState<AdminCommand | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<User[]>(MOCK_LEADERBOARD);
  
  // Anti-Cheat State: Track answered IDs
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>(() => {
    try {
        const saved = localStorage.getItem('noah_answered_ids');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
  });

  // Connection & Config State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [authStatus, setAuthStatus] = useState<'loading' | 'success' | 'error' | 'none'>('loading');
  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [tripCode, setTripCode] = useState(TRIP_CODE_VALID); // Dynamic Trip Code

  // Setup Modal State
  const [showSetup, setShowSetup] = useState(!isConfigured);
  const [configInput, setConfigInput] = useState('');
  const [setupError, setSetupError] = useState('');

  // Messaging State (Requests to Admin)
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  
  // Confirmation Modal State (For Delete Actions)
  const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isLoadingAction, setIsLoadingAction] = useState(false);

  // Admin State
  const [commandInput, setCommandInput] = useState('');
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
    correctAnswerText: '',
    type: QuestionType.TEXT,
    points: 100,
    difficulty: 'متوسط'
  });
  
  const [showDeleteModal, setShowDeleteModal] = useState(false); // For single question delete
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showSpinWheel, setShowSpinWheel] = useState(false);
  const [justSentId, setJustSentId] = useState<string | null>(null);

  // Sound & Notification Logic
  const prevQuestionId = useRef<string | null>(null);
  const prevCommandTime = useRef<number | null>(null);

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

  // Save answered IDs whenever they change
  useEffect(() => {
      localStorage.setItem('noah_answered_ids', JSON.stringify(answeredQuestionIds));
  }, [answeredQuestionIds]);

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
            
            // Handle specific auth errors
            if (error) {
                if (error.includes('operation-not-allowed')) {
                     setConnectionError("يجب تفعيل 'Anonymous Auth' في Firebase Console");
                } else if (error.includes('configuration-not-found')) {
                     setConnectionError("خطأ في المصادقة: الخدمة غير مفعلة (Enable Auth)");
                } else {
                     setConnectionError(`خطأ في الاتصال: ${error}`);
                }
            }
        }

        // 2. Monitor Connection Status
        const connectedRef = ref(db, ".info/connected");
        onValue(connectedRef, (snap) => {
            const connected = snap.val() === true;
            setIsConnected(connected);
            if(connected && connectionError.includes('اتصال')) setConnectionError('');
        });

        // 3. Listen for Trip Code (Admin Config)
        const configRef = ref(db, 'config/tripCode');
        onValue(configRef, (snapshot) => {
           const code = snapshot.val();
           if (code) setTripCode(code);
        });

        // 4. Listen for Active Question
        const questionRef = ref(db, 'activeQuestion');
        onValue(questionRef, (snapshot) => {
            const data = snapshot.val();
            setActiveLiveQuestion(data || null);
            setConnectionError('');
            
            // Notification Logic (Sound/Vibrate) for Questions
            if (data && data.id && data.id !== prevQuestionId.current) {
                playNotificationSound();
                if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
            }
            prevQuestionId.current = data ? data.id : null;
        }, (error) => {
             // Error handling...
             console.error(error);
        });

        // 5. Listen for Admin Commands (New Feature)
        const commandRef = ref(db, 'activeCommand');
        onValue(commandRef, (snapshot) => {
            const cmd = snapshot.val() as AdminCommand | null;
            setActiveCommand(cmd);
            
            if (cmd && cmd.timestamp !== prevCommandTime.current) {
                // Play alert sound for command
                playAlertSound();
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
                prevCommandTime.current = cmd.timestamp;
            } else if (!cmd) {
                prevCommandTime.current = null;
            }
        });

        // 6. Listen for Leaderboard
        const usersRef = ref(db, 'users');
        onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const usersList = Object.values(data).filter((u: any) => u && typeof u === 'object' && u.id && u.name) as User[];
                setLeaderboardData(usersList);
                
                if (user) {
                    const myData = usersList.find(u => u.id === user.id);
                    if (myData) {
                        // Sync local score and wheel status if changed remotely
                        if (myData.score !== score || myData.hasSpunWheel !== user.hasSpunWheel) {
                            setScore(myData.score);
                            const updatedLocal = { ...user, score: myData.score, hasSpunWheel: myData.hasSpunWheel };
                            localStorage.setItem('noah_user_session', JSON.stringify(updatedLocal));
                            setUser(updatedLocal);
                        }
                    }
                }
            } else {
                 setLeaderboardData([]);
            }
        });

        // 7. Listen for Admin Messages
        const messagesRef = ref(db, 'messages');
        onValue(messagesRef, (snapshot) => {
           const msgs = snapshot.val();
           if (msgs) {
               const list = Object.entries(msgs).map(([key, val]: [string, any]) => ({
                   id: key,
                   ...val
               }));
               list.sort((a, b) => b.timestamp - a.timestamp);
               setAdminMessages(list);
           } else {
               setAdminMessages([]);
           }
        });
    };

    initConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Persist Questions (Admin Local Only)
  useEffect(() => {
    localStorage.setItem('noah_questions_v1', JSON.stringify(questionsList));
  }, [questionsList]);

  // Sound Helpers
  const playNotificationSound = () => {
     try {
         const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
         if (!AudioContext) return;
         const ctx = new AudioContext();
         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         osc.connect(gain);
         gain.connect(ctx.destination);
         osc.type = 'sine';
         osc.frequency.setValueAtTime(800, ctx.currentTime);
         osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.1);
         osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.3);
         gain.gain.setValueAtTime(0.5, ctx.currentTime);
         gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
         osc.start();
         osc.stop(ctx.currentTime + 0.5);
     } catch (e) { console.error(e); }
  };

  const playAlertSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Siren-like sound
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.3);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.6);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.9);
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.9);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
        
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
    } catch (e) { console.error(e); }
  };

  // ------------------ Handlers ------------------

  const handleConfigSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setSetupError('');
      try {
        const firstBrace = configInput.indexOf('{');
        const lastBrace = configInput.lastIndexOf('}');
        if(firstBrace === -1 || lastBrace === -1) throw new Error("لم يتم العثور على كود JSON صحيح.");
        const jsonStr = configInput.substring(firstBrace, lastBrace + 1);
        const config = JSON.parse(jsonStr);
        if(!config.apiKey || !config.databaseURL) throw new Error("الكود ينقصه apiKey أو databaseURL");
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
    if (db) set(ref(db, 'users/' + u.id), u).catch(console.error);
  };

  const handleLogout = () => {
    localStorage.removeItem('noah_user_session');
    setUser(null);
    setView(View.AUTH);
  };

  const handleScoreUpdate = (points: number) => {
    const newScore = score + points;
    setScore(newScore);
    if (activeLiveQuestion && view === View.LIVE_QUIZ) {
        setAnsweredQuestionIds(prev => [...prev, activeLiveQuestion.id]);
    }
    if (user) {
        const updatedUser = { ...user, score: newScore };
        setUser(updatedUser);
        localStorage.setItem('noah_user_session', JSON.stringify(updatedUser));
        if (db) update(ref(db, 'users/' + user.id), { score: newScore });
        else setLeaderboardData(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    }
    // Only go home if quiz
    if (view === View.LIVE_QUIZ) {
        setTimeout(() => {
            setView(View.HOME);
        }, 2500);
    }
  };

  // Specific handler for Wheel to mark it as used
  const handleSpinWin = (points: number) => {
      if (!user) return;
      const newScore = score + points;
      setScore(newScore);
      
      const updatedUser = { ...user, score: newScore, hasSpunWheel: true };
      setUser(updatedUser);
      localStorage.setItem('noah_user_session', JSON.stringify(updatedUser));
      
      if (db) {
          update(ref(db, 'users/' + user.id), { score: newScore, hasSpunWheel: true });
      } else {
          setLeaderboardData(prev => prev.map(u => u.id === user.id ? updatedUser : u));
      }
      
      setShowSpinWheel(false);
      // Wait a bit before showing alert so the wheel animation settle doesn't feel abrupt
      setTimeout(() => alert(`مبروك! ربحت ${points} نقطة!`), 300);
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
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    }
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  };

  const handleSendMessage = (e: React.FormEvent) => {
      e.preventDefault();
      if (!msgText.trim()) return;
      if (db && user) {
          push(ref(db, 'messages'), {
              senderId: user.id,
              senderName: user.name,
              text: msgText,
              timestamp: Date.now()
          }).then(() => {
              alert("تم إرسال رسالتك للقائد بنجاح ✅");
              setMsgText('');
              setShowMsgModal(false);
          }).catch(() => alert("فشل الإرسال"));
      } else {
          alert("يجب أن تكون متصلاً لإرسال الرسائل");
      }
  };

  // ADMIN Functions
  const triggerLiveQuestion = (qId: string) => {
      let q = questionsList.find(x => x.id === qId);
      if (!q) q = WHO_SAID_IT_QUESTIONS.find(x => x.id === qId);
      if (q) {
          const cleanQ = JSON.parse(JSON.stringify(q));
          if (db) set(ref(db, 'activeQuestion'), cleanQ).catch(alert);
          else setActiveLiveQuestion(q);
          setJustSentId(qId);
          setTimeout(() => setJustSentId(null), 1500);
      }
  };
  const closeLiveQuestion = () => db ? set(ref(db, 'activeQuestion'), null) : setActiveLiveQuestion(null);
  
  const handleUpdateTripCode = (newCode: string) => {
      if (!newCode || newCode.length < 4) return alert("الكود قصير جداً");
      if (db) {
          set(ref(db, 'config/tripCode'), newCode.toUpperCase())
            .then(() => alert("تم تحديث كود الرحلة بنجاح"))
            .catch((e) => alert("فشل التحديث: " + e.message));
      } else {
          setTripCode(newCode.toUpperCase());
          alert("تم التحديث محلياً (غير متصل)");
      }
  };

  // --- Secure Delete Handlers using Modal ---
  const handleClearMessagesClick = () => {
      if (!db) return alert("خطأ: لا يوجد اتصال بقاعدة البيانات");
      setConfirmModal({
          isOpen: true,
          title: "مسح كل الرسائل",
          message: "هل أنت متأكد تماماً من حذف جميع رسائل المتسابقين؟ لا يمكن التراجع عن هذا الإجراء.",
          onConfirm: async () => {
              setIsLoadingAction(true);
              try {
                  await remove(ref(db, 'messages'));
                  setConfirmModal(prev => ({...prev, isOpen: false}));
                  alert("تم مسح الرسائل بنجاح ✅");
              } catch (error: any) {
                  console.error("Delete Error", error);
                  if (error.code === 'PERMISSION_DENIED') alert("خطأ: ليس لديك صلاحية الحذف. راجع إعدادات Firebase Rules.");
                  else alert("حدث خطأ أثناء المسح: " + error.message);
              } finally {
                  setIsLoadingAction(false);
              }
          }
      });
  };

  const handleResetLeaderboardClick = () => {
      if (!db) return alert("خطأ: لا يوجد اتصال بقاعدة البيانات");
      setConfirmModal({
          isOpen: true,
          title: "تصفير الترتيب (حذف الكل)",
          message: "⚠️ تحذير: سيتم حذف جميع المستخدمين وجميع النتائج لبدء جولة جديدة. هل أنت متأكد؟",
          onConfirm: async () => {
              setIsLoadingAction(true);
              try {
                  await remove(ref(db, 'users'));
                  await set(ref(db, 'activeQuestion'), null);
                  await set(ref(db, 'activeCommand'), null); // Also reset command
                  
                  setLeaderboardData([]);
                  setConfirmModal(prev => ({...prev, isOpen: false}));
                  alert("تم تصفير الترتيب وحذف المستخدمين بنجاح ✅");
              } catch (error: any) {
                  console.error("Reset Error", error);
                  if (error.code === 'PERMISSION_DENIED') alert("خطأ: ليس لديك صلاحية الحذف. راجع إعدادات Firebase Rules.");
                  else alert("فشل الحذف: " + error.message);
              } finally {
                  setIsLoadingAction(false);
              }
          }
      });
  };

  const handleSendCommand = (e: React.FormEvent) => {
      e.preventDefault();
      if (!commandInput.trim() || !db) return;
      
      const newCommand: AdminCommand = {
          text: commandInput,
          timestamp: Date.now(),
          type: 'alert' // or judgment, could add a toggle later
      };

      set(ref(db, 'activeCommand'), newCommand)
         .then(() => {
             alert('تم إرسال الأمر/الحكم بنجاح 🔔');
             setCommandInput('');
         })
         .catch(err => alert('فشل الإرسال: ' + err.message));
  };

  const handleClearCommand = () => {
      if (!db) return;
      set(ref(db, 'activeCommand'), null)
        .then(() => alert('تم إخفاء الأمر 🔕'))
        .catch(err => alert('خطأ: ' + err.message));
  };

  // CRUD
  const resetForm = () => { setQuestionForm({ id: '', text: '', options: ['', '', '', ''], correctIndex: 0, correctAnswerText: '', type: QuestionType.TEXT, points: 100, difficulty: 'متوسط' }); setIsEditing(false); };
  const handleEditClick = (q: Question) => { setQuestionForm(q); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleDeleteClick = (id: string) => { setDeleteTargetId(id); setShowDeleteModal(true); };
  const confirmDelete = () => { if (deleteTargetId) { setQuestionsList(prev => prev.filter(q => q.id !== deleteTargetId)); if (isEditing && questionForm.id === deleteTargetId) resetForm(); } setShowDeleteModal(false); setDeleteTargetId(null); };
  const cancelDelete = () => { setShowDeleteModal(false); setDeleteTargetId(null); };
  const handleSaveQuestion = (e: React.FormEvent) => { e.preventDefault(); if (questionForm.id) setQuestionsList(prev => prev.map(q => q.id === questionForm.id ? questionForm : q)); else { setQuestionsList(prev => [{ ...questionForm, id: 'custom-' + Date.now() }, ...prev]); } resetForm(); };
  const handleOptionChange = (idx: number, val: string) => { const newOpts = [...questionForm.options]; newOpts[idx] = val; setQuestionForm({ ...questionForm, options: newOpts }); };
  const handleResetQuestions = () => { if(window.confirm('هل تريد استعادة الأسئلة الافتراضية؟')) { setQuestionsList(LIVE_QUESTIONS); localStorage.removeItem('noah_questions_v1'); } };

  if (showSetup) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-6"><div className="text-4xl mb-2">⚙️</div><h2 className="text-xl font-bold">إعداد قاعدة البيانات</h2></div>
                <form onSubmit={handleConfigSubmit} className="space-y-4">
                    <textarea value={configInput} onChange={e => setConfigInput(e.target.value)} placeholder={'Example: { apiKey: "...", databaseURL: "..." }'} className="w-full h-32 p-3 border border-slate-300 rounded-xl text-xs font-mono outline-none" dir="ltr" />
                    {setupError && <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg border border-red-100">{setupError}</div>}
                    <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold">حفظ واتصال 🚀</button>
                    <button type="button" onClick={() => setShowSetup(false)} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-bold mt-2">رجوع</button>
                </form>
            </div>
        </div>
      );
  }

  const renderContent = () => {
    // Only show wheel if not already spun (checked before opening)
    if (showSpinWheel) return <SpinWheel onWin={handleSpinWin} onClose={() => setShowSpinWheel(false)} />;

    switch (view) {
      case View.HOME:
        const isCurrentQuestionAnswered = activeLiveQuestion && answeredQuestionIds.includes(activeLiveQuestion.id);
        const hasSpun = user?.hasSpunWheel;

        return (
          <div className="p-4 flex flex-col gap-4 h-full content-start relative">
             <div className="bg-gradient-to-r from-primary to-blue-500 rounded-2xl p-6 text-white shadow-lg mb-2 relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 text-9xl opacity-20">🚢</div>
                <h2 className="text-2xl font-bold mb-2">مرحباً {user?.name}</h2>
                <p className="opacity-90">استعد للمسابقة المباشرة!</p>
             </div>

             {connectionError && <div className="bg-red-500 text-white p-3 rounded-xl text-sm shadow-md animate-pulse font-bold">{connectionError}</div>}
             {!isConnected && !connectionError && isConfigured && <div className="bg-yellow-500 text-white p-3 rounded-xl text-sm shadow-md">📡 جارِ الاتصال بالخادم...</div>}

             {/* Active Command Banner (Replacing Overlay) */}
             {activeCommand && (
                <div className="bg-yellow-400 text-slate-900 p-4 rounded-xl shadow-lg flex items-center justify-between border-2 border-yellow-500 animate-pulse">
                     <div className="flex items-center gap-3">
                        <span className="text-3xl">📣</span>
                        <div className="flex flex-col">
                            <span className="font-black text-lg">أمر القائد</span>
                            <span className="font-bold text-md">{activeCommand.text}</span>
                        </div>
                     </div>
                </div>
             )}

             {/* Live Question Banner */}
             {activeLiveQuestion && !isCurrentQuestionAnswered && (
                <div onClick={() => setView(View.LIVE_QUIZ)} className="bg-red-500 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse cursor-pointer border-2 border-red-400">
                    <div className="flex items-center gap-2"><span className="text-2xl">⚡</span><div className="flex flex-col"><span className="font-bold">سؤال مباشر نشط!</span><span className="text-xs text-red-100">اضغط للدخول الآن</span></div></div>
                    <span className="bg-white text-red-600 px-3 py-1 rounded-full text-xs font-bold">دخول</span>
                </div>
             )}

             {/* Answered State Banner */}
             {activeLiveQuestion && isCurrentQuestionAnswered && (
                <div className="bg-slate-200 text-slate-500 p-4 rounded-xl shadow-inner flex items-center justify-between border-2 border-slate-300">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🔒</span>
                        <div className="flex flex-col">
                            <span className="font-bold">تمت الإجابة</span>
                            <span className="text-xs">انتظر السؤال التالي من القائد...</span>
                        </div>
                    </div>
                </div>
             )}

             <div className="grid grid-cols-2 gap-4">
                <button 
                    onClick={() => {
                        if (activeLiveQuestion && !isCurrentQuestionAnswered) setView(View.LIVE_QUIZ);
                        else alert("لا يوجد سؤال نشط أو قمت بالإجابة عليه بالفعل.");
                    }} 
                    className={`p-6 rounded-xl shadow-sm border flex flex-col items-center gap-2 transition-all active:scale-95 ${activeLiveQuestion && !isCurrentQuestionAnswered ? 'bg-white border-slate-100 hover:bg-slate-50' : 'bg-slate-100 border-slate-200 opacity-60'}`}
                >
                    <span className="text-5xl mb-2">⚡</span>
                    <span className="font-bold text-slate-700">المسابقة</span>
                </button>
                <button 
                    onClick={() => {
                        if (hasSpun) {
                            alert("لقد استخدمت عجلة الحظ بالفعل! 🚫");
                        } else {
                            setShowSpinWheel(true);
                        }
                    }} 
                    className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 transition-all ${hasSpun ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-slate-50 active:scale-95'}`}
                >
                    <span className="text-5xl mb-2">{hasSpun ? '🔒' : '🎡'}</span>
                    <span className="font-bold text-slate-700">{hasSpun ? 'تم الاستخدام' : 'عجلة الحظ'}</span>
                </button>
             </div>
             
             {/* Messaging Button */}
             <button onClick={() => setShowMsgModal(true)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 mt-2">
                 <div className="flex items-center gap-3"><span className="text-3xl">📨</span><span className="font-bold text-slate-700">إرسال طلب للقائد</span></div>
                 <span className="text-slate-400">←</span>
             </button>
          </div>
        );
      case View.LIVE_QUIZ: 
        const isAnswered = activeLiveQuestion && answeredQuestionIds.includes(activeLiveQuestion.id);
        return <LiveGame 
            question={activeLiveQuestion} 
            onAnswer={handleScoreUpdate} 
            onPlaySound={playFeedbackSound} 
            isAlreadyAnswered={!!isAnswered}
        />;
      case View.LEADERBOARD: return <Leaderboard currentUser={user!} data={leaderboardData} />;
      case View.ADMIN:
        return (
            <div className="p-4 relative pb-20">
                <div className="bg-slate-800 text-white p-4 rounded-xl mb-6 shadow-md">
                     <h3 className="font-bold mb-3 text-yellow-400">🔐 إعدادات الرحلة</h3>
                     <label className="text-xs text-slate-300 block mb-1">كود الرحلة الحالي (للمتسابقين)</label>
                     <div className="flex gap-2">
                         <input type="text" defaultValue={tripCode} onBlur={(e) => handleUpdateTripCode(e.target.value)} className="bg-slate-700 border-none rounded-lg px-3 py-2 w-full text-center tracking-widest font-mono text-lg font-bold" />
                     </div>
                     <p className="text-[10px] text-slate-400 mt-2">قم بتغيير الكود واضغط خارج الحقل للحفظ.</p>
                </div>
                
                {/* Admin Command Section */}
                <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-xl shadow-md mb-6">
                    <h3 className="font-bold text-lg text-slate-800 mb-2 flex items-center gap-2">
                        <span>📢</span> إرسال حكم / تنبيه
                    </h3>
                    <form onSubmit={handleSendCommand} className="flex flex-col gap-2">
                        <input 
                            type="text" 
                            value={commandInput} 
                            onChange={(e) => setCommandInput(e.target.value)} 
                            placeholder="اكتب الأمر أو الحكم هنا..." 
                            className="w-full p-3 rounded-xl border border-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        />
                        <div className="flex gap-2">
                            <button type="submit" className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 rounded-xl transition-colors">
                                إرسال 🔔
                            </button>
                            {activeCommand && (
                                <button type="button" onClick={handleClearCommand} className="px-4 bg-slate-200 text-slate-600 font-bold rounded-xl">
                                    إخفاء 🔕
                                </button>
                            )}
                        </div>
                    </form>
                    {activeCommand && <p className="text-[10px] text-green-600 mt-2 font-bold">✅ يوجد أمر نشط حالياً للمستخدمين: {activeCommand.text}</p>}
                </div>

                <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-6">
                    <div className="flex justify-between items-center mb-3">
                         <h3 className="font-bold text-lg text-slate-700">📬 رسائل المتسابقين</h3>
                         {adminMessages.length > 0 && <button onClick={handleClearMessagesClick} className="text-xs text-red-500 underline font-bold px-2 py-1 hover:bg-red-50 rounded">مسح الكل</button>}
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                        {adminMessages.length === 0 ? <p className="text-center text-sm text-slate-400 py-4">لا توجد رسائل جديدة</p> : adminMessages.map(msg => (
                            <div key={msg.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="font-bold text-primary">{msg.senderName}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(msg.timestamp).toLocaleTimeString('ar-EG')}</span>
                                </div>
                                <p className="text-slate-700">{msg.text}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-100 p-4 rounded-xl mb-6 border border-slate-200">
                    <h3 className="font-bold mb-3 text-slate-700">🔍 تشخيص الاتصال</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className={`p-2 rounded ${isConnected ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>اتصال: {isConnected ? 'متصل ✅' : 'مقطوع ❌'}</div>
                        <div className={`p-2 rounded ${authStatus === 'success' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>مصادقة: {authStatus === 'success' ? 'تمت ✅' : 'فشلت ❌'}</div>
                    </div>
                    <button onClick={() => setShowSetup(true)} className="text-[10px] text-blue-500 underline w-full text-center">تغيير إعدادات الرابط</button>
                </div>
                
                {/* Confirmation Modal */}
                {confirmModal.isOpen && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                            <h3 className="text-lg font-bold text-slate-800 mb-2">{confirmModal.title}</h3>
                            <p className="text-slate-600 mb-6">{confirmModal.message}</p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
                                    className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold"
                                    disabled={isLoadingAction}
                                >
                                    إلغاء
                                </button>
                                <button 
                                    onClick={() => {
                                        confirmModal.onConfirm();
                                    }} 
                                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold flex justify-center items-center"
                                    disabled={isLoadingAction}
                                >
                                    {isLoadingAction ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> : "تأكيد"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showDeleteModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl">
                            <h3 className="text-lg font-bold text-center mb-2">حذف السؤال؟</h3>
                            <div className="flex gap-3 mt-4"><button onClick={cancelDelete} className="flex-1 py-2 rounded-xl bg-slate-100">لا</button><button onClick={confirmDelete} className="flex-1 py-2 rounded-xl bg-red-500 text-white">نعم</button></div>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">إدارة الأسئلة</h2><button onClick={handleResetQuestions} className="text-[10px] text-red-400 underline">استعادة الافتراضي</button></div>
                
                <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-8">
                    <h3 className="font-bold text-lg mb-3 text-primary">{isEditing ? '✏️ تعديل سؤال' : '➕ إضافة سؤال جديد'}</h3>
                    <form onSubmit={handleSaveQuestion} className="space-y-3">
                        <div className="flex gap-2 mb-2">
                            <button 
                                type="button" 
                                onClick={() => setQuestionForm({...questionForm, type: QuestionType.TEXT})}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold ${questionForm.type === QuestionType.TEXT ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
                            >
                                اختيارات
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setQuestionForm({...questionForm, type: QuestionType.INPUT})}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold ${questionForm.type === QuestionType.INPUT ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
                            >
                                سؤال مباشر (كتابي)
                            </button>
                        </div>

                        <input type="text" required value={questionForm.text} onChange={e => setQuestionForm({...questionForm, text: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="نص السؤال..." />
                        
                        <div className="flex gap-2">
                            <input type="number" required value={questionForm.points} onChange={e => setQuestionForm({...questionForm, points: parseInt(e.target.value)})} className="w-1/2 border p-2 rounded-lg" placeholder="النقاط" />
                            <select value={questionForm.difficulty} onChange={e => setQuestionForm({...questionForm, difficulty: e.target.value})} className="w-1/2 border p-2 rounded-lg bg-white"><option value="سهل">سهل</option><option value="متوسط">متوسط</option><option value="صعب">صعب</option></select>
                        </div>
                        
                        {questionForm.type === QuestionType.INPUT ? (
                             <div className="relative">
                                 <label className="text-xs text-slate-500 mb-1 block">الإجابة النموذجية (تتطلب تطابق دقيق)</label>
                                 <input 
                                    type="text" 
                                    required 
                                    value={questionForm.correctAnswerText || ''} 
                                    onChange={e => setQuestionForm({...questionForm, correctAnswerText: e.target.value})} 
                                    className="w-full border p-2 rounded-lg border-green-500 bg-green-50" 
                                    placeholder="اكتب الإجابة الصحيحة هنا..." 
                                 />
                             </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {questionForm.options.map((opt, idx) => (
                                    <div key={idx} className="relative">
                                        <input type="radio" name="correctIdx" checked={questionForm.correctIndex === idx} onChange={() => setQuestionForm({...questionForm, correctIndex: idx})} className="absolute top-3 left-2" />
                                        <input type="text" required value={opt} onChange={e => handleOptionChange(idx, e.target.value)} className={`w-full border p-2 pl-6 rounded-lg text-sm ${questionForm.correctIndex === idx ? 'border-green-500 bg-green-50' : ''}`} placeholder={`خيار ${idx + 1}`} />
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        <div className="flex gap-2 pt-2"><button type="submit" className="flex-1 bg-primary text-white py-2 rounded-lg font-bold">{isEditing ? 'حفظ' : 'إضافة'}</button>{isEditing && <button type="button" onClick={resetForm} className="bg-slate-200 px-4 rounded-lg">إلغاء</button>}</div>
                    </form>
                </div>
                
                <div className="space-y-3 mb-8">
                    {questionsList.map(q => (
                        <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="flex-grow">
                                    <span className="font-bold text-slate-800 block">{q.text}</span>
                                    {q.type === QuestionType.INPUT ? (
                                        <span className="text-xs text-blue-600 font-bold block mt-1">📝 إجابة كتابية: {q.correctAnswerText}</span>
                                    ) : (
                                        <span className="text-xs text-green-600 font-bold block mt-1">✅ الاختيار: {q.options[q.correctIndex]}</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2 ml-2"><button onClick={() => handleEditClick(q)} className="text-slate-400 hover:text-blue-500">✏️</button><button onClick={() => handleDeleteClick(q.id)} className="text-red-300 hover:text-red-500">🗑️</button></div>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button onClick={() => triggerLiveQuestion(q.id)} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${justSentId === q.id ? "bg-green-500 text-white" : "bg-primary text-white"}`}>{justSentId === q.id ? "تم الإرسال!" : "إرسال 🚀"}</button>
                                {activeLiveQuestion?.id === q.id && <button onClick={closeLiveQuestion} className="px-4 bg-red-100 text-red-600 rounded-xl text-sm font-bold">إيقاف</button>}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="border-t pt-6">
                    <h3 className="font-bold mb-2">إدارة المستخدمين</h3>
                    <p className="text-xs text-slate-400 mb-2">عدد المتصلين: {leaderboardData.length}</p>
                    <div className="flex items-center gap-3 mt-2">
                        {isConfigured && <button onClick={clearManualConfig} className="text-[10px] text-slate-400 underline">Reset Config</button>}
                        <button 
                            onClick={handleResetLeaderboardClick} 
                            className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-lg font-bold border border-red-200 hover:bg-red-200 transition-colors"
                        >
                            🗑️ تصفير الترتيب (حذف الكل)
                        </button>
                    </div>
                </div>
            </div>
        );
      default: return <div className="p-4">الصفحة قيد الإنشاء</div>;
    }
  };

  if (!user) return <Auth onLogin={handleLogin} dynamicTripCode={tripCode} />;

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <TopBar user={user} onLogout={handleLogout} score={score} isConnected={isConnected} />
      <div className="flex-grow overflow-y-auto no-scrollbar">{renderContent()}</div>
      <BottomNav currentView={view} user={user} onChangeView={setView} onLogout={handleLogout} />
      
      {/* User Message Modal */}
      {showMsgModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-bounce-in">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-800">✉️ رسالة للقائد</h3>
                      <button onClick={() => setShowMsgModal(false)} className="text-slate-400 text-xl">×</button>
                  </div>
                  <form onSubmit={handleSendMessage}>
                      <textarea 
                          value={msgText}
                          onChange={e => setMsgText(e.target.value)}
                          className="w-full h-32 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-primary outline-none mb-4 resize-none"
                          placeholder="اكتب طلبك، ملاحظتك، أو اقتراحك هنا..."
                      ></textarea>
                      <button type="submit" className="w-full bg-secondary hover:bg-yellow-500 text-slate-900 font-bold py-3 rounded-xl transition-all">إرسال</button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;