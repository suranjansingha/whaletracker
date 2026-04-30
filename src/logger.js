'use strict';
/**
 * Logger — colour-coded output via plain ANSI codes (no chalk dependency).
 */

const c = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  magenta: '\x1b[35m',
};

function ts() {
  return `${c.dim}[${new Date().toISOString()}]${c.reset}`;
}

const logger = {
  info:    (...a) => console.log(ts(), `${c.cyan}INFO ${c.reset}`, ...a),
  warn:    (...a) => console.warn(ts(), `${c.yellow}WARN ${c.reset}`, ...a),
  error:   (...a) => console.error(ts(), `${c.red}ERROR${c.reset}`, ...a),
  success: (...a) => console.log(ts(), `${c.green}OK   ${c.reset}`, ...a),
  box(msg) {
    const line = '═'.repeat(msg.length + 4);
    console.log(`${c.magenta}╔${line}╗${c.reset}`);
    console.log(`${c.magenta}║  ${msg}  ║${c.reset}`);
    console.log(`${c.magenta}╚${line}╝${c.reset}`);
  },
};

module.exports = { logger };
