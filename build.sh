#!/bin/bash
# This script runs during Vercel build to inject environment variables

cat > config.js << EOF
const SUPABASE_CONFIG = {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}'
};
EOF

echo "✅ config.js generated with environment variables"

