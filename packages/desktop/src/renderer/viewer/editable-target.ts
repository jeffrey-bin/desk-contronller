type EditableKeyboardTarget = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

export function isEditableKeyboardTarget(target: unknown): boolean {
  const element = target as EditableKeyboardTarget | null | undefined

  if (element === null || element === undefined) {
    return false
  }

  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''

  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true
  }

  if (element.isContentEditable === true) {
    return true
  }

  const closestEditable = element.closest?.(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
  )

  return closestEditable !== null && closestEditable !== undefined
}
