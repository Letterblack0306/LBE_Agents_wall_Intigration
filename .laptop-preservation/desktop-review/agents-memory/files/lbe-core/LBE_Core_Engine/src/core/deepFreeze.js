// src/core/deepFreeze.js
// Recursively freeze an object so no caller can mutate trust config at runtime.
// Applied to policy and keyStore immediately after load in createLBE().

export function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;

    Object.freeze(obj);

    for (const key of Object.getOwnPropertyNames(obj)) {
        const val = obj[key];
        if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
            deepFreeze(val);
        }
    }

    return obj;
}
