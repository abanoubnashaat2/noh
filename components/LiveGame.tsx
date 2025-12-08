import React, { useState, useEffect, useRef } from 'react';
import { Question, QuestionType } from '../types';

interface LiveGameProps {
  question: Question | null;
  onAnswer: (points: number) => void;
  isAdmin?: boolean;
  onPlaySound?: (type: 'correct' | 'wrong') => void;
  isAlreadyAnswered?: boolean;
}

const LiveGame: React.FC<LiveGameProps> = ({ question, onAnswer, isAdmin, onPlaySound, isAlreadyAnswered }) => {
  const [timeLeft, setTimeLeft] = useState(30); // Increased default time for typing
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // For Input Type
  const [textAnswer, setTextAnswer] = useState('');
  
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isCorrectInput, setIsCorrectInput] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset state when new question arrives
    if (question) {
      const initialTime = question.type === QuestionType.INPUT ? 45 : 15; // More time for typing
      setTimeLeft(initialTime);
      setSelectedOption(null);
      setTextAnswer('');
      setHasAnswered(false);
      setShowResult(false);
      setIsCorrectInput(false);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setShowResult(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
        if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [question?.id]);

  const isLocked = isAlreadyAnswered && !hasAnswered;

  const handleOptionClick = (index: number) => {
    if (hasAnswered || timeLeft === 0 || !question) return;

    setHasAnswered(true);
    setSelectedOption(index);
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrect = index === question.correctIndex;

    if (onPlaySound) onPlaySound(isCorrect ? 'correct' : 'wrong');

    let points = 0;
    if (isCorrect) {
      const timeTaken = 15 - timeLeft;
      points = Math.max(10, 100 - (timeTaken * 5));
    }

    setTimeout(() => {
        setShowResult(true);
        onAnswer(isCorrect ? points : 0);
    }, 1000);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (hasAnswered || timeLeft === 0 || !question) return;
      if (!textAnswer.trim()) return;

      setHasAnswered(true);
      if (timerRef.current) clearInterval(timerRef.current);

      // Validation Logic
      const expected = question.correctAnswerText?.trim().toLowerCase();
      const actual = textAnswer.trim().toLowerCase();
      
      const isCorrect = expected === actual;
      setIsCorrectInput(isCorrect);

      if (onPlaySound) onPlaySound(isCorrect ? 'correct' : 'wrong');

      let points = 0;
      if (isCorrect) {
          // Slightly simpler scoring for text
          points = question.points; 
      }

      setTimeout(() => {
          setShowResult(true);
          onAnswer(isCorrect ? points : 0);
      }, 1000);
  };

  if (isLocked) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-fade-in">
          <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner border border-slate-200">
               <span className="text-5xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">تمت الإجابة على هذا السؤال</h2>
          <p className="text-slate-500 text-sm mb-6">انتظر السؤال التالي من القائد...</p>
        </div>
      );
  }

  if (!question) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 animate-pulse">
        <div className="text-6xl mb-4">⏳</div>
        <p className="text-lg font-medium">في انتظار سؤال القائد...</p>
        <p className="text-sm mt-2">كن مستعداً!</p>
      </div>
    );
  }

  const maxTime = question.type === QuestionType.INPUT ? 45 : 15;

  return (
    <div className="flex flex-col h-full p-4">
      {/* Timer Bar */}
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-6 relative">
        <div 
            className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-red-500' : 'bg-primary'}`}
            style={{ width: `${(timeLeft / maxTime) * 100}%` }}
        />
        <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-700">
            {timeLeft} ثانية
        </span>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 flex-grow flex flex-col justify-center border-t-4 border-primary">
        <h2 className="text-xl font-bold text-center text-slate-800 mb-2">{question.text}</h2>
        <div className="text-center text-sm text-slate-400">
            {question.type === QuestionType.INPUT ? 'سؤال مباشر - اكتب الإجابة' : 'سؤال سرعة 🔥'}
        </div>
      </div>

      {question.type === QuestionType.INPUT ? (
          // Input Interface
          <form onSubmit={handleInputSubmit} className="flex flex-col gap-4">
              <input 
                type="text" 
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={hasAnswered}
                placeholder="اكتب إجابتك هنا..."
                className={`w-full p-4 rounded-xl border-2 text-center text-lg font-bold outline-none transition-colors
                    ${showResult 
                        ? (isCorrectInput ? 'border-green-500 bg-green-50 text-green-900' : 'border-red-500 bg-red-50 text-red-900')
                        : 'border-slate-300 focus:border-primary'
                    }
                `}
              />
              {!showResult && (
                  <button 
                    type="submit" 
                    disabled={hasAnswered || !textAnswer.trim()}
                    className="bg-primary text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-blue-600 disabled:opacity-50"
                  >
                      إرسال الإجابة 🚀
                  </button>
              )}
          </form>
      ) : (
          // Multiple Choice Interface
          <div className="grid grid-cols-1 gap-3">
            {question.options.map((option, idx) => {
              let stateClass = "bg-white border-2 border-slate-100 text-slate-700";
              
              if (showResult) {
                if (idx === question.correctIndex) {
                  stateClass = "bg-green-100 border-green-500 text-green-800";
                } else if (idx === selectedOption) {
                  stateClass = "bg-red-100 border-red-500 text-red-800";
                } else {
                    stateClass = "opacity-50";
                }
              } else if (selectedOption === idx) {
                 stateClass = "bg-primary border-primary text-white";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionClick(idx)}
                  disabled={hasAnswered || timeLeft === 0}
                  className={`p-4 rounded-xl font-bold text-lg shadow-sm transition-all transform active:scale-95 ${stateClass}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
      )}

      {showResult && (
        <div className="mt-6 text-center animate-bounce">
            {(question.type === QuestionType.INPUT ? isCorrectInput : selectedOption === question.correctIndex) ? (
                 <div className="flex flex-col items-center">
                    <span className="text-6xl mb-2">🎉</span>
                    <span className="text-green-600 font-bold text-xl">إجابة صحيحة!</span>
                    {question.type === QuestionType.INPUT && <span className="text-xs text-slate-400 mt-1">الإجابة: {question.correctAnswerText}</span>}
                 </div>
            ) : (
                <div className="flex flex-col items-center">
                    <span className="text-6xl mb-2">😢</span>
                    <span className="text-red-500 font-bold text-xl">إجابة خاطئة!</span>
                    {question.type === QuestionType.INPUT ? (
                        <span className="text-sm font-bold text-slate-600 mt-2">الإجابة الصحيحة: {question.correctAnswerText}</span>
                    ) : (
                         <span className="text-sm text-slate-400 mt-1">حظ أوفر المرة القادمة</span>
                    )}
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default LiveGame;