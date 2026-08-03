Composed select, shadcn-shaped. No `options` prop — you write the items.

```jsx
<Select defaultValue="Hard" onValueChange={setDifficulty}>
  <SelectTrigger><SelectValue placeholder="Pick a difficulty" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="Easy">Easy</SelectItem>
    <SelectItem value="Hard">Hard</SelectItem>
    <SelectItem value="Deadly">Deadly</SelectItem>
  </SelectContent>
</Select>
```

Matches `Input` visually: 38px, 6px radius, 1px border. The open list is an 8px-radius popover on `--shadow-3`.
