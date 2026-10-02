import { useState } from 'react'
import { formatBytes } from '../assets'
import { importedFontStack } from '../freeform/fontFiles'
import { fontLibrary, useImportedFonts, type ImportedFont } from '../freeform/fontLibrary'
import { t } from '../i18n'
import { TrashIcon, UploadIcon } from '../ui/icons'
import { ConfirmDialog } from './ConfirmDialog'

const FORMAT_LABELS: Record<ImportedFont['format'], string> = { truetype: 'TTF', opentype: 'OTF', woff: 'WOFF', woff2: 'WOFF2' }

/** Import font files into this browser's font library; the first failure is reported. */
export async function importFontFiles(files: readonly File[]): Promise<string | null> {
  for (const file of files) {
    try {
      await fontLibrary.importFile(file)
    } catch (error) {
      return error instanceof Error && error.message ? t(error.message) : t('字体导入失败，请稍后重试')
    }
  }
  return null
}

/**
 * 素材库's fonts: the fonts imported in this browser, each shown in its own
 * face, to import more and to remove. They are the fonts every text's font
 * menu lists after the built-in ones.
 */
export function FontLibraryPanel({ error, onPick }: { error: string | null; onPick: () => void }) {
  const fonts = useImportedFonts()
  const [deleting, setDeleting] = useState<ImportedFont | null>(null)

  return (
    <>
      {error && (
        <div className="font-library-error" role="alert">{error}</div>
      )}
      {fonts.length > 0 ? (
        <div className="font-grid" data-testid="font-grid">
          {fonts.map((font) => (
            <article key={font.id} className="font-card" data-testid="font-card">
              <div className="font-card-sample" style={{ fontFamily: importedFontStack(font.family) }} aria-hidden="true">
                <span className="font-card-big">{t('永 Aa')}</span>
                <span className="font-card-line">{t('字体样张 123')}</span>
              </div>
              <div className="font-card-info">
                <span className="font-card-name" title={font.family}>{font.family}</span>
                <span className="font-card-meta tnum">{FORMAT_LABELS[font.format]} · {formatBytes(font.bytes)}</span>
              </div>
              <button
                type="button"
                className="icon-btn font-card-remove"
                aria-label={t('删除字体 {font}', { font: font.family })}
                title={t('删除字体 {font}', { font: font.family })}
                onClick={() => setDeleting(font)}
              >
                <TrashIcon />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="asset-drop">
          <span className="asset-drop-icon"><UploadIcon /></span>
          <b>{t('把字体文件拖到这里')}</b>
          <span>{t('TTF、OTF、WOFF、WOFF2 都可以，最大 40 MB。')}</span>
          <button className="ghost" type="button" onClick={onPick}>{t('选择字体')}</button>
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={t('删除字体「{title}」？', { title: deleting.family })}
          body={t('用了它的文字会换回默认字体。')}
          confirmLabel={t('删除')}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const font = deleting
            setDeleting(null)
            void fontLibrary.remove(font.id).catch(() => undefined)
          }}
        />
      )}
    </>
  )
}

