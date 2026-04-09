export function stripFrontmatter(text: string): string {
  const yamlMatch = text.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/);
  if (yamlMatch) return text.slice(yamlMatch[0].length);

  const tomlMatch = text.match(/^\+\+\+[ \t]*\r?\n[\s\S]*?\r?\n\+\+\+[ \t]*\r?\n/);
  if (tomlMatch) return text.slice(tomlMatch[0].length);

  const jsonMatch = text.match(/^\{\s*\r?\n[\s\S]*?\r?\n\}\s*\r?\n/);
  if (jsonMatch) {
    try {
      const candidate = text.slice(0, jsonMatch[0].length);
      JSON.parse(candidate);
      return text.slice(jsonMatch[0].length);
    } catch {
      // not valid JSON frontmatter
    }
  }

  return text;
}

const DEFAULT_EXTENSIONS = ["md", "mdx"];

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "cpp",
  "h",
  "sh",
  "bash",
  "zsh",
  "yaml",
  "yml",
  "json",
  "toml",
]);

export function isTargetFile(path: string, prefix: string, extensions?: string[]): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return false;

  const allowed = extensions && extensions.length > 0 ? extensions : DEFAULT_EXTENSIONS;
  if (!allowed.includes(ext)) return false;

  if (prefix && !path.startsWith(prefix)) return false;
  return true;
}

export { isTargetFile as isTargetMarkdown };

export function isCodeFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return CODE_EXTENSIONS.has(ext);
}

export function extractCodeText(rawText: string, filePath: string): string {
  const lines = rawText.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;
    return true;
  });
  const header = `File: ${filePath}`;
  return `${header}\n${filtered.join("\n")}`;
}
