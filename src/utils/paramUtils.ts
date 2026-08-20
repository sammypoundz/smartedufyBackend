export const getStringParam = (param: string | string[] | undefined): string | null => {
  if (!param || Array.isArray(param)) return null;
  return param;
};