import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repoRoot = process.cwd();
const targets = [path.join(repoRoot, "apps/web/app"), path.join(repoRoot, "apps/web/components")];

const allowedAttributeNames = new Set([
  "className",
  "href",
  "src",
  "id",
  "type",
  "role",
  "target",
  "rel",
]);
const checkedAttributeNames = new Set(["placeholder", "title", "aria-label", "alt"]);
const allowedJsxTextLiterals = new Set([
  "+",
  "-",
  "/",
  "→",
  "B",
  "I",
  "S",
  "H1",
  "H2",
  "H3",
  "1.",
  '"',
  "</>",
]);
const localeLiteralPattern = /[A-Za-z\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    if (/\.test\./.test(entry.name) || /\.spec\./.test(entry.name)) {
      continue;
    }
    results.push(fullPath);
  }

  return results;
}

function getLineAndColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function reportIssue(issues, sourceFile, node, message, value) {
  const { line, column } = getLineAndColumn(sourceFile, node);
  issues.push({
    file: path.relative(repoRoot, sourceFile.fileName).replaceAll("\\", "/"),
    line,
    column,
    message,
    value,
  });
}

function normalizeJsxText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function isInsideTranslateCall(node) {
  let current = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      if (["t", "translate"].includes(current.expression.text)) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function shouldCheckLiteral(text) {
  return Boolean(text) && localeLiteralPattern.test(text);
}

function visit(sourceFile, node, issues) {
  if (ts.isJsxText(node)) {
    const text = normalizeJsxText(node.getText(sourceFile));
    if (text && !allowedJsxTextLiterals.has(text) && shouldCheckLiteral(text)) {
      reportIssue(issues, sourceFile, node, "Hardcoded JSX text", text);
    }
  }

  if (ts.isJsxAttribute(node) && node.initializer) {
    const attributeName = node.name.text;
    if (allowedAttributeNames.has(attributeName)) {
      return ts.forEachChild(node, (child) => visit(sourceFile, child, issues));
    }
    if (checkedAttributeNames.has(attributeName) && ts.isStringLiteral(node.initializer)) {
      const text = node.initializer.text.trim();
      if (shouldCheckLiteral(text)) {
        reportIssue(issues, sourceFile, node, `Hardcoded ${attributeName} attribute`, text);
      }
    }
  }

  if (
    ts.isStringLiteral(node) &&
    shouldCheckLiteral(node.text.trim()) &&
    !isInsideTranslateCall(node) &&
    ts.isJsxExpression(node.parent)
  ) {
    reportIssue(issues, sourceFile, node, "Hardcoded JSX expression string", node.text.trim());
  }

  ts.forEachChild(node, (child) => visit(sourceFile, child, issues));
}

const issues = [];

for (const dir of targets) {
  for (const file of collectFiles(dir)) {
    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    visit(sourceFile, sourceFile, issues);
  }
}

if (issues.length > 0) {
  console.error("Found hardcoded UI literals outside the i18n dictionary:\n");
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line}:${issue.column} ${issue.message} -> ${issue.value}`);
  }
  process.exit(1);
}

console.log("No hardcoded UI literals found in apps/web/app or apps/web/components.");
