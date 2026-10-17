type Vars = Record<string, string | string[]>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Render a command template into command text; array variables are space-joined. */
export function renderCmdText(template: string, vars: Vars = {}): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`Missing template variable: ${name}`);
    return Array.isArray(value) ? value.join(" ") : value;
  });
}
