#!/bin/sh
set -eu

: "${API_BASE_URL:?API_BASE_URL must be set to the public backend URL}"
api_base=$API_BASE_URL
port=${PORT:-8080}
case "$api_base" in
  *[!a-zA-Z0-9:/._-]*)
    echo "API_BASE_URL contains unsupported characters." >&2
    exit 1
    ;;
esac
case "$port" in
  *[!0-9]*|'')
    echo "PORT must be a numeric TCP port." >&2
    exit 1
    ;;
esac

printf 'window.__APP_CONFIG__ = { API_BASE: "%s" };\n' "$api_base" > /usr/share/nginx/html/config.js
sed -i "s/listen 8080;/listen ${port};/" /etc/nginx/conf.d/default.conf
