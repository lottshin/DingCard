import { paintFallbackColor, textFillToStyle } from './paint'
import { textEffectLayer, textEffectWordsStyle } from './textEffects'
import type { ColorPaint, TextEffect } from './types'

/**
 * A few words drawn with a fill and an effect, the way a text on the canvas
 * draws them: the 花字 tiles and the effect choices show their look with it.
 */
export function TextEffectSample({
  text,
  fontSize,
  textFill,
  effect,
}: {
  text: string
  fontSize: number
  textFill: ColorPaint
  effect: TextEffect | null
}) {
  const layer = effect ? textEffectLayer(effect, fontSize) : null
  const color = textFill.type === 'solid' ? textFill.color : paintFallbackColor(textFill)
  return (
    <span className="text-effect-sample" style={{ fontSize }} aria-hidden="true">
      {layer && (
        <span className="text-effect-sample-layer" style={layer.style}>
          {layer.band ? <span className="freeform-text-effect-band" style={layer.band}>{text}</span> : text}
        </span>
      )}
      <span
        className="text-effect-sample-words"
        style={{ ...textFillToStyle(textFill), ...(effect ? textEffectWordsStyle(effect, fontSize, color) : {}) }}
      >
        {text}
      </span>
    </span>
  )
}
