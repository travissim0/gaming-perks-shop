// TypeScript can return forward slashes even when Node uses Windows separators.
export function pathKey(file: string, caseSensitive: boolean): string {
  const normalized = file.replace(/\\/g, '/');
  return caseSensitive ? normalized : normalized.toLowerCase();
}

export function isTournamentIntegration(file: string): boolean {
  return /dueling-tournament|dueling-tournaments|src\/app\/auth\/|src\/lib\/auth-return|src\/lib\/authcontext|src\/components\/navbar|src\/app\/dueling\/page/.test(
    pathKey(file, false),
  );
}
