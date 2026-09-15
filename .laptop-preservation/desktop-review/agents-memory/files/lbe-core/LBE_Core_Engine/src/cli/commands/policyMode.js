import { loadLocalPolicy, writeLocalPolicy } from '../../core/localPolicy.js';

export async function policyModeCommand(mode, opts = {}) {
    const loaded = loadLocalPolicy(opts.root || process.cwd(), mode);
    writeLocalPolicy(loaded.root, { ...loaded.policy, mode });
    console.log(JSON.stringify({ mode, policy: loaded.policyPath }, null, 2));
}
