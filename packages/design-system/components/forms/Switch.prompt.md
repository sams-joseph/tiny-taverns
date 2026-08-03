40&times;22 toggle for settings that take effect immediately. `checked` + `onCheckedChange`; no label of its own.

```jsx
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <Switch id="share" checked={share} onCheckedChange={setShare} />
  <Label htmlFor="share">Share with players</Label>
</div>
```

A pill track with a circular knob that glides on `--ease-out`. 40×22, so it stays distinct from the 18px square Checkbox.
