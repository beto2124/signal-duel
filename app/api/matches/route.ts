import { handle } from "@/lib/matches";
export async function POST(request: Request) {
  return handle(request, "create");
}
