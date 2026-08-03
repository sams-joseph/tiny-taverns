Modal for a decision the DM must make now, composed the shadcn way.

```jsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent width={400}>
    <DialogHeader>
      <DialogTitle>End the session?</DialogTitle>
      <DialogDescription>Initiative and hit points are saved to Session 12.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Keep playing</Button>
      <Button variant="destructive" size="sm">End session</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

The scrim is `--scrim` with a 3px blur; the box fades up 6px from `scale(.98)` on `--ease-out`. Keep dialogs ≤520px wide and never nest them.
