Pressable filter chip on shadcn's `Toggle` API. Replaces the old `Tag`; for static metadata use `Badge variant="outline"`.

```jsx
<Toggle size="sm" pressed={env.includes("Marsh")} onPressedChange={() => toggleEnv("Marsh")}>Marsh</Toggle>
```

Pill-shaped, 1px border. Pressed state is a soft `--accent-soft` fill with `--accent-ink` text and an `--accent` border.
