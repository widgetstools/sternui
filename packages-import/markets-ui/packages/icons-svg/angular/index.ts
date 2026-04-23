/**
 * @markets/icons-svg/angular
 *
 * Angular icon bindings for the MarketsUI monorepo.
 * Wraps lucide-angular so icon versions are centralised and consistent.
 *
 * Usage:
 *   import { LucideAngularModule, FILE_TEXT, HOME } from '@markets/icons-svg/angular';
 *
 *   // In your component:
 *   @Component({
 *     imports: [LucideAngularModule],
 *     template: `<lucide-icon [img]="icons.home" [size]="16" />`
 *   })
 *   export class MyComponent {
 *     icons = { home: HOME };
 *   }
 *
 * To add a new icon, re-export it from lucide-angular below.
 * To swap the underlying icon library, update only this file.
 */

// Re-export the Angular module/component needed to render icons
export { LucideAngularModule } from 'lucide-angular';

// Re-export individual icon definitions
// These are data objects (not components) that describe each icon's SVG paths.
// Pass them to <lucide-icon [img]="iconDef" /> to render.
export {
  // ─── File & Document ───────────────────────────────────────────
  FileText,
  File,
  FilePlus,
  FolderOpen,
  Folder,
  Save,
  Download,
  Upload,
  Copy,
  Clipboard,
  Scissors,

  // ─── Editing ───────────────────────────────────────────────────
  Pencil,
  Trash2,
  Undo,
  Redo,
  RotateCcw,

  // ─── Settings & Tools ──────────────────────────────────────────
  Settings,
  SlidersHorizontal,
  Wrench,

  // ─── Search & View ─────────────────────────────────────────────
  Search,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,

  // ─── Layout ────────────────────────────────────────────────────
  Layout,
  LayoutGrid,
  Columns3,
  Maximize,
  Minimize,

  // ─── Actions ───────────────────────────────────────────────────
  Plus,
  PlusCircle,
  Minus,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RefreshCw,

  // ─── Communication ─────────────────────────────────────────────
  Bell,
  Mail,
  Send,
  MessageSquare,

  // ─── Navigation ────────────────────────────────────────────────
  Globe,
  Link,
  ExternalLink,
  Home,
  Store,
  Map,
  Compass,

  // ─── Users & Security ──────────────────────────────────────────
  User,
  Users,
  Lock,
  Key,
  Shield,
  LogIn,
  LogOut,

  // ─── Status & Feedback ─────────────────────────────────────────
  Star,
  Heart,
  Bookmark,
  Flag,
  Tag,
  Info,
  HelpCircle,
  AlertTriangle,

  // ─── Development ───────────────────────────────────────────────
  Terminal,
  Code,
  Database,
  Server,
  Monitor,
  GitBranch,
  Share2,
  Power,
  Workflow,

  // ─── Media ─────────────────────────────────────────────────────
  Image,
  Sun,
  Moon,
  Palette,

  // ─── Data & Charts ─────────────────────────────────────────────
  Zap,
  Activity,
  BarChart2,
  LineChart,
  PieChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Wallet,

  // ─── Organization ──────────────────────────────────────────────
  Package,
  Layers,
  Clock,
  Calendar,
  Filter,
  Table,
  Menu,
  Target,
  GripVertical,
  ListOrdered,
} from 'lucide-angular';
