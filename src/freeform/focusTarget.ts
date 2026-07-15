const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ')

export function isFocusablePointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(FOCUSABLE_SELECTOR)) return true
  const label = target.closest('label')
  return (
    label instanceof HTMLLabelElement &&
    label.control !== null &&
    !label.control.matches(':disabled')
  )
}
