---
name: tiny-taverns-design
description: Use this skill to generate well-branded interfaces and assets for Tiny Taverns, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

**In this repository:** production code must not re-implement these prototypes. The
system is already ported to real shadcn/Base UI components in `packages/ui` — import
from `@taverns/ui`. The `components/*.jsx` files here are the *visual specification*
only. See `PORT-NOTES.md` for what was and was not brought across, and the root
`AGENTS.md` for how the tokens reach Tailwind.
