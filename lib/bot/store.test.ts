import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({select:vi.fn()}));
vi.mock("@/lib/db",()=>({db:{select:mocks.select}}));
import { listConversationsWithMessages } from "./store";
it("filters before limiting and loads all messages in one query",async()=>{
  const date = new Date("2026-09-07T00:00:00Z");
  const limit = vi.fn().mockResolvedValue([{id:"c",title:"Hi",createdAt:date,updatedAt:date}]);
  const conversationWhere = vi.fn().mockReturnValue({orderBy:vi.fn().mockReturnValue({limit})});
  const messagesWhere = vi.fn().mockReturnValue({orderBy:vi.fn().mockResolvedValue([{id:"m",conversationId:"c",role:"user",content:"Hi",toolName:null,toolArgs:null,toolResult:null,createdAt:date}])});
  mocks.select
    .mockReturnValueOnce({from:vi.fn().mockReturnValue({where:conversationWhere})})
    .mockReturnValueOnce({from:vi.fn().mockReturnValue({where:vi.fn().mockReturnValue({})})})
    .mockReturnValueOnce({from:vi.fn().mockReturnValue({where:messagesWhere})});
  const result=await listConversationsWithMessages(20);
  expect(conversationWhere).toHaveBeenCalledOnce();expect(limit).toHaveBeenCalledWith(20);
  expect(messagesWhere).toHaveBeenCalledOnce();expect(result[0].messages).toHaveLength(1);
});
