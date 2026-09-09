#!/usr/bin/env bash
# Bakes every class from the one shared man sprite, tinting only the uniform ramp.
# Hues chosen to match how the classes actually look in game.
set -e
# man.blo lives on the zone host; fetch it once with
#   scp serverb:/home/freeinfantry/zones/Blobs/man.blo .
BLO="${1:?usage: bake-all-classes.sh <man.blo> [outDir] [rowStep]}"
OUT="${2:-public/sprites}"
ROWSTEP="${3:-4}"

# name              tint (hue,sat[,valueScale])   target
bake() {
  node scripts/bake-infantry-atlas.mjs --blo "$BLO" --entry gfx00000 \
    --name "$1" --out "$OUT" --rowStep "$ROWSTEP" --tint "$2" 2>&1 |
    grep -E "^atlas|^wrote" | sed "s/^/  [$1] /"
}

echo "infantry        red"
bake infantry        "0,0.62"
echo "heavy-weapons   turquoise-blue"
bake heavy-weapons   "190,0.55"
echo "squad-leader    green"
bake squad-leader    "120,0.55"
echo "field-medic     yellow"
bake field-medic     "50,0.70"
echo "combat-engineer brown"
bake combat-engineer "25,0.55,0.72"
echo "infiltrator     purple-pink"
bake infiltrator     "300,0.50"
echo "jump-trooper    grey"
bake jump-trooper    "0,0.0"
