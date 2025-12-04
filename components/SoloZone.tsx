import React, { useState, useEffect, useRef } from 'react';

// Replaced SoloZone with just QRScanner as per request to remove other games.

export const QRScanner: React.FC<{ onScan: (data: string) => void, onClose: () => void }> = ({ onScan, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState("جاري تشغيل الكاميرا...");

    useEffect(() => {
        let stream: MediaStream | null = null;
        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStatus("امسح الكود ضوئياً");
                }
            } catch (err) {
                setStatus("تعذر الوصول للكاميرا. تأكد من الأذونات.");
                console.error(err);
            }
        };
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        }
    }, []);

    const handleSimulateScan = () => {
        onScan("QR-TREASURE-1"); // Mock scan
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            <div className="p-4 flex justify-between items-center text-white bg-black/50 absolute top-0 w-full">
                <span>{status}</span>
                <button onClick={onClose} className="text-2xl font-bold">×</button>
            </div>
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
            
            {/* Overlay Frame */}
            <div className="absolute inset-0 border-[50px] border-black/50 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-4 border-secondary rounded-xl animate-pulse"></div>
            </div>

            <div className="absolute bottom-10 left-0 w-full flex justify-center pointer-events-auto">
                 <button onClick={handleSimulateScan} className="bg-secondary text-black px-6 py-2 rounded-full font-bold shadow-lg">
                    محاكاة التقاط الكود (تجريبي)
                 </button>
            </div>
        </div>
    )
}

export default QRScanner;