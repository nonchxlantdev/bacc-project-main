import { useEffect, useRef } from 'react';

export default function SignaturePad({ value, disabled, onChange, label = 'Signature' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-navy').trim() || '#0b1e3d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, [value]);

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
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange?.(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        // A canvas exposes nothing of itself to assistive technology, so
        // without a name this is an unlabelled drawing surface — and the
        // signature is the one control on the form that carries a person's
        // accountability for what they filed.
        role="img"
        aria-label={label}
        width={320}
        height={96}
        className="h-24 w-full touch-none rounded border border-navy/20 bg-white"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      {!disabled && (
        <button type="button" onClick={clear} className="mt-1 text-xs text-muted hover:text-alert">
          Clear signature
        </button>
      )}
    </div>
  );
}
