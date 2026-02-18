/**
 * Manual integration test for workspace-manager against real Docker.
 *
 * Prerequisites:
 *   - Docker daemon running
 *   - Run from repo root: pnpm turbo build && npx tsx packages/workspace-manager/scripts/integration-test.ts
 *
 * Tests:
 *   1. Docker ping
 *   2. Create container from node:22, exec `node --version`, destroy
 *   3. Named volume create, persist across container cycles, cleanup
 *   4. Orphaned container pruning
 *   5. Exec with stderr and non-zero exit code
 *   6. Stream exec output
 */

import { createDockerClient, ContainerService, VolumeService } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, err: unknown) {
  failed++;
  console.log(`  ❌ ${name} — ${err instanceof Error ? err.message : String(err)}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testDockerPing(cs: ContainerService) {
  console.log('\n── Test 1: Docker ping ──');
  const reachable = await cs.ping();
  if (reachable) ok('Docker daemon is reachable');
  else fail('Docker daemon is reachable', 'ping returned false');
}

async function testContainerLifecycle(cs: ContainerService) {
  console.log('\n── Test 2: Container lifecycle (create → exec → stop → remove) ──');

  const { containerId, containerName } = await cs.createAndStart({
    sessionId: 'integration-test-1',
    image: 'node:22-slim',
    env: { TEST_VAR: 'hello' },
    binds: [],
    memorySizeMb: 256,
    cpuCount: 1,
    labels: {},
  });

  ok('Container created', `${containerName} (${containerId.slice(0, 12)})`);

  // Check status
  const status = await cs.getStatus(containerId);
  if (status === 'running') ok('Container status is running');
  else fail('Container status is running', `got: ${status}`);

  // Exec node --version
  const nodeResult = await cs.exec(containerId, ['node', '--version']);
  if (nodeResult.exitCode === 0 && nodeResult.stdout.trim().startsWith('v'))
    ok('exec node --version', nodeResult.stdout.trim());
  else fail('exec node --version', `exit=${nodeResult.exitCode} stdout="${nodeResult.stdout}"`);

  // Exec echo $TEST_VAR (env var check)
  const envResult = await cs.exec(containerId, ['/bin/sh', '-c', 'echo $TEST_VAR']);
  if (envResult.stdout.trim() === 'hello')
    ok('Environment variable injected', `TEST_VAR=${envResult.stdout.trim()}`);
  else fail('Environment variable injected', `got: "${envResult.stdout.trim()}"`);

  // Exec with working directory
  const wdResult = await cs.exec(containerId, ['pwd'], { workingDir: '/tmp' });
  if (wdResult.stdout.trim() === '/tmp') ok('Custom working directory', '/tmp');
  else fail('Custom working directory', `got: "${wdResult.stdout.trim()}"`);

  // Stop
  await cs.stop(containerId);
  const stoppedStatus = await cs.getStatus(containerId);
  if (stoppedStatus === 'stopped') ok('Container stopped');
  else fail('Container stopped', `got: ${stoppedStatus}`);

  // Remove
  await cs.remove(containerId);
  const removedStatus = await cs.getStatus(containerId);
  if (removedStatus === 'not_found') ok('Container removed');
  else fail('Container removed', `got: ${removedStatus}`);
}

async function testExecStderrAndNonZero(cs: ContainerService) {
  console.log('\n── Test 3: Exec with stderr and non-zero exit ──');

  const { containerId } = await cs.createAndStart({
    sessionId: 'integration-test-2',
    image: 'node:22-slim',
    env: {},
    binds: [],
    memorySizeMb: 256,
    cpuCount: 1,
    labels: {},
  });

  // Command that writes to stderr and exits non-zero
  const result = await cs.exec(containerId, [
    '/bin/sh',
    '-c',
    'echo "error msg" >&2 && exit 42',
  ]);
  if (result.exitCode === 42) ok('Non-zero exit code captured', `exit=${result.exitCode}`);
  else fail('Non-zero exit code captured', `expected 42, got ${result.exitCode}`);

  if (result.stderr.includes('error msg'))
    ok('Stderr captured', result.stderr.trim());
  else fail('Stderr captured', `got: "${result.stderr.trim()}"`);

  await cs.remove(containerId);
}

async function testExecStream(cs: ContainerService) {
  console.log('\n── Test 4: Streaming exec output ──');

  const { containerId } = await cs.createAndStart({
    sessionId: 'integration-test-3',
    image: 'node:22-slim',
    env: {},
    binds: [],
    memorySizeMb: 256,
    cpuCount: 1,
    labels: {},
  });

  const chunks: string[] = [];
  const exitCode = await cs.execStream(
    containerId,
    ['/bin/sh', '-c', 'echo line1 && echo line2 && echo line3'],
    (chunk) => chunks.push(chunk),
    () => {},
  );

  const combined = chunks.join('');
  if (exitCode === 0 && combined.includes('line1') && combined.includes('line3'))
    ok('Streaming exec captured output', `${chunks.length} chunk(s), exit=0`);
  else fail('Streaming exec', `exit=${exitCode}, chunks="${combined}"`);

  await cs.remove(containerId);
}

async function testNamedVolumes(cs: ContainerService, vs: VolumeService) {
  console.log('\n── Test 5: Named volume persistence ──');

  const volumeName = 'fleetwide-test-volume';

  // Ensure volume
  await vs.ensureVolume(volumeName);
  ok('Volume created', volumeName);

  // Ensure is idempotent
  await vs.ensureVolume(volumeName);
  ok('Volume ensure is idempotent');

  // Create container with the volume mounted, write a file
  const { containerId: c1 } = await cs.createAndStart({
    sessionId: 'integration-test-vol-1',
    image: 'node:22-slim',
    env: {},
    binds: [`${volumeName}:/data:rw`],
    memorySizeMb: 256,
    cpuCount: 1,
    labels: {},
  });

  await cs.exec(c1, ['/bin/sh', '-c', 'echo "persisted" > /data/test.txt']);
  ok('File written to volume');
  await cs.remove(c1);

  // Create a NEW container with same volume, read the file
  const { containerId: c2 } = await cs.createAndStart({
    sessionId: 'integration-test-vol-2',
    image: 'node:22-slim',
    env: {},
    binds: [`${volumeName}:/data:rw`],
    memorySizeMb: 256,
    cpuCount: 1,
    labels: {},
  });

  const readResult = await cs.exec(c2, ['cat', '/data/test.txt']);
  if (readResult.stdout.trim() === 'persisted')
    ok('Volume data persisted across containers');
  else fail('Volume data persisted', `got: "${readResult.stdout.trim()}"`);

  await cs.remove(c2);

  // Cleanup volume
  const docker = createDockerClient();
  await docker.getVolume(volumeName).remove();
  ok('Test volume cleaned up');
}

async function testOrphanPruning(cs: ContainerService) {
  console.log('\n── Test 6: Orphaned container pruning ──');

  // Create 2 "orphaned" containers
  await cs.createAndStart({
    sessionId: 'orphan-test-1',
    image: 'node:22-slim',
    env: {},
    binds: [],
    memorySizeMb: 128,
    cpuCount: 1,
    labels: {},
  });
  await cs.createAndStart({
    sessionId: 'orphan-test-2',
    image: 'node:22-slim',
    env: {},
    binds: [],
    memorySizeMb: 128,
    cpuCount: 1,
    labels: {},
  });
  ok('Created 2 orphan containers');

  // Prune them
  const pruned = await cs.pruneOrphaned();
  if (pruned >= 2) ok('Pruned orphaned containers', `count=${pruned}`);
  else fail('Pruned orphaned containers', `expected ≥2, got ${pruned}`);
}

async function testResourceLimits(cs: ContainerService) {
  console.log('\n── Test 7: Resource limits enforced ──');

  const { containerId } = await cs.createAndStart({
    sessionId: 'integration-test-limits',
    image: 'node:22-slim',
    env: {},
    binds: [],
    memorySizeMb: 256,
    cpuCount: 1,
    labels: {},
  });

  // Verify limits via container inspect
  const docker = createDockerClient();
  const info = await docker.getContainer(containerId).inspect();
  const mem = info.HostConfig.Memory;
  const cpu = info.HostConfig.NanoCpus;

  if (mem === 256 * 1024 * 1024)
    ok('Memory limit set', `${mem / 1024 / 1024} MB`);
  else fail('Memory limit set', `expected ${256 * 1024 * 1024}, got ${mem}`);

  if (cpu === 1_000_000_000)
    ok('CPU limit set', `${cpu / 1_000_000_000} CPU`);
  else fail('CPU limit set', `expected 1000000000, got ${cpu}`);

  await cs.remove(containerId);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🐳 Workspace Manager — Integration Tests\n');
  console.log('Requires: Docker daemon running\n');

  const docker = createDockerClient();
  const cs = new ContainerService(docker);
  const vs = new VolumeService(docker);

  try {
    await testDockerPing(cs);
    await testContainerLifecycle(cs);
    await testExecStderrAndNonZero(cs);
    await testExecStream(cs);
    await testNamedVolumes(cs, vs);
    await testOrphanPruning(cs);
    await testResourceLimits(cs);
  } catch (err) {
    console.error('\n💥 Unexpected error:', err);
    failed++;
  }

  // Cleanup: ensure no leftover containers
  try {
    await cs.pruneOrphaned();
  } catch { /* best effort */ }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check Docker is running and node:22-slim is pullable.');
    process.exit(1);
  } else {
    console.log('\n🎉 All integration tests passed!');
  }
}

main();
