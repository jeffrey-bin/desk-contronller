import type React from 'react'
import { useMemo, useRef, useState } from 'react'
import {
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { RTCView } from 'react-native-webrtc'

import { MobileEmbeddedTransport } from '../src/embedded-transport'
import {
  MobileViewerSession,
  type MobileRemoteStream,
  type MobileViewerState,
  type MobileViewerUnsubscribe,
} from '../src/mobile-viewer-session'
import { createNativePeerAdapter } from './native-peer'

type Snapshot = {
  state: MobileViewerState
  stream: MobileRemoteStream | undefined
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = '49831'
const DEFAULT_PAIR_CODE = 'RNM2E2'

export default function App(): React.JSX.Element {
  const [host, setHost] = useState(DEFAULT_HOST)
  const [port, setPort] = useState(DEFAULT_PORT)
  const [pairCode, setPairCode] = useState(DEFAULT_PAIR_CODE)
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: 'idle', stream: undefined })
  const [message, setMessage] = useState('Ready')
  const sessionRef = useRef<MobileViewerSession | undefined>(undefined)
  const unsubscribeRef = useRef<MobileViewerUnsubscribe | undefined>(undefined)

  const canConnect = useMemo(() => {
    return host.trim().length > 0 && port.trim().length > 0 && pairCode.trim().length > 0
  }, [host, pairCode, port])

  async function connect(): Promise<void> {
    if (!canConnect || snapshot.state !== 'idle') {
      return
    }

    const transport = new MobileEmbeddedTransport({
      url: `ws://${host.trim()}:${port.trim()}`,
      role: 'viewer',
      clientId: `rn-${Platform.OS}-viewer-${Date.now()}`,
      logger: {
        warn: setMessage,
      },
    })
    const session = new MobileViewerSession({
      transport,
      peer: createNativePeerAdapter(),
    })

    unsubscribeRef.current = session.onChange((nextSnapshot) => {
      setSnapshot(nextSnapshot)
      setMessage(nextSnapshot.state === 'streaming' ? 'Remote stream attached' : 'Connecting')
    })
    sessionRef.current = session

    try {
      setMessage('Connecting')
      await session.connect(pairCode.trim())
    } catch (error) {
      setSnapshot({ state: 'failed', stream: undefined })
      setMessage(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  async function disconnect(): Promise<void> {
    const session = sessionRef.current
    unsubscribeRef.current?.()
    unsubscribeRef.current = undefined
    sessionRef.current = undefined

    if (session) {
      await session.disconnect()
    }

    setSnapshot({ state: 'idle', stream: undefined })
    setMessage('Disconnected')
  }

  const isBusy = snapshot.state !== 'idle' && snapshot.state !== 'failed'
  const remoteStreamURL = snapshot.stream?.streamURL

  if (remoteStreamURL) {
    return (
      <View style={styles.remoteSurface}>
        <StatusBar hidden />
        <RTCView
          testID="remote-video"
          accessibilityLabel="remote-video"
          objectFit="contain"
          streamURL={remoteStreamURL}
          style={styles.fullscreenVideo}
          {...(Platform.OS === 'android' ? { zOrder: 1 } : {})}
        />
        <View style={styles.remoteOverlay}>
          <Text testID="status-value" accessibilityLabel={snapshot.state} style={styles.remotePill}>
            {snapshot.state}
          </Text>
          <Pressable
            testID="disconnect-button"
            accessibilityRole="button"
            accessibilityLabel="disconnect-button"
            onPress={() => {
              void disconnect()
            }}
            style={({ pressed }) => [
              styles.remoteDisconnectButton,
              pressed && styles.pressedButton,
            ]}
          >
            <Text style={styles.remoteDisconnectText}>Disconnect</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>VIEWER</Text>
        <Text style={styles.title}>Remote desktop</Text>

        <View style={styles.statusRow}>
          <Text style={styles.label}>Status</Text>
          <Text testID="status-value" accessibilityLabel={snapshot.state} style={styles.statusPill}>
            {snapshot.state}
          </Text>
        </View>

        <View style={styles.form}>
          <LabeledInput
            label="Host"
            testID="host-input"
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <LabeledInput
            label="Port"
            testID="port-input"
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
          />
          <LabeledInput
            label="Pair code"
            testID="pair-code-input"
            value={pairCode}
            onChangeText={setPairCode}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            testID="connect-button"
            accessibilityRole="button"
            accessibilityLabel="connect-button"
            disabled={!canConnect || isBusy}
            onPress={() => {
              void connect()
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              (!canConnect || isBusy) && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
          >
            <Text style={styles.primaryButtonText}>Connect</Text>
          </Pressable>
          <Pressable
            testID="disconnect-button"
            accessibilityRole="button"
            accessibilityLabel="disconnect-button"
            onPress={() => {
              void disconnect()
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
          >
            <Text style={styles.secondaryButtonText}>Disconnect</Text>
          </Pressable>
        </View>

        <View testID="stream-card" style={styles.streamCard}>
          {snapshot.stream?.streamURL ? (
            <RTCView
              testID="remote-video"
              accessibilityLabel="remote-video"
              objectFit="contain"
              streamURL={snapshot.stream.streamURL}
              style={styles.remoteVideo}
            />
          ) : (
            <>
              <Text style={styles.streamTitle}>
                {snapshot.stream ? snapshot.stream.id : 'Waiting for remote stream'}
              </Text>
              <Text style={styles.streamMeta}>
                {snapshot.stream ? `${snapshot.stream.videoTracks} video track` : message}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

type LabeledInputProps = {
  label: string
  testID: string
  value: string
  onChangeText(value: string): void
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  keyboardType?: 'default' | 'number-pad' | 'numbers-and-punctuation'
}

function LabeledInput(props: LabeledInputProps): React.JSX.Element {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        testID={props.testID}
        accessibilityLabel={props.testID}
        value={props.value}
        onChangeText={props.onChangeText}
        autoCapitalize={props.autoCapitalize}
        autoCorrect={false}
        keyboardType={props.keyboardType}
        style={styles.input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    flexGrow: 1,
    gap: 18,
    padding: 24,
  },
  kicker: {
    color: '#1456F0',
    fontSize: 16,
    fontWeight: '800',
  },
  title: {
    color: '#070B1C',
    fontSize: 32,
    fontWeight: '800',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusPill: {
    backgroundColor: '#E8EEF6',
    borderRadius: 18,
    color: '#344155',
    fontSize: 16,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: '#344155',
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2E1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0B1023',
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#071022',
    borderRadius: 8,
    minHeight: 52,
    minWidth: 128,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2E1',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 52,
    minWidth: 128,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  disabledButton: {
    backgroundColor: '#CBD5E1',
  },
  pressedButton: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#1F2A3D',
    fontSize: 16,
    fontWeight: '800',
  },
  streamCard: {
    backgroundColor: '#080D1F',
    borderRadius: 8,
    minHeight: 240,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 18,
  },
  remoteVideo: {
    alignSelf: 'stretch',
    aspectRatio: 16 / 10,
    backgroundColor: '#000000',
    borderRadius: 6,
  },
  streamTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  streamMeta: {
    color: '#B8C4D6',
    fontSize: 16,
    marginTop: 8,
  },
  remoteSurface: {
    backgroundColor: '#000000',
    flex: 1,
  },
  fullscreenVideo: {
    backgroundColor: '#000000',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  remoteOverlay: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  remotePill: {
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 18,
    borderWidth: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  remoteDisconnectButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.92)',
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  remoteDisconnectText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
})
