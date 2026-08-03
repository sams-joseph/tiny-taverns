Composed tabs, shadcn-shaped. An underline bar: the active trigger is semibold with a 2px accent rule; inactive triggers are muted.

```jsx
<Tabs defaultValue="combat" onValueChange={setTab}>
  <TabsList>
    <TabsTrigger value="combat"><Icon name="swords" size={13} />Combat</TabsTrigger>
    <TabsTrigger value="notes">Notes</TabsTrigger>
  </TabsList>
  <TabsContent value="combat">…</TabsContent>
  <TabsContent value="notes">…</TabsContent>
</Tabs>
```

Triggers are 13px medium sentence case. This is the only navigation pattern in the app — never a pill group or segmented control.
