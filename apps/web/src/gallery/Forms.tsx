import { useState } from "react";
import {
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@taverns/ui";

import { Caption, Field, Section, Specimen } from "./Layout";
import { BLURBS, NOTES } from "./specs";

export function Forms() {
  const [reread, setReread] = useState(true);
  const [partial, setPartial] = useState(false);
  const [share, setShare] = useState(false);
  const [difficulty, setDifficulty] = useState("Hard");

  return (
    <Section id="forms" title="Forms" blurb={BLURBS.forms}>
      <Specimen label="Input" note={NOTES.input}>
        <Field>
          <Label htmlFor="encounter">Encounter name</Label>
          <Input id="encounter" placeholder="Goblin ambush" />
        </Field>
        <Field>
          <Label htmlFor="damage">Damage</Label>
          <Input id="damage" mono defaultValue="2d6+3" />
          <Caption>Pass mono for anything numeric.</Caption>
        </Field>
      </Specimen>

      <Specimen label="Input — invalid and disabled">
        <Field>
          <Label htmlFor="initiative">Initiative</Label>
          <Input id="initiative" mono defaultValue="44" aria-invalid />
          <span className="text-caption leading-body text-danger-ink">Must be 1–30.</span>
        </Field>
        <Field>
          <Label htmlFor="locked">Campaign</Label>
          <Input id="locked" defaultValue="The marsh road" disabled />
        </Field>
      </Specimen>

      <Specimen label="Select" note={NOTES.select}>
        <Field>
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select value={difficulty} onValueChange={(value) => setDifficulty(String(value))}>
            <SelectTrigger id="difficulty">
              <SelectValue placeholder="Pick a difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
              <SelectItem value="Deadly">Deadly</SelectItem>
            </SelectContent>
          </Select>
          <Caption>Running it on {difficulty.toLowerCase()}.</Caption>
        </Field>
        <Field>
          <Label htmlFor="empty-select">Party</Label>
          <Select>
            <SelectTrigger id="empty-select">
              <SelectValue placeholder="Pick a party" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="The Lantern Company">The Lantern Company</SelectItem>
              <SelectItem value="Three and a cart">Three and a cart</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Specimen>

      <Specimen label="Checkbox" note={NOTES.checkbox}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="reread"
              checked={reread}
              onCheckedChange={(checked) => setReread(Boolean(checked))}
            />
            <Label htmlFor="reread" className="font-normal text-body-s">
              Reread the reeds ambush
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="partial"
              indeterminate={!partial}
              checked={partial}
              onCheckedChange={(checked) => setPartial(Boolean(checked))}
            />
            <Label htmlFor="partial" className="font-normal text-body-s">
              Prep the whole session {partial ? "" : "— partial group state"}
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="checkbox-disabled" disabled />
            <Label htmlFor="checkbox-disabled" className="font-normal text-body-s">
              Disabled
            </Label>
          </div>
        </div>
      </Specimen>

      <Specimen label="Switch" note={NOTES.switch}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Switch
              id="share"
              checked={share}
              onCheckedChange={(next) => setShare(Boolean(next))}
            />
            <Label htmlFor="share">Share with players</Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Switch id="hide" defaultChecked />
            <Label htmlFor="hide">Hide legendary actions</Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Switch id="switch-disabled" disabled />
            <Label htmlFor="switch-disabled">Disabled</Label>
          </div>
        </div>
      </Specimen>
    </Section>
  );
}
