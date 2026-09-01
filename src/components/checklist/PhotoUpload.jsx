import { Camera, X } from 'lucide-react';
import { useRef } from 'react';

export default function PhotoUpload({ itemCode, previewUrl, disabled, onSelect, onClear }) {
  const inputRef = useRef(null);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Photo evidence</p>
      {previewUrl ? (
        <>
          <div className="relative overflow-hidden rounded-md border border-line/15">
            <img src={previewUrl} alt={`${itemCode} evidence`} className="h-36 w-full object-cover" />
            {!disabled && (
              <button
                type="button"
                onClick={onClear}
                className="absolute right-2 top-2 rounded-full bg-navy/80 p-1 text-white"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            {itemCode}.jpg
          </p>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-line/30 bg-stripe px-3 py-6 text-sm text-muted hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          Attach photo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
