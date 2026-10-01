import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.58 3.58l1.06 1.06M11.36 11.36l1.06 1.06M3.58 12.42l1.06-1.06M11.36 4.64l1.06-1.06" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.25 9.9A5.5 5.5 0 1 1 6.1 2.75a4.4 4.4 0 0 0 7.15 7.15Z" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.75 3.75 5.5 8l4.25 4.25" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.25 3.75 10.5 8l-4.25 4.25" />
    </Icon>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5v7.75M4.75 7 8 10.25 11.25 7M3 13.25h10" />
    </Icon>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.75 8h8.5" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3.75v8.5M3.75 8h8.5" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" />
    </Icon>
  )
}

export function BoldIcon(props: IconProps) {
  return (
    <Icon strokeWidth="1.75" {...props}>
      <path d="M4.75 3h3.9a2.4 2.4 0 0 1 0 4.8h-3.9zM4.75 7.8h4.6a2.6 2.6 0 0 1 0 5.2h-4.6z" />
    </Icon>
  )
}

export function ItalicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.75 3H6.75M9.25 13h-4M9.1 3 6.9 13" />
    </Icon>
  )
}

export function QuoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.25 3.5v9M6.5 5h6.25M6.5 8h6.25M6.5 11h4" />
    </Icon>
  )
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 4.5h6.25M6.5 8h6.25M6.5 11.5h6.25" />
      <circle cx="3.5" cy="4.5" r="0.5" fill="currentColor" />
      <circle cx="3.5" cy="8" r="0.5" fill="currentColor" />
      <circle cx="3.5" cy="11.5" r="0.5" fill="currentColor" />
    </Icon>
  )
}

export function PageBreakIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 2.25v2.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.5M4 13.75v-2.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2.5M2 8h1.5M6.25 8h3.5M12.5 8H14" />
    </Icon>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 7 8 2.75 13.25 7v6.25a.75.75 0 0 1-.75.75H10V9.75H6V14H3.5a.75.75 0 0 1-.75-.75z" />
    </Icon>
  )
}

export function ProjectsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="2.25" width="4.75" height="4.75" rx="1" />
      <rect x="9" y="2.25" width="4.75" height="4.75" rx="1" />
      <rect x="2.25" y="9" width="4.75" height="4.75" rx="1" />
      <rect x="9" y="9" width="4.75" height="4.75" rx="1" />
    </Icon>
  )
}

export function TemplatesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75" />
      <path d="M2.25 6.25h11.5M6.25 6.25v7.5" />
    </Icon>
  )
}

export function AssetsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.75" />
      <circle cx="6" cy="6" r="1.1" />
      <path d="m13.75 10.25-3.25-3.25-7.75 6.75" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.25" cy="7.25" r="4.5" />
      <path d="m13.5 13.5-2.9-2.9" />
    </Icon>
  )
}

/** The Markdown mark (M↓), identity icon for "Markdown 卡片". */
export function MarkdownMarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.75" />
      <path d="M4 10V6l1.75 2L7.5 6v4M11 6v3.75M9.6 8.6 11 10l1.4-1.4" />
    </Icon>
  )
}

/** Overlapping shapes, identity icon for "自由编辑". */
export function FreeformMarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.75" cy="5.75" r="3.25" />
      <rect x="8.25" y="8.25" width="5.5" height="5.5" rx="1" />
    </Icon>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="3.75" cy="8" r=".75" fill="currentColor" />
      <circle cx="8" cy="8" r=".75" fill="currentColor" />
      <circle cx="12.25" cy="8" r=".75" fill="currentColor" />
    </Icon>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.75 5.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 4.5h10.5M6.5 7.25v4M9.5 7.25v4M3.75 4.5l.6 8.4a1 1 0 0 0 1 .85h5.3a1 1 0 0 0 1-.85l.6-8.4M6 4.5V2.75h4V4.5" />
    </Icon>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.25 13.75H3.5a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1h2.75M10.5 11l3-3-3-3M13.5 8H6.25" />
    </Icon>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 13.25V5.5M4.75 8.5 8 5.25l3.25 3.25M3 2.75h10" />
    </Icon>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.25" y="7" width="9.5" height="6.75" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4.25 6.25 3.75 3.75 3.75-3.75" />
    </Icon>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m10.25 2.75 3 3-7.5 7.5-3.5.5.5-3.5z" />
      <path d="m8.75 4.25 3 3" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.25 8.25 3 3 6.5-6.5" />
    </Icon>
  )
}

export function SidebarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2" />
      <path d="M6.25 2.75v10.5" />
    </Icon>
  )
}

/** A panel docked on the right: the editor's settings panel. */
export function PanelRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2" />
      <path d="M9.75 2.75v10.5" />
    </Icon>
  )
}

/** Pages one under another: the editor's page list. */
export function PagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.25" y="1.75" width="7.5" height="5" rx="1.25" />
      <rect x="4.25" y="9.25" width="7.5" height="5" rx="1.25" />
    </Icon>
  )
}

export function LanguageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.25 8h11.5M8 2.25c1.6 1.7 2.4 3.6 2.4 5.75S9.6 12.05 8 13.75C6.4 12.05 5.6 10.15 5.6 8S6.4 3.95 8 2.25Z" />
    </Icon>
  )
}

export function UndoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 4.25 2.75 7l2.75 2.75" />
      <path d="M2.75 7h6.5a4 4 0 0 1 0 8h-2" />
    </Icon>
  )
}

export function RedoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.5 4.25 13.25 7l-2.75 2.75" />
      <path d="M13.25 7h-6.5a4 4 0 0 0 0 8h2" />
    </Icon>
  )
}

export function TextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4.25V3h10v1.25M8 3v10M6 13h4" />
    </Icon>
  )
}

export function ShapesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.5" cy="5.5" r="3" />
      <path d="M8.75 8.75h4.5v4.5h-4.5z" />
      <path d="m10.75 2.25 2.5 4.25h-5z" />
    </Icon>
  )
}

export function LineToolIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 13 13 3" />
      <path d="M9 3h4v4" />
    </Icon>
  )
}

export function GraphicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 12.75c1.75-7.5 4.5-9 6-5.25s3.75 2.75 4.5-4.75" />
    </Icon>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.75" />
      <circle cx="5.75" cy="6.5" r="1.1" />
      <path d="m13.75 10.5-3.25-3-7.5 5.25" />
    </Icon>
  )
}

export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3.75A.75.75 0 0 1 3.75 3h6.5L13 5.75v6.5a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75z" />
      <path d="M5.5 3v3h4V3M5.5 13v-3.5h5V13" />
    </Icon>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.25 4.5a1 1 0 0 1 1-1h3l1.5 1.5h5a1 1 0 0 1 1 1v6.25a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1z" />
    </Icon>
  )
}

/** Solid previews for the shape and line insert menus. */
export function ShapePreviewIcon({ shape, ...props }: IconProps & { shape: string }) {
  const paths: Record<string, JSX.Element> = {
    rect: <rect x="4" y="6" width="24" height="20" rx="3" />,
    ellipse: <circle cx="16" cy="16" r="11" />,
    triangle: <path d="M16 5 28 26H4z" />,
    star: <path d="m16 4 3.6 7.6 8.4 1-6.2 5.8 1.6 8.3L16 22.6l-7.4 4.1 1.6-8.3L4 12.6l8.4-1z" />,
    hexagon: <path d="M10 5h12l6 11-6 11H10L4 16z" />,
    line: <path d="M5 27 27 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />,
    arrow: (
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 27 26 6" />
        <path d="M15 6h11v11" />
      </g>
    ),
  }
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      {paths[shape] ?? paths.rect}
    </svg>
  )
}

export function BookmarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.25 2.75h7.5v10.5L8 10.75l-3.75 2.5z" />
    </Icon>
  )
}

export function StackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 2.5 5.5 2.75L8 8 2.5 5.25z" />
      <path d="m2.5 8 5.5 2.75L13.5 8M2.5 10.75 8 13.5l5.5-2.75" />
    </Icon>
  )
}

export function BadgeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="6" r="2.75" />
      <path d="M3 13.5c.7-2.3 2.7-3.75 5-3.75s4.3 1.45 5 3.75" />
    </Icon>
  )
}

export function CloudCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12.25a3 3 0 0 1-.4-5.97 4 4 0 0 1 7.72-.9 3.2 3.2 0 0 1 .43 6.87z" />
      <path d="m6.25 9 1.25 1.25L9.75 8" />
    </Icon>
  )
}

export function CloudOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 12.25H4.5a3 3 0 0 1-.4-5.97 4 4 0 0 1 .8-1.73M7.1 3.1a4 4 0 0 1 4.72 2.28 3.2 3.2 0 0 1 1.83 5.6" />
      <path d="m2.5 2.5 11 11" />
    </Icon>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.5M8 10.9v.1" />
    </Icon>
  )
}

export function FileImportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.25 2.25H4.75a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V5.25z" />
      <path d="M9.25 2.25v3h3M8 7v4.25M6.25 9.5 8 11.25 9.75 9.5" />
    </Icon>
  )
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 2.5 5.5 2.75L8 8 2.5 5.25z" />
      <path d="m2.5 8 5.5 2.75L13.5 8" />
    </Icon>
  )
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 8a5.25 5.25 0 1 0 1.54-3.71" />
      <path d="M2.75 2.75v2.5h2.5M8 5.25V8l1.75 1.25" />
    </Icon>
  )
}

export function SlidersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.75 5h10.5M2.75 11h10.5" />
      <circle cx="6" cy="5" r="1.6" fill="var(--surface-pop, #fff)" />
      <circle cx="10" cy="11" r="1.6" fill="var(--surface-pop, #fff)" />
    </Icon>
  )
}

export function DeviceCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.75V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6.25M1.75 12.5h12.5" />
      <path d="m6.4 7.1 1.1 1.1 2.1-2.1" />
    </Icon>
  )
}
