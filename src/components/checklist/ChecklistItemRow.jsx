import StatusPill from './StatusPill.jsx';

export default function ChecklistItemRow({
  item,
  row,
  selected,
  striped,
  disabled,
  remarksError,
  onSelect,
  onChange,
}) {
  const result = row?.result ?? null;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_minmax(8rem,14rem)] items-stretch border-b border-navy/10 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_minmax(10rem,16rem)] ${
        striped ? 'bg-stripe' : 'bg-white'
      } ${selected ? 'ring-2 ring-inset ring-primary' : ''} ${
        remarksError ? 'bg-alert-soft' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(item.code)}
        className="px-3 py-2 text-left"
      >
        <span className="mr-2 font-bold text-navy">{item.code}</span>
        <span className="text-sm text-ink">{item.text}</span>
      </button>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 border-l border-navy/10 text-[10px] font-semibold">
        <input
          type="radio"
          name={`${item.code}-result`}
          className="accent-success"
          disabled={disabled}
          checked={result === 'sat'}
          onChange={() => onChange({ result: 'sat' })}
        />
        <span className={result === 'sat' ? 'text-success' : 'text-muted'}>SAT</span>
      </label>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 border-l border-navy/10 text-[10px] font-semibold">
        <input
          type="radio"
          name={`${item.code}-result`}
          className="accent-alert"
          disabled={disabled}
          checked={result === 'no_sat'}
          onChange={() => {
            onChange({ result: 'no_sat' });
            onSelect(item.code);
          }}
        />
        <span className={result === 'no_sat' ? 'text-alert' : 'text-muted'}>NO-SAT</span>
      </label>

      <div className="border-l border-navy/10 p-2">
        <input
          value={row?.remarks ?? ''}
          disabled={disabled}
          placeholder={result === 'no_sat' ? 'Required for NO-SAT' : 'Remarks / location'}
          onChange={(e) => onChange({ remarks: e.target.value })}
          onFocus={() => onSelect(item.code)}
          className={`w-full rounded border px-2 py-1 text-sm ${
            remarksError ? 'border-alert bg-white' : 'border-navy/15 bg-white'
          }`}
        />
        {result === 'no_sat' && (
          <div className="mt-1">
            <StatusPill status="no_sat" />
          </div>
        )}
      </div>
    </div>
  );
}
