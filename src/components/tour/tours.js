/**
 * Guided-tour content. Data only — no React, no driver.js — so tests can read
 * it in Node (tests/tours.test.js checks word counts, wording, targets and FAQ
 * links against the real source).
 *
 * A tour:
 *   id       short slug, stored in the account's `tours_seen`
 *   version  raise it after a screen changes enough that people should see the
 *            tour again; everyone who saw an older version gets it once more
 *   title    what Help lists it as
 *   path     the route it belongs to: an exact path, or a pattern ending in
 *            `/:id` for record screens (those are replayed from the Help menu
 *            while on the record, not from the Help page)
 *   screen   access-map key that must be allowed for the tour to exist at all
 *   steps    see below
 *
 * A step:
 *   target   `data-tour` value of the element to spotlight; omit for a
 *            centred message
 *   title    a few words
 *   body     one or two sentences, 25 words at most — a string, or
 *            ({ can }) => string when the answer depends on the role
 *   requires access key the role must have, or the step is dropped
 *   needsNav the target lives in the sidebar, so on a phone the drawer opens
 *   faq      Help FAQ group id for the "More in Help" link
 *
 * Copy rules (enforced by the test): production wording only, nothing about
 * features that are switched off (work orders, photo attachments).
 */

export const INTRO_TOUR_ID = 'intro';

export const TOURS = [
  {
    id: INTRO_TOUR_ID,
    version: 1,
    title: 'Welcome tour',
    path: null,
    steps: [
      {
        title: 'Welcome to the BACC Airport Portal',
        body: 'Inspections, incidents and approvals for PGIA, in one place. This short tour shows where everything is. Replay it any time from Help.',
      },
      {
        target: 'sidebar',
        needsNav: true,
        title: 'Your menu',
        body: 'Operate holds the work you do every shift. Manage holds reports and settings. You only see the screens open to your role.',
      },
      {
        target: 'nav-dashboard',
        needsNav: true,
        title: 'Dashboard',
        body: 'Today at a glance: open incidents, checklists due and approvals waiting.',
      },
      {
        target: 'nav-checklistsMine',
        needsNav: true,
        title: 'My Checklists',
        body: 'Your drafts and submitted inspections. Start a new inspection from here.',
      },
      {
        target: 'nav-checklistsAll',
        needsNav: true,
        title: 'All Checklists',
        body: 'Every approved form, grouped by team, with what is due and overdue.',
      },
      {
        target: 'nav-incidents',
        needsNav: true,
        title: 'Incidents',
        body: ({ can }) =>
          can('seeAll')
            ? 'Every deficiency raised from a NO SAT item, across all teams.'
            : 'Deficiencies you raised from a NO SAT item, or that are assigned to you.',
      },
      {
        target: 'nav-approvals',
        needsNav: true,
        title: 'Approvals',
        body: ({ can }) =>
          can('acknowledge')
            ? 'Submitted checklists waiting for your acknowledgment.'
            : 'Anything assigned to you for review appears here.',
      },
      {
        target: 'nav-reports',
        needsNav: true,
        title: 'Reports',
        body: 'How the inspection programme is tracking: done, still to do and behind.',
      },
      {
        target: 'nav-locations',
        needsNav: true,
        title: 'Locations',
        body: 'The airport map, with every incident that has a pinned location.',
      },
      {
        target: 'nav-users',
        needsNav: true,
        requires: 'users',
        title: 'Users',
        body: 'The staff directory. Add accounts, change roles and reset passwords under Settings.',
      },
      {
        target: 'nav-settings',
        needsNav: true,
        title: 'Settings',
        body: ({ can }) =>
          can('orgSettings')
            ? 'Your profile and saved signature, plus the airport-wide configuration.'
            : 'Your profile, saved signature, notifications and appearance.',
      },
      {
        target: 'nav-help',
        needsNav: true,
        title: 'Help',
        body: 'Answers to common questions, and every guided tour.',
      },
      {
        target: 'topbar-notifications',
        title: 'Notifications',
        body: 'Assignments, reminders and anything waiting on you arrive here.',
      },
      {
        target: 'topbar-help',
        title: 'Help menu',
        body: 'Search answers, or choose Show me around this page for a guide to the screen you are on.',
      },
      {
        target: 'topbar-profile',
        title: 'Your account',
        body: 'Your name and role. Sign out here when you finish, especially on a shared device.',
      },
      {
        title: 'You are all set',
        body: 'Next, a quick look at this screen. Each screen shows a short guide the first time you open it.',
      },
    ],
  },

  {
    id: 'dashboard',
    version: 1,
    title: 'Dashboard',
    path: '/dashboard',
    screen: 'dashboard',
    steps: [
      {
        target: 'dash-kpis',
        title: 'Your numbers',
        body: 'Open incidents, checklists due and approvals waiting. Tap a tile to go straight to that list.',
        faq: 'getting-started',
      },
      {
        target: 'dash-panels',
        title: 'What is happening',
        body: 'Recently submitted checklists and incidents still open. Tap any row to open it.',
      },
      {
        target: 'dash-activity',
        title: 'Activity',
        body: 'Submissions by department, and the latest actions across the portal.',
      },
    ],
  },

  {
    id: 'checklists-mine',
    version: 1,
    title: 'My Checklists',
    path: '/checklists/mine',
    screen: 'checklistsMine',
    steps: [
      {
        target: 'mine-new',
        title: 'Start an inspection',
        body: 'Pick the approved form and the portal opens a draft for you.',
        faq: 'checklists',
      },
      {
        target: 'mine-table',
        title: 'Your checklists',
        body: 'Drafts save as you go. Submitted checklists are locked and stay on file.',
      },
    ],
  },

  {
    id: 'checklists-all',
    version: 1,
    title: 'All Checklists',
    path: '/checklists/all',
    screen: 'checklistsAll',
    steps: [
      {
        target: 'all-kpis',
        title: 'Programme status',
        body: 'How many forms there are, what was completed this month, and what is overdue or due soon.',
      },
      {
        target: 'all-filters',
        title: 'Find a form',
        body: 'Search by form, manual or department, or filter by manual and frequency.',
      },
      {
        target: 'all-teams',
        title: 'Forms by team',
        body: 'Open a team to see its forms and start one, or use Create New Inspection.',
        faq: 'checklists',
      },
    ],
  },

  {
    id: 'checklist',
    version: 1,
    title: 'Filling in a checklist',
    path: '/checklists/:id',
    screen: 'checklistsMine',
    steps: [
      {
        target: 'cl-actions',
        title: 'Form actions',
        body: 'Save a draft, preview the approved form, submit and export the PDF. Submitting locks the record.',
      },
      {
        target: 'cl-header',
        title: 'Header details',
        body: 'Fill in the required header fields. Your name and title come from your account.',
      },
      {
        target: 'cl-section',
        title: 'Checklist items',
        body: 'Each section matches the approved form. Mark every item SAT or NO SAT. A NO SAT needs remarks before you can submit.',
        faq: 'no-sat',
      },
      {
        target: 'cl-evidence',
        title: 'Item detail',
        body: 'Select an item to add remarks. For a NO SAT, raise an incident from here.',
      },
      {
        target: 'cl-signoffs',
        title: 'Sign-off',
        body: 'Sign in your block. If you saved a signature in Settings, apply it in one tap.',
      },
      {
        target: 'cl-autosave',
        title: 'Autosave',
        body: 'Every change saves automatically, even without a signal. It syncs when you reconnect.',
        faq: 'checklists',
      },
    ],
  },

  {
    id: 'incidents',
    version: 1,
    title: 'Incidents',
    path: '/incidents',
    screen: 'incidents',
    steps: [
      {
        target: 'inc-actions',
        title: 'Raising an incident',
        body: 'Incidents start from a NO SAT item on a checklist. Export the NOC register as the approved Annex G.',
        faq: 'incidents',
      },
      {
        target: 'inc-filters',
        title: 'Search and filter',
        body: 'Find an incident by reference, item, team or person, or narrow the list by team and status.',
      },
      {
        target: 'inc-table',
        title: 'The register',
        body: ({ can }) =>
          can('seeAll')
            ? 'Every incident across PGIA, with its team, level and due date. Open one to manage it.'
            : 'Incidents you reported or that are assigned to you. Open one to follow it.',
      },
    ],
  },

  {
    id: 'incident',
    version: 1,
    title: 'Managing an incident',
    path: '/incidents/:id',
    screen: 'incidents',
    steps: [
      {
        target: 'incd-status',
        title: 'At a glance',
        body: 'Status, deficiency level, owning team, who reported it and when it is due.',
      },
      {
        target: 'incd-tabs',
        title: 'Details, updates and history',
        body: 'Switch tabs to read the source item, see the location, add an update or check every change.',
      },
      {
        target: 'incd-sidebar',
        title: 'Status and assignment',
        body: 'Move the incident through its stages. Closing needs the source item verified back to SAT.',
        faq: 'incidents',
      },
    ],
  },

  {
    id: 'approvals',
    version: 1,
    title: 'Approvals',
    path: '/approvals',
    screen: 'approvals',
    steps: [
      {
        title: 'Approvals',
        body: ({ can }) =>
          can('acknowledge')
            ? 'Submitted checklists wait here for your acknowledgment. Acknowledging adds your signature; it never changes the record.'
            : 'Items assigned to you for review appear here. The Operations Manager acknowledges submitted checklists.',
        faq: 'approvals',
      },
      {
        target: 'appr-filters',
        title: 'Search and filter',
        body: 'Find an item by form, team, department or person.',
      },
      {
        target: 'appr-queue',
        title: 'The queue',
        body: 'Grouped by the team whose form it is. Open an item to review it.',
      },
    ],
  },

  {
    id: 'reports',
    version: 1,
    title: 'Reports',
    path: '/reports',
    screen: 'reports',
    steps: [
      {
        target: 'rep-headline',
        title: 'The headline',
        body: 'How many scheduled inspections are behind, still to do and done. Figures cover the records your account can see.',
      },
      {
        target: 'rep-actions',
        title: 'Choose and export',
        body: 'Pick which sections to show, then export a spreadsheet or the PDF report.',
        faq: 'reports',
      },
    ],
  },

  {
    id: 'locations',
    version: 1,
    title: 'Locations',
    path: '/locations',
    screen: 'locations',
    steps: [
      {
        target: 'loc-map',
        title: 'Airport map',
        body: 'Every incident with a captured location shows as a pin. Tap a pin for its details.',
      },
      {
        target: 'loc-legend',
        title: 'Legend',
        body: 'Pin colours show each incident’s status.',
      },
    ],
  },

  {
    id: 'users',
    version: 1,
    title: 'Users',
    path: '/users',
    screen: 'users',
    steps: [
      {
        target: 'users-table',
        title: 'Staff directory',
        body: 'Everyone who can sign in, with their position and department.',
      },
      {
        title: 'Managing accounts',
        body: 'Add people, change roles and reset passwords in Settings, under Users & roles.',
        faq: 'account',
      },
    ],
  },

  {
    id: 'settings',
    version: 1,
    title: 'Settings',
    path: '/settings',
    screen: 'settings',
    steps: [
      {
        target: 'set-sections',
        title: 'Sections',
        body: ({ can }) =>
          can('orgSettings')
            ? 'Your own preferences first, then the airport-wide configuration only OM and administrators can change.'
            : 'Your profile and saved signature, notifications, and appearance such as your landing page.',
      },
      {
        target: 'set-panel',
        title: 'Make a change',
        body: 'Edit the section and save. Save your signature under My profile to apply it in one tap later.',
        faq: 'account',
      },
    ],
  },

  {
    id: 'help',
    version: 1,
    title: 'Help',
    path: '/help',
    screen: 'help',
    steps: [
      {
        target: 'help-tours',
        title: 'Guided tours',
        body: 'Replay the welcome tour or any screen’s guide from here.',
      },
      {
        target: 'help-search',
        title: 'Search help',
        body: 'Type a word like signature or NO SAT to find the answer.',
      },
    ],
  },
];
