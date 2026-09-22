import { handle } from "@/lib/matches";
export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return handle(request, "move", (await context.params).code);
}
