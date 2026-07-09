import { requireSession } from "@/lib/auth/guards";
import { Chat } from "@/components/chat/chat";

export const metadata = { title: "New chat · Aria" };

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  await requireSession();
  return (
    <div className="h-[calc(100vh-0px)] md:h-screen">
      <Chat projectId={searchParams.project ?? null} />
    </div>
  );
}
