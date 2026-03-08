declare module "svg-captcha" {
  export function create(options?: { ignoreChars?: string; noise?: number; color?: boolean }): {
    data: string;
    text: string;
  };
}
