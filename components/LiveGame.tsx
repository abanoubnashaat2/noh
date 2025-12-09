import React, { useState, useEffect, useRef } from 'react';
import { Question, QuestionType } from '../types';

interface LiveGameProps {
  questions: Question[]; // Changed from single question to array
  onAnswer: (points: number, questionId: string) => void;
  isAdmin?: boolean;
  onPlaySound?: (type: 'correct' | 'wrong') => void;
  onComplete?: () => void;
}

const LiveGame: React.FC<LiveGameProps> = ({ questions, onAnswer, onPlaySound, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isCorrectInput, setIsCorrectInput] = useState(false);
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    // Reset state when question changes
    if (currentQuestion) {
      const initialTime = currentQuestion.type === QuestionType.INPUT ? 45 : 20; 
      setTimeLeft(initialTime);
      setSelectedOption(null);
      setTextAnswer('');
      setHasAnswered(false);
      setShowResult(false);
      setIsCorrectInput(false);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
        // No more questions
        if (onComplete) onComplete();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions]); // Re-run when index changes or new batch loaded

  const handleNext = () => {
      if (currentIndex < questions.length - 1) {
          setCurrentIndex(prev => prev + 1);
      } else {
          if (onComplete) onComplete();
      }
  };

  const handleTimeUp = () => {
      setHasAnswered(true);
      setShowResult(true);
      // Auto advance after delay if user didn't answer
      setTimeout(handleNext, 2500);
  };

  const handleOptionClick = (index: number) => {
    if (hasAnswered || timeLeft === 0 || !currentQuestion) return;

    setHasAnswered(true);
    setSelectedOption(index);
    if (timerRef.current) clearInterval(timerRef.current);

    const isCorrect = index === currentQuestion.correctIndex;

    if (onPlaySound) onPlaySound(isCorrect ? 'correct' : 'wrong');

    let points = 0;
    if (isCorrect) {
      const timeTaken = 20 - timeLeft;
      points = Math.max(10, currentQuestion.points - (timeTaken * 2)); // Simple decay
    }

    setShowResult(true);
    onAnswer(isCorrect ? points : 0, currentQuestion.id);
    
    // Auto Advance
    setTimeout(handleNext, 2500);
  };

  const handleInputSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (hasAnswered || timeLeft === 0 || !currentQuestion) return;
      if (!textAnswer.trim()) return;

      setHasAnswered(true);
      if (timerRef.current) clearInterval(timerRef.current);

      const expected = currentQuestion.correctAnswerText?.trim().toLowerCase();
      const actual = textAnswer.trim().toLowerCase();
      const isCorrect = expected === actual;
      setIsCorrectInput(isCorrect);

      if (onPlaySound) onPlaySound(isCorrect ? 'correct' : 'wrong');

      let points = 0;
      if (isCorrect) points = currentQuestion.points;

      setShowResult(true);
      onAnswer(isCorrect ? points : 0, currentQuestion.id);

      // Auto Advance
      setTimeout(handleNext, 2500);
  };

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 animate-pulse">
        <div className="text-6xl mb-4">✅</div>
        <p className="text-lg font-medium">أنهيت جميع الأسئلة!</p>
      </div>
    );
  }

  const maxTime = currentQuestion.type === QuestionType.INPUT ? 45 : 20;

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header Info */}
      <div className="flex justify-between items-center mb-4 text-xs font-bold text-slate-500">
          <span>سؤال {currentIndex + 1} من {questions.length}</span>
          <span>النقاط: {currentQuestion.points}</span>
      </div>

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

      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 flex-grow flex flex-col justify-center border-t-4 border-primary relative overflow-hidden">
        {/* Progress Watermark */}
        <div className="absolute top-2 right-2 text-6xl opacity-5 font-black z-0">
            {currentIndex + 1}
        </div>

        <h2 className="text-xl font-bold text-center text-slate-800 mb-2 relative z-10">{currentQuestion.text}</h2>
        <div className="text-center text-sm text-slate-400 relative z-10">
            {currentQuestion.type === QuestionType.INPUT ? 'سؤال مباشر - اكتب الإجابة' : 'اختر الإجابة الصحيحة'}
        </div>
      </div>

      {currentQuestion.type === QuestionType.INPUT ? (
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
          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((option, idx) => {
              let stateClass = "bg-white border-2 border-slate-100 text-slate-700";
              
              if (showResult) {
                if (idx === currentQuestion.correctIndex) {
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
            {(currentQuestion.type === QuestionType.INPUT ? isCorrectInput : selectedOption === currentQuestion.correctIndex) ? (
                 <div className="flex flex-col items-center">
                    <span className="text-4xl mb-1">🎉</span>
                    <span className="text-green-600 font-bold">إجابة صحيحة!</span>
                 </div>
            ) : (
                <div className="flex flex-col items-center">
                    <span className="text-4xl mb-1">❌</span>
                    <span className="text-red-500 font-bold">إجابة خاطئة!</span>
                    {currentQuestion.type === QuestionType.INPUT && (
                        <span className="text-xs text-slate-500 mt-1">الصحيح: {currentQuestion.correctAnswerText}</span>
                    )}
                </div>
            )}
            <div className="text-xs text-slate-400 mt-2">جاري الانتقال للسؤال التالي...</div>
        </div>
      )}
    </div>
  );
};

export default LiveGame;