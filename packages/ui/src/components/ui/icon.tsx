import * as React from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock,
  Dice5,
  Dice6,
  Dices,
  Droplet,
  EyeOff,
  Flame,
  Footprints,
  Hash,
  HeartPulse,
  Info,
  Keyboard,
  LoaderCircle,
  Lock,
  Map,
  Minus,
  Moon,
  OctagonX,
  PanelLeft,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Swords,
  Trash2,
  TriangleAlert,
  Users,
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
 */
export const icons = {
  "arrow-right": ArrowRight,
  bell: Bell,
  "book-open": BookOpen,
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-check": CircleCheck,
  clock: Clock,
  "dice-5": Dice5,
  "dice-6": Dice6,
  dices: Dices,
  droplet: Droplet,
  "eye-off": EyeOff,
  flame: Flame,
  footprints: Footprints,
  hash: Hash,
  "heart-pulse": HeartPulse,
  info: Info,
  keyboard: Keyboard,
  "loader-circle": LoaderCircle,
  lock: Lock,
  map: Map,
  minus: Minus,
  moon: Moon,
  "octagon-x": OctagonX,
  "panel-left": PanelLeft,
  pencil: Pencil,
  plus: Plus,
  "scroll-text": ScrollText,
  search: Search,
  shield: Shield,
  skull: Skull,
  snowflake: Snowflake,
  sparkles: Sparkles,
  star: Star,
  swords: Swords,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  users: Users,
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
