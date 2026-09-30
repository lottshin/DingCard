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
