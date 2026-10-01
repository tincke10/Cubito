import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { DeviceRegistry } from '../runtime/device-registry'
import { RuntimeMobileNotificationController } from '../runtime/runtime-mobile-notification-controller'
import { PushUnregisterOutbox } from '../runtime/push/push-unregister-outbox'
import { createPushHostKeypair } from '../runtime/push/push-host-challenge-fixtures'
import { acquireProfileStateMaintenance } from '../persistence/profile-state/profile-state-access'
import { profileStateAccessPaths } from '../persistence/profile-state/profile-state-access-owner'

const state = vi.hoisted(() => ({
  root: '',
  controller: null as RuntimeMobileNotificationController | null,
  registry: null as DeviceRegistry | null,
  rpcStarted: false,
  automationStart: vi.fn(),
  automationStop: vi.fn(),
  browserProvider: vi.fn(async () => null),
  register: vi.fn(async () => ({ ok: true, registrationId: 'headless-registration' })),
  send: vi.fn(async () => ({ ok: true, results: [] }))
}))
vi.mock('./orcad-app-paths', () => ({
  resolveOrcadInstallRoot: () => state.root,
  resolveOrcadPath: () => state.root,
  resolveUserDataPath: () => state.root
}))
vi.mock('./orcad-browser-provider', () => ({ resolveOrcadBrowserProvider: state.browserProvider }))
vi.mock('./orcad-instance-lock', () => ({ acquireOrcadInstanceLock: () => ({ release() {} }) }))
vi.mock('./orcad-daemon-supervision', () => ({
  startOrcadDaemon: async () => {},
  stopOrcadDaemon: async () => {}
}))
vi.mock('./orcad-automation-service', () => ({
  createOrcadAutomationService: () => ({ start: state.automationStart, stop: state.automationStop })
}))
vi.mock('./orcad-health', () => ({ collectOrcadHealth: async () => ({}) }))
vi.mock('../daemon/daemon-init', () => ({ daemonOwnsFreshPersistentPtys: () => false }))
vi.mock('../ipc/pty', () => ({
  registerHeadlessPtyRuntime: async () => {},
  getLocalPtyProvider: () => null,
  getSshPtyProvider: () => null
}))
vi.mock('./orcad-profile-state-startup', () => ({
  createOrcadProfileStateStartup: async () => ({
    store: {
      getSettings: () => ({}),
      flushFinalOrThrowAsync: async () => {},
      freezeWritesAsync: async () => {}
    },
    authority: {
      backend: 'sqlite',
      classification: 'neither',
      authority_mode: 'sqlite-candidate',
      runtime: 'orcad',
      migrated: false
    }
  })
}))
vi.mock('../orca-profiles/profile-index-store', () => ({
  initOrcaProfilePaths() {},
  ensureActiveOrcaProfile: () => ({
    dataFile: join(state.root, 'profile.json'),
    stateDatabaseFile: join(state.root, 'profile-state.db'),
    profile: { id: 'headless-profile' }
  })
}))
vi.mock('../ssh/ssh-host-key-store', () => ({ initSshHostKeyStoreFile() {} }))
vi.mock('../server/serve-readiness', () => ({
  ServeReadinessPublisher: class {
    async publish() {}
  }
}))
vi.mock('../runtime/orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'headless-runtime'
    }
    rehydrateClientHostedBrowserPages() {}
    async refreshRestoredOrchestrationAuthority() {
      expect(state.automationStart).not.toHaveBeenCalled()
    }
    async reconcileLegacyWorkerTerminals() {}
    setMobilePushRegistrar(
      registrar: Parameters<RuntimeMobileNotificationController['setPushRegistrar']>[0]
    ) {
      state.controller!.setPushRegistrar(registrar)
    }
    onNotificationDispatched(
      listener: Parameters<RuntimeMobileNotificationController['onDispatched']>[0]
    ) {
      return state.controller!.onDispatched(listener)
    }
  }
}))
vi.mock('../runtime/runtime-rpc', () => ({
  OrcaRuntimeRpcServer: class {
    async start() {
      state.rpcStarted = true
    }
    async stop() {
      state.rpcStarted = false
    }
    getWebSocketEndpoint() {
      return null
    }
    getE2EEKeypair() {
      expect(state.rpcStarted).toBe(true)
      return createPushHostKeypair()
    }
    getDeviceRegistry() {
      return state.registry
    }
    getPushUnregisterOutbox() {
      return new PushUnregisterOutbox(state.root)
    }
    setOnPushUnregisterQueued() {}
  }
}))
vi.mock('../runtime/push/push-gateway-client', () => ({
  PushGatewayClient: class {
    registerDevice = state.register
    send = state.send
    async deleteDevice() {
      return { deleted: true, retryable: false }
    }
  }
}))

// Why: startup resolves the secret key; an explicit one keeps tests off the macOS Keychain.
vi.stubEnv('CUBITO_SECRET_KEY', 'ab'.repeat(32))

afterEach(() => {
  rmSync(state.root, { recursive: true, force: true })
  vi.clearAllMocks()
})

it('refuses recovery overlap before initializing the browser provider or runtime', async () => {
  state.root = mkdtempSync(join(tmpdir(), 'orca-headless-recovery-'))
  const maintenance = acquireProfileStateMaintenance(state.root)
  const { startOrcad } = await import('./orcad-entry')
  try {
    await expect(startOrcad({ noPairing: true, json: true })).rejects.toThrow()
    expect(state.browserProvider).not.toHaveBeenCalled()
    expect(state.rpcStarted).toBe(false)
  } finally {
    maintenance.release()
  }
})

it('never starts the push service: Cubito has no mobile companion and push.onorca.dev stays untouched', async () => {
  state.root = mkdtempSync(join(tmpdir(), 'orca-headless-push-'))
  state.controller = new RuntimeMobileNotificationController()
  state.registry = new DeviceRegistry(state.root)
  const phone = state.registry.addDevice('headless-phone', 'mobile')
  const { startOrcad } = await import('./orcad-entry')
  const host = await startOrcad({ noPairing: true, json: true })
  try {
    // Why: with no registrar the controller degrades to a clean "not registered" answer.
    expect(
      await state.controller.registerPushDevice({
        deviceId: phone.deviceId,
        platform: 'android',
        token: 'test-token',
        filter: { onlyWhenDesktopAway: true }
      })
    ).toEqual({ registered: false, reason: 'gateway_unreachable' })
    expect(await state.controller.testPushDevice(phone.deviceId)).toEqual({
      accepted: false,
      reason: 'unavailable'
    })
    expect(state.controller.getListenerCount()).toBe(0)
    state.controller.dispatch({
      type: 'notification',
      source: 'agent-task-complete',
      title: 'QA',
      body: 'QA'
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(state.register).not.toHaveBeenCalled()
    expect(state.send).not.toHaveBeenCalled()
  } finally {
    await host.stop()
  }
  expect(readdirSync(profileStateAccessPaths(state.root).participants)).toEqual([])
  acquireProfileStateMaintenance(state.root).release()
})

it('starts automations after recovery and stops them on shutdown', async () => {
  state.root = mkdtempSync(join(tmpdir(), 'orca-headless-automations-'))
  state.controller = new RuntimeMobileNotificationController()
  state.registry = new DeviceRegistry(state.root)
  const { startOrcad } = await import('./orcad-entry')
  const host = await startOrcad({ noPairing: true, json: true })
  expect(state.automationStart).toHaveBeenCalledTimes(1)
  expect(state.automationStop).not.toHaveBeenCalled()
  await host.stop()
  expect(state.automationStop).toHaveBeenCalledTimes(1)
})

it('releases admission when host setup fails before a runtime exists', async () => {
  state.root = mkdtempSync(join(tmpdir(), 'orca-headless-setup-failure-'))
  state.browserProvider.mockRejectedValueOnce(new Error('browser setup failed'))
  const { startOrcad } = await import('./orcad-entry')
  await expect(startOrcad()).rejects.toThrow('browser setup failed')
  expect(readdirSync(profileStateAccessPaths(state.root).participants)).toEqual([])
  acquireProfileStateMaintenance(state.root).release()
})
