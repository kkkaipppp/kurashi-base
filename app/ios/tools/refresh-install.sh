#!/bin/zsh
# くらしベースの iPhone アプリ（個人用）を、無料の Apple ID の期限（7日）が切れる前に入れ直す。
# Mac の LaunchAgent（jp.kurashibase.refresh）から毎日呼ばれる。期限まで3日を切っていたときだけ作り直して入れる。
# 使い方：refresh-install.sh [--force]
# 記録（アプリの中の localStorage）は、同じアプリを入れ直しても消えない。
set -u

REPO="/Users/AI開発/kurashi-base"
# iPhone の識別番号は Git に入れず、Mac の ~/.config/kurashi-refresh.env（KB_DEVICE=...）に置く
[[ -f "$HOME/.config/kurashi-refresh.env" ]] && source "$HOME/.config/kurashi-refresh.env"
DEVICE="${KB_DEVICE:?~/.config/kurashi-refresh.env に KB_DEVICE がない}"
BUNDLE="jp.kurashibase.personal"
DD="/tmp/kbdd-dev"
LOG="$HOME/Library/Logs/kurashi-refresh.log"
PROFILES="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export PATH="$HOME/.local/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"

log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# アプリ用の署名の許可（プロファイル）の残り日数。なければ -1
days_left() {
  local best=-1 f exp left
  for f in "$PROFILES"/*(N); do
    security cms -D -i "$f" 2>/dev/null | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null | grep -q "\.${BUNDLE}$" || continue
    exp=$(security cms -D -i "$f" 2>/dev/null | plutil -extract ExpirationDate raw -o - - 2>/dev/null) || continue
    left=$(( ( $(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$exp" +%s) - $(date +%s) ) / 86400 ))
    (( left > best )) && best=$left
  done
  print $best
}

LEFT=$(days_left)
if [[ "${1:-}" != "--force" ]] && (( LEFT >= 3 )); then
  log "まだ大丈夫（残り ${LEFT} 日）"
  exit 0
fi
log "入れ直しを始める（残り ${LEFT} 日）"

# iPhone が見えるか（同じ Wi-Fi・ケーブル）
if ! xcrun devicectl device info details --device "$DEVICE" >/dev/null 2>&1; then
  log "iPhone が見つからない（同じ Wi-Fi にいない・電源が切れている）。明日また試す"
  exit 1
fi

# 古いプロファイルを消して、新しい7日分を作らせる（このアプリとウィジェットの分だけ）
for f in "$PROFILES"/*(N); do
  security cms -D -i "$f" 2>/dev/null | plutil -extract Entitlements.application-identifier raw -o - - 2>/dev/null | grep -q "\.${BUNDLE}\(\.KurashiWidget\)\{0,1\}$" && rm -f "$f"
done

cd "$REPO/app" || { log "リポジトリがない"; exit 1; }
if ! npm run build:app >> "$LOG" 2>&1 || ! npx cap copy ios >> "$LOG" 2>&1; then
  log "画面の書き出しに失敗"
  exit 1
fi
cd ios/App
if ! xcodebuild -project App.xcodeproj -scheme App -configuration Debug -derivedDataPath "$DD" \
     -destination "generic/platform=iOS" -allowProvisioningUpdates build >> "$LOG" 2>&1; then
  log "組み立て・署名に失敗"
  exit 1
fi
if ! xcrun devicectl device install app --device "$DEVICE" "$DD/Build/Products/Debug-iphoneos/App.app" >> "$LOG" 2>&1; then
  log "iPhone への入れ直しに失敗（iPhone のロック中など）。明日また試す"
  exit 1
fi
log "入れ直した（新しい期限まで残り $(days_left) 日）"
