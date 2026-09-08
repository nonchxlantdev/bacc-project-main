/**
 * Who uses the portal.
 *
 * The first seven are real PGIA staff, transcribed from BACC's own
 * `BACCUsers and Departments.xlsx` without correction — including the one Gmail
 * address, which is what BACC supplied and is therefore what is true.
 *
 * The last two are Vision Forge demo accounts on `@pgia.local`, a domain that
 * does not resolve. That is deliberate: they are obvious next to real mailboxes,
 * and no test notification can ever be delivered to an employee once email is
 * wired up. Both are seeded as `admin` so the team can exercise every portal
 * path (settings, approvals, draft delete, org-wide queues) without role gates.
 *
 * All nine can sign in, so every role can be shown from its own chair rather
 * than described from the Operations Manager's.
 *
 * Separate from generateSeed.js because that file imports the form schemas as
 * JSON the Vite way and cannot be loaded by Node. A directory this consequential
 * should be checkable by a test, so it lives where a test can reach it.
 */
/**
 * A demo account's `position` is the plain post title, with no "(test account)"
 * annotation. It reaches printed forms: the sign-off block stamps whatever
 * position the signer holds straight onto the approved PDF, and a parenthetical
 * about our test arrangements has no business on a PGIA record. `is_demo` is
 * what marks these two accounts, and the Users page renders that as a badge.
 */
export const PEOPLE = [
  { n: 1, email: 'kmoore@pgiabelize.com', full_name: 'Keagan Moore', position: 'Operations Manager', role: 'om', department: 'Operations', is_approver: true },
  { n: 2, email: 'masevedo@pgiabelize.com', full_name: 'Michael Asevedo', position: 'Duty Manager', role: 'duty_manager', department: 'Operations' },
  { n: 3, email: 'mhinkson@pgiabelize.com', full_name: 'Marsha Hinkson', position: 'Duty Manager', role: 'duty_manager', department: 'Operations' },
  { n: 4, email: 'edelacruz@pgiabelize.com', full_name: 'Edair de la Cruz', position: 'Duty Manager', role: 'duty_manager', department: 'Operations' },
  { n: 5, email: 'achable@pgiabelize.com', full_name: 'Andy Chable', position: 'Apron Supervisor', role: 'apron_supervisor', department: 'Operations' },
  { n: 6, email: 'kareemnunez24@gmail.com', full_name: 'Kareem Nunez', position: 'Apron Supervisor', role: 'apron_supervisor', department: 'Operations' },
  { n: 7, email: 'wthompson@pgiabelize.com', full_name: 'Windell Thompson', position: 'SMS', role: 'sms', department: 'Operations' },
  {
    n: 8,
    email: 'shamira.young@pgia.local',
    full_name: 'Shamira Young',
    position: 'Administrator',
    role: 'admin',
    department: 'Operations',
    is_approver: true,
    is_demo: true,
  },
  {
    n: 9,
    email: 'glenrick.spain@pgia.local',
    full_name: 'Glenrick Spain',
    position: 'Administrator',
    role: 'admin',
    department: 'Engineering',
    is_approver: true,
    is_demo: true,
  },
];

export function buildDirectory(seedId) {
  return PEOPLE.map(({ n, ...person }) => ({
    id: seedId('user', n),
    ...person,
    can_login: true,
    is_active: true,
  }));
}
