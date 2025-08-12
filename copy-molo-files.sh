#!/bin/bash

# Simple wrapper for copying Molo's uploaded files to the test zone
# Usage: ./copy-molo-files.sh <filename>

FILENAME="$1"

if [ -z "$FILENAME" ]; then
    echo "Usage: $0 <filename>"
    echo ""
    echo "Available files in /home/molo/upload:"
    ls -la /home/molo/upload/ 2>/dev/null || echo "Directory not accessible or empty"
    exit 1
fi

# Call the main script with tzmolo zone
/root/Infantry/scripts/safe-zone-file-copy.sh "$FILENAME" tzmolo







