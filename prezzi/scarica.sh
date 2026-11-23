#!/usr/bin/env bash
# Legge i prezzi di oggi per ogni strumento di elenco.tsv e li aggiunge a giornalieri.csv (senza duplicati).
D="$(cd "$(dirname "$0")" && pwd)"; CSV="$D/giornalieri.csv"; UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
OGGI="$(TZ=Europe/Rome date +%F)"
[ -f "$CSV" ] || echo "data_lettura;data_fonte;codice;prezzo;fonte" > "$CSV"
CONF=""; ok=0; ko=0; MANCANTI="${MANCANTI:-/dev/null}"; : > "$MANCANTI"
leggi(){ # fonte parametro → "data;prezzo" o vuoto
  case "$1" in
    yahoo) curl -s -m 30 -A "$UA" "https://query1.finance.yahoo.com/v8/finance/chart/$2?range=5d&interval=1d" | perl "$D/parse.pl" yahoo x ;;
    borsaitaliana) curl -s -L -m 30 -A "$UA" "$2" | perl "$D/parse.pl" borsaitaliana x ;;
    confinvest) [ -n "$CONF" ] || CONF="$(curl -s -L -m 30 -A "$UA" https://www.confinvest.it/quotazioni/)"; printf '%s' "$CONF" | perl "$D/parse.pl" confinvest "$2" ;;
  esac; }
while IFS=$'\t' read -r cod fonte par ris; do
  [ "$cod" = "codice" ] && continue
  r="$(leggi "$fonte" "$par")"; usata="$fonte"
  if [ -z "$r" ] && [ -n "$ris" ]; then r="$(leggi borsaitaliana "$ris")"; usata="borsaitaliana"; fi
  if [ -z "$r" ]; then echo "MANCA $cod" >&2; echo "$cod" >> "$MANCANTI"; ko=$((ko+1)); continue; fi
  df="${r%;*}"; pr="${r#*;}"
  grep -q "^[^;]*;$df;$cod;" "$CSV" || echo "$OGGI;$df;$cod;$pr;$usata" >> "$CSV"
  echo "$cod $df $pr ($usata)"; ok=$((ok+1))
done < "$D/elenco.tsv"
echo "letti $ok, mancanti $ko"
