import { getRepos } from '../data/repositories/index.js';

export function templateIsAssigned(template, profile) {
  const rules = template.assignment_rules ?? [];
  if (!profile) return true;
  if (['om', 'coo', 'admin'].includes(profile.role)) return true;
  if (!rules.length) return true;
  return rules.some(
    (rule) =>
      (!rule.department || !profile.department || rule.department === profile.department) &&
      (!rule.role || !profile.role || rule.role === profile.role),
  );
}

export async function listTemplates(profile) {
  return getRepos().templates.list(profile);
}

export async function getTemplate(idOrCode) {
  return getRepos().templates.get(idOrCode);
}

export function getLocalTemplates() {
  return [];
}
