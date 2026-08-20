import { getRepos } from '../data/repositories/index.js';

/** Templates this profile may open — the repository applies BACC §4 scoping. */
export async function listTemplates(profile) {
  return getRepos().templates.list(profile);
}

export async function getTemplate(idOrCode) {
  return getRepos().templates.get(idOrCode);
}
