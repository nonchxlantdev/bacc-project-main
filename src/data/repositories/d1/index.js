import { TEMPLATE_REGISTRY, getRegistryEntry } from '../../templates/registry.js';
import { createD1Adapter } from './adapter.js';
import { callData } from './client.js';

export function createD1Repositories() {
  return createD1Adapter({
    call: callData,
    registry: { entries: TEMPLATE_REGISTRY, getEntry: getRegistryEntry },
  });
}
