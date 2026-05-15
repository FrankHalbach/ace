/**
 * Branded-Type-Helfer.
 *
 * Verwendung — Entity-ID als unverwechselbarer Typ trotz gleichem Runtime-Typ
 * (siehe ADR-005 und CLAUDE.md § Code-Stil):
 *
 *   export type MemberId = Brand<number, 'MemberId'>
 *   export type SeasonId = Brand<number, 'SeasonId'>
 *
 *   // Beim Erzeugen aus DB / API:
 *   const id = brand<MemberId>(rawNumber)
 */

declare const brandSymbol: unique symbol

export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B }

export function brand<B extends Brand<unknown, string>>(value: B extends Brand<infer T, string> ? T : never): B {
  return value as B
}
