18px square control with a 4px radius, `checked` + `onCheckedChange` (shadcn's API). Renders no label — compose one.

```jsx
<div style={{ display: "flex", alignItems: "center", gap: 9 }}>
  <Checkbox id="p1" checked={done} onCheckedChange={setDone} />
  <Label htmlFor="p1" style={{ textTransform: "none", font: "var(--fw-regular) var(--fs-body-s)/1.35 var(--font-sans)" }}>Reread the reeds ambush</Label>
</div>
```

Accepts `checked="indeterminate"` for partial group state.
