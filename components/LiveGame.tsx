import React, { useState, useEffect, useRef } from 'react';
import { Question } from '../types';

interface LiveGameProps {
  question: Question | null;
  onAnswer: (points: number) => void;
  isAdmin?: boolean;
  onPlaySound?: (type: 'correct' | 'wrong') => void;
  isAlreadyAnswered?: boolean;
}

const LiveGame: React.FC<LiveGameProps> = ({ question, onAnswer, isAdmin, onPlaySound, isAlreadyAnswered }) => {
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResult, setShowResult] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset state when new question arrives
    if (question) {
      // If the question changed, we reset our local "hasAnswered" state.
      // NOTE: parent (App) tracks "isAlreadyAnswered". 
      // If question ID changes, parent should pass isAlreadyAnswered=false.
      
      setTimeLeft(15);
      setSelectedOption(null);
      setHasAnswered(false);
      setShowResult(false);

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
        // Clear timer if no question
        if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [question?.id]); // Only reset if ID changes

  // Logic to show "Locked" screen:
  // If the parent says it's answered, AND we haven't just answered it in this session (hasAnswered is false).
  // This covers the case where user refreshes or navigates away and back.
  const isLocked = isAlreadyAnswered && !hasAnswered;

  const handleOptionClick = (index: number) => {
    if (hasAnswered || timeLeft === 0 || !question) return;

    setHasAnswered(true);
    setSelectedOption(index);
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrect = index === question.correctIndex;

    // Play Sound Automatically
    if (onPlaySound) {
        onPlaySound(isCorrect ? 'correct' : 'wrong');
    }

    // Score Calculation: 100 max, minus time elapsed
    let points = 0;
    
    if (isCorrect) {
      // Logic: Faster answer = more points. Min 10 pts.
      const timeTaken = 15 - timeLeft;
      // Simple formula: 100 - (timeTaken * 5)
      points = Math.max(10, 100 - (timeTaken * 5));
    }

    setTimeout(() => {
        setShowResult(true);
        if (isCorrect) {
            onAnswer(points);
        } else {
            // Wrong answer penalty? Or just 0.
            onAnswer(0);
        }
    }, 1000); // Small delay for tension
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

  return (
    <div className="flex flex-col h-full p-4">
      {/* Timer Bar */}
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden mb-6 relative">
        <div 
            className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-red-500' : 'bg-primary'}`}
            style={{ width: `${(timeLeft / 15) * 100}%` }}
        />
        <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-700">
            {timeLeft} ثانية
        </span>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 flex-grow flex flex-col justify-center border-t-4 border-primary">
        <h2 className="text-xl font-bold text-center text-slate-800 mb-2">{question.text}</h2>
        <div className="text-center text-sm text-slate-400">سؤال سرعة 🔥</div>
      </div>

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

      {showResult && (
        <div className="mt-6 text-center animate-bounce">
            {selectedOption === question.correctIndex ? (
                 <span className="text-green-600 font-bold text-xl">🎉 إجابة صحيحة!</span>
            ) : (
                <span className="text-red-500 font-bold text-xl">❌ حظ أوفر!</span>
            )}
        </div>
      )}
    </div>
  );
};

export default LiveGame;