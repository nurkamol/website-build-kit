#!/usr/bin/env bash
# Install the kit's skills and commands for Claude Code.
#
#   ./install.sh          symlink into ~/.claude  (updates as you pull)
#   ./install.sh --copy   copy instead of symlink
set -euo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"
MODE="${1:---link}"

mkdir -p "$DEST/skills" "$DEST/commands"

install_one() {
  local src="$1" dst="$2"
  rm -rf "$dst"
  if [ "$MODE" = "--copy" ]; then cp -R "$src" "$dst"; else ln -s "$src" "$dst"; fi
  printf '  %-22s %s\n' "$(basename "$dst")" "$([ "$MODE" = "--copy" ] && echo copied || echo linked)"
}

echo "skills →  $DEST/skills"
for s in "$KIT"/skills/*/; do install_one "${s%/}" "$DEST/skills/$(basename "$s")"; done

echo "commands →  $DEST/commands"
for c in "$KIT"/commands/*.md; do install_one "$c" "$DEST/commands/$(basename "$c")"; done

echo
echo "Done. Start a build with /website-build, or just ask for a website —"
echo "the skill's description should match."
