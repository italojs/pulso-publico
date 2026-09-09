const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: NO_STORE_HEADERS },
  );
}
