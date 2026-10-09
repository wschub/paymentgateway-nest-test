#!/usr/bin/env bash
# Sandbox spike: validates the card payment flow against the payment provider sandbox
# before writing the adapter. Reads the local .env; never prints keys or tokens.
#
# Usage:  ./sandbox-spike.sh [path/to/.env] [approved|declined]
# Needs in the .env: pub_stagtest, prv_stagtest, stagtest_integrity, UAT_SANDBOX_URL
set -euo pipefail

ENV_FILE="${1:-.env}"
CASE="${2:-approved}"

if [ ! -f "$ENV_FILE" ]; then echo "No .env at $ENV_FILE"; exit 1; fi
set -a; . "$ENV_FILE"; set +a

for v in pub_stagtest prv_stagtest stagtest_integrity UAT_SANDBOX_URL; do
  if [ -z "${!v:-}" ]; then echo "Missing variable: $v"; exit 1; fi
done

BASE="${UAT_SANDBOX_URL%/}"
case "$CASE" in
  approved) CARD="4242424242424242" ;;
  declined) CARD="4111111111111111" ;;
  *) echo "Case must be approved or declined"; exit 1 ;;
esac

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null || true; }

echo "1) Merchant info and acceptance tokens"
MERCHANT=$(curl -s -w "\n%{http_code}" "$BASE/merchants/$pub_stagtest")
CODE=$(echo "$MERCHANT" | tail -n1); BODY=$(echo "$MERCHANT" | sed '$d')
echo "   HTTP $CODE"
ACCEPT=$(echo "$BODY" | json "d['data']['presigned_acceptance']['acceptance_token']")
PERSONAL=$(echo "$BODY" | json "d['data']['presigned_personal_data_auth']['acceptance_token']")
if [ -z "$ACCEPT" ] || [ -z "$PERSONAL" ]; then echo "   Could not read both acceptance tokens"; echo "$BODY" | head -c 400; exit 1; fi
echo "   Both acceptance tokens received"

echo "2) Card tokenization (public key)"
TOK=$(curl -s -w "\n%{http_code}" -X POST "$BASE/tokens/cards" \
  -H "Authorization: Bearer $pub_stagtest" -H "Content-Type: application/json" \
  -d "{\"number\":\"$CARD\",\"cvc\":\"123\",\"exp_month\":\"12\",\"exp_year\":\"30\",\"card_holder\":\"Test Buyer\"}")
CODE=$(echo "$TOK" | tail -n1); BODY=$(echo "$TOK" | sed '$d')
echo "   HTTP $CODE"
TOKEN=$(echo "$BODY" | json "d['data']['id']")
BRAND=$(echo "$BODY" | json "d['data']['brand']")
if [ -z "$TOKEN" ]; then echo "   No token in the response"; echo "$BODY" | head -c 400; exit 1; fi
echo "   Token received, brand: $BRAND"

echo "3) Create the transaction (private key, server side)"
REF="SPIKE-$(date +%s)-$RANDOM"
AMOUNT=3000000   # 30,000 COP expressed in cents
CURRENCY="COP"
SIGNATURE=$(printf "%s%s%s%s" "$REF" "$AMOUNT" "$CURRENCY" "$stagtest_integrity" | shasum -a 256 | cut -d' ' -f1)
TX=$(curl -s -w "\n%{http_code}" -X POST "$BASE/transactions" \
  -H "Authorization: Bearer $prv_stagtest" -H "Content-Type: application/json" \
  -d "{\"acceptance_token\":\"$ACCEPT\",\"accept_personal_auth\":\"$PERSONAL\",\"amount_in_cents\":$AMOUNT,\"currency\":\"$CURRENCY\",\"signature\":\"$SIGNATURE\",\"customer_email\":\"buyer@example.com\",\"reference\":\"$REF\",\"payment_method\":{\"type\":\"CARD\",\"token\":\"$TOKEN\",\"installments\":1}}")
CODE=$(echo "$TX" | tail -n1); BODY=$(echo "$TX" | sed '$d')
echo "   HTTP $CODE"
TXID=$(echo "$BODY" | json "d['data']['id']")
if [ -z "$TXID" ]; then
  echo "   No transaction id. If this was 401 or 403, retry the call with the public key to see which one the sandbox expects."
  echo "$BODY" | head -c 600; exit 1
fi
echo "   Transaction $TXID created with status $(echo "$BODY" | json "d['data']['status']")"

echo "4) Poll the final status (up to about 40 seconds)"
for i in $(seq 1 20); do
  R=$(curl -s "$BASE/transactions/$TXID")
  STATUS=$(echo "$R" | json "d['data']['status']")
  echo "   try $i: ${STATUS:-unknown}"
  if [ -n "$STATUS" ] && [ "$STATUS" != "PENDING" ]; then
    echo "   Final status: $STATUS"
    echo "   Message: $(echo "$R" | json "d['data'].get('status_message')")"
    echo "   Brand / last four / installments: $(echo "$R" | json "(d['data']['payment_method'].get('extra') or {}).get('brand'), (d['data']['payment_method'].get('extra') or {}).get('last_four'), d['data']['payment_method'].get('installments')")"
    exit 0
  fi
  sleep 2
done
echo "   Still PENDING after the polling window"
exit 2
