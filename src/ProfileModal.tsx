import { useRef, useState } from 'react'
import { AVATAR_COLORS, type Profile } from './theme'

interface ProfileModalProps {
  profile: Profile
  onSave: (next: Profile) => void
  onClose: () => void
}

/** The "个人资料" dialog: avatar color/upload, nickname, verified toggle. */
export function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [draft, setDraft] = useState<Profile>(profile)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set('avatarImage', reader.result as string)
    reader.readAsDataURL(file)
  }

  const previewStyle = draft.avatarImage
    ? { backgroundImage: `url(${draft.avatarImage})` }
    : { background: draft.avatarColor }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>个人资料</h3>
          <button className="modal-x" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="modal-row">
          <div className="avatar-preview" style={previewStyle} />
          <div className="avatar-picker">
            <div className="field-label">头像颜色（或上传图片）</div>
            <div className="swatches">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  className={
                    !draft.avatarImage && draft.avatarColor === c ? 'swatch active' : 'swatch'
                  }
                  style={{ background: c }}
                  onClick={() => {
                    set('avatarColor', c)
                    set('avatarImage', null)
                  }}
                  aria-label={`颜色 ${c}`}
                />
              ))}
              <button
                className="swatch swatch-upload"
                onClick={() => fileRef.current?.click()}
                aria-label="上传图片"
              >
                +
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onPickFile}
              />
            </div>
          </div>
        </div>

        <label className="field">
          <span className="field-label">昵称</span>
          <input
            className="text-input"
            value={draft.nickname}
            onChange={(e) => set('nickname', e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">@ 用户名（推特）</span>
          <input
            className="text-input"
            value={draft.handle}
            onChange={(e) => set('handle', e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">发布地点（微博/推特）</span>
          <input
            className="text-input"
            value={draft.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </label>

        <div className="field-inline">
          <span className="field-label">显示认证标志</span>
          <button
            className={draft.verified ? 'toggle on' : 'toggle'}
            onClick={() => set('verified', !draft.verified)}
            role="switch"
            aria-checked={draft.verified}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="field-inline">
          <span className="field-label">只在首页显示个人信息</span>
          <button
            className={draft.headerFirstPageOnly ? 'toggle on' : 'toggle'}
            onClick={() => set('headerFirstPageOnly', !draft.headerFirstPageOnly)}
            role="switch"
            aria-checked={draft.headerFirstPageOnly}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        <div className="modal-foot">
          <button className="ghost" onClick={onClose}>
            取消
          </button>
          <button className="primary" onClick={() => onSave(draft)}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
