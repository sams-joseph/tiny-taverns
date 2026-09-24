import { Input } from "@taverns/ui";
import { Field } from "./form";

/**
 * The field a permanent delete is gated on: type the name to arm the button.
 * One implementation for the campaign and the Shared World dialogs, with
 * `confirmsName` beside it, so the two gates cannot come to disagree about what
 * counts as confirming.
 */
export function ConfirmNameField({
  id,
  name,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Field label={`Type ${name} to confirm`} htmlFor={id}>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
