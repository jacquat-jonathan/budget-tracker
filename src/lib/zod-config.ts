import { z } from 'zod'

// The production Content-Security-Policy forbids eval (`script-src 'self'`). Zod probes for
// `new Function` before its first object parse to decide whether to compile fast parsers;
// the probe is caught, but the browser still reports a CSP violation. `jitless` skips both
// the probe and the compiled parsers. Must run before any schema is parsed.
z.config({ jitless: true })
