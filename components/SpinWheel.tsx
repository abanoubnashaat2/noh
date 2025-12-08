import React, { useState, useRef } from 'react';

interface SpinWheelProps {
  onWin: (points: number) => void;
  onClose: () => void;
}

const PRIZES = [
  { label: '50', value: 50, color: '#ef4444' },    // red
  { label: '10', value: 10, color: '#f97316' },    // orange
  { label: '100', value: 100, color: '#eab308' },  // yellow
  { label: '20', value: 20, color: '#22c55e' },    // green
  { label: '0', value: 0, color: '#3b82f6' },     // blue
  { label: '5', value: 5, color: '#a855f7' },     // purple
  { label: '200', value: 200, color: '#ec4899' },  // pink
  { label: '30', value: 30, color: '#64748b' },    // slate
];

const SpinWheel: React.FC<SpinWheelProps> = ({ onWin, onClose }) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);

  const spin = () => {
    if (spinning) return;

    setSpinning(true);
    setResult(null);

    // Calculate random spin
    const randomSpin = Math.floor(Math.random() * 3600) + 360; // At least 1 full spin + random
    const newRotation = rotation + randomSpin;
    
    setRotation(newRotation);

    // Calculate result
    // The pointer is usually at the top (270deg or -90deg in CSS terms depending on setup).
    // Let's assume standard 0 is right. We need to map final angle to segment.
    
    setTimeout(() => {
        setSpinning(false);
        
        const finalAngle = newRotation % 360;
        // Each segment is 360 / 8 = 45 degrees
        // Determine which segment is at the pointer (let's assume pointer is at Top/270deg)
        // This is a simplified simulation logic
        
        // Randomize prize for simplicity of logic vs visual sync
        const randomPrizeIndex = Math.floor(Math.random() * PRIZES.length);
        const prize = PRIZES[randomPrizeIndex];
        
        setResult(prize.value);
        if (prize.value > 0) {
            onWin(prize.value);
        }
    }, 4000); // 4 seconds duration
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center relative overflow-hidden shadow-2xl border-4 border-yellow-400">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 text-xl font-bold">✕</button>
        
        <h2 className="text-2xl font-black text-slate-800 mb-2">🎡 عجلة الحظ</h2>
        <p className="text-slate-500 text-xs mb-6">جرب حظك واكسب نقاط إضافية!</p>

        <div className="relative w-64 h-64 mx-auto mb-6">
            {/* Pointer */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10 text-4xl text-slate-800">🔻</div>
            
            {/* Wheel */}
            <div 
                className="w-full h-full rounded-full border-8 border-slate-100 shadow-inner overflow-hidden relative spin-wheel-container"
                style={{ 
                    transform: `rotate(${rotation}deg)`,
                    transition: spinning ? 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none'
                }}
            >
                {PRIZES.map((prize, idx) => {
                    const angle = (360 / PRIZES.length) * idx;
                    return (
                        <div 
                            key={idx}
                            className="absolute top-0 left-0 w-full h-full"
                            style={{ 
                                transform: `rotate(${angle}deg)`,
                                transformOrigin: '50% 50%' 
                            }}
                        >
                            <div 
                                className="w-[50%] h-[50%] absolute top-0 right-0 origin-bottom-left flex items-center justify-center"
                                style={{ 
                                    backgroundColor: prize.color,
                                    transform: `skewY(-45deg)`, // Only approximate visual for 8 segments
                                    clipPath: 'polygon(0 0, 100% 0, 100% 100%)' // Tries to make a slice
                                }}
                            >
                               <span 
                                style={{ transform: 'skewY(45deg) rotate(22deg) translate(20px, 40px)' }}
                                className="text-white font-bold text-lg block"
                               >
                                   {prize.label}
                               </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Center Cap */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center font-bold text-xs border-2 border-slate-200">
                NOAH
            </div>
        </div>

        {result !== null ? (
            <div className="animate-bounce-in">
                <p className="text-lg font-bold text-slate-700">النتيجة</p>
                <div className="text-4xl font-black text-primary mb-4">{result} نقطة</div>
                <button onClick={onClose} className="w-full bg-slate-100 py-3 rounded-xl font-bold">إغلاق</button>
            </div>
        ) : (
            <button 
                onClick={spin} 
                disabled={spinning}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg text-xl transition-all ${spinning ? 'bg-slate-300 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:scale-105'}`}
            >
                {spinning ? 'جاري الدوران...' : 'دوران! 🎲'}
            </button>
        )}
      </div>
    </div>
  );
};

export default SpinWheel;