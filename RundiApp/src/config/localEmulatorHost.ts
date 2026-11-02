export function resolveLocalEmulatorHost(host: string, platform: string): string {
  return platform === 'android' && (host === 'localhost' || host === '127.0.0.1')
    ? '10.0.2.2'
    : host;
}

export function buildFunctionsEmulatorBaseUrl(
  projectId: string,
  region: string,
  host: string,
  platform: string,
): string {
  return `http://${resolveLocalEmulatorHost(host, platform)}:5001/${projectId}/${region}`;
}
