import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  FlaskConical,
  ListTree,
  RotateCcw,
  Send,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { settingsAudit } from '../lib/settingsStore.js';
import { fmtDateTime } from '../lib/airportFormat.js';
import { getRepos } from '../data/repositories/index.js';
import Select from '../components/ui/Select.jsx';
import DeficiencyLevelsSection from '../components/settings/DeficiencyLevelsSection.jsx';
import {
  AlertsSection,
  LookupsSection,
  OrganisationSection,
  PreferencesSection,
  ProfileSection,
  SchedulingSection,
} from '../components/settings/OtherSections.jsx';

/**
 * Settings.
 *
 * Sections are filtered by role rather than hidden behind a second route, so
 * there is no admin URL to protect and nothing renders empty for the wrong
 * person. `admin: true` means the section changes behaviour for everyone at
 * PGIA, not just the person editing it.
 *
 * Ordered by who they belong to: your own settings first, then the ones that
 * govern the airport, then the demo tools.
 */
const SECTIONS = [
  { id: 'profile', label: 'My profile', blurb: 'Name, position, and saved signature', Icon: UserRound, store: 'preferences' },
  { id: 'preferences', label: 'My notifications', blurb: 'What reaches you', Icon: Bell, store: 'preferences' },
  {
    id: 'deficiency',
    label: 'Deficiency levels',
    blurb: 'What 1–4 mean and their response times',
    Icon: AlertTriangle,
    store: 'deficiency',
    admin: true,
    questions: 'A1, A2',
  },
  {
    id: 'alerts',
    label: 'Alerts & escalation',
    blurb: 'Who is notified, and when it escalates',
    Icon: Send,
    store: 'alerts',
    admin: true,
    questions: 'B3, C4',
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    blurb: 'When work counts as late',
    Icon: CalendarClock,
    store: 'scheduling',
    admin: true,
  },
  {
    id: 'lookups',
    label: 'Lookups',
    blurb: 'Categories and the NOC number',
    Icon: ListTree,
    store: 'lookups',
    admin: true,
    questions: 'B1, B2',
  },
  {
    id: 'organisation',
    label: 'Organisation',
    blurb: 'Identity, retention, export footer',
    Icon: Building2,
    store: 'organisation',
    admin: true,
    questions: 'C1',
  },
  { id: 'demo', label: 'Demo controls', blurb: 'Clock and seed data', Icon: FlaskConical, dev: true },
];

const ADMIN_ROLES = ['om', 'coo', 'admin'];

export default function SettingsPage() {
  const { user, profile, displayName, position, updateProfile, configured } = useAuth();
  const { settings, saveSection, resetSection } = useSettings();

  const isAdmin = ADMIN_ROLES.includes(profile?.role);
  const sections = useMemo(
    () => SECTIONS.filter((s) => (!s.admin || isAdmin) && (!s.dev || import.meta.env.DEV)),
    [isAdmin],
  );

  const [activeId, setActiveId] = useState('profile');
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  const [draft, setDraft] = useState(null);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [audit, setAudit] = useState([]);

  const actor = useMemo(() => ({ id: user?.id, full_name: displayName }), [user?.id, displayName]);

  // The committed value for whichever section is open. Profile is the odd one
  // out: it lives on the user record, not in settings.
  const committed = useMemo(() => {
    if (active?.id === 'profile') {
      return {
        full_name: displayName,
        position,
        stored_signature_data_uri: profile?.stored_signature_data_uri ?? null,
        stored_signature_updated_at: profile?.stored_signature_updated_at ?? null,
        hide_signature_prompt: Boolean(profile?.hide_signature_prompt),
      };
    }
    return settings[active?.store] ?? null;
  }, [active, settings, displayName, position, profile]);

  // Re-clone during render, not in an effect.
  //
  // An effect runs AFTER the new section has already rendered once, which meant
  // switching from My profile to Deficiency levels rendered the levels editor
  // with the profile's draft and crashed on the first read. Comparing the
  // source we cloned from is React's documented way to adjust state when the
  // input changes: it re-renders immediately and never commits the bad frame.
  // The same check resyncs after a save, when `committed` gets a new identity.
  if (source !== committed) {
    setSource(committed);
    setDraft(committed ? structuredClone(committed) : null);
    if (banner) setBanner(null);
  }

  useEffect(() => {
    settingsAudit().then(setAudit).catch(() => {});
  }, [settings]);

  const dirty = useMemo(
    () => Boolean(draft && committed) && JSON.stringify(draft) !== JSON.stringify(committed),
    [draft, committed],
  );

  // Warn on a real page unload. In-app navigation is guarded by the sticky bar
  // being the only way to commit, so an unsaved draft is always visible.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const lastChange = useMemo(
    () => audit.find((row) => row.section === active?.store) ?? null,
    [audit, active?.store],
  );

  const onSave = useCallback(async () => {
    setBusy(true);
    setBanner(null);
    try {
      if (active.id === 'profile') {
        await updateProfile({
          full_name: draft.full_name,
          position: draft.position,
          stored_signature_data_uri: draft.stored_signature_data_uri ?? null,
          stored_signature_updated_at: draft.stored_signature_updated_at ?? null,
          hide_signature_prompt: Boolean(draft.hide_signature_prompt),
        });
      } else {
        await saveSection(active.store, draft, actor);
      }
      setBanner({ tone: 'success', text: 'Saved.' });
    } catch (err) {
      setBanner({ tone: 'error', text: err.message || 'Could not save those settings.' });
    } finally {
      setBusy(false);
    }
  }, [active, draft, actor, saveSection, updateProfile]);

  const onReset = useCallback(async () => {
    if (!window.confirm(`Restore the shipped defaults for ${active.label}? Your changes to this section are recorded and reversible.`)) {
      return;
    }
    setBusy(true);
    try {
      await resetSection(active.store, actor);
      setBanner({ tone: 'success', text: 'Restored to defaults.' });
    } catch (err) {
      setBanner({ tone: 'error', text: err.message || 'Could not reset that section.' });
    } finally {
      setBusy(false);
    }
  }, [active, actor, resetSection]);

  return (
    <div className="space-y-5">
      {/* Marked in progress so nobody demoing the portal mistakes an
          unfinished screen for a finished one. */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/30 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
          <Wrench className="h-3.5 w-3.5" aria-hidden />
          In progress · Dev
        </span>
        <span>This page is still being built. Everything below saves and takes effect.</span>
      </p>

      <header>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">Settings</h1>
        <p className="max-w-2xl text-sm text-muted">
          {isAdmin
            ? 'Your own preferences, and the configuration that governs how the portal treats inspections and deficiencies across PGIA.'
            : 'Your own preferences. Airport-wide configuration is managed by the Operations Manager.'}
          {!configured && ' This demo stores changes in this browser only.'}
        </p>
      </header>

      <div className="gap-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Phone: a select, because eight sections of vertical tabs would push
            the actual settings below the fold on every visit. */}
        <div className="mb-4 lg:hidden">
          <Select
            label="Settings section"
            value={active?.id}
            onChange={setActiveId}
            options={sections.map((s) => ({ value: s.id, label: s.label, hint: s.blurb, Icon: s.Icon }))}
          />
        </div>

        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="space-y-0.5">
            {sections.map((section) => {
              const on = section.id === active?.id;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(section.id)}
                    aria-current={on ? 'page' : undefined}
                    className={`flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-left transition ${
                      on ? 'bg-primary text-white' : 'text-ink hover:bg-surface'
                    }`}
                  >
                    <section.Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-white' : 'text-primary'}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{section.label}</span>
                      <span className={`block text-xs ${on ? 'text-white/70' : 'text-muted'}`}>
                        {section.blurb}
                      </span>
                    </span>
                    {dirty && on && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal" aria-label="Unsaved changes" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {banner && (
            <p
              className={`rounded-md border px-4 py-2 text-sm ${
                banner.tone === 'error'
                  ? 'border-alert bg-alert-soft text-alert'
                  : 'border-success/30 bg-success-soft text-success'
              }`}
            >
              {banner.text}
            </p>
          )}

          {draft && <SectionBody id={active.id} draft={draft} onChange={setDraft} profile={profile} user={user} />}
          {active?.id === 'demo' && <DemoControls />}

          {active?.store && lastChange && (
            <p className="text-xs text-muted">
              Last changed by {lastChange.by_name || 'a system account'} on {fmtDateTime(lastChange.at)}
              {lastChange.action === 'reset' ? ' (restored to defaults).' : '.'}
            </p>
          )}

          {/* The commit bar. Sticky so a long section never hides the way to
              save what you just typed. */}
          {active?.id !== 'demo' && (
            <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line/10 bg-stripe/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
              <button
                type="button"
                disabled={!dirty || busy}
                onClick={onSave}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-40 sm:min-h-10"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                disabled={!dirty || busy}
                onClick={() => setDraft(structuredClone(committed))}
                className="inline-flex min-h-11 items-center rounded-md border border-line/20 bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-40 sm:min-h-10"
              >
                Discard
              </button>
              <span className="text-xs text-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
              {active?.store && active.store !== 'preferences' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onReset}
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted hover:text-alert sm:min-h-10"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore defaults
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionBody({ id, draft, onChange, profile, user }) {
  switch (id) {
    case 'profile':
      return (
        <ProfileSection
          draft={draft}
          onChange={onChange}
          email={user?.email}
          role={profile?.role}
          department={profile?.department}
        />
      );
    case 'preferences':
      return <PreferencesSection draft={draft} onChange={onChange} />;
    case 'deficiency':
      return <DeficiencyLevelsSection draft={draft} onChange={onChange} />;
    case 'alerts':
      return <AlertsSection draft={draft} onChange={onChange} />;
    case 'scheduling':
      return <SchedulingSection draft={draft} onChange={onChange} />;
    case 'lookups':
      return <LookupsSection draft={draft} onChange={onChange} />;
    case 'organisation':
      return <OrganisationSection draft={draft} onChange={onChange} />;
    default:
      return null;
  }
}

/** Development-only tools for moving the demo clock and reseeding. */
function DemoControls() {
  const [clock, setClock] = useState(null);

  useEffect(() => {
    getRepos().instances.getClock().then(setClock);
  }, []);

  return (
    <section className="space-y-3 rounded-lg border border-dashed border-line/30 bg-surface p-5">
      <div>
        <h2 className="text-base font-bold text-ink">Demo clock</h2>
        <p className="mt-1 text-sm text-muted">
          Due and overdue calculations use America/Belize, not this device&apos;s timezone. Airport
          time is currently {clock?.demoNow ?? '—'}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <DemoButton onClick={async () => setClock(await getRepos().instances.advanceClock(1))}>
          Advance 1 day
        </DemoButton>
        <DemoButton onClick={async () => setClock(await getRepos().instances.advanceClock(7))}>
          Advance 7 days
        </DemoButton>
        <DemoButton
          onClick={async () => {
            const result = await getRepos().instances.generate();
            setClock(await getRepos().instances.getClock());
            window.alert(`Generated ${result.created} occurrence(s). Total ${result.total}.`);
          }}
        >
          Generate occurrences
        </DemoButton>
        <DemoButton
          onClick={async () => {
            const result = await getRepos().instances.loadShowcase();
            window.alert(
              `Loaded sample data: ${result.submissions} checklists, ${result.incidents} incidents, ${result.approvals} pending approvals.`,
            );
            window.location.reload();
          }}
        >
          Load showcase data
        </DemoButton>
        <DemoButton
          tone="alert"
          onClick={async () => {
            await getRepos().instances.resetDemo();
            window.location.reload();
          }}
        >
          Reset demo data
        </DemoButton>
      </div>
    </section>
  );
}

function DemoButton({ onClick, tone, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-md border px-3 text-sm font-medium sm:min-h-10 ${
        tone === 'alert' ? 'border-alert text-alert hover:bg-alert-soft' : 'border-line/20 text-ink hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
