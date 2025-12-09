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
  const [activeQuiz, setActiveQuiz] = useState<Question[] | null>(null);
  const [activeCommand, setActiveCommand] = useState<AdminCommand | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<User[]>(MOCK_LEADERBOARD);
  
  // Notification Permission State
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  
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
  const [tripCode, setTripCode] = useState(TRIP_CODE_VALID);

  // Setup Modal State
  const [showSetup, setShowSetup] = useState(!isConfigured);
  const [configInput, setConfigInput] = useState('');
  const [setupError, setSetupError] = useState('');

  // Messaging State
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [adminMessages, setAdminMessages] = useState<AdminMessage[]>([]);
  
  // Modals
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showSpinWheel, setShowSpinWheel] = useState(false);
  const [justSentId, setJustSentId] = useState<string | null>(null);
  
  // Admin Batch Selection State
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  
  // Admin Questions List
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
  const [questionForm, setQuestionForm] = useState<Question>({ id: '', text: '', options: ['', '', '', ''], correctIndex: 0, correctAnswerText: '', type: QuestionType.TEXT, points: 100, difficulty: 'متوسط' });
  
  // Sound & Notification Refs
  const prevQuizId = useRef<string | null>(null);
  const prevCommandTime = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

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

  // Save answered IDs
  useEffect(() => {
      localStorage.setItem('noah_answered_ids', JSON.stringify(answeredQuestionIds));
  }, [answeredQuestionIds]);

  // Handle Visibility & Wake Lock (Keep Screen On logic)
  useEffect(() => {
      const requestWakeLock = async () => {
        if ('wakeLock' in navigator && user) {
          try {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            console.log('Wake Lock active: Screen will stay on to keep connection.');
          } catch (err) {
            console.log('Wake Lock Error:', err);
          }
        }
      };

      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
              document.title = "سفينة نوح"; // Reset title
              requestWakeLock(); // Re-acquire lock if lost during switch
          }
      };
      
      document.addEventListener("visibilitychange", handleVisibilityChange);
      if (user) requestWakeLock();

      return () => {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          if (wakeLockRef.current) wakeLockRef.current.release();
      };
  }, [user]);

  // Request Notification Permission Handler
  const requestNotificationAccess = () => {
    if (!("Notification" in window)) {
        alert("هذا المتصفح لا يدعم الإشعارات");
        return;
    }
    Notification.requestPermission().then(permission => {
        setNotificationPerm(permission);
        if (permission === 'granted') {
            // Test Notification
            sendSystemNotification("✅ تم التفعيل", "ستصلك إشعارات عند بدء المسابقة!");
            playNotificationSound();
        }
    });
  };

  // Helper function to show System Notification
  const sendSystemNotification = (title: string, body: string) => {
    // 1. Flash Title if hidden
    if (document.hidden) {
        let flashState = false;
        const flashInterval = setInterval(() => {
            document.title = flashState ? `🔔 ${title}` : "سفينة نوح";
            flashState = !flashState;
            if (document.visibilityState === 'visible') {
                clearInterval(flashInterval);
                document.title = "سفينة نوح";
            }
        }, 1000);
        // Clear interval after 10 seconds to stop annoyance
        setTimeout(() => clearInterval(flashInterval), 10000);
    }

    // 2. Vibrate (Android/Mobile)
    if (navigator.vibrate) {
        // Distinct Pattern: Vibrate 500ms, Pause 100ms, Vibrate 500ms...
        navigator.vibrate([500, 100, 500, 100, 1000]);
    }

    // 3. Send Push Notification (Browser Native)
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const notification = new Notification(title, {
          body: body,
          icon: '/vite.svg', 
          tag: 'noah-app-alert',
          requireInteraction: true,
          silent: false // We play our own sound to ensure it works
        });
        
        notification.onclick = function() {
          window.focus();
          notification.close();
        };
      } catch (e) {
        console.error("Notification Error:", e);
      }
    }
  };

  // ---------------------------------------------------------
  // FIREBASE CONNECTION & SYNC
  // ---------------------------------------------------------
  useEffect(() => {
    if (!db) return;

    const initConnection = async () => {
        const { user: authUser, error } = await signIn();
        if (authUser) setAuthStatus('success');
        else {
            setAuthStatus('error');
            setAuthErrorMessage(error || "Unknown Auth Error");
            if (error?.includes('operation-not-allowed')) setConnectionError("يجب تفعيل 'Anonymous Auth'");
            else if (error?.includes('configuration-not-found')) setConnectionError("خطأ في المصادقة");
            else setConnectionError(`خطأ في الاتصال: ${error}`);
        }

        onValue(ref(db, ".info/connected"), (snap) => {
            const connected = snap.val() === true;
            setIsConnected(connected);
            if(connected && connectionError.includes('اتصال')) setConnectionError('');
        });

        onValue(ref(db, 'config/tripCode'), (snap) => { if (snap.val()) setTripCode(snap.val()); });

        // Listen for Quiz/Questions
        onValue(ref(db, 'activeQuiz'), (snapshot) => {
            const data = snapshot.val();
            let questions: Question[] | null = null;
            if (data) {
                if (Array.isArray(data)) questions = data;
                else if (typeof data === 'object') questions = [data];
            }

            setActiveQuiz(questions);
            setConnectionError('');
            
            // Notification Logic for New Quiz
            if (questions && questions.length > 0) {
                const currentBatchId = questions.map(q => q.id).join(',');
                if (currentBatchId !== prevQuizId.current) {
                    
                    // Trigger Alerts
                    playNotificationSound();
                    
                    const msg = questions.length > 1 
                        ? `بدأت مسابقة جديدة مكونة من ${questions.length} أسئلة!`
                        : `سؤال جديد: ${questions[0].text}`;

                    sendSystemNotification("⚡ مسابقة جديدة!", msg);
                    prevQuizId.current = currentBatchId;
                }
            } else {
                prevQuizId.current = null;
            }
        });

        // Listen for Admin Commands
        onValue(ref(db, 'activeCommand'), (snapshot) => {
            const cmd = snapshot.val() as AdminCommand | null;
            setActiveCommand(cmd);
            
            if (cmd && cmd.timestamp !== prevCommandTime.current) {
                playAlertSound();
                sendSystemNotification("📣 تنبيه من القائد", cmd.text);
                prevCommandTime.current = cmd.timestamp;
            } else if (!cmd) {
                prevCommandTime.current = null;
            }
        });

        // Listen for Leaderboard
        onValue(ref(db, 'users'), (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const usersList = Object.values(data).filter((u: any) => u && typeof u === 'object' && u.id) as User[];
                setLeaderboardData(usersList);
                if (user) {
                    const myData = usersList.find(u => u.id === user.id);
                    if (myData && (myData.score !== score || myData.hasSpunWheel !== user.hasSpunWheel)) {
                        setScore(myData.score);
                        const updatedLocal = { ...user, score: myData.score, hasSpunWheel: myData.hasSpunWheel };
                        localStorage.setItem('noah_user_session', JSON.stringify(updatedLocal));
                        setUser(updatedLocal);
                    }
                }
            } else {
                 setLeaderboardData([]);
            }
        });

        onValue(ref(db, 'messages'), (snapshot) => {
           const msgs = snapshot.val();
           if (msgs) {
               const list = Object.entries(msgs).map(([key, val]: [string, any]) => ({ id: key, ...val }));
               list.sort((a, b) => b.timestamp - a.timestamp);
               setAdminMessages(list);
           } else setAdminMessages([]);
        });
    };

    initConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Persist Questions
  useEffect(() => { localStorage.setItem('noah_questions_v1', JSON.stringify(questionsList)); }, [questionsList]);

  // Sound Helpers (Improved for background/sleep contexts)
  const playNotificationSound = () => {
     try {
         const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
         if (!AudioContext) return;
         const ctx = new AudioContext();
         
         // Attempt to resume if suspended (critical for mobile background)
         if (ctx.state === 'suspended') ctx.resume();

         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         osc.connect(gain);
         gain.connect(ctx.destination);
         
         // High pitched attention grabber
         osc.type = 'sine';
         osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
         osc.frequency.linearRampToValueAtTime(1760, ctx.currentTime + 0.1); // A6
         
         gain.gain.setValueAtTime(0.8, ctx.currentTime);
         gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
         
         osc.start();
         osc.stop(ctx.currentTime + 0.8);
     } catch (e) { console.error("Sound Error", e); }
  };

  const playAlertSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Siren like sound
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.2);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.4);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.6);
        
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
    } catch (e) { console.error("Sound Error", e); }
  };

  // Handlers
  const handleConfigSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const jsonStr = configInput.substring(configInput.indexOf('{'), configInput.lastIndexOf('}') + 1);
        const config = JSON.parse(jsonStr);
        if(!config.apiKey || !config.databaseURL) throw new Error("Missing apiKey or databaseURL");
        saveManualConfig(config);
      } catch (err: any) { setSetupError(err.message); }
  };

  const handleLogin = (u: User) => {
    setUser(u);
    setScore(u.score);
    localStorage.setItem('noah_user_session', JSON.stringify(u));
    setView(View.HOME);
    if (db) set(ref(db, 'users/' + u.id), u).catch(console.error);
    
    // Attempt request on login automatically
    if ("Notification" in window && Notification.permission === 'default') {
        Notification.requestPermission().then(setNotificationPerm);
    }
  };

  const handleLogout = () => { localStorage.removeItem('noah_user_session'); setUser(null); setView(View.AUTH); };
  
  const handleScoreUpdate = (points: number, questionId: string) => {
    const newScore = score + points;
    setScore(newScore);
    setAnsweredQuestionIds(prev => (!prev.includes(questionId) ? [...prev, questionId] : prev));
    if (user) {
        const updatedUser = { ...user, score: newScore };
        setUser(updatedUser);
        localStorage.setItem('noah_user_session', JSON.stringify(updatedUser));
        if (db) update(ref(db, 'users/' + user.id), { score: newScore });
        else setLeaderboardData(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    }
  };

  const handleQuizComplete = () => { setTimeout(() => { setView(View.HOME); }, 3000); };
  
  const handleSpinWin = (points: number) => {
      if (!user) return;
      const newScore = score + points;
      setScore(newScore);
      const updatedUser = { ...user, score: newScore, hasSpunWheel: true };
      setUser(updatedUser);
      localStorage.setItem('noah_user_session', JSON.stringify(updatedUser));
      if (db) update(ref(db, 'users/' + user.id), { score: newScore, hasSpunWheel: true });
      setShowSpinWheel(false);
      setTimeout(() => alert(`مبروك! ربحت ${points} نقطة!`), 300);
  };

  const playFeedbackSound = (type: 'correct' | 'wrong') => {
    // ... same sound logic ...
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
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
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
          push(ref(db, 'messages'), { senderId: user.id, senderName: user.name, text: msgText, timestamp: Date.now() })
            .then(() => { alert("تم الإرسال"); setMsgText(''); setShowMsgModal(false); }).catch(() => alert("فشل الإرسال"));
      } else alert("يجب أن تكون متصلاً");
  };

  // Admin Handlers
  const toggleQuestionSelection = (qId: string) => setSelectedQuestionIds(prev => prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]);
  const sendQuizBatch = () => {
      if (selectedQuestionIds.length === 0) return;
      const batch: Question[] = [];
      selectedQuestionIds.forEach(id => {
          let q = questionsList.find(x => x.id === id);
          if (!q) q = WHO_SAID_IT_QUESTIONS.find(x => x.id === id);
          if (q) batch.push(JSON.parse(JSON.stringify(q)));
      });
      if (batch.length > 0) {
          if (db) set(ref(db, 'activeQuiz'), batch).catch(alert);
          else setActiveQuiz(batch);
          setJustSentId("BATCH");
          setTimeout(() => setJustSentId(null), 1500);
          setSelectedQuestionIds([]);
      }
  };
  const triggerLiveQuestion = (qId: string) => {
      let q = questionsList.find(x => x.id === qId) || WHO_SAID_IT_QUESTIONS.find(x => x.id === qId);
      if (q) {
          const cleanQ = JSON.parse(JSON.stringify(q));
          if (db) set(ref(db, 'activeQuiz'), [cleanQ]).catch(alert);
          setJustSentId(qId);
          setTimeout(() => setJustSentId(null), 1500);
      }
  };
  const closeLiveQuiz = () => db ? set(ref(db, 'activeQuiz'), null) : setActiveQuiz(null);
  const handleUpdateTripCode = (newCode: string) => { if (db) set(ref(db, 'config/tripCode'), newCode.toUpperCase()).then(() => alert("تم التحديث")); else setTripCode(newCode.toUpperCase()); };
  const handleClearMessagesClick = () => setConfirmModal({ isOpen: true, title: "مسح الرسائل", message: "تأكيد؟", onConfirm: async () => { setIsLoadingAction(true); try { await remove(ref(db, 'messages')); setConfirmModal(prev => ({...prev, isOpen: false})); } finally { setIsLoadingAction(false); } } });
  const handleResetLeaderboardClick = () => setConfirmModal({ isOpen: true, title: "تصفير", message: "تأكيد الحذف؟", onConfirm: async () => { setIsLoadingAction(true); try { await remove(ref(db, 'users')); await set(ref(db, 'activeQuiz'), null); await set(ref(db, 'activeCommand'), null); setLeaderboardData([]); setConfirmModal(prev => ({...prev, isOpen: false})); } finally { setIsLoadingAction(false); } } });
  const handleSendCommand = (e: React.FormEvent) => { e.preventDefault(); if (commandInput.trim() && db) set(ref(db, 'activeCommand'), { text: commandInput, timestamp: Date.now(), type: 'alert' }).then(() => { alert('تم'); setCommandInput(''); }); };
  const handleClearCommand = () => { if (db) set(ref(db, 'activeCommand'), null); };
  
  // CRUD
  const resetForm = () => { setQuestionForm({ id: '', text: '', options: ['', '', '', ''], correctIndex: 0, correctAnswerText: '', type: QuestionType.TEXT, points: 100, difficulty: 'متوسط' }); setIsEditing(false); };
  const handleEditClick = (q: Question) => { setQuestionForm(q); setIsEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleDeleteClick = (id: string) => { setDeleteTargetId(id); setShowDeleteModal(true); };
  const confirmDelete = () => { if (deleteTargetId) setQuestionsList(prev => prev.filter(q => q.id !== deleteTargetId)); setShowDeleteModal(false); setDeleteTargetId(null); if(isEditing) resetForm(); };
  const cancelDelete = () => { setShowDeleteModal(false); setDeleteTargetId(null); };
  const handleSaveQuestion = (e: React.FormEvent) => { e.preventDefault(); if (questionForm.id) setQuestionsList(prev => prev.map(q => q.id === questionForm.id ? questionForm : q)); else setQuestionsList(prev => [{ ...questionForm, id: 'custom-' + Date.now() }, ...prev]); resetForm(); };
  const handleOptionChange = (idx: number, val: string) => { const newOpts = [...questionForm.options]; newOpts[idx] = val; setQuestionForm({ ...questionForm, options: newOpts }); };
  const handleResetQuestions = () => { if(window.confirm('استعادة الافتراضي؟')) { setQuestionsList(LIVE_QUESTIONS); localStorage.removeItem('noah_questions_v1'); } };

  // Setup View
  if (showSetup) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
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

  // Render Content
  const renderContent = () => {
    if (showSpinWheel) return <SpinWheel onWin={handleSpinWin} onClose={() => setShowSpinWheel(false)} />;

    switch (view) {
      case View.HOME:
        const playableQuestions = activeQuiz ? activeQuiz.filter(q => !answeredQuestionIds.includes(q.id)) : [];
        const hasActiveQuiz = playableQuestions.length > 0;
        const allAnswered = activeQuiz && activeQuiz.length > 0 && playableQuestions.length === 0;
        const hasSpun = user?.hasSpunWheel;

        return (
          <div className="p-4 flex flex-col gap-4 h-full content-start relative">
             <div className="bg-gradient-to-r from-primary to-blue-500 rounded-2xl p-6 text-white shadow-lg mb-2 relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 text-9xl opacity-20">🚢</div>
                <h2 className="text-2xl font-bold mb-2">مرحباً {user?.name}</h2>
                <p className="opacity-90">استعد للمسابقة المباشرة!</p>
             </div>

             {/* Notification Request Banner */}
             {notificationPerm !== 'granted' && "Notification" in window && (
                 <button onClick={requestNotificationAccess} className="bg-slate-800 text-white p-4 rounded-xl shadow-lg flex items-center justify-between cursor-pointer border-2 border-slate-600 animate-pulse w-full">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🔔</span>
                        <div className="flex flex-col items-start">
                            <span className="font-bold">تفعيل التنبيهات والاهتزاز</span>
                            <span className="text-xs text-slate-300">اضغط هنا لاستقبال إشعارات المسابقة في الخلفية</span>
                        </div>
                    </div>
                 </button>
             )}

             {connectionError && <div className="bg-red-500 text-white p-3 rounded-xl text-sm shadow-md font-bold">{connectionError}</div>}
             {!isConnected && !connectionError && isConfigured && <div className="bg-yellow-500 text-white p-3 rounded-xl text-sm shadow-md">📡 جارِ الاتصال بالخادم...</div>}

             {activeCommand && (
                <div className="bg-yellow-400 text-slate-900 p-4 rounded-xl shadow-lg flex items-center justify-between border-2 border-yellow-500 animate-pulse">
                     <div className="flex items-center gap-3"><span className="text-3xl">📣</span><div className="flex flex-col"><span className="font-black text-lg">أمر القائد</span><span className="font-bold text-md">{activeCommand.text}</span></div></div>
                </div>
             )}

             {hasActiveQuiz && (
                <div onClick={() => setView(View.LIVE_QUIZ)} className="bg-red-500 text-white p-4 rounded-xl shadow-lg flex items-center justify-between animate-pulse cursor-pointer border-2 border-red-400">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">⚡</span>
                        <div className="flex flex-col">
                            <span className="font-bold">مسابقة نشطة!</span>
                            <span className="text-xs text-red-100">{playableQuestions.length} سؤال متبقي</span>
                        </div>
                    </div>
                    <span className="bg-white text-red-600 px-3 py-1 rounded-full text-xs font-bold">دخول</span>
                </div>
             )}

             {allAnswered && (
                <div className="bg-slate-200 text-slate-500 p-4 rounded-xl shadow-inner flex items-center justify-between border-2 border-slate-300">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">✅</span>
                        <div className="flex flex-col">
                            <span className="font-bold">أنهيت المسابقة الحالية</span>
                            <span className="text-xs">انتظر المجموعة القادمة...</span>
                        </div>
                    </div>
                </div>
             )}

             <div className="grid grid-cols-2 gap-4">
                <button onClick={() => hasActiveQuiz ? setView(View.LIVE_QUIZ) : alert("لا يوجد أسئلة نشطة")} className={`p-6 rounded-xl shadow-sm border flex flex-col items-center gap-2 transition-all active:scale-95 ${hasActiveQuiz ? 'bg-white border-slate-100 hover:bg-slate-50' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
                    <span className="text-5xl mb-2">⚡</span><span className="font-bold text-slate-700">المسابقة</span>
                </button>
                <button onClick={() => hasSpun ? alert("مستخدمة!") : setShowSpinWheel(true)} className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 transition-all ${hasSpun ? 'opacity-50 grayscale' : 'hover:bg-slate-50 active:scale-95'}`}>
                    <span className="text-5xl mb-2">{hasSpun ? '🔒' : '🎡'}</span><span className="font-bold text-slate-700">{hasSpun ? 'تم' : 'عجلة الحظ'}</span>
                </button>
             </div>
             
             <button onClick={() => setShowMsgModal(true)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 mt-2">
                 <div className="flex items-center gap-3"><span className="text-3xl">📨</span><span className="font-bold text-slate-700">إرسال طلب للقائد</span></div><span className="text-slate-400">←</span>
             </button>
          </div>
        );
      case View.LIVE_QUIZ: 
        const playable = activeQuiz ? activeQuiz.filter(q => !answeredQuestionIds.includes(q.id)) : [];
        return <LiveGame questions={playable} onAnswer={handleScoreUpdate} onPlaySound={playFeedbackSound} onComplete={handleQuizComplete} />;
      case View.LEADERBOARD: return <Leaderboard currentUser={user!} data={leaderboardData} />;
      case View.ADMIN:
        return (
            <div className="p-4 relative pb-20">
                <div className="bg-slate-800 text-white p-4 rounded-xl mb-6 shadow-md"><h3 className="font-bold mb-3 text-yellow-400">🔐 إعدادات الرحلة</h3><input type="text" defaultValue={tripCode} onBlur={(e) => handleUpdateTripCode(e.target.value)} className="bg-slate-700 border-none rounded-lg px-3 py-2 w-full text-center text-lg font-bold" /></div>
                
                <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-xl shadow-md mb-6">
                    <h3 className="font-bold text-lg text-slate-800 mb-2">📢 إرسال حكم / تنبيه</h3>
                    <form onSubmit={handleSendCommand} className="flex flex-col gap-2"><input type="text" value={commandInput} onChange={(e) => setCommandInput(e.target.value)} placeholder="اكتب الأمر..." className="w-full p-3 rounded-xl border border-yellow-300" /><div className="flex gap-2"><button type="submit" className="flex-1 bg-yellow-500 text-white font-bold py-2 rounded-xl">إرسال 🔔</button>{activeCommand && <button type="button" onClick={handleClearCommand} className="px-4 bg-slate-200 text-slate-600 font-bold rounded-xl">إخفاء</button>}</div></form>
                </div>
                
                <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-6">
                    <div className="flex justify-between items-center mb-3"><h3 className="font-bold text-lg text-slate-700">📬 الرسائل</h3>{adminMessages.length > 0 && <button onClick={handleClearMessagesClick} className="text-xs text-red-500 font-bold px-2 py-1">مسح الكل</button>}</div>
                    <div className="max-h-60 overflow-y-auto space-y-2">{adminMessages.map(msg => <div key={msg.id} className="bg-slate-50 p-3 rounded-lg border text-sm"><span className="font-bold text-primary">{msg.senderName}</span>: {msg.text}</div>)}</div>
                </div>

                {confirmModal.isOpen && <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60"><div className="bg-white rounded-2xl p-6 w-full max-w-sm"><h3 className="text-lg font-bold mb-2">{confirmModal.title}</h3><div className="flex gap-3"><button onClick={() => setConfirmModal({...confirmModal, isOpen: false})} className="flex-1 py-3 bg-slate-100 rounded-xl">إلغاء</button><button onClick={confirmModal.onConfirm} className="flex-1 py-3 bg-red-500 text-white rounded-xl">{isLoadingAction ? '...' : 'تأكيد'}</button></div></div></div>}
                {showDeleteModal && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"><div className="bg-white rounded-2xl p-6 w-full max-w-xs"><h3 className="text-lg font-bold text-center mb-4">حذف؟</h3><div className="flex gap-3"><button onClick={cancelDelete} className="flex-1 py-2 rounded-xl bg-slate-100">لا</button><button onClick={confirmDelete} className="flex-1 py-2 rounded-xl bg-red-500 text-white">نعم</button></div></div></div>}

                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">إدارة الأسئلة</h2><button onClick={handleResetQuestions} className="text-[10px] text-red-400">استعادة الافتراضي</button></div>
                
                {selectedQuestionIds.length > 0 && <div className="fixed bottom-20 left-4 right-4 bg-slate-800 text-white p-4 rounded-xl shadow-2xl flex justify-between items-center z-50 animate-bounce-in"><span className="font-bold">{selectedQuestionIds.length} محدد</span><div className="flex gap-2"><button onClick={() => setSelectedQuestionIds([])} className="text-slate-300">إلغاء</button><button onClick={sendQuizBatch} className="bg-green-500 text-white px-6 py-2 rounded-lg font-bold">إرسال</button></div></div>}

                <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-8">
                    <h3 className="font-bold text-lg mb-3 text-primary">{isEditing ? 'تعديل' : 'إضافة'}</h3>
                    <form onSubmit={handleSaveQuestion} className="space-y-3">
                        <div className="flex gap-2 mb-2"><button type="button" onClick={() => setQuestionForm({...questionForm, type: QuestionType.TEXT})} className={`flex-1 py-2 rounded-lg text-xs font-bold ${questionForm.type === QuestionType.TEXT ? 'bg-primary text-white' : 'bg-slate-100'}`}>اختيارات</button><button type="button" onClick={() => setQuestionForm({...questionForm, type: QuestionType.INPUT})} className={`flex-1 py-2 rounded-lg text-xs font-bold ${questionForm.type === QuestionType.INPUT ? 'bg-primary text-white' : 'bg-slate-100'}`}>مباشر</button></div>
                        <input type="text" required value={questionForm.text} onChange={e => setQuestionForm({...questionForm, text: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="السؤال" />
                        <div className="flex gap-2"><input type="number" required value={questionForm.points} onChange={e => setQuestionForm({...questionForm, points: parseInt(e.target.value)})} className="w-1/2 border p-2 rounded-lg" placeholder="النقاط" /><select value={questionForm.difficulty} onChange={e => setQuestionForm({...questionForm, difficulty: e.target.value})} className="w-1/2 border p-2 rounded-lg bg-white"><option value="سهل">سهل</option><option value="متوسط">متوسط</option><option value="صعب">صعب</option></select></div>
                        {questionForm.type === QuestionType.INPUT ? <input type="text" required value={questionForm.correctAnswerText || ''} onChange={e => setQuestionForm({...questionForm, correctAnswerText: e.target.value})} className="w-full border p-2 rounded-lg border-green-500 bg-green-50" placeholder="الإجابة" /> : <div className="grid grid-cols-2 gap-2">{questionForm.options.map((opt, idx) => <div key={idx} className="relative"><input type="radio" name="correctIdx" checked={questionForm.correctIndex === idx} onChange={() => setQuestionForm({...questionForm, correctIndex: idx})} className="absolute top-3 left-2" /><input type="text" required value={opt} onChange={e => handleOptionChange(idx, e.target.value)} className={`w-full border p-2 pl-6 rounded-lg text-sm ${questionForm.correctIndex === idx ? 'border-green-500 bg-green-50' : ''}`} placeholder={`خيار ${idx + 1}`} /></div>)}</div>}
                        <div className="flex gap-2 pt-2"><button type="submit" className="flex-1 bg-primary text-white py-2 rounded-lg font-bold">{isEditing ? 'حفظ' : 'إضافة'}</button>{isEditing && <button type="button" onClick={resetForm} className="bg-slate-200 px-4 rounded-lg">إلغاء</button>}</div>
                    </form>
                </div>
                
                <div className="space-y-3 mb-8">{questionsList.map(q => { const isSelected = selectedQuestionIds.includes(q.id); return (<div key={q.id} className={`bg-white p-4 rounded-xl shadow-sm border flex gap-3 items-start ${isSelected ? 'border-green-500 bg-green-50' : ''}`}><div className="pt-1"><input type="checkbox" checked={isSelected} onChange={() => toggleQuestionSelection(q.id)} className="w-5 h-5 rounded" /></div><div className="flex-grow flex flex-col gap-2"><div className="flex justify-between items-start"><div className="flex-grow"><span className="font-bold text-slate-800 block">{q.text}</span>{q.type === QuestionType.INPUT ? <span className="text-xs text-blue-600 font-bold block mt-1">📝 {q.correctAnswerText}</span> : <span className="text-xs text-green-600 font-bold block mt-1">✅ {q.options[q.correctIndex]}</span>}</div><div className="flex flex-col gap-2 ml-2"><button onClick={() => handleEditClick(q)} className="text-slate-400">✏️</button><button onClick={() => handleDeleteClick(q.id)} className="text-red-300">🗑️</button></div></div><div className="flex gap-2 w-full"><button onClick={() => triggerLiveQuestion(q.id)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${justSentId === q.id ? "bg-green-500 text-white" : "bg-slate-100"}`}>{justSentId === q.id ? "أرسل!" : "إرسال مفرد"}</button></div></div></div>); })}</div>

                <div className="border-t pt-6"><h3 className="font-bold mb-2">إدارة النظام</h3><div className="flex items-center gap-3 mt-2">{activeQuiz && <button onClick={closeLiveQuiz} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm">⛔ إيقاف</button>}<button onClick={handleResetLeaderboardClick} className="text-xs bg-red-100 text-red-600 px-3 py-2 rounded-lg font-bold border border-red-200">🗑️ تصفير</button></div></div>
            </div>
        );
      default: return <div className="p-4">...</div>;
    }
  };

  if (!user) return <Auth onLogin={handleLogin} dynamicTripCode={tripCode} />;

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <TopBar user={user} onLogout={handleLogout} score={score} isConnected={isConnected} />
      <div className="flex-grow overflow-y-auto no-scrollbar">{renderContent()}</div>
      <BottomNav currentView={view} user={user} onChangeView={setView} onLogout={handleLogout} />
      {showMsgModal && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"><div className="bg-white rounded-2xl p-6 w-full max-w-sm"><div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">رسالة</h3><button onClick={() => setShowMsgModal(false)}>×</button></div><form onSubmit={handleSendMessage}><textarea value={msgText} onChange={e => setMsgText(e.target.value)} className="w-full h-32 border p-3 rounded-xl mb-4" placeholder="..." /><button type="submit" className="w-full bg-secondary text-slate-900 font-bold py-3 rounded-xl">إرسال</button></form></div></div>}
    </div>
  );
};

export default App;