/**
 * A create payload with its description when one was written, trimmed — omitted
 * rather than blank when not, since optional keys are omitted. The server would
 * store a blank as none anyway; this keeps it off the wire.
 */
export const describedBy = <A extends object>(
  payload: A,
  description: string,
): A & { readonly description?: string } => {
  const trimmed = description.trim();
  return trimmed === "" ? payload : { ...payload, description: trimmed };
};
