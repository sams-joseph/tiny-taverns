import { Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@taverns/ui";

import { Section, Specimen } from "./Layout";
import { BLURBS, NOTES } from "./specs";

export function Navigation() {
  return (
    <Section id="navigation" title="Navigation" blurb={BLURBS.navigation}>
      <Specimen label="Tabs" note={NOTES.tabs}>
        <Tabs defaultValue="combat" className="w-full">
          <TabsList>
            <TabsTrigger value="combat">
              <Icon name="swords" size={13} />
              Combat
            </TabsTrigger>
            <TabsTrigger value="notes">
              <Icon name="scroll-text" size={13} />
              Notes
            </TabsTrigger>
            <TabsTrigger value="bestiary">
              <Icon name="footprints" size={13} />
              Bestiary
            </TabsTrigger>
            <TabsTrigger value="locked" disabled>
              Locked
            </TabsTrigger>
          </TabsList>
          <TabsContent value="combat">
            <p className="max-w-measure leading-body">
              Six goblins are hiding in the reeds. Two have already rolled, four are still holding.
            </p>
          </TabsContent>
          <TabsContent value="notes">
            <p className="max-w-measure leading-body">
              The wagon driver knows the shortcut and will not say so in front of the halfling.
            </p>
          </TabsContent>
          <TabsContent value="bestiary">
            <p className="max-w-measure leading-body">
              Nothing lives here. Loosen a filter, or add a creature of your own.
            </p>
          </TabsContent>
          <TabsContent value="locked">
            <p className="max-w-measure leading-body">Unreachable — the trigger is disabled.</p>
          </TabsContent>
        </Tabs>
      </Specimen>
    </Section>
  );
}
