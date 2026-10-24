/** The signed-in role, for a crash report. Never the name or the email. */
let role = '';

export function setClientRole(value) {
  role = value ? String(value).slice(0, 32) : '';
}

export function clientRole() {
  return role;
}
