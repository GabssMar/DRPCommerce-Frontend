#!/usr/bin/env bash
# =============================================================================
# Publica as tasks de refatoração no GitHub Project, na coluna "Design".
#
#   Pré-requisitos:
#     1. gh CLI instalado        → winget install --id GitHub.cli
#     2. autenticado com escopo de project:
#          gh auth login
#          gh auth refresh -s project,read:project
#
#   Uso:
#     bash create-project-tasks.sh            # cria draft items no project
#     MODE=issue bash create-project-tasks.sh # cria issues no repo e adiciona ao project
#     DRY_RUN=1 bash create-project-tasks.sh  # só mostra o que faria
#     FILES="00-*.md 1[0-8]-*.md" bash create-project-tasks.sh  # publica só algumas tasks
#
#   MODE=issue exige permissão de escrita em $REPO e $BACKEND_REPO.
#   Tasks com título "[API · Back-end]" viram issue em $BACKEND_REPO; as demais em $REPO.
# =============================================================================
set -euo pipefail

OWNER="${OWNER:-joseHenrique346}"
PROJECT_NUMBER="${PROJECT_NUMBER:-1}"
REPO="joseHenrique346/DRPCommerce-Frontend"
BACKEND_REPO="${BACKEND_REPO:-joseHenrique346/DRPCommerce-Backend}"
COLUMN="${COLUMN:-Design}"
FILES="${FILES:-[0-9][0-9]-*.md}"
FIELD_NAME="${FIELD_NAME:-Status}"   # nome do campo que representa as colunas
MODE="${MODE:-draft}"
DRY_RUN="${DRY_RUN:-0}"

cd "$(dirname "$0")"

command -v gh >/dev/null || { echo "ERRO: gh CLI não encontrado. winget install --id GitHub.cli"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERRO: não autenticado. Rode: gh auth login"; exit 1; }

echo "→ Lendo o project $OWNER/$PROJECT_NUMBER…"
PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')

FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
  --jq ".fields[] | select(.name==\"$FIELD_NAME\") | .id")

if [ -z "${FIELD_ID:-}" ]; then
  echo "ERRO: campo \"$FIELD_NAME\" não encontrado. Campos disponíveis:"
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.fields[].name'
  echo "Rode de novo com: FIELD_NAME=\"<nome>\" bash $0"
  exit 1
fi

OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
  --jq ".fields[] | select(.name==\"$FIELD_NAME\") | .options[]? | select(.name==\"$COLUMN\") | .id")

if [ -z "${OPTION_ID:-}" ]; then
  echo "ERRO: coluna \"$COLUMN\" não encontrada no campo \"$FIELD_NAME\". Opções:"
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
    --jq ".fields[] | select(.name==\"$FIELD_NAME\") | .options[]?.name"
  exit 1
fi

echo "  project=$PROJECT_ID  campo=$FIELD_NAME  coluna=$COLUMN"
echo "  modo=$MODE"
echo

for file in $FILES; do
  title=$(head -1 "$file" | sed 's/^# *//')
  body=$(tail -n +2 "$file")

  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $file → \"$title\""
    continue
  fi

  echo "→ $title"

  if [ "$MODE" = "issue" ]; then
    target_repo="$REPO"
    case "$title" in "[API · Back-end]"*) target_repo="$BACKEND_REPO" ;; esac
    url=$(gh issue create --repo "$target_repo"--title "$title" --body "$body")
    item_id=$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" --format json --jq '.id')
    echo "  issue: $url"
  else
    item_id=$(gh project item-create "$PROJECT_NUMBER" --owner "$OWNER" \
      --title "$title" --body "$body" --format json --jq '.id')
    echo "  draft item: $item_id"
  fi

  gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" \
    --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID" >/dev/null
  echo "  → coluna $COLUMN"
done

echo
echo "Pronto. Confira em: https://github.com/users/$OWNER/projects/$PROJECT_NUMBER/views/1"
