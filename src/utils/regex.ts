/** Escapes user input so it can be placed inside a RegExp without changing its meaning. */
export const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
