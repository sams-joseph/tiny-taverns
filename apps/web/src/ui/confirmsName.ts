/**
 * Whether what was typed is the name, exactly. Surrounding spaces are forgiven
 * and nothing else is: a permanent delete is gated on reading the thing back,
 * and a case-folded or partial match would let the gate be passed without
 * reading it.
 */
export const confirmsName = (name: string, typed: string): boolean => typed.trim() === name.trim();
