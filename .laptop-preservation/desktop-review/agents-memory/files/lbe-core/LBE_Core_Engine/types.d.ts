// @letterblack/lbe-core — public type declarations

/**
 * Validate a proposed agent action against the local policy.
 * Accepts a JSON string, returns a JSON string.
 * Exit decision is in result.decision: "allow" | "deny"
 */
export function execute(input: string): string;
