/**
 * NO_PROXY construction for agent containers.
 *
 * OneCLI injects HTTP_PROXY/HTTPS_PROXY pointing at its gateway so outbound
 * API calls get credentials attached. That env is honoured by curl, Node
 * (NODE_USE_ENV_PROXY=1), and the MCP HTTP client alike — including for
 * requests aimed at *other* host-local services.
 *
 * That's a problem for anything the host exposes on its own port, like the
 * Strava MCP proxy: a request to host.docker.internal:<port> gets tunnelled
 * into the OneCLI gateway, which has no route for it, and the connection dies
 * (curl exit 7 / HTTP 000). Exempting the host gateway keeps those requests
 * direct while leaving genuine outbound traffic proxied through OneCLI.
 */

/** Hosts that must always bypass the container's HTTP proxy. */
const ALWAYS_BYPASS = ['host.docker.internal', 'localhost', '127.0.0.1'];

/**
 * Build the NO_PROXY value for a container.
 *
 * @param providerValue NO_PROXY contributed by the provider, if any.
 *                      Entries are preserved; duplicates are collapsed.
 */
export function buildNoProxyValue(providerValue: string | undefined): string {
  const entries = (providerValue ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const host of ALWAYS_BYPASS) {
    if (!entries.includes(host)) entries.push(host);
  }

  return entries.join(',');
}
