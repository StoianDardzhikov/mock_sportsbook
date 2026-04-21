#!/usr/bin/env bash
# Quick TCP feed test — connects, handshakes, and streams messages with color output.
# Usage: ./test-feed.sh [host] [port]
#   Defaults: localhost 7887

HOST="${1:-localhost}"
PORT="${2:-7887}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

if ! command -v nc &>/dev/null; then
  echo -e "${RED}Error: nc (netcat) is required but not found.${RESET}"
  exit 1
fi

echo -e "${CYAN}Connecting to ${HOST}:${PORT}...${RESET}"

# Send handshake then read the stream, coloring output by method
{
  echo '{"app_key":"test","partner_id":1,"service_id":1}'
  # keep stdin open so nc doesn't close
  sleep 300
} | nc "$HOST" "$PORT" | while IFS= read -r line; do
  method=$(echo "$line" | grep -oP '"method"\s*:\s*"\K[^"]+' 2>/dev/null)

  case "$method" in
    connect.success)  color="$GREEN"  ;;
    ping)             color="$YELLOW" ;;
    event.*)          color="$CYAN"   ;;
    market.*)         color="$RED"    ;;
    outcome.*)        color="$GREEN"  ;;
    *)                color="$RESET"  ;;
  esac

  timestamp=$(date +%H:%M:%S)
  printf "${YELLOW}[%s]${RESET} ${color}%-22s${RESET} %s\n" "$timestamp" "$method" "$line"
done

echo -e "${RED}Connection closed.${RESET}"
