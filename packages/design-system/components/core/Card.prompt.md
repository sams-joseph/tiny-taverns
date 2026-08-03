12px-radius container on `--surface-card` with a 1px hairline, composed the shadcn way. **Dark only** — there is no light variant.

```jsx
<Card>
  <CardHeader><CardTitle>Goblin ambush</CardTitle><CardDescription>6 creatures</CardDescription></CardHeader>
  <CardContent>Three goblins in the reeds.</CardContent>
  <CardFooter><Button size="sm">Run it</Button></CardFooter>
</Card>
```

Tones step through the dark surface stack: `sunken` → `default` → `raised`, with `panel` for the live DM screen. Depth comes from surface lightness plus a black shadow, never from a border alone.
