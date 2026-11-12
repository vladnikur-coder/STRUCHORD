#!/usr/bin/env python3
"""B-123 / 0.824: make Safari Web Audio an explicit playback audio session."""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / "STRUCHORD.html"
SW = ROOT / "sw.js"

REPLACEMENTS = [
    (
        "  audioRecoveryPending = false,\n  audioRecoveryLastError = '',",
        "  audioRecoveryPending = false,\n  audioRecoveryLastError = '',\n  audioPlaybackSessionRequested = false,",
        "playback session flag",
    ),
    (
        "function resumeAudioContext() {\n  const ctx = audioCtx;",
        """function activatePlaybackAudioSession(reason) {
  // Safari can report a running AudioContext while keeping a Web-Audio-only
  // page out of the playback media session. Opt in on a real playback gesture.
  audioPlaybackSessionRequested = true;
  const session = typeof navigator !== 'undefined' ? navigator.audioSession : null;
  if (!session) return false; // unsupported browsers keep their existing path
  try {
    const before = String(session.type || 'auto');
    if (before !== 'playback') session.type = 'playback';
    const after = String(session.type || 'auto');
    recordAudioDiagnostic(after === 'playback' ? 'audio-session-playback-set' : 'audio-session-playback-not-set', {
      reason: reason || 'playback', before, after
    });
    return after === 'playback';
  } catch (error) {
    recordAudioDiagnostic('audio-session-playback-error', {
      reason: reason || 'playback', message: error && error.message ? error.message : String(error)
    });
    return false;
  }
}
function resumeAudioContext() {
  const ctx = audioCtx;""",
        "playback session helper",
    ),
    (
        "  const ctx = audioCtx;\n  if (!ctx) return;\n  if (ctx.state === 'running') { audioRecoveryPending = false; return; }\n  recordAudioDiagnostic('resume-requested', { path: 'manager', reason, before: audioDiagnosticContextSnapshot(ctx) });",
        "  const ctx = audioCtx;\n  if (!ctx) return;\n  if (audioPlaybackSessionRequested) activatePlaybackAudioSession(reason || 'resume');\n  if (ctx.state === 'running') { audioRecoveryPending = false; return; }\n  recordAudioDiagnostic('resume-requested', { path: 'manager', reason, before: audioDiagnosticContextSnapshot(ctx) });",
        "reassert playback session on managed resume",
    ),
    (
        "function hardRecoverAudioContext(reason, force) {\n  recordAudioDiagnostic('hard-recovery-started',",
        "function hardRecoverAudioContext(reason, force) {\n  if (audioPlaybackSessionRequested || reason === 'dev') activatePlaybackAudioSession(reason || 'hard-recovery');\n  recordAudioDiagnostic('hard-recovery-started',",
        "playback session on context rebuild",
    ),
    (
        "function audioPreflightForGesture() {\n  const ctx = getAudioContext();",
        "function audioPreflightForGesture() {\n  activatePlaybackAudioSession('user-gesture');\n  const ctx = getAudioContext();",
        "playback session on user gesture",
    ),
    (
        "· ver 0.823",
        "· ver 0.824",
        "HTML version",
    ),
]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    html = HTML.read_text(encoding="utf-8")
    sw = SW.read_text(encoding="utf-8")
    for old, new, label in REPLACEMENTS:
        if args.check:
            if new in html:
                print(f"  ok  {label}: already applied")
                continue
            if html.count(old) != 1:
                raise SystemExit(f"{label}: expected one old anchor, found {html.count(old)}")
            print(f"  ok  {label}: anchor ready")
        else:
            if new in html:
                print(f"  ok  {label}: already applied")
                continue
            html = replace_once(html, old, new, label)
    old_sw, new_sw = "const CACHE_NAME = 'struchord-v823';", "const CACHE_NAME = 'struchord-v824';"
    if args.check:
        if new_sw in sw:
            print("  ok  sw.js cache: already applied")
        elif sw.count(old_sw) == 1:
            print("  ok  sw.js cache: anchor ready")
        else:
            raise SystemExit("sw.js: expected one v823 cache anchor")
        print("ПРОВЕРКА ПРОЙДЕНА")
        return
    if new_sw not in sw:
        sw = replace_once(sw, old_sw, new_sw, "sw.js cache")
    HTML.write_text(html, encoding="utf-8")
    SW.write_text(sw, encoding="utf-8")
    print("ПАТЧ ПРИМЕНЁН: 0.823 -> 0.824 (Safari playback audio session).")


if __name__ == "__main__":
    main()
