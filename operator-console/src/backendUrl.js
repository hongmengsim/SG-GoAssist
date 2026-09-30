// Which backend the console talks to, and therefore where the operator token is sent.
//
// The `?backend=` parameter used to be trusted as it came, so a crafted link could point the
// console at another server and collect the token the operator typed. It is now accepted only
// for the host that served the page, for this machine, or for an address in an allow-list.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_PORT = 3000;

function parse(text) {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * @param {{param: string|null, page: {protocol: string, hostname: string}, allowed?: string[]}} input
 * @returns {{baseUrl: string, warning: string}}
 */
export function resolveBackend({ param, page, allowed = [] }) {
  const fallback = `${page.protocol}//${page.hostname}:${DEFAULT_PORT}`;
  let baseUrl = fallback;
  let warning = "";
  if (param) {
    const url = parse(param);
    const permitted =
      url &&
      (url.hostname === page.hostname ||
        LOOPBACK.has(url.hostname) ||
        allowed.some((entry) => parse(entry)?.origin === url.origin));
    if (permitted) baseUrl = url.origin;
    else
      warning =
        "The backend address in the link was ignored: it is not this host or an allowed one.";
  }
  const chosen = parse(baseUrl);
  if (chosen?.protocol === "http:" && !LOOPBACK.has(chosen.hostname))
    warning =
      `${warning} The operator token travels over plain http to ${chosen.hostname}; use https outside a trusted network.`.trim();
  return { baseUrl, warning };
}
