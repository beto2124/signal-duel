import { handle } from "@/lib/matches";
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return handle(request, "read", (await context.params).code);
}
