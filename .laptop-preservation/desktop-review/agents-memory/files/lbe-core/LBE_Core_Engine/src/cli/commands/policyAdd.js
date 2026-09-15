import { addLocalPolicyRule } from '../../core/localPolicy.js';

export async function policyAddCommand(opts = {}) {
    const result = addLocalPolicyRule(opts.root || process.cwd(), {
        effect: opts.effect, type: opts.type, pattern: opts.pattern, from: opts.from
    }, opts.mode);
    console.log(JSON.stringify(result, null, 2));
}
