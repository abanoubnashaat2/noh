import React, { useState } from 'react';

interface SpinWheelProps {
  onWin: (points: number) => void;
  onClose: () => void;
}

const PRIZES = [
  { label: '50', value: 50, color: '#ef4444', text: 'white' },    // Red
  { label: '10', value: 10, color: '#f97316', text: 'white' },    // Orange
  { label: '100', value: 100, color: '#eab308', text: 'black' },  // Yellow
  { label: '20', value: 20, color: '#22c55e', text: 'white' },    // Green
  { label: '0', value: 0, color: '#3b82f6', text: 'white' },     // Blue
  { label: '5', value: 5, color: '#a855f7', text: 'white' },     // Purple
  { label: '200', value: 200, color: '#ec4899', text: 'white' },  // Pink
  { label: '30', value: 30, color: '#64748b', text: 'white' },    // Slate
];

const SpinWheel: React.FC<SpinWheelProps> = ({ onWin, onClose }) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);

  // Create conic gradient string dynamically based on prizes
  const gradientBackground = `conic-gradient(${PRIZES.map(
    (p, i) => `${p.color} ${(i * 360) / PRIZES.length}deg ${((i + 1) * 360) / PRIZES.length}deg`
  ).join(', ')})`;

  const handleSpin = () => {
    if (spinning) return;

    setSpinning(true);
    setResult(null);

    // 1. Decide the winner beforehand (Deterministic Logic)
    const prizeIndex = Math.floor(Math.random() * PRIZES.length);
    const selectedPrize = PRIZES[prizeIndex];

    // 2. Calculate rotation to land EXACTLY on this prize
    // We want the center of the segment to align with the top (0deg).
    // Segment i covers [i*45, (i+1)*45]. Center is i*45 + 22.5.
    const segmentAngle = 360 / PRIZES.length; // 45 degrees per segment
    const segmentCenter = (prizeIndex * segmentAngle) + (segmentAngle / 2);
    
    // To bring "segmentCenter" to 0deg (Top), we need to rotate the container.
    // Logic: If content is at Angle X, rotating the container by (360 - X) brings it to 0.
    const targetAlignment = (360 - segmentCenter) % 360; 
    
    // Add multiple full spins for excitement (e.g., 5 to 8 full spins)
    const spins = Math.floor(Math.random() * 3) + 5; 
    const spinDeg = spins * 360;

    // Calculate current position modulus to ensure smooth continuous rotation
    const currentMod = rotation % 360;
    
    // Calculate delta needed to reach targetAlignment from current position
    // We always want to spin forward (positive delta)
    let dist = targetAlignment - currentMod;
    if (dist < 0) dist += 360;
    
    // Add some noise (jitter) to make it look realistic, but keep it inside the segment safe zone
    // Segment width is 45. Safe zone is +/- 20 from center. Let's do +/- 15 to be safe.
    const jitter = Math.floor(Math.random() * 30) - 15;

    const totalRotation = rotation + spinDeg + dist + jitter;

    setRotation(totalRotation);

    // 3. Wait for animation to finish then show result
    setTimeout(() => {
        setSpinning(false);
        setResult(selectedPrize.value);
    }, 4500); // 4.5s matches CSS transition duration
  };

  const handleClose = () => {
      // If user won points, trigger callback. Else just close.
      if (result !== null && result > 0) {
          onWin(result);
      } else {
          onClose();
      }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center relative shadow-2xl border-4 border-yellow-400 flex flex-col items-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-xl font-bold transition-colors">✕</button>
        
        <h2 className="text-2xl font-black text-slate-800 mb-1">🎡 عجلة الحظ</h2>
        <p className="text-slate-400 text-xs mb-6">جرب حظك واربح نقاطاً!</p>

        {/* Wheel Container */}
        <div className="relative w-72 h-72 mb-8">
            {/* Pointer / Ticker */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 w-8 h-10 filter drop-shadow-md">
                <div className="w-full h-full bg-red-600 rounded-b-full border-2 border-white relative z-10"></div>
            </div>

            {/* The Rotating Wheel */}
            <div 
                className="w-full h-full rounded-full border-[8px] border-slate-800 shadow-2xl relative overflow-hidden"
                style={{ 
                    background: gradientBackground,
                    transform: `rotate(${rotation}deg)`,
                    transition: spinning ? 'transform 4.5s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
                }}
            >
                {/* Labels */}
                {PRIZES.map((prize, idx) => {
                    // Calculate center angle of the segment
                    const angle = (360 / PRIZES.length) * idx + (360 / PRIZES.length) / 2;
                    return (
                        <div 
                            key={idx}
                            className="absolute top-0 left-0 w-full h-full flex justify-center pt-4 pointer-events-none"
                            style={{ 
                                transform: `rotate(${angle}deg)`,
                            }}
                        >
                            <span 
                                className="font-black text-lg drop-shadow-md"
                                style={{ color: prize.text }}
                            >
                                {prize.label}
                            </span>
                        </div>
                    );
                })}
            </div>
            
            {/* Center Cap */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-white rounded-full shadow-xl flex items-center justify-center border-4 border-slate-200 z-10">
                <span className="text-xl">⚓</span>
            </div>
        </div>

        {/* Controls */}
        <div className="w-full h-16 relative">
            {result !== null ? (
                <div className="animate-bounce-in absolute inset-0 flex flex-col items-center justify-center z-30">
                    <p className="text-sm font-bold text-slate-500">النتيجة</p>
                    <div className="text-3xl font-black text-primary mb-2">
                        {result > 0 ? `+${result} نقطة!` : 'حظ أوفر 😢'}
                    </div>
                    <button 
                        onClick={handleClose} 
                        className="bg-primary text-white px-8 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
                    >
                        {result > 0 ? 'استلام النقاط' : 'إغلاق'}
                    </button>
                </div>
            ) : (
                <button 
                    onClick={handleSpin} 
                    disabled={spinning}
                    className={`
                        w-full py-4 rounded-xl font-bold text-white text-xl shadow-lg transition-all
                        ${spinning 
                            ? 'bg-slate-300 cursor-not-allowed scale-95' 
                            : 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:scale-105 hover:shadow-orange-300/50'
                        }
                    `}
                >
                    {spinning ? 'جاري الدوران...' : 'دوران! 🎲'}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default SpinWheel;