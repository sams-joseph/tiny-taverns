Hard-bordered black label on hover/focus, composed the shadcn way. Always pass `shortcut` when the action has a key.

```jsx
<Tooltip>
  <TooltipTrigger>
    <Button size="icon" aria-label="Next turn"><Icon name="chevron-right" /></Button>
  </TooltipTrigger>
  <TooltipContent shortcut="SPACE">Next turn</TooltipContent>
</Tooltip>
```

No arrow, no fade, no delay — it appears and disappears in one frame. `TooltipProvider` is a no-op passthrough kept for API parity.
