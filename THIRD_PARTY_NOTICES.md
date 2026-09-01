# Third-party notices

Tiny Taverns bundles a 334-row 2014 SRD monster corpus, a 2014 D&D 5e rules vocabulary for character creation, the 319-spell 2014 SRD spell corpus, the 237-row 2014 SRD mundane-equipment corpus, and the 362-row 2014 SRD magic-item corpus. The rows are imported by `pnpm -F server bestiary:import`, `pnpm -F server ruleset:import`, `pnpm -F server spell:import`, `pnpm -F server equipment:import`, and `pnpm -F server magic-item:import`; imported domain rows record stable source corpus/family/key columns, and the web footer/README carry the attribution.

## 5e-bits / 5e-database

- Source: <https://github.com/5e-bits/5e-database>
- Snapshot used here: `5e-database` 5.10.0, commit `5a7ee5a0489b26655d343e4a41e8f7942a887af2`, `src/2014/en`
- License for the 5e-bits project data: MIT License
- Underlying material: Dungeons & Dragons 5th Edition SRD 5.1 material under the Open Game License version 1.0a

MIT notice from `5e-bits/5e-database`:

> MIT License
>
> Copyright (c) [2018-2020] [Adrian Padua, Christopher Ward]
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The upstream README states: "The underlying material is released using the Open Gaming License Version 1.0a" and links to Wizards' OGL FAQ. Tiny Taverns displays the attribution in the web footer and keeps this notice with the repository.
