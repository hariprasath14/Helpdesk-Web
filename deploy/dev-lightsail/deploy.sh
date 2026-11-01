#!/usr/bin/env bash
# TEMPORARY dev setup (no AWS budget yet): builds the committed web app for the dev server and
# publishes it there. The planned dev setup (S3 + CloudFront through the pipeline) is unchanged;
# see helpdesk-api/docs/ARCHITECTURE.md. Run from this repo:
#   HELPDESK_DEV_HOST=<static IP> bash deploy/dev-lightsail/deploy.sh
# Rehearsal on this computer (no server): build into a folder instead, for helpdesk-api's rehearse.sh:
#   REHEARSAL_DIR=../helpdesk-api/deploy/dev-lightsail/.rehearsal-web bash deploy/dev-lightsail/deploy.sh
# Each build goes into releases/<commit>; "current" then points at it, so a deploy is all or nothing.
set -euo pipefail
# The dev server's real names (address, DNS zone, SSH key) come from dev.local.env next to
# this script: not committed; copy dev.local.env.example and fill it in.

HERE=$(cd "$(dirname "$0")" && pwd)
if [ -f "$HERE/dev.local.env" ]; then . "$HERE/dev.local.env"; fi
cd "$HERE/../.."

if [ -n "${REHEARSAL_DIR:-}" ]; then
  DOMAIN=helpdesk.localhost
else
  DOMAIN=${HELPDESK_DEV_DOMAIN:?Set HELPDESK_DEV_DOMAIN to the dev address (dev.local.env)}
  if [ -n "$(git status --porcelain)" ]; then
    echo "Commit or stash your changes first: only committed code is deployed." >&2
    exit 1
  fi
fi
VERSION=$(git rev-parse --short=12 HEAD)

echo "== Building helpdesk-web $VERSION for $DOMAIN"
VITE_API_URL= VITE_APP_DOMAIN="$DOMAIN" VITE_DESIGN_PREVIEW=true VITE_BRAND=forest npm run build

if [ -n "${REHEARSAL_DIR:-}" ]; then
  # A plain copy: symbolic links don't survive Windows folders shared with Docker.
  mkdir -p "$REHEARSAL_DIR"
  rm -rf "$REHEARSAL_DIR/current"
  cp -r dist "$REHEARSAL_DIR/current"
  echo "== Built into $REHEARSAL_DIR/current"
  exit 0
fi

HOST=${HELPDESK_DEV_HOST:?Set HELPDESK_DEV_HOST to the dev server address}
KEY=${HELPDESK_DEV_SSH_KEY:?Set HELPDESK_DEV_SSH_KEY to the dev server key file (dev.local.env)}
TARGET="ubuntu@$HOST"
echo "== Uploading to $HOST"
tar -C dist -c . | ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$TARGET" VERSION="$VERSION" bash -c "'
  set -euo pipefail
  cd /srv/helpdesk/web
  rm -rf releases/\$VERSION && mkdir -p releases/\$VERSION
  tar -x -C releases/\$VERSION
  ln -sfn releases/\$VERSION current
  ls -1t releases | tail -n +4 | xargs -r -I{} rm -rf releases/{}
  echo == Live: helpdesk-web \$VERSION
'"
