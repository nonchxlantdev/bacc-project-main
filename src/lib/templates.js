import { getRepos } from '../data/repositories/index.js';

/** Every template. Visibility is not scoped by role — see the mock repository. */
export async function listTemplates(profile) {
  return getRepos().templates.list(profile);
}

export async function getTemplate(idOrCode) {
  return getRepos().templates.get(idOrCode);
}
