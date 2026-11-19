/* ------------------------------------------------------------------
 * Icônes (Lucide, licence ISC) : un vocabulaire visuel unique et sobre.
 * Seules les icônes importées ici sont embarquées dans l'application.
 * ------------------------------------------------------------------ */
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  AudioLines,
  Award,
  BadgeCheck,
  Bike,
  BookA,
  BookOpen,
  BookOpenText,
  Bot,
  Brain,
  Briefcase,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  Coffee,
  Compass,
  Cpu,
  Crown,
  Download,
  Dumbbell,
  Ear,
  Flame,
  Footprints,
  Gamepad2,
  Gem,
  GraduationCap,
  Grid2x2,
  Hand,
  History,
  Handshake,
  HardDrive,
  HeartPulse,
  Highlighter,
  Hourglass,
  House,
  Info,
  Landmark,
  Layers,
  Library,
  Lightbulb,
  ListChecks,
  Lock,
  Map as MapIcon,
  MapPin,
  Medal,
  MessageCircle,
  MessageSquareQuote,
  MessagesSquare,
  Mic,
  MicOff,
  Moon,
  Newspaper,
  Palette,
  PartyPopper,
  PenLine,
  Plane,
  Puzzle,
  Quote,
  Replace,
  Rocket,
  RotateCcw,
  Scale,
  Scissors,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Signpost,
  SkipForward,
  SpellCheck,
  SlidersHorizontal,
  Smartphone,
  Snail,
  Snowflake,
  Sparkles,
  Split,
  Sprout,
  Square,
  Star,
  Sun,
  SunMoon,
  Target,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Trash,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Undo2,
  Upload,
  UserRound,
  Users,
  UtensilsCrossed,
  VenetianMask,
  Volume2,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  // navigation
  home: House,
  path: MapIcon,
  chat: MessagesSquare,
  games: Gamepad2,
  review: Brain,
  test: Compass,
  method: BookOpen,
  settings: Settings,
  // progression / gamification
  flame: Flame,
  freeze: Snowflake,
  star: Star,
  xp: Zap,
  trophy: Trophy,
  medal: Medal,
  target: Target,
  quests: ListChecks,
  trend: TrendingUp,
  party: PartyPopper,
  effort: Dumbbell,
  // retours
  ok: CircleCheck,
  ko: CircleX,
  almost: CircleAlert,
  skip: SkipForward,
  tip: Lightbulb,
  warn: TriangleAlert,
  info: Info,
  check: Check,
  close: X,
  answer: BookOpenText,
  // audio / voix
  speaker: Volume2,
  slow: Snail,
  mic: Mic,
  micOff: MicOff,
  stop: Square,
  replay: RotateCcw,
  hand: Hand,
  voice: AudioLines,
  ear: Ear,
  // divers
  library: Library,
  search: Search,
  grammar: BookOpen,
  vocab: Layers,
  pin: MapPin,
  chart: ChartColumn,
  cpu: Cpu,
  ai: Sparkles,
  bot: Bot,
  data: HardDrive,
  profile: UserRound,
  recap: ClipboardCheck,
  write: PenLine,
  download: Download,
  upload: Upload,
  trash: Trash,
  arrowRight: ArrowRight,
  prev: ChevronLeft,
  next: ChevronRight,
  sun: Sun,
  moon: Moon,
  auto: SunMoon,
  coffee: Coffee,
  lock: Lock,
  verified: BadgeCheck,
  thumbsUp: ThumbsUp,
  thumbsDown: ThumbsDown,
  hourglass: Hourglass,
  sprout: Sprout,
  footprints: Footprints,
  bike: Bike,
  rocket: Rocket,
  graduation: GraduationCap,
  dictionary: BookA,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Texte alternatif : sinon l'icône est décorative (aria-hidden). */
  label?: string;
  strokeWidth?: number;
}

export default function Icon({ name, size = 20, className, style, label, strokeWidth = 2 }: IconProps) {
  const C = ICONS[name];
  return (
    <C
      size={size}
      strokeWidth={strokeWidth}
      className={`icon${className ? ' ' + className : ''}`}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable={false}
    />
  );
}

/** Icône dans une pastille colorée (cartes, listes). */
export function IconBadge({
  icon: C,
  tone = 'primary',
  size = 22,
  className = '',
}: {
  icon: LucideIcon;
  tone?: 'primary' | 'accent' | 'gold' | 'info' | 'success' | 'neutral';
  size?: number;
  className?: string;
}) {
  return (
    <span className={`icon-badge tone-${tone} ${className}`} aria-hidden>
      <C size={size} strokeWidth={2} />
    </span>
  );
}

/* ------------------------------ Icônes des contenus ------------------------------ */

const UNIT: Record<string, LucideIcon> = {
  'a1-u1': Hand,
  'a1-u2': Users,
  'a1-u3': Clock,
  'a1-u4': ShoppingCart,
  'a2-u1': CalendarDays,
  'a2-u2': Plane,
  'a2-u3': Scale,
  'a2-u4': Award,
  'b1-u1': Hourglass,
  'b1-u2': Split,
  'b1-u3': Signpost,
  'b1-u4': Newspaper,
  'b2-u1': BookOpenText,
  'b2-u2': Quote,
  'b2-u3': Undo2,
  'b2-u4': Briefcase,
  'c1-u1': Highlighter,
  'c1-u2': Scissors,
  'c1-u3': Search,
  'c1-u4': Handshake,
  'c2-u1': SlidersHorizontal,
  'c2-u2': WandSparkles,
  'c2-u3': MessageSquareQuote,
  'c2-u4': Replace,
};
export const unitIcon = (id: string): LucideIcon => UNIT[id] ?? BookOpen;

const TOPIC: Record<string, LucideIcon> = {
  travel: Plane,
  work: Briefcase,
  personal: UserRound,
  food: UtensilsCrossed,
  hobbies: Palette,
  health: HeartPulse,
  shopping: ShoppingBag,
  tech: Smartphone,
  interview: Handshake,
  society: Landmark,
};
export const topicIcon = (id: string): LucideIcon => TOPIC[id] ?? MessageCircle;

const BADGE: Record<string, LucideIcon> = {
  placement: Compass,
  'first-lesson': Sprout,
  perfect: Gem,
  'streak-3': Flame,
  'streak-7': Medal,
  'streak-30': Crown,
  'xp-100': Star,
  'xp-1000': Sparkles,
  'xp-5000': Rocket,
  'chat-10': MessageCircle,
  'chat-100': MessagesSquare,
  travel: Plane,
  'topics-5': Puzzle,
  'games-5': Gamepad2,
  'speed-20': Zap,
  'reviews-50': Brain,
  'speak-10': Mic,
  'level-done': GraduationCap,
};
export const badgeIcon = (id: string): LucideIcon => BADGE[id] ?? Award;

const GAME: Record<string, LucideIcon> = {
  chrono: Timer,
  'faux-amis': VenetianMask,
  puzzle: Puzzle,
  dictee: PenLine,
  prononciation: Mic,
  verbes: History,
  'phrase-juste': SpellCheck,
  memory: Grid2x2,
};
export const gameIcon = (id: string): LucideIcon => GAME[id] ?? Gamepad2;

