The action control, on shadcn/ui's API — `variant`: `default` | `secondary` | `destructive` | `outline` | `ghost` | `link`; `size`: `default` | `sm` | `lg` | `icon`.

```jsx
<Button>Roll initiative</Button>
<Button variant="secondary" size="sm">Add monster</Button>
<Button variant="destructive">End session</Button>
<Button size="icon" aria-label="Add combatant"><Icon name="plus" /></Button>
```

Heights 38 / 32 / 44 / 38(icon), 6px radius, 1px border. Solid variants carry a level-1 shadow that swaps to a subtle inset on press — no transform, no bounce. Labels are 12–15px medium sentence case; `ghost`, `link` and `outline` inherit `color`, so on dark panels set `color` on a wrapper rather than using a dark-specific variant. `ghost`, `link` and `outline` inherit `color`, so on dark panels set `color` on a wrapper rather than reaching for a dark-specific variant.
