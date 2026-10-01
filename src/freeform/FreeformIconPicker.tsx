import { memo, useMemo, useState } from 'react'
import { useLang, t } from '../i18n'
import { SearchIcon } from '../ui/icons'
import { searchIcons, type IconDefinition } from './icons'

/**
 * The Elements panel's icon section: a search box over the built-in icons.
 * It keeps its own query, so typing never re-renders the editor around it;
 * give it a stable `onPick` so editor renders skip it too.
 */
export const FreeformIconPicker = memo(function FreeformIconPicker({
  onPick,
}: {
  onPick: (icon: IconDefinition) => void
}) {
  const lang = useLang()
  const [query, setQuery] = useState('')
  const matches = useMemo(() => searchIcons(query), [query])

  return (
    <>
      <label className="search-field freeform-icon-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder={t('搜索图标')}
          aria-label={t('搜索图标')}
          data-testid="freeform-icon-search"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {matches.length > 0 ? (
        <div className="freeform-icon-grid" role="group" aria-label={t('图标')}>
          {matches.map((icon) => {
            const name = lang === 'en' ? icon.en : icon.zh
            return (
              <button
                key={icon.id}
                type="button"
                className="freeform-icon-tile"
                data-testid={`insert-icon-${icon.id}`}
                aria-label={name}
                title={name}
                onClick={() => onPick(icon)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={icon.d} />
                </svg>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="freeform-icon-empty" data-testid="freeform-icon-empty">{t('没有找到图标')}</p>
      )}
    </>
  )
})
