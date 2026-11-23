#!/bin/bash
# Test de la conversation vocale dans le simulateur iOS (runner GitHub « xcode-27 ») :
# l'appli de test (WKWebView, comme Brave) ouvre la page Emma ; un micro virtuel (BlackHole)
# rejoue la réponse enregistrée en boucle ; harness.js enchaîne les réponses et renvoie le journal.
set -uo pipefail
WS="${GITHUB_WORKSPACE:-$(pwd)}"
HERE="$WS/ci/ios-sim"
OUT="$WS/ios-out"
OLD_REF="${OLD_REF:-7c73df7}"
mkdir -p "$OUT"
step() { echo; echo "=== $(date +%H:%M:%S) $*"; }

step "Construction (nouvelle version et $OLD_REF)"
cd "$WS"
npm ci --no-audit --no-fund > "$OUT/npm.log" 2>&1 || { tail -30 "$OUT/npm.log"; exit 1; }
npx vite build > "$OUT/build-new.log" 2>&1 || { tail -30 "$OUT/build-new.log"; exit 1; }
cp -R dist /tmp/dist-new
cp "$HERE/user-says.wav" /tmp/dist-new/__harness-user-says.wav
git worktree add /tmp/old "$OLD_REF" > /dev/null 2>&1
ln -s "$WS/node_modules" /tmp/old/node_modules
(cd /tmp/old && npx vite build > "$OUT/build-old.log" 2>&1) || { tail -30 "$OUT/build-old.log"; exit 1; }
cp -R /tmp/old/dist /tmp/dist-old
node "$HERE/serve.mjs" /tmp/dist-new 4317 > "$OUT/serve-new.log" 2>&1 &
node "$HERE/serve.mjs" /tmp/dist-old 4318 > "$OUT/serve-old.log" 2>&1 &
sleep 1
curl -sf -o /dev/null http://localhost:4317/ && echo "serveurs prêts"

step "Micro virtuel (BlackHole) et outils"
brew install --quiet --cask blackhole-2ch blackhole-16ch > "$OUT/brew.log" 2>&1 || tail -20 "$OUT/brew.log"
brew install --quiet switchaudio-osx sox xcodegen coreutils >> "$OUT/brew.log" 2>&1 || tail -20 "$OUT/brew.log"
sudo killall coreaudiod 2>/dev/null || sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod || true
sleep 8
SwitchAudioSource -a
SwitchAudioSource -t input -s "BlackHole 2ch" || true
SwitchAudioSource -t output -s "BlackHole 16ch" || true
echo "entrée : $(SwitchAudioSource -c -t input) · sortie : $(SwitchAudioSource -c -t output)"

step "Autorisation du micro pour le simulateur (TCC de l'hôte)"
for db in "$HOME/Library/Application Support/com.apple.TCC/TCC.db" "/Library/Application Support/com.apple.TCC/TCC.db"; do
  for client in com.apple.iphonesimulator com.apple.CoreSimulator.SimulatorTrampoline com.apple.CoreSimulator.CoreSimulatorService; do
    sudo sqlite3 "$db" "INSERT OR REPLACE INTO access (service, client, client_type, auth_value, auth_reason, auth_version) VALUES ('kTCCServiceMicrophone', '$client', 0, 2, 4, 1);" 2>&1 | head -2
  done
done

step "Simulateur"
xcrun simctl list runtimes > "$OUT/runtimes.txt"
xcrun simctl list devicetypes > "$OUT/devicetypes.txt"
RUNTIME=$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
rs = [r for r in json.load(sys.stdin)["runtimes"] if r.get("platform") == "iOS" and r.get("isAvailable")]
rs.sort(key=lambda r: [int(x) for x in r["version"].split(".")])
pick = [r for r in rs if r["version"].startswith("27.0")] or rs
print(pick[0]["identifier"] if pick[0]["version"].startswith("27.0") else rs[-1]["identifier"])')
UDID=""
for dt in iPhone-12-mini iPhone-13-mini iPhone-17e iPhone-17; do
  UDID=$(xcrun simctl create "Test $dt" "com.apple.CoreSimulator.SimDeviceType.$dt" "$RUNTIME" 2>/dev/null) && { echo "appareil : $dt · $RUNTIME · $UDID"; break; }
done
[ -n "$UDID" ] || { echo "aucun simulateur créé"; exit 1; }
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b > /dev/null
open "$(xcode-select -p)/Applications/Simulator.app" --args -CurrentDeviceUDID "$UDID" || true
sleep 5
xcrun simctl privacy 2>&1 | head -40 > "$OUT/privacy-help.txt"

step "Appli de test"
cd "$HERE"
xcodegen generate > "$OUT/xcodegen.log" 2>&1 || { cat "$OUT/xcodegen.log"; exit 1; }
xcodebuild -project Harness.xcodeproj -target Harness -sdk iphonesimulator -configuration Debug ONLY_ACTIVE_ARCH=YES ARCHS=arm64 CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- SYMROOT=/tmp/hb build > "$OUT/xcodebuild.log" 2>&1 || { tail -40 "$OUT/xcodebuild.log"; exit 1; }
APP=/tmp/hb/Debug-iphonesimulator/Harness.app
codesign -dv "$APP" 2>&1 | head -3
xcrun simctl install "$UDID" "$APP"
SIMTCC="$HOME/Library/Developer/CoreSimulator/Devices/$UDID/data/Library/TCC/TCC.db"
grant_db() {
  sqlite3 "$SIMTCC" ".schema access" 2>&1 | head -2
  for svc in kTCCServiceMicrophone kTCCServiceSpeechRecognition; do
    sqlite3 "$SIMTCC" "INSERT OR REPLACE INTO access (service, client, client_type, auth_value, auth_reason, auth_version) VALUES ('$svc', 'com.teatime.harness', 0, 2, 2, 1);" 2>&1 | head -2
  done
  sqlite3 "$SIMTCC" "SELECT service, client, auth_value FROM access;" 2>&1 | head
}
if xcrun simctl privacy "$UDID" grant microphone com.teatime.harness; then
  grant_db
else
  # Repli : écriture directe dans la base d'autorisations du simulateur, appareil arrêté.
  ls -la "$(dirname "$SIMTCC")" 2>&1 | head
  xcrun simctl shutdown "$UDID"
  grant_db
  xcrun simctl boot "$UDID"
  xcrun simctl bootstatus "$UDID" -b > /dev/null
fi

step "Journal système du simulateur (WebKit, audio)"
xcrun simctl spawn "$UDID" log stream --style compact --level default \
  --predicate 'subsystem BEGINSWITH "com.apple.WebKit" OR subsystem BEGINSWITH "com.apple.coreaudio" OR subsystem == "com.apple.speech.localspeechrecognition" OR process == "Harness"' \
  > "$OUT/syslog.txt" 2>&1 &
LOGPID=$!

step "Réponse enregistrée rejouée en boucle dans le micro virtuel"
( while true; do AUDIODEV="BlackHole 2ch" play -q "$HERE/user-says.wav" 2>>"$OUT/play.log"; sleep 1; done ) &
PLAYPID=$!
sleep 2
echo "niveau reçu par l'entrée BlackHole 2ch (côté Mac, 8 s) :"
sox -q -t coreaudio "BlackHole 2ch" -n trim 0 8 stat 2>&1 | grep -E "RMS +amplitude|Maximum amplitude|Length" || echo "(mesure impossible)"

run() {
  local label="$1" url="$2" settings="$3" mode="${4:-}"
  step "Essai « $label » : $url · réglages $settings"
  local data hlog
  data=$(xcrun simctl get_app_container "$UDID" com.teatime.harness data)
  hlog="$data/Documents/harness.log"
  rm -f "$hlog"
  SIMCTL_CHILD_HARNESS_URL="$url" SIMCTL_CHILD_HARNESS_SETTINGS="$settings" SIMCTL_CHILD_HARNESS_TURNS=3 SIMCTL_CHILD_HARNESS_TIMEOUT=420 SIMCTL_CHILD_HARNESS_MODE="$mode" \
    xcrun simctl launch --terminate-running-process --stdout="$OUT/$label.out" --stderr="$OUT/$label.err" "$UDID" com.teatime.harness
  local t=0
  while [ $t -lt 470 ] && ! grep -q "HARNESS EXIT" "$hlog" 2>/dev/null; do
    sleep 5
    t=$((t + 5))
    [ $t -eq 60 ] && xcrun simctl io "$UDID" screenshot "$OUT/$label-60s.png" > /dev/null 2>&1
  done
  cp "$hlog" "$OUT/$label.log" 2>/dev/null || echo "(pas de trace de l'appli)" > "$OUT/$label.log"
  echo "fin de l'essai après ${t} s"
  xcrun simctl io "$UDID" screenshot "$OUT/$label.png" > /dev/null 2>&1 || true
  xcrun simctl terminate "$UDID" com.teatime.harness > /dev/null 2>&1 || true
  grep -E "MOI :|EMMA :|FIN|DÉLAI|erreur|TERMINATED|media-permission|page http" "$OUT/$label.log" | cut -c1-220
}

RUNS="${RUNS:-nouvelle nouvelle-webspeech ancienne}"
for r in $RUNS; do
  case "$r" in
    nouvelle) run nouvelle http://localhost:4317/ '{}' ;;
    nouvelle-tape) run nouvelle-tape http://localhost:4317/ '{}' tape ;;
    nouvelle-voix) run nouvelle-voix http://localhost:4317/ '{}' voix ;;
    # Site en ligne, réglages d'un apprenant d'avant la mise à jour (reconnaissance du navigateur, rév. 4).
    en-ligne-voix) run en-ligne-voix https://gharel.github.io/teatime/ '{"sttEngine":"webspeech","settingsRev":4,"whisperModel":"onnx-community/whisper-base"}' voix ;;
    en-ligne-tape) run en-ligne-tape https://gharel.github.io/teatime/ '{"sttEngine":"webspeech","settingsRev":4,"whisperModel":"onnx-community/whisper-base"}' tape ;;
    nouvelle-webspeech) run nouvelle-webspeech http://localhost:4317/ '{"sttEngine":"webspeech","settingsRev":5}' ;;
    ancienne) run ancienne http://localhost:4318/ '{}' ;;
  esac
done

kill "$PLAYPID" "$LOGPID" 2>/dev/null || true
step "Terminé"
