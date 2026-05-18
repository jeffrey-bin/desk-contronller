import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function isAllowedNavigationUrl(
  url: string,
  rendererUrl = process.env.ELECTRON_RENDERER_URL,
  allowedFileRoot?: string,
): boolean {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }

  if (target.protocol === 'file:') {
    return isAllowedFileUrl(target, allowedFileRoot)
  }

  if (rendererUrl === undefined) {
    return false
  }

  try {
    return target.origin === new URL(rendererUrl).origin
  } catch {
    return false
  }
}

function isAllowedFileUrl(url: URL, allowedFileRoot: string | undefined): boolean {
  if (allowedFileRoot === undefined) {
    return false
  }

  let targetPath: string
  try {
    targetPath = fileURLToPath(url)
  } catch {
    return false
  }

  const root = resolve(allowedFileRoot)
  const target = resolve(targetPath)
  const pathFromRoot = relative(root, target)
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
}
