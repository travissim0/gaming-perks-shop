#!/bin/bash
# Comprehensive Gaming Perks Shop Deployment Script (Bash)
# Usage: ./deploy.sh "Your commit message"

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if commit message provided
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ Error: Please provide a commit message${NC}"
    echo "Usage: ./deploy.sh \"Your commit message\""
    exit 1
fi

COMMIT_MESSAGE="$1"
SKIP_BUILD=${2:-false}
LOCAL_ONLY=${3:-false}

function write_step() {
    echo -e "${BLUE}🚀 $1${NC}"
}

function write_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

function write_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

function write_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo -e "${BLUE}🎮 Gaming Perks Shop Deployment Script${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Check git status
write_step "Checking git status..."
if git status --porcelain | grep -q .; then
    echo "Modified files:"
    git status --porcelain | sed 's/^/  /'
else
    write_warning "No changes detected. Continuing anyway..."
fi

# Step 2: Add all changes
write_step "Adding all changes to git..."
git add .
write_success "Changes added successfully"

# Step 3: Commit changes
write_step "Committing changes..."
if git commit -m "$COMMIT_MESSAGE"; then
    write_success "Changes committed successfully"
else
    write_warning "Nothing to commit or commit failed"
fi

# Step 4: Push to GitHub
write_step "Pushing to GitHub..."
git push origin main
write_success "Changes pushed to GitHub successfully"

# Step 5: Local build test (optional)
if [ "$SKIP_BUILD" != "true" ]; then
    write_step "Running local build test..."
    if npm run build; then
        write_success "Local build completed successfully"
    else
        write_error "Local build failed - but continuing with deployment"
    fi
fi

# Step 6: Deploy to server (if not local only)
if [ "$LOCAL_ONLY" != "true" ]; then
    write_step "Deploying to production server..."
    echo -e "${YELLOW}📡 Server deployment commands:${NC}"
    
    echo -e "${BLUE}Run these commands on your DigitalOcean server:${NC}"
    echo "  cd /var/www/gaming-perks-shop"
    echo "  git pull origin main"
    echo "  npm install"
    echo "  npm run build"
    echo "  pm2 restart gaming-perks-shop"
    
    write_warning "Please run these commands manually on your server."
fi

echo ""
echo -e "${GREEN}🎉 Deployment process completed!${NC}"
echo -e "${BLUE}Summary:${NC}"
echo "  • Changes committed: '$COMMIT_MESSAGE'"
echo "  • Pushed to GitHub: main branch"
if [ "$SKIP_BUILD" != "true" ]; then
    echo "  • Local build: tested"
fi
if [ "$LOCAL_ONLY" != "true" ]; then
    echo "  • Server deployment: commands displayed"
fi

echo ""
echo -e "${BLUE}🔧 Usage examples:${NC}"
echo -e "  ${YELLOW}./deploy.sh 'Your commit message'${NC}           # Full deployment"
echo -e "  ${YELLOW}./deploy.sh 'Your commit message' true${NC}      # Skip build"
echo -e "  ${YELLOW}./deploy.sh 'Your commit message' false true${NC} # Git only" 