Renders one Lucide glyph tinted with `currentColor`; use it anywhere an icon is needed instead of inlining SVG.

```jsx
<Icon name="dice-5" size={18} />
<span style={{ color: "var(--danger)" }}><Icon name="skull" size={16} /></span>
```

Sizes: 16 inline with body text, 18 inside controls, 20 in navigation, 24+ for empty states. The glyph inherits colour from its parent, so tint by setting `color` on the wrapper rather than passing a style.
