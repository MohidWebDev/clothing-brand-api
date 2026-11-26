/** Pakistani mobile numbers: 03XXXXXXXXX, 923XXXXXXXXX or +923XXXXXXXXX. */
const PK_MOBILE = /^(?:\+92|92|0)(3\d{9})$/;

const stripSeparators = (value: string) => value.replace(/[\s-]/g, '');

export const isValidPkPhone = (value: string) => PK_MOBILE.test(stripSeparators(value));

/** Normalises to +923XXXXXXXXX. Call only after isValidPkPhone. */
export function normalizePkPhone(value: string): string {
  const match = PK_MOBILE.exec(stripSeparators(value));
  return match ? `+92${match[1]}` : value;
}
