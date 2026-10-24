#!/bin/bash
# Render the app in the font an Android phone uses, whatever this machine has.
#
# The app asks for the system font by its Apple and Windows names, then Roboto.
# A phone answers with its own: San Francisco on an iPhone, Roboto on Android.
# A test machine answers with whatever its fontconfig maps those names to, and
# one container image maps them all to Inter, which is 7-11% wider than either:
# the width suites then failed by a few pixels on tables that fit every phone.
# This pins Roboto for those names, for this user only, so every layout suite
# measures what a phone shows. Idempotent; touches nothing outside $HOME.
set -e
cd "$(dirname "$(readlink -f "$0")")/.."
SRC=node_modules/roboto-fontface/fonts/roboto
DEST="$HOME/.local/share/fonts/go-roboto"
CONF="$HOME/.config/fontconfig/conf.d/60-go-phone.conf"
if [ ! -d "$SRC" ]; then echo "  roboto-fontface is not installed (npm install)"; exit 1; fi
mkdir -p "$DEST" "$(dirname "$CONF")"
node lib/woff2ttf.js "$SRC" "$DEST" >/dev/null
{
  echo '<?xml version="1.0"?>'
  echo '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">'
  echo '<!-- Written by tests/lib/phonefont.sh: the app rendered as on an Android phone. -->'
  echo '<fontconfig>'
  for n in "-apple-system" "BlinkMacSystemFont" "SF Pro Text" "SF Pro" "Segoe UI" "system-ui"; do
    echo "  <match target=\"pattern\"><test name=\"family\"><string>$n</string></test><edit name=\"family\" mode=\"assign\" binding=\"strong\"><string>Roboto</string></edit></match>"
  done
  echo '</fontconfig>'
} > "$CONF"
fc-cache -f >/dev/null 2>&1 || true
echo "  system font names now render in $(fc-match -f '%{family[0]}' 'SF Pro Text' 2>/dev/null || echo '?')"
