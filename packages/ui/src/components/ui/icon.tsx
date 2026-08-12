import * as React from "react";
import {
  ArrowBigUpDash,
  ArrowRight,
  ArrowUp,
  Backpack,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUp,
  CircleCheck,
  CircleHelp,
  Clock,
  Coins,
  Copy,
  CornerDownRight,
  Crown,
  Dice5,
  Dice6,
  Dices,
  Droplet,
  EyeOff,
  Flag,
  Flame,
  Footprints,
  Gem,
  GitBranch,
  HandHelping,
  Hash,
  HeartPulse,
  Hexagon,
  History,
  ImagePlus,
  Info,
  Keyboard,
  Link,
  ListChecks,
  LoaderCircle,
  Lock,
  Mail,
  Map,
  MapPin,
  Megaphone,
  Mic,
  Minus,
  Moon,
  OctagonX,
  Package,
  PanelLeft,
  PanelRightClose,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  ScrollText,
  Search,
  Shield,
  ShieldHalf,
  Skull,
  Slash,
  Snowflake,
  Sparkles,
  Star,
  Swords,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Unlink,
  User,
  UserPlus,
  UserRound,
  UserRoundX,
  Users,
  WandSparkles,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The whole glyph set, in one place — readme.md's "Iconography" requires that the
 * set be swappable from a single edit. Keys are Lucide slugs, so call sites read
 * exactly as the design system documents them (`<Icon name="dice-5" />`).
 *
 * The delivered prototype loaded these as CSS masks from unpkg. Here they are real
 * `lucide-react` SVGs: same slugs, same `currentColor` tinting, no network request
 * and no per-icon HTTP round trip at the table.
 *
 * The set grows by naming what a delivered surface asks for, never by
 * substituting a near-enough glyph at the call site: `ui_kits/dm-screen`'s chat
 * parts name `history`, `list-checks`, `wand-sparkles`, `git-branch`, `gem`,
 * `mic`, `user-round`, `arrow-up`, `slash` and `panel-right-close`, so those are
 * here. The third delivery's `Chronicle.jsx` adds `chevrons-up`, `coins`, `flag`,
 * `help-circle`, `map-pin`, `megaphone`, `refresh-cw`, `scale` and `trending-up`;
 * its nav item names `scroll-text`, which the chat parts already asked for. Note
 * it passes half of those through a `Facet icon=` prop rather than `Icon name=`,
 * so a grep for `name="…"` alone undercounts what a surface asks for. That is the
 * whole cost of adding one, and it keeps this table the single answer to "which
 * glyphs does Tiny Taverns use" — it tracks the deliveries, so it grows when one
 * is vendored rather than when a screen is finally built against it.
 *
 * The fourth delivery's player side and `Party.jsx` add sixteen: `arrow-big-up-dash`,
 * `backpack`, `copy`, `corner-down-right`, `crown`, `hand-helping`, `hexagon`,
 * `image-plus`, `link`, `mail`, `package`, `shield-half`, `unlink`, `user`,
 * `user-plus` and `user-round-x`. It spells them a third way again — `RoleSwitch`
 * and the action lists hold them as bare tuple elements (`["Dodge", "shield-half"]`,
 * `["dm", "crown", "DM"]`), so neither `name="…"` nor `icon: "…"` finds them. The
 * reliable sweep is to intersect every kebab string literal in the kit against
 * `lucide-react`'s own export list and then read the survivors in context, which is
 * what separates a glyph from a CSS value: `grid`, `baseline`, `pointer`, `text`
 * and `table` are all real Lucide names and none of them is an icon here.
 */
export const icons = {
  "arrow-big-up-dash": ArrowBigUpDash,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  backpack: Backpack,
  bell: Bell,
  "book-open": BookOpen,
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "chevrons-up": ChevronsUp,
  "circle-check": CircleCheck,
  clock: Clock,
  coins: Coins,
  copy: Copy,
  "corner-down-right": CornerDownRight,
  crown: Crown,
  "dice-5": Dice5,
  "dice-6": Dice6,
  dices: Dices,
  droplet: Droplet,
  "eye-off": EyeOff,
  flag: Flag,
  flame: Flame,
  footprints: Footprints,
  gem: Gem,
  "git-branch": GitBranch,
  "hand-helping": HandHelping,
  hash: Hash,
  "heart-pulse": HeartPulse,
  /* The delivery spells this the old Lucide way; the export it binds to is the
     current one. The key follows the call site, as every key here does. */
  "help-circle": CircleHelp,
  hexagon: Hexagon,
  history: History,
  "image-plus": ImagePlus,
  info: Info,
  keyboard: Keyboard,
  link: Link,
  "list-checks": ListChecks,
  "loader-circle": LoaderCircle,
  lock: Lock,
  mail: Mail,
  map: Map,
  "map-pin": MapPin,
  megaphone: Megaphone,
  mic: Mic,
  minus: Minus,
  moon: Moon,
  "octagon-x": OctagonX,
  package: Package,
  "panel-left": PanelLeft,
  "panel-right-close": PanelRightClose,
  pencil: Pencil,
  plus: Plus,
  "refresh-cw": RefreshCw,
  scale: Scale,
  "scroll-text": ScrollText,
  search: Search,
  shield: Shield,
  "shield-half": ShieldHalf,
  skull: Skull,
  slash: Slash,
  snowflake: Snowflake,
  sparkles: Sparkles,
  star: Star,
  swords: Swords,
  "trash-2": Trash2,
  "trending-up": TrendingUp,
  "triangle-alert": TriangleAlert,
  unlink: Unlink,
  user: User,
  "user-plus": UserPlus,
  "user-round": UserRound,
  "user-round-x": UserRoundX,
  users: Users,
  "wand-sparkles": WandSparkles,
  wind: Wind,
  x: X,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export interface IconProps extends React.ComponentProps<LucideIcon> {
  /** Lucide slug, e.g. "dice-5", "swords", "heart-pulse". */
  name: IconName;
  /**
   * Square size in px. 16 inline with body text, 18 in controls, 20 in
   * navigation, 24+ for empty states.
   */
  size?: number;
}

/**
 * One Lucide glyph, tinted with `currentColor`. Tint by setting `color` on a
 * wrapper rather than passing a fill.
 *
 * Icons are never decorative-only in Tiny Taverns: this renders `aria-hidden`, so
 * the accessible name belongs on the control around it (`aria-label` on a
 * `Button size="icon"`, or the visible text beside it).
 */
function Icon({ name, size = 16, ...props }: IconProps) {
  const Glyph = icons[name];
  return <Glyph data-slot="icon" aria-hidden="true" size={size} {...props} />;
}

export { Icon };
