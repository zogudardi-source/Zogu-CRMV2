import React, { useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

// Since signature_pad is loaded from a script tag, we need to declare its type for TypeScript
declare const SignaturePad: any;

interface SignatureModalProps {
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ onClose, onSave }) => {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<any>(null);

  const resizeCanvas = useCallback(() => {
    if (canvasRef.current) {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvasRef.current.width = canvasRef.current.offsetWidth * ratio;
      canvasRef.current.height = canvasRef.current.offsetHeight * ratio;
      canvasRef.current.getContext("2d")?.scale(ratio, ratio);
      if (signaturePadRef.current) {
        signaturePadRef.current.clear(); // Clear signature on resize
      }
    }
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      signaturePadRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: 'rgb(255, 255, 255)'
      });
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
    }
    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas]);

  const handleClear = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  const handleSave = () => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const dataUrl = signaturePadRef.current.toDataURL('image/png');
      onSave(dataUrl);
    } else {
      alert(t('provideSignatureFirst'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 flex flex-col">
        <h2 className="text-xl font-bold mb-4">{t('customerSignature')}</h2>
        <div className="w-full aspect-video border rounded-md dark:border-gray-600 mb-4 bg-white">
          <canvas ref={canvasRef} className="w-full h-full"></canvas>
        </div>
        <div className="flex justify-between items-center">
            <button type="button" onClick={handleClear} className="px-4 py-2 bg-gray-200 rounded text-sm font-medium dark:bg-gray-600">
                {t('clear')}
            </button>
            <div className="flex space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded text-sm font-medium dark:bg-gray-600">{t('cancel')}</button>
                <button type="button" onClick={handleSave} className="px-4 py-2 text-white bg-primary-600 rounded text-sm font-medium hover:bg-primary-700">{t('save')}</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SignatureModal;