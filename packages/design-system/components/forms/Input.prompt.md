A bare input, like shadcn's. It renders no label, hint, error or icon — compose those yourself.

```jsx
<div style={{ display: "grid", gap: 6 }}>
  <Label htmlFor="dmg">Damage</Label>
  <Input id="dmg" mono defaultValue="2d6+3" />
  <span style={{ font: "var(--fw-regular) var(--fs-caption)/1.4 var(--font-sans)", color: "var(--danger-ink)" }}>Must be 1&ndash;30</span>
</div>
```

38px tall, 6px radius, 1px border. Focus swaps the border to `--accent` and adds the `--ring`. Pass `mono` for anything numeric.
