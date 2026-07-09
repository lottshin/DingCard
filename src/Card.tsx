import { forwardRef } from 'react'
import type { CardConfig, Profile } from './theme'

interface CardProps {
  html: string
  config: CardConfig
  profile: Profile
  showHeader?: boolean
}

/** Two-letter avatar fallback when the user hasn't uploaded an image. */
function avatarLabel(nickname: string): string {
  const trimmed = nickname.trim()
  return trimmed ? trimmed.slice(0, 1) : '·'
}

function Avatar({ profile, shape }: { profile: Profile; shape: 'circle' | 'rounded' }) {
  const radius = shape === 'circle' ? '50%' : '8px'
  if (profile.avatarImage) {
    return (
      <img
        className="avatar"
        src={profile.avatarImage}
        alt=""
        style={{ borderRadius: radius }}
      />
    )
  }
  return (
    <div
      className="avatar avatar-fallback"
      style={{ background: profile.avatarColor, borderRadius: radius }}
    >
      {avatarLabel(profile.nickname)}
    </div>
  )
}

/** Twitter's blue-scalloped check. */
function TwitterBadge() {
  return (
    <svg className="verified" viewBox="0 0 22 22" width="15" height="15" aria-hidden>
      <path
        fill="#1d9bf0"
        d="M20.4 11c0-1.2-.7-2.3-1.7-2.8.3-1.1 0-2.4-.9-3.3-.9-.9-2.2-1.2-3.3-.9C13.3 3 12.2 2.3 11 2.3S8.7 3 8.5 4c-1.1-.3-2.4 0-3.3.9-.9.9-1.2 2.2-.9 3.3-1 .5-1.7 1.6-1.7 2.8s.7 2.3 1.7 2.8c-.3 1.1 0 2.4.9 3.3.9.9 2.2 1.2 3.3.9.2 1 1.3 1.7 2.5 1.7s2.3-.7 2.5-1.7c1.1.3 2.4 0 3.3-.9.9-.9 1.2-2.2.9-3.3 1-.5 1.7-1.6 1.7-2.8z"
      />
      <path
        fill="#fff"
        d="M9.8 14.4l-2.8-2.8 1.1-1.1 1.7 1.7 3.9-3.9 1.1 1.1z"
      />
    </svg>
  )
}

/**
 * Weibo's personal-account "V" — a small amber disc with a stylized check.
 * Real Weibo renders it right underneath the nickname, on its own line, at a
 * small size; the color is a distinctive golden-orange, not the theme accent.
 */
function WeiboBadge() {
  return (
    <svg className="verified verified-weibo" viewBox="0 0 20 20" width="14" height="14" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="#f6a623" />
      <path
        d="M5.5 10.2l2.7 2.7 6-6.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const WEIBO_ORANGE = '#ff8200'

function WeiboHeader({ profile }: { profile: Profile }) {
  return (
    <div className="cardhead cardhead-weibo">
      <div className="cardhead-weibo-avatar-wrap">
        <Avatar profile={profile} shape="circle" />
        {profile.verified && (
          <span className="cardhead-weibo-avatar-badge" aria-hidden>
            <WeiboBadge />
          </span>
        )}
      </div>
      <div className="cardhead-meta">
        <span className="cardhead-name" style={{ color: WEIBO_ORANGE }}>
          {profile.nickname}
        </span>
        <span className="cardhead-sub">
          {nowStamp()}
          {profile.location && <span>&nbsp;&nbsp;发布于&nbsp;{profile.location}</span>}
        </span>
      </div>
    </div>
  )
}

function TwitterHeader({ profile }: { profile: Profile }) {
  return (
    <div className="cardhead cardhead-twitter">
      <Avatar profile={profile} shape="circle" />
      <div className="cardhead-meta">
        <div className="cardhead-name-row">
          <span className="cardhead-name">{profile.nickname}</span>
          {profile.verified && <TwitterBadge />}
        </div>
        <div className="cardhead-sub">
          @{profile.handle}
          {profile.location && <span>&nbsp;&nbsp;发布于&nbsp;{profile.location}</span>}
        </div>
      </div>
    </div>
  )
}

/** Weibo-style timestamp, e.g. "26-7-8 22:59". */
function nowStamp(): string {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${yy}-${d.getMonth() + 1}-${d.getDate()} ${hh}:${mm}`
}

/**
 * A single exportable card. The forwarded ref points at the exact box that
 * html-to-image snapshots, so everything visual must live inside it.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { html, config, profile, showHeader = true },
  ref,
) {
  return (
    <div className="card" ref={ref}>
      {showHeader && config.header === 'weibo' && <WeiboHeader profile={profile} />}
      {showHeader && config.header === 'twitter' && <TwitterHeader profile={profile} />}
      <div className="card-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
})
