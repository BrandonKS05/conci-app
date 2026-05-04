import "server-only";

export function getDbErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function throwPostgrest(err: unknown, fallback: string): never {
  throw new Error(getDbErrorMessage(err, fallback));
}
