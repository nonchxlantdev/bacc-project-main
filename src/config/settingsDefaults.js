import { CATEGORICAL } from './chartPalette.js';

/**
 * What the portal does before BACC change anything.
 *
 * These are DEFAULTS, not state. The settings store persists only the keys BACC
 * actually edited and merges them over this file, so a default improved in a
 * later release reaches every deployment that had not overridden it.
 *
 * Everything here was previously hardcoded somewhere in the app. Moving it into
 * one file is what makes it configurable; nothing changed value in the move.
 */

/**
 * Deficiency Levels 1–4 (BACC configuration questions A1 and A2).
 *
 * The annexes record "Level (1–4)" and define none of it. `severityOrder` is
 * the one place the direction of the scale is stated — no code infers it,
 * because getting it wrong would invert urgency, colour and alerting across the
 * whole portal at once.
 *
 * `targetDays: null` means "no rule yet", and that is why incidents currently
 * have no countdown. Setting a number here, or in the UI, is what makes
 * `target_date` real.
 */
export const DEFAULT_DEFICIENCY = {
  severityOrder: 'unset', // 'one_highest' | 'four_highest' | 'unset'
  levels: [
    { level: 1, label: 'Level 1', definition: '', color: CATEGORICAL.blue, targetDays: null, alerting: false },
    { level: 2, label: 'Level 2', definition: '', color: CATEGORICAL.orange, targetDays: null, alerting: false },
    { level: 3, label: 'Level 3', definition: '', color: CATEGORICAL.green, targetDays: null, alerting: false },
    { level: 4, label: 'Level 4', definition: '', color: CATEGORICAL.vermillion, targetDays: null, alerting: false },
  ],
  /** Days before the target date that the countdown turns amber. */
  slaWarningDays: 3,
};

/**
 * Scheduling windows. All three were magic numbers: two in the catalogue, one
 * in the scheduler's status refresh.
 */
export const DEFAULT_SCHEDULING = {
  /** An inspection due within this many days counts as "due soon". */
  dueSoonDays: 7,
  /** Past due by more than this many days stops being overdue and becomes missed. */
  missedAfterDays: 14,
  /** How far back each cadence reaches when generating a first backlog. */
  backfillDays: { daily: 14, weekly: 56 },
};

/**
 * Who hears about what, and from where.
 *
 * BACC require an email on four events: incident alerts, checklist due,
 * overdue checklist, and approval required. Those carry `emailRequired`, which
 * shows on the settings row so the requirement stays visible if someone later
 * switches the channel off.
 *
 * `escalateAfterHours` of null means no escalation. No timing is invented —
 * putting a number in front of BACC that looks agreed is worse than a blank.
 */
export const DEFAULT_ALERTS = {
  fromAddress: '',
  fromName: 'PGIA Operations Portal',
  events: {
    incident_alerting_level: {
      inApp: true,
      email: true,
      emailRequired: true,
      recipients: ['om', 'coo'],
      escalateAfterHours: null,
    },
    // Not on BACC's required list — assignment is a working notification, not
    // an alert. Email is on by default and can be switched off freely.
    incident_assigned: {
      inApp: true,
      email: true,
      recipients: ['assignee'],
      escalateAfterHours: null,
    },
    checklist_due: {
      inApp: true,
      email: true,
      emailRequired: true,
      recipients: ['assignee'],
      escalateAfterHours: null,
    },
    checklist_overdue: {
      inApp: true,
      email: true,
      emailRequired: true,
      recipients: ['assignee', 'om'],
      escalateAfterHours: null,
      escalation: ['assignee', 'duty_manager', 'om'],
    },
    approval_required: {
      inApp: true,
      email: true,
      emailRequired: true,
      recipients: ['assignee'],
      escalateAfterHours: null,
    },
  },
};

/**
 * Whether a mail service is wired up.
 *
 * False until one is. Everything marked for email is still recorded and
 * queued — the flag only controls whether the portal claims delivery. Flip it
 * in one place when the integration lands.
 */
export const EMAIL_INTEGRATION_READY = false;

/** Lookup lists (questions B1 and B2). Free-form so BACC's own words win. */
export const DEFAULT_LOOKUPS = {
  deficiencyCategories: ['Drainage', 'Other'],
  incidentTypes: ['Drainage', 'Other'],
  /** {seq} is the running number, {year} the four-digit year. */
  nocNumberFormat: '{year}-{seq}',
  nocSeqPadding: 4,
};

/** Identity that appears on exports and headers (questions C1 and C6). */
export const DEFAULT_ORGANISATION = {
  airportName: 'Philip S.W. Goldson International Airport',
  operatorName: 'Belize Airport Concession Company Limited',
  timezone: 'America/Belize',
  /** Years inspection records must be kept. null = not yet confirmed by BDCA. */
  retentionYears: null,
  pdfFooter: '',
};

/** Per-person preferences. Stored against the user, not the organisation. */
export const DEFAULT_PREFERENCES = {
  notifyInApp: true,
  notifyEmail: true,
  landingPage: '/dashboard',
};

export const SETTINGS_DEFAULTS = {
  deficiency: DEFAULT_DEFICIENCY,
  scheduling: DEFAULT_SCHEDULING,
  alerts: DEFAULT_ALERTS,
  lookups: DEFAULT_LOOKUPS,
  organisation: DEFAULT_ORGANISATION,
  preferences: DEFAULT_PREFERENCES,
};

/** Section keys in the order they appear in the settings rail. */
export const SETTINGS_SECTIONS = Object.keys(SETTINGS_DEFAULTS);
