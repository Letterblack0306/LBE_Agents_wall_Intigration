// src/cli/logo.js
// LBE brand logo — block-art ANSI renderer
// Visual reference: assets/preview.html
// Design language:
//   # = red background block   (outer frame)
//   * = white foreground block (inner frame + LBE mark)
//   _ | = dim border chars
//   space = terminal background (black)

// Brand colors
const RED_BG = '\x1b[41m';
const RED = '\x1b[38;2;239;75;75m';
const WHITE = '\x1b[38;2;233;233;239m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Compact block-art logo (~13 lines tall)
// # = red bg block  * = white block  _ | = dim border
const LOGO = [
    '  _____________________________________________________________ ',
    ' |                                                             |',
    ' |      ###############################################        |',
    ' |      ##                                       *****##        |',
    ' |      ##  ******  ####  *******                *****##        |',
    ' |      ##  **  **  ####  **   **                *****##        |',
    ' |      ##  ******  ####  *******                *****##        |',
    ' |      ##  **  **  ####  **   **                *****##        |',
    ' |      ##  ******  ####  *******                *****##        |',
    ' |      ##                                       *****##        |',
    ' |      ###############################################        |',
    ' |                                                             |',
    ' |_____________________________________________________________|',
];

/**
 * Render one character to its ANSI block.
 * # -> red background    * -> white text
 * _ | -> dim gray        space -> transparent
 */
function renderChar(ch) {
    if (ch === '#') return `${RED_BG} ${RESET}`;
    if (ch === '*') return `${WHITE}\u2588${RESET}`;
    if (ch === ' ') return ' ';
    return `${DIM}${ch}${RESET}`;
}

export function renderLogo() {
    return LOGO.map(line => [...line].map(renderChar).join(''));
}

/**
 * Full terminal header: outer box + block-art logo + text labels.
 */
export function renderHeader({ version }) {
    const w = 66;
    const topBorder = `${WHITE}\u2554${'\u2550'.repeat(w)}\u2557${RESET}`;
    const bottomBorder = `${WHITE}\u255A${'\u2550'.repeat(w)}\u255D${RESET}`;
    const blankLine = `${WHITE}\u2551${' '.repeat(w)}\u2551${RESET}`;
    const pad = (s, n) => { const v = String(s); return v + ' '.repeat(Math.max(0, n - v.length)); };

    const logoLines = renderLogo();
    const lines = ['', topBorder, blankLine];

    for (const l of logoLines) {
        // eslint-disable-next-line no-control-regex, no-useless-escape
        const plain = l.replace(/[\[0-9;]*m/g, '');
        const padded = plain.length < w ? l + ' '.repeat(w - plain.length) : plain.slice(0, w);
        lines.push(`${WHITE}\u2551${RESET}${padded}${WHITE}\u2551${RESET}`);
    }

    lines.push(blankLine);

    const title = `${BOLD}${WHITE}LetterBlack Sentinel${RESET}`;
    lines.push(`${WHITE}\u2551${RESET}  ${title}${' '.repeat(w - 2 - 20)}${WHITE}\u2551${RESET}`);

    const tag = `${WHITE}Local Execution Governance${RESET}`;
    lines.push(`${WHITE}\u2551${RESET}  ${tag}${' '.repeat(w - 2 - 27)}${WHITE}\u2551${RESET}`);

    lines.push(`${WHITE}\u2551${RESET}  ${DIM}v${pad(version, 16)}${RESET}${' '.repeat(w - 2 - 18)}${WHITE}\u2551${RESET}`);

    lines.push(blankLine);
    lines.push(bottomBorder);
    return lines;
}

export function renderStatusBar({ root, mode, proofStatus, cloudStatus }) {
    const modeIndicator = mode === 'enforce'
        ? `${RED_BG} ${RESET}${RED} enforce${RESET}`
        : mode === 'observe'
            ? `${RED_BG} ${RESET} observe`
            : '\u25CB not initialized';

    const proofIndicator = proofStatus && proofStatus !== 'not found'
        ? `${proofStatus === 'PASS' ? '\u2713' : '\u25CB'} ${proofStatus}`
        : '\u25CB no proof';

    const cloudIndicator = cloudStatus === 'connected'
        ? `${RED_BG} ${RESET} cloud`
        : '\u25CB local';

    const line = `  ${DIM}${root}${RESET}  |  ${modeIndicator}  |  ${proofIndicator}  |  ${cloudIndicator}`;
    return ['', line, ''];
}

export function colorize(text, color = WHITE, bold = false) {
    return `${bold ? BOLD : ''}${color}${text}${RESET}`;
}

export { RED, RED_BG, WHITE, BOLD, DIM, RESET };