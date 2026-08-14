import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { baccLogoUrl } from '../../lib/brandAssets.js';

export default function TopBar({ online }) {
  const { displayName, position, signOut } = useAuth();
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-14 items-center justify-between bg-navy px-4 text-white">
      <div className="flex items-center gap-3">
        <img src={baccLogoUrl} alt="BACC" className="h-8 w-auto bg-white object-contain p-0.5" />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide">BACC Airport Portal</div>
          <div className="text-[11px] text-white/70">Philip S.W. Goldson International Airport</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${
            online ? 'bg-success/20 text-teal' : 'bg-alert/20 text-white'
          }`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
        <div className="text-right leading-tight">
          <div className="text-sm font-semibold">{displayName}</div>
          <div className="text-[11px] text-white/70">{position}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-xs font-bold text-navy">
          {initials}
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded p-2 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
