import path from 'node:path';
import os from 'node:os';

/**
 * Returns the platform-appropriate root for LBE central state.
 *
 * All paths are user-local — no system-wide directories, no elevated permissions.
 * Env vars are checked first; os.homedir() is the universal fallback.
 *
 * Windows:  %LOCALAPPDATA%\LetterBlack\Sentinel
 *           fallback: <homedir>\AppData\Local\LetterBlack\Sentinel
 * macOS:    ~/Library/Application Support/LetterBlack/Sentinel
 *           fallback: <homedir>/Library/Application Support/LetterBlack/Sentinel
 * Linux:    $XDG_DATA_HOME/LetterBlack/Sentinel
 *           fallback: <homedir>/.local/share/LetterBlack/Sentinel
 */
export function stateRoot() {
    const home = os.homedir();

    if (process.platform === 'win32') {
        const localAppData =
            process.env.LOCALAPPDATA ||
            path.join(home, 'AppData', 'Local');
        return path.join(localAppData, 'LetterBlack', 'Sentinel');
    }

    if (process.platform === 'darwin') {
        const appSupport =
            process.env.HOME
                ? path.join(process.env.HOME, 'Library', 'Application Support')
                : path.join(home, 'Library', 'Application Support');
        return path.join(appSupport, 'LetterBlack', 'Sentinel');
    }

    // Linux / other POSIX
    const xdgData =
        process.env.XDG_DATA_HOME ||
        path.join(home, '.local', 'share');
    return path.join(xdgData, 'LetterBlack', 'Sentinel');
}
