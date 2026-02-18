import Docker from 'dockerode';

export function createDockerClient(socketPath = '/var/run/docker.sock'): Docker {
  return new Docker({ socketPath });
}
