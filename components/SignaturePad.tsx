import React, { useRef, useState, useEffect } from 'react';

interface SignaturePadProps {
  onSave: (base64: string) => void;
  onClear?: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx) {
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
    }

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const point = getPoint(e);

    if (!canvas || !ctx || !point) return;

    canvas.setPointerCapture(e.pointerId);

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (!isDrawing) return;

    const ctx = canvasRef.current?.getContext('2d');
    const point = getPoint(e);

    if (!ctx || !point) return;

    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(false);

    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch { }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      if (onClear) onClear();
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    onSave(canvas.toDataURL('image/png'));
    setIsOpen(false);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-xl bg-blue-600 px-4 py-4 font-bold text-white"
      >
        Assinar
      </button>

      {hasSignature && (
        <p className="text-center text-xs font-bold text-emerald-600">
          ✓ Assinatura capturada
        </p>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-white p-3"
          style={{
            touchAction: 'none',
            overscrollBehavior: 'none',
          }}
        >
          <div className="flex h-full flex-col">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Assinatura</h2>
                <p className="text-xs text-slate-500">
                  Assine dentro do campo abaixo.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div
              className="flex-1 overflow-hidden rounded-xl border-2 border-slate-300 bg-white"
              style={{
                touchAction: 'none',
                overscrollBehavior: 'none',
              }}
            >
              <canvas
                ref={canvasRef}
                width={900}
                height={500}
                className="block h-full w-full"
                style={{
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                onPointerLeave={stopDrawing}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={clear}
                className="rounded-xl bg-slate-100 px-4 py-4 text-base font-bold text-slate-600"
              >
                Limpar
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!hasSignature}
                className="rounded-xl bg-blue-600 px-4 py-4 text-base font-bold text-white disabled:bg-slate-300"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignaturePad;