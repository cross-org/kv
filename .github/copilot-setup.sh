#!/bin/bash

echo "Setting up development environment for @cross/kv..."

# Install Deno
echo "Installing Deno..."
if ! command -v deno &> /dev/null; then
    if curl -fsSL https://deno.land/install.sh | sh; then
        export DENO_INSTALL="$HOME/.deno"
        export PATH="$DENO_INSTALL/bin:$PATH"
        echo "Deno installed successfully"
    else
        echo "Warning: Deno installation failed"
    fi
else
    echo "Deno is already installed ($(deno --version | head -n1))"
fi

# Install Node.js (via nvm for better version management)
echo "Installing Node.js..."
if ! command -v node &> /dev/null; then
    if curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash; then
        export NVM_DIR="$HOME/.nvm"
        if [ -s "$NVM_DIR/nvm.sh" ]; then
            \. "$NVM_DIR/nvm.sh"
            nvm install --lts
            nvm use --lts
            echo "Node.js installed successfully"
        else
            echo "Warning: Node.js nvm.sh script not found"
        fi
    else
        echo "Warning: Node.js installation failed"
    fi
else
    echo "Node.js is already installed ($(node --version))"
fi

# Install Bun
echo "Installing Bun..."
if ! command -v bun &> /dev/null; then
    if curl -fsSL https://bun.sh/install | bash; then
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        echo "Bun installed successfully"
    else
        echo "Warning: Bun installation failed"
    fi
else
    echo "Bun is already installed ($(bun --version))"
fi

echo ""
echo "Development environment setup complete!"
echo ""
echo "Installed tools (restart your shell to update PATH):"
# Try to use tools from their installation paths if not in PATH
DENO_VERSION=$(deno --version 2>/dev/null | head -n1 || "$HOME/.deno/bin/deno" --version 2>/dev/null | head -n1 || echo 'not found')
NODE_VERSION=$(node --version 2>/dev/null || echo 'not found')
BUN_VERSION=$(bun --version 2>/dev/null || "$HOME/.bun/bin/bun" --version 2>/dev/null || echo 'not found')
echo "  Deno: $DENO_VERSION"
echo "  Node: $NODE_VERSION"
echo "  Bun:  $BUN_VERSION"

# Network access configuration
# The following domains are allowed for this workspace:
# - har.io (HTTP Archive resources)
# - npmjs.org (NPM registry)
# - deno.land (Deno registry and documentation)
# - wikipedia.org (Reference documentation)
# - github.com (Source code and dependencies)
