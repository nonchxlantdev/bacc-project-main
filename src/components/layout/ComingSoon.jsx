import { Construction } from 'lucide-react';

export default function ComingSoon({ title = 'Coming soon', blurb }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line/10 bg-surface p-10 text-center shadow-card">
      <Construction className="mx-auto mb-4 h-10 w-10 text-teal" />
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        {blurb ?? 'This module is planned for a later phase. Navigation is in place so the portal shell matches the target layout.'}
      </p>
    </div>
  );
}
