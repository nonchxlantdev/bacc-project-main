import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

function SignaturePlaceholder() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
      <svg
        viewBox="0 0 200 48"
        className="mb-1 h-10 w-44 text-navy/20"
        aria-hidden
        fill="none"
      >
        <path
          d="M8 34c18-22 32-26 48-18s28 8 44-4 28-10 40 2 36 14 52-8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-sm font-semibold text-navy">Add your signature here</p>
      <p className="text-xs text-muted">Use your mouse, trackpad, or touchscreen.</p>
    </div>
  );
}

export default function SignaturePad({
  value,
  disabled,
  onChange,
  label = 'Signature',
  variant = 'default',
  hideClear = false,
}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const prompt = variant === 'prompt';
  const [hasInk, setHasInk] = useState(Boolean(value));

  useEffect(() => {
    setHasInk(Boolean(value));
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (prompt) {
      // Prompt canvas stays transparent so the dashed box's placeholder
      // illustration (rendered behind it) can show through until inked.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-navy').trim() || '#0b1e3d';
    ctx.lineWidth = prompt ? 2.5 : 2;
    ctx.lineCap = 'round';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, [value, prompt]);

  function pos(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = event.touches ? event.touches[0] : event;
    return {
      x: ((src.clientX - rect.left) / rect.width) * canvas.width,
      y: ((src.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event) {
    if (disabled) return;
    drawing.current = true;
    setHasInk(true);
    const { x, y } = pos(event);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event) {
    if (!drawing.current || disabled) return;
    event.preventDefault();
    const { x, y } = pos(event);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange?.(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (prompt) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
    onChange?.(null);
  }

  return (
    <div>
      <div
        className={`relative ${
          prompt ? 'overflow-hidden rounded-lg border-2 border-dashed border-navy/20 bg-white' : ''
        }`}
      >
        {prompt && !hasInk && !disabled && <SignaturePlaceholder />}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          width={prompt ? 480 : 320}
          height={prompt ? 160 : 96}
          className={
            prompt
              ? 'relative z-10 h-40 w-full touch-none'
              : 'h-24 w-full touch-none rounded border border-navy/20 bg-white'
          }
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      {!disabled && !hideClear && (
        <button
          type="button"
          onClick={clear}
          className={`mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium desk:min-h-0 ${
            prompt ? 'text-primary hover:text-primary-hover' : 'text-xs text-muted hover:text-alert'
          }`}
        >
          {prompt ? (
            <>
              <RotateCcw className="h-4 w-4" />
              Clear signature
            </>
          ) : (
            'Clear signature'
          )}
        </button>
      )}
    </div>
  );
}
