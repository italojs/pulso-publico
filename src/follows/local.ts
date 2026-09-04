import { z } from "zod";

export const LOCAL_FOLLOWS_KEY = "pulso:follows:v1";
export const LOCAL_FOLLOWS_CHANGED_EVENT = "pulso:follows-changed";

const localFollow = z.object({
  kind: z.enum(["bill", "lawmaker"]),
  source: z.enum(["camara", "senado"]),
  externalId: z.string().min(1).max(200),
  label: z.string().min(1).max(240),
  href: z.string().startsWith("/").max(500),
  subtitle: z.string().max(240).optional(),
});

export type LocalFollow = z.infer<typeof localFollow>;

export function localFollowKey(item: Pick<LocalFollow, "kind" | "source" | "externalId">) {
  return `${item.kind}:${item.source}:${item.externalId}`;
}

export function parseLocalFollows(value: string | null): LocalFollow[] {
  if (!value) return [];
  try {
    const decoded = JSON.parse(value) as unknown;
    if (!Array.isArray(decoded)) return [];
    const valid = decoded.flatMap((item) => {
      const parsed = localFollow.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    return [...new Map(valid.map((item) => [localFollowKey(item), item])).values()].slice(0, 200);
  } catch {
    return [];
  }
}

export function parseLocalBillReferences(value: string | null) {
  return parseLocalFollows(value)
    .filter((item) => item.kind === "bill")
    .map(({ source, externalId }) => ({ source, externalId }));
}

export function toggleLocalFollow(current: LocalFollow[], item: LocalFollow, followed: boolean) {
  const key = localFollowKey(item);
  const without = current.filter((candidate) => localFollowKey(candidate) !== key);
  return followed ? [...without, item] : without;
}
