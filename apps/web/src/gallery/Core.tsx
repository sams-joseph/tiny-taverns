import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Icon,
  Label,
  Toggle,
} from "@taverns/ui";

import { Caption, Section, Specimen } from "./Layout";
import { BLURBS, NOTES } from "./specs";

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const;
const BUTTON_SIZES = ["default", "sm", "lg"] as const;
const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "success",
  "magic",
  "info",
] as const;
const CARD_TONES = ["sunken", "default", "raised", "panel"] as const;
const ENVIRONMENTS = ["Marsh", "Ruin", "Underdark", "Coast"];

export function Core() {
  const [environments, setEnvironments] = useState<string[]>(["Marsh"]);

  const toggleEnvironment = (name: string) =>
    setEnvironments((current) =>
      current.includes(name) ? current.filter((one) => one !== name) : [...current, name],
    );

  return (
    <Section id="core" title="Core" blurb={BLURBS.core}>
      <Specimen label="Button — variants" note={NOTES.buttonVariants}>
        {BUTTON_VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant === "destructive" ? "End session" : "Roll initiative"}
          </Button>
        ))}
      </Specimen>

      <Specimen label="Button — sizes" note={NOTES.buttonSizes}>
        {BUTTON_SIZES.map((size) => (
          <Button key={size} size={size}>
            Add monster
          </Button>
        ))}
        <Button size="icon" aria-label="Add combatant">
          <Icon name="plus" size={18} />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Next turn">
          <Icon name="chevron-right" size={18} />
        </Button>
      </Specimen>

      <Specimen label="Button — with a glyph, and disabled">
        <Button>
          <Icon name="swords" size={16} />
          Start the fight
        </Button>
        <Button variant="secondary">
          <Icon name="dice-5" size={16} />
          Roll a d20
        </Button>
        <Button disabled>Waiting on the party</Button>
        <Button variant="secondary" disabled>
          Waiting on the party
        </Button>
      </Specimen>

      <Specimen label="Button — on a raised surface" note={NOTES.buttonOnRaised}>
        <div className="flex w-full flex-wrap items-center gap-4 rounded-card border border-strong bg-surface-raised p-4 text-slate-200">
          <Button variant="outline">Keep playing</Button>
          <Button variant="ghost">Skip the turn</Button>
          <Button variant="link">Read the stat block</Button>
        </div>
      </Specimen>

      <Specimen label="Badge — variants" note={NOTES.badgeVariants}>
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant === "destructive"
              ? "Hostile"
              : variant === "magic"
                ? "Concentrating"
                : variant === "success"
                  ? "Saved"
                  : variant === "info"
                    ? "Rules"
                    : variant === "outline"
                      ? "CR 4"
                      : variant === "secondary"
                        ? "Prone"
                        : "Your turn"}
          </Badge>
        ))}
      </Specimen>

      <Specimen label="Badge — with a glyph">
        <Badge variant="destructive">
          <Icon name="skull" size={11} />
          Hostile
        </Badge>
        <Badge variant="success">
          <Icon name="heart-pulse" size={11} />
          Healed 7
        </Badge>
        <Badge variant="magic">
          <Icon name="sparkles" size={11} />
          Concentrating
        </Badge>
        <Badge variant="outline">
          <Icon name="shield" size={11} />
          AC 15
        </Badge>
      </Specimen>

      <Specimen label="Card — tones step through the dark surface stack">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          {CARD_TONES.map((tone) => (
            <Card key={tone} tone={tone}>
              <CardHeader>
                <CardTitle>Goblin ambush</CardTitle>
                <CardDescription>Six creatures · tone {tone}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body-s leading-body">
                  Three goblins in the reeds, three more behind the wagon.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Run it</Button>
                <Button size="sm" variant="ghost">
                  Prep notes
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Specimen>

      <Specimen label="Icon — one Lucide glyph, tinted with currentColor">
        <div className="flex flex-wrap items-center gap-5">
          <span className="text-heading">
            <Icon name="swords" size={22} />
          </span>
          <span className="text-danger">
            <Icon name="skull" size={22} />
          </span>
          <span className="text-success">
            <Icon name="heart-pulse" size={22} />
          </span>
          <span className="text-magic">
            <Icon name="sparkles" size={22} />
          </span>
          <span className="text-info">
            <Icon name="scroll-text" size={22} />
          </span>
          <span className="text-accent-ink">
            <Icon name="dices" size={22} />
          </span>
          <span className="text-muted-foreground">
            <Icon name="footprints" size={22} />
          </span>
          <span className="text-muted-foreground">
            <Icon name="eye-off" size={22} />
          </span>
        </div>
        <Caption>{NOTES.icon}</Caption>
      </Specimen>

      <Specimen label="Icon — sizes">
        <span className="flex items-center gap-4 text-heading">
          <Icon name="dice-5" size={16} />
          <Icon name="dice-5" size={18} />
          <Icon name="dice-5" size={20} />
          <Icon name="dice-5" size={28} />
        </span>
      </Specimen>

      <Specimen label="Label" note={NOTES.label}>
        <Label htmlFor="gallery-label-demo">Encounter name</Label>
        <Caption>Form controls render no label of their own.</Caption>
      </Specimen>

      <Specimen label="Toggle — sizes and pressed state" note={NOTES.toggleSizes}>
        <Toggle size="sm">Marsh</Toggle>
        <Toggle>Marsh</Toggle>
        <Toggle size="lg">Marsh</Toggle>
        <Toggle defaultPressed>Pressed</Toggle>
        <Toggle disabled>Disabled</Toggle>
      </Specimen>

      <Specimen label="Toggle — as a filter row">
        {ENVIRONMENTS.map((name) => (
          <Toggle
            key={name}
            size="sm"
            pressed={environments.includes(name)}
            onPressedChange={() => toggleEnvironment(name)}
          >
            {name}
          </Toggle>
        ))}
        <Caption>
          {environments.length > 0
            ? `Filtering by ${environments.join(", ")}.`
            : "Nothing lives here. Loosen a filter, or add a creature of your own."}
        </Caption>
      </Specimen>
    </Section>
  );
}
