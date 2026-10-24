/**
 * Which sign-off box on each approved form belongs to the Operations Manager.
 *
 * The OM's approval is always stored as the `om_acknowledgment` sign-off (the
 * D1 lock triggers let exactly that role change on a filed record). Each form
 * names the OM's box differently, so this map says where that signature is
 * shown and stamped. Confirmed with the client 2026-10-14. Forms not listed
 * have no OM box: the OM approves in the portal and nothing is stamped.
 *
 * Pure — imported by the browser, the PDF export and the Worker.
 */
export const OM_SIGNOFF_ROLE = 'om_acknowledgment';

const VAES = Object.fromEntries(
  Array.from({ length: 20 }, (_, i) => [`PGIA-CL-VAES-${String(i + 1).padStart(2, '0')}`, 'supervisor']),
);

export const APPROVER_ROLE_BY_CODE = {
  'PGIA-PMM-F01': 'om', // Annex A
  'PGIA-PMM-F02': 'om', // Annex B
  'PGIA-PMM-F03': 'om', // Annex C
  'PGIA-PMM-F04': 'om_acknowledgment', // Annex D
  'PGIA-PMM-F05': 'om', // Annex E
  'PGIA-PMM-F06': 'om', // Annex F
  'PGIA-PMM-F09': 'om', // Annex I
  ...VAES, // Appendix C-01 … C-20: "Supervisor Signature"
  'PGIA-AOM-A5-06': 'received_by', // Wildlife Findings Report
};

/** The schema role of the OM's box on this form, or null when it has none. */
export function approverRole(schemaOrCode) {
  const code = typeof schemaOrCode === 'string' ? schemaOrCode : schemaOrCode?.code;
  return (code && APPROVER_ROLE_BY_CODE[code]) || null;
}

/**
 * A signature drawn in a log-sheet row, stored as a sign-off rather than in
 * the row cell. `row:<tableKey>:<n>:<columnKey>`, 1-based n.
 */
export const ROW_SIGNOFF_ROLE = /^row:[A-Za-z0-9_]{1,40}:\d{1,3}:[A-Za-z0-9_]{1,40}$/;

export function isRowSignoffRole(role) {
  return typeof role === 'string' && ROW_SIGNOFF_ROLE.test(role);
}

/** True for the box only the OM's approval may fill (and the stored OM role itself). */
export function isApproverSignoffRole(schemaOrCode, role) {
  if (!role || isRowSignoffRole(role)) return false;
  return role === OM_SIGNOFF_ROLE || role === approverRole(schemaOrCode);
}
