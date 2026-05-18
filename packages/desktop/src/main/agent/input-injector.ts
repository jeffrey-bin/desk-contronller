import {
  Button as NutButton,
  Key as NutKey,
  Point as NutPoint,
  keyboard,
  mouse,
} from '@nut-tree-fork/nut-js'
import { Mods, normalizedToScreen, type KeyMsg, type MouseMsg, type Size } from '@desk/shared'

type MouseButton = 'left' | 'middle' | 'right'

type InputDriver = {
  validateKey?(code: string): void
  move(point: { x: number; y: number }): Promise<void> | void
  buttonDown(button: MouseButton): Promise<void> | void
  buttonUp(button: MouseButton): Promise<void> | void
  scroll(dx: number, dy: number): Promise<void> | void
  keyDown(code: string): Promise<void> | void
  keyUp(code: string): Promise<void> | void
}

export type InputInjectorOptions = {
  driver?: InputDriver
}

export class InputInjector {
  readonly #driver: InputDriver
  readonly #pressedKeys = new Set<string>()
  readonly #pressedButtons = new Set<MouseButton>()
  #mouseQueue: Promise<void> = Promise.resolve()
  #keyQueue: Promise<void> = Promise.resolve()

  constructor(options: InputInjectorOptions = {}) {
    this.#driver = options.driver ?? createNutDriver()
  }

  async handleMouse(message: MouseMsg, display: Size): Promise<void> {
    const task = this.#mouseQueue
      .catch(() => undefined)
      .then(() => this.#handleMouse(message, display))
    this.#mouseQueue = task.catch(() => undefined)
    await task
  }

  async handleKey(message: KeyMsg): Promise<void> {
    const task = this.#keyQueue.catch(() => undefined).then(() => this.#handleKey(message))
    this.#keyQueue = task.catch(() => undefined)
    await task
  }

  async releaseAll(): Promise<void> {
    const releaseButtons = this.#mouseQueue
      .catch(() => undefined)
      .then(() => this.#releaseButtons())
    const releaseKeys = this.#keyQueue.catch(() => undefined).then(() => this.#releaseKeys())
    this.#mouseQueue = releaseButtons.catch(() => undefined)
    this.#keyQueue = releaseKeys.catch(() => undefined)
    await Promise.all([releaseButtons, releaseKeys])
  }

  async #handleMouse(message: MouseMsg, display: Size): Promise<void> {
    if (message.t !== 'mw') {
      await this.#move(message, display)
    }

    switch (message.t) {
      case 'mm':
        break
      case 'md':
        await this.#pressButton(buttonFromWire(message.b))
        break
      case 'mu':
        await this.#releaseButton(buttonFromWire(message.b))
        break
      case 'mw':
        await this.#driver.scroll(message.dx, message.dy)
        break
    }
  }

  async #handleKey(message: KeyMsg): Promise<void> {
    switch (message.t) {
      case 'kd':
        await this.#pressKey(message.code)
        await this.#syncModifiers(message.mods)
        break
      case 'ku':
        await this.#releaseKey(message.code)
        await this.#syncModifiers(message.mods)
        break
      case 'sync':
        await this.#syncKeys(message.keys)
        await this.#syncModifiers(message.mods)
        break
      case 'rk':
        await this.#releaseAllFromKeyQueue()
        break
    }
  }

  async #releaseAllFromKeyQueue(): Promise<void> {
    const releaseButtons = this.#mouseQueue
      .catch(() => undefined)
      .then(() => this.#releaseButtons())
    this.#mouseQueue = releaseButtons.catch(() => undefined)
    await Promise.all([releaseButtons, this.#releaseKeys()])
  }

  async #releaseButtons(): Promise<void> {
    const buttons = [...this.#pressedButtons].reverse()
    for (const button of buttons) {
      try {
        await this.#releaseButton(button)
      } catch {
        // Best effort: keep releasing other stuck inputs.
      }
    }
  }

  async #releaseKeys(): Promise<void> {
    const keys = [...this.#pressedKeys].reverse()
    for (const code of keys) {
      try {
        await this.#releaseKey(code)
      } catch {
        // Best effort: keep releasing other stuck inputs.
      }
    }
  }

  async #move(message: { x: number; y: number }, display: Size): Promise<void> {
    await this.#driver.move(normalizedToScreen({ x: message.x, y: message.y }, display))
  }

  async #pressKey(code: string): Promise<void> {
    if (this.#pressedKeys.has(code)) {
      return
    }

    this.#driver.validateKey?.(code)
    await this.#driver.keyDown(code)
    this.#pressedKeys.add(code)
  }

  async #releaseKey(code: string): Promise<void> {
    if (!this.#pressedKeys.has(code)) {
      return
    }

    await this.#driver.keyUp(code)
    this.#pressedKeys.delete(code)
  }

  async #pressButton(button: MouseButton): Promise<void> {
    if (this.#pressedButtons.has(button)) {
      return
    }

    await this.#driver.buttonDown(button)
    this.#pressedButtons.add(button)
  }

  async #releaseButton(button: MouseButton): Promise<void> {
    if (!this.#pressedButtons.has(button)) {
      return
    }

    await this.#driver.buttonUp(button)
    this.#pressedButtons.delete(button)
  }

  async #syncKeys(keys: string[]): Promise<void> {
    const remoteKeys = new Set(keys)
    for (const code of [...this.#pressedKeys]) {
      if (!remoteKeys.has(code) && !modifierCodes.includes(code)) {
        await this.#releaseKey(code)
      }
    }
  }

  async #syncModifiers(mods: number): Promise<void> {
    await this.#alignModifier('ShiftLeft', (mods & Mods.Shift) !== 0)
    await this.#alignModifier('ControlLeft', (mods & Mods.Ctrl) !== 0)
    await this.#alignModifier('AltLeft', (mods & Mods.Alt) !== 0)
    await this.#alignModifier('MetaLeft', (mods & Mods.Meta) !== 0)
  }

  async #alignModifier(code: string, shouldBePressed: boolean): Promise<void> {
    if (shouldBePressed) {
      await this.#pressKey(code)
      return
    }

    await this.#releaseKey(code)
  }
}

function createNutDriver(): InputDriver {
  return {
    validateKey(code) {
      toNutKey(code)
    },
    async move(point) {
      await mouse.setPosition(new NutPoint(point.x, point.y))
    },
    async buttonDown(button) {
      await mouse.pressButton(toNutButton(button))
    },
    async buttonUp(button) {
      await mouse.releaseButton(toNutButton(button))
    },
    async scroll(dx, dy) {
      if (dy > 0) {
        await mouse.scrollUp(Math.abs(dy))
      } else if (dy < 0) {
        await mouse.scrollDown(Math.abs(dy))
      }

      if (dx > 0) {
        await mouse.scrollRight(Math.abs(dx))
      } else if (dx < 0) {
        await mouse.scrollLeft(Math.abs(dx))
      }
    },
    async keyDown(code) {
      await keyboard.pressKey(toNutKey(code))
    },
    async keyUp(code) {
      await keyboard.releaseKey(toNutKey(code))
    },
  }
}

function buttonFromWire(button: 0 | 1 | 2): MouseButton {
  return ['left', 'middle', 'right'][button] as MouseButton
}

function toNutButton(button: MouseButton): NutButton {
  switch (button) {
    case 'left':
      return NutButton.LEFT
    case 'middle':
      return NutButton.MIDDLE
    case 'right':
      return NutButton.RIGHT
  }
}

const modifierCodes = ['ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft']

const codeToNutKeyName: Record<string, keyof typeof NutKey> = {
  Backquote: 'Grave',
  Digit1: 'Num1',
  Digit2: 'Num2',
  Digit3: 'Num3',
  Digit4: 'Num4',
  Digit5: 'Num5',
  Digit6: 'Num6',
  Digit7: 'Num7',
  Digit8: 'Num8',
  Digit9: 'Num9',
  Digit0: 'Num0',
  BracketLeft: 'LeftBracket',
  BracketRight: 'RightBracket',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Enter: 'Return',
  ShiftLeft: 'LeftShift',
  ShiftRight: 'RightShift',
  ControlLeft: 'LeftControl',
  ControlRight: 'RightControl',
  AltLeft: 'LeftAlt',
  AltRight: 'RightAlt',
  MetaLeft: 'LeftMeta',
  MetaRight: 'RightMeta',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Numpad0: 'NumPad0',
  Numpad1: 'NumPad1',
  Numpad2: 'NumPad2',
  Numpad3: 'NumPad3',
  Numpad4: 'NumPad4',
  Numpad5: 'NumPad5',
  Numpad6: 'NumPad6',
  Numpad7: 'NumPad7',
  Numpad8: 'NumPad8',
  Numpad9: 'NumPad9',
  NumpadDecimal: 'Decimal',
  NumpadAdd: 'Add',
  NumpadSubtract: 'Subtract',
  NumpadMultiply: 'Multiply',
  NumpadDivide: 'Divide',
  NumpadEnter: 'Enter',
  NumpadEqual: 'NumPadEqual',
}

function toNutKey(code: string): NutKey {
  const keyName = code.startsWith('Key')
    ? code.slice(3)
    : (codeToNutKeyName[code] ?? (code as keyof typeof NutKey))
  const key = NutKey[keyName as keyof typeof NutKey]

  if (key === undefined) {
    throw new Error(`Unsupported key code: ${code}`)
  }

  return key
}
