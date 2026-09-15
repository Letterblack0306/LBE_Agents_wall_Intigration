// src/cli/parseArgs.js
// Command-line argument parser


import { PUBLIC_HELP, ADVANCED_COMMANDS } from './public-strings.js';
export function parseArgs(argv) {
    // argv should already have node and script removed
    if (argv.length === 0) {
        return { command: 'help', opts: {} };
    }

    const command = argv[0];
    const opts = { _: [] };

    for (let i = 1; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].substring(2);
            // Handle --key=value format
            if (key.includes('=')) {
                const [k, v] = key.split('=');
                opts[k] = v;
            } else {
                const nextArg = argv[i + 1];
                if (!nextArg || nextArg.startsWith('-')) {
                    opts[key] = true;
                } else {
                    opts[key] = nextArg;
                    i++;
                }
            }
        } else if (argv[i].startsWith('-')) {
            const key = argv[i].substring(1);
            const nextArg = argv[i + 1];
            if (!nextArg || nextArg.startsWith('-')) {
                opts[key] = true;
            } else {
                opts[key] = nextArg;
                i++;
            }
        } else {
            opts._.push(argv[i]);
        }
    }

    return { command, opts };
}

function printPublicHelp() {
    const D='\x1b[2m',B='\x1b[1m',RB='\x1b[41m',Y='\x1b[33m',G='\x1b[90m',N='\x1b[0m',W='\x1b[38;2;233;233;239m';

    let out = '\n  '+W+B+'LBE'+N+' \u2014 LetterBlack Sentinel\n';
    out += '  '+G+PUBLIC_HELP.tagline+N+'\n\n';
    out += '  '+G+'Install:'+N+'  '+PUBLIC_HELP.install+'\n';
    out += '  '+G+'Run:'+N+'     '+PUBLIC_HELP.run+'\n\n';
    out += '  '+B+'Menu options:'+N+'\n';

    for (let i = 0; i < PUBLIC_HELP.menu.length; i++) {
        const m = PUBLIC_HELP.menu[i];
        const highlight = i === 0 ? RB : '';
        const endHighlight = i === 0 ? N : '';
        const label = highlight + ' ' + m.label + ' ' + endHighlight;
        out += '    ' + label.padEnd(22) + m.desc + '\n';
    }

    out += '\n  '+G+PUBLIC_HELP.directNote+N+'  lbe <command>\n';
    out += '  '+G+PUBLIC_HELP.advancedNote+N+'                     '+PUBLIC_HELP.advancedHint+'\n\n';
    out += '  '+G+'https://github.com/Letterblack0306/LetterBlack-Sentinel'+N+'\n';
    console.log(out);
}

function printAdvancedHelp(version) {
    let commands = '';
    for (const c of ADVANCED_COMMANDS) {
        commands += `  ${c.cmd.padEnd(22)}${c.desc}\n`;
    }

    console.log(`
╔═════════════════════════════════════════════════════════════╗
║       LetterBlack Sentinel — Advanced CLI Reference       ║
║     Local-first execution governance SDK  v${version.padEnd(12)}║
╚═════════════════════════════════════════════════════════════╝

USAGE:
  lbe [command] [options]

COMMANDS:
${commands}
OPTIONS:
  --in              Input file (JSON proposal)
  --config          Policy config file (default: ./.lbe/config/policy.default.json)
  --policy          Alias for --config
  --policy-sig      Policy signature file (default: ./.lbe/config/policy.sig.json)
  --policy-state    Policy monotonic state file (default: ./.lbe/data/policy.state.json)
  --policy-unsigned-ok  Allow unsigned policy (dev-only; default: false)
  --policy-key-id   Signer keyId for policy-sign (default: policy-signer-v1-2026Q1)
  --secret-key-file Secret key for policy-sign (default: ./.lbe/keys/secret.key)
  --data-dir        Data directory for health checks (default: ./.lbe/data)
  --nonce-db        Nonce DB path for health checks
  --rate-db         Rate-limit DB path for health checks
  --keys-store      Trusted keys store (default: ./.lbe/config/keys.json)
  --pub-key         Public key for verification (Ed25519 base64)
  --pub-key-file    Legacy single-key file path (fallback mode)
  --integrity-strict  Fail verify/dryrun/run if integrity check fails
  --integrity-manifest Integrity manifest path (default: ./.lbe/config/integrity.manifest.json)
  --manifest        Manifest path override for integrity-check
  --out             Output path for integrity-generate
  --audit           Audit log file (default: ./.lbe/data/audit.log.jsonl)
  --root            Project root for local policy commands (default: cwd)
  --effect          Local rule effect: allow or deny
  --type            Local rule type: path or command
  --pattern         Local rule glob/pattern
  --from            Required human-readable rule provenance
  --json            JSON output (default: true)
  --fail-fast       Stop at first audit integrity error (default: true)
  --max             Max audit entries to process (optional)
  --version         Show version
  --help            Show this help message

EXAMPLES:
  lbe run --in proposal.json
  cat proposal.json | lbe run
  lbe policy-sign --config ./.lbe/config/policy.default.json --policy-sig ./.lbe/config/policy.sig.json
  lbe integrity-generate --out ./.lbe/config/integrity.manifest.json
  lbe integrity-check --integrity-strict --manifest ./.lbe/config/integrity.manifest.json
  lbe audit-verify --audit ./.lbe/data/audit.log.jsonl

For more info, visit: https://github.com/Letterblack0306/LetterBlack-Sentinel
`);
}

export function printHelp(version = 'unknown', opts = {}) {
    if (opts.advanced) {
        printAdvancedHelp(version);
        return;
    }
    printPublicHelp();
}
