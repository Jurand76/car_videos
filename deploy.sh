#!/bin/bash
set -e

# Production deployment script for Mikrus VPS
# Usage: GITHUB_PAT=<token> bash deploy.sh
# Or store token in /opt/car_videos/.github_pat

REPO_URL="https://github.com/Jurand76/car_videos.git"
REPO_DIR="/opt/car_videos"
BRANCH="serwis"
DOCKER_COMPOSE_FILE="docker-compose.mikrus.yml"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Get GitHub PAT from env or file
get_github_pat() {
    if [ ! -z "$GITHUB_PAT" ]; then
        echo "$GITHUB_PAT"
        return 0
    fi
    
    if [ -f "$REPO_DIR/.github_pat" ]; then
        cat "$REPO_DIR/.github_pat"
        return 0
    fi
    
    log_error "GitHub PAT not found. Set GITHUB_PAT env var or create $REPO_DIR/.github_pat"
    exit 1
}

# Configure git credentials temporarily
configure_git_credentials() {
    local pat=$1
    local cred_file="/tmp/.git-credentials-$$"
    
    echo "https://x-access-token:${pat}@github.com" > "$cred_file"
    chmod 600 "$cred_file"
    
    export GIT_ASKPASS_OVERRIDE=
    git config --global credential.helper "store --file=$cred_file"
    
    echo "$cred_file"
}

cleanup_git_credentials() {
    local cred_file=$1
    [ -f "$cred_file" ] && rm -f "$cred_file"
    git config --global --unset credential.helper || true
}

# Main deployment steps
main() {
    log_info "Starting deployment..."
    
    # Step 1: Get GitHub PAT
    log_info "Reading GitHub PAT..."
    PAT=$(get_github_pat)
    
    # Step 2: Create repo dir if needed
    if [ ! -d "$REPO_DIR" ]; then
        log_info "Creating repository directory: $REPO_DIR"
        mkdir -p "$REPO_DIR"
    fi
    
    # Step 3: Clone or update repository
    CRED_FILE=$(configure_git_credentials "$PAT")
    trap "cleanup_git_credentials $CRED_FILE" EXIT
    
    if [ ! -d "$REPO_DIR/.git" ]; then
        log_info "Cloning repository..."
        git clone "$REPO_URL" "$REPO_DIR"
        cd "$REPO_DIR"
    else
        log_info "Updating repository..."
        cd "$REPO_DIR"
        git fetch origin
    fi
    
    # Step 4: Checkout branch
    log_info "Checking out branch: $BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    
    # Step 5: Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_warn "Repository has uncommitted changes. Stashing..."
        git stash
    fi
    
    # Step 6: Show latest commit
    log_info "Latest commit:"
    git log -1 --oneline
    
    # Step 7: Stop containers
    log_info "Stopping containers..."
    docker compose -f "$DOCKER_COMPOSE_FILE" down || true
    
    # Step 8: Build images
    log_info "Building Docker images (no cache)..."
    docker compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    
    # Step 9: Start containers
    log_info "Starting containers..."
    docker compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    # Step 10: Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Step 11: Verify services
    log_info "Verifying services..."
    docker compose -f "$DOCKER_COMPOSE_FILE" ps
    
    # Step 12: Check API health
    log_info "Checking API health..."
    API_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/v1/service/staff || echo "000")
    if [ "$API_HEALTH" = "200" ] || [ "$API_HEALTH" = "401" ]; then
        log_info "API is responding (HTTP $API_HEALTH)"
    else
        log_warn "API returned HTTP $API_HEALTH (may need more time to start)"
    fi
    
    # Step 13: Show logs summary
    log_info "Recent logs (last 20 lines from each service):"
    docker compose -f "$DOCKER_COMPOSE_FILE" logs --tail=20
    
    log_info "✅ Deployment completed successfully!"
    log_info "Access the application at:"
    echo "  - Hub: https://bob133-20133.wykr.es/hub"
    echo "  - Service: https://bob133-20133.wykr.es/service"
    echo "  - API: https://bob133-30133.wykr.es/api/v1/service"
    
}

# Run main
main "$@"
