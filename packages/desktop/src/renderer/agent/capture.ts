export class ScreenCaptureError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'denied' | 'failed',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ScreenCaptureError'
  }
}

export async function capturePrimaryScreen(): Promise<MediaStream> {
  if (navigator.mediaDevices?.getDisplayMedia === undefined) {
    throw new ScreenCaptureError('Screen capture is unavailable', 'unsupported')
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new ScreenCaptureError('Screen capture permission denied', 'denied', { cause: error })
    }

    throw new ScreenCaptureError('Screen capture failed', 'failed', { cause: error })
  }
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop()
  }
}
