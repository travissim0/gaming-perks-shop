import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isTournamentIntegration, pathKey } from './typecheck-paths';

// Check the entire application, including pages and edited auth files. Compare
// legacy diagnostics with the actual base branch, never a blanket ignore.
const root = process.cwd();
const canonical = (file: string) => pathKey(path.resolve(file), ts.sys.useCaseSensitiveFileNames);
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { incremental: false });
if (parsed.errors.length)
  throw new Error(
    ts.formatDiagnostics(parsed.errors, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: canonical,
      getNewLine: () => '\n',
    }),
  );
const baselineRef = process.env.DUELING_TYPECHECK_BASE ?? 'origin/main';
const tracked = new Set(
  execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', baselineRef], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((file) => canonical(path.resolve(root, file))),
);
const changed = execFileSync('git', ['diff', baselineRef, '--name-only', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(
    (file) => /\.[cm]?[jt]sx?$/.test(file) && tracked.has(canonical(path.resolve(root, file))),
  );
const originals = new Map(
  changed.map((file) => [
    canonical(path.resolve(root, file)),
    execFileSync('git', ['show', `${baselineRef}:${file}`], { encoding: 'utf8' }),
  ]),
);
const baseHost = ts.createCompilerHost(parsed.options);
const read = baseHost.readFile.bind(baseHost);
baseHost.readFile = (file) => {
  const absolute = canonical(file);
  if (
    (absolute.startsWith(canonical(path.join(root, 'src')) + '/') ||
      absolute.startsWith(canonical(path.join(root, 'tests')) + '/')) &&
    !tracked.has(absolute)
  )
    return undefined;
  return originals.get(absolute) ?? read(file);
};
const baseline = ts.getPreEmitDiagnostics(
  ts.createProgram(
    parsed.fileNames.filter(
      (file) => tracked.has(canonical(file)) || canonical(file).includes('/.next/'),
    ),
    parsed.options,
    baseHost,
  ),
);
const current = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
const key = (diagnostic: ts.Diagnostic) =>
  `${diagnostic.file ? pathKey(path.relative(root, diagnostic.file.fileName), ts.sys.useCaseSensitiveFileNames) : ''}:${diagnostic.code}:${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
const counts = new Map<string, number>();
for (const diagnostic of baseline)
  counts.set(key(diagnostic), (counts.get(key(diagnostic)) ?? 0) + 1);
const unexpected = current.filter((diagnostic) => {
  const signature = key(diagnostic);
  if (isTournamentIntegration(diagnostic.file ? path.relative(root, diagnostic.file.fileName) : ''))
    return true;
  const remaining = counts.get(signature) ?? 0;
  if (remaining > 0) {
    counts.set(signature, remaining - 1);
    return false;
  }
  return true;
});
console.log(
  `Full application typecheck: ${current.length} current diagnostics, ${current.length - unexpected.length} matched against ${baselineRef}, ${unexpected.length} new diagnostics.`,
);
if (unexpected.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(unexpected, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => '\n',
    }),
  );
  process.exitCode = 1;
} else if (baseline.length) {
  console.log(
    'Existing base-branch errors remain. This is a no-new-errors check, not a clean full-project typecheck.',
  );
}
