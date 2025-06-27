declare module 'toml' {
  export function parse<T = any>(content: string): T;
  export function stringify(value: any): string;
}
