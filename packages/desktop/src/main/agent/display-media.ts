type DisplayMediaSource = {
  id: string
  name: string
}

type DisplayMediaSourceOptions = {
  types: ['screen']
  thumbnailSize: {
    width: 0
    height: 0
  }
}

type DisplayMediaStreams = {
  video?: DisplayMediaSource
}

type DisplayMediaRequestHandler = (
  request: unknown,
  callback: (streams: DisplayMediaStreams) => void,
) => void

type DisplayMediaSession = {
  setDisplayMediaRequestHandler(handler: DisplayMediaRequestHandler | null): void
}

type DisplayMediaCapturer = {
  getSources(options: DisplayMediaSourceOptions): Promise<DisplayMediaSource[]>
}

type DisplayMediaLogger = {
  warn(message: string): void
}

type DisplayMediaOptions = {
  fallbackSource?: DisplayMediaSource
}

export function configureDisplayMediaRequestHandler(
  session: DisplayMediaSession,
  capturer: DisplayMediaCapturer,
  logger?: DisplayMediaLogger,
  options: DisplayMediaOptions = {},
): void {
  session.setDisplayMediaRequestHandler((_request, callback) => {
    void capturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then(
      (sources) => {
        const source = choosePrimaryScreenSource(sources) ?? options.fallbackSource
        if (source === undefined) {
          logger?.warn('No screen source available for display capture; sourceCount=0')
          callback({})
          return
        }

        if (sources.length === 0) {
          logger?.warn(
            `No screen source available for display capture; using fallback source ${source.id}`,
          )
        }

        callback({ video: source })
      },
      (error: unknown) => {
        logger?.warn(`Failed to enumerate display sources: ${String(error)}`)
        callback({})
      },
    )
  })
}

export function choosePrimaryScreenSource(
  sources: readonly DisplayMediaSource[],
): DisplayMediaSource | undefined {
  return sources[0]
}
