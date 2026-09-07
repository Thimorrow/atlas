import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), append: vi.fn(), model: vi.fn(), tool: vi.fn(),
}));
vi.mock("@/lib/bot/context",()=>({buildGreeting:async()=>({text:"Hallo",suggestions:[]}),buildSystemPrompt:()=>"sys"}));
vi.mock("@/lib/bot/lagebild",()=>({ladeLagebild:async()=>null}));
vi.mock("@/lib/stunde-kontext",()=>({ladeStundeKontext:async()=>null}));
vi.mock("@/lib/bot/model",()=>({botEnabled:()=>true,streamChatWithFallback:mocks.model}));
vi.mock("@/lib/bot/tools",()=>({botTools:[],runTool:mocks.tool,statusTextFor:()=>"working"}));
vi.mock("@/lib/subject-store",()=>({isUuid:()=>true,isObj:(x:unknown)=>typeof x==="object"&&x!==null}));
vi.mock("@/lib/bot/store",()=>({createConversation:mocks.create,appendMessage:mocks.append,getConversation:async()=>({id:"c"}),listMessages:async()=>[{role:"user",content:"Hi"}],setTitleIfEmpty:async()=>{},touchConversation:async()=>{}}));
import { GET, POST } from "./route";
const call = {id:"t",type:"function",function:{name:"aufgabe_anlegen",arguments:'{"titel":"Test"}'}};
beforeEach(()=>{
  vi.clearAllMocks(); mocks.create.mockResolvedValue({id:"c"});mocks.append.mockResolvedValue({id:"m"});mocks.tool.mockResolvedValue({aufgabe:{id:"a"}});
  mocks.model.mockImplementation(async function*(){yield {type:"text",delta:"Hi"};yield {type:"done"};});
});
const request = (signal?:AbortSignal)=>new Request("http://localhost/api/bot",{method:"POST",body:JSON.stringify({message:"Hi"}),signal});
const events = async (response:Response)=>(await response.text()).trim().split("\n").map(line=>JSON.parse(line));
describe("bot request lifecycle",()=>{
  it("does not create empty conversations on GET",async()=>{
    expect(await (await GET()).json()).toMatchObject({conversationId:null});expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns conversation id before any model output",async()=>{
    expect((await events(await POST(request())))[0]).toEqual({type:"conversation",conversationId:"c"});
  });
  it("reports six tool rounds as incomplete instead of success",async()=>{
    mocks.model.mockImplementation(async function*(){yield {type:"tool_calls",toolCalls:[call]};});
    const result=await events(await POST(request()));
    expect(mocks.tool).toHaveBeenCalledTimes(6);expect(result.at(-1).type).toBe("error");expect(result.some(e=>e.type==="done")).toBe(false);
  });
  it("stops before the next tool when the first tool triggers cancellation",async()=>{
    const controller=new AbortController();
    mocks.model.mockImplementation(async function*(){yield {type:"tool_calls",toolCalls:[call,{...call,id:"second"}]};});
    mocks.tool.mockImplementation(async()=>{controller.abort();return {aufgabe:{id:"a"}};});
    await events(await POST(request(controller.signal)));expect(mocks.tool).toHaveBeenCalledTimes(1);
  });
  it("never executes malformed tool arguments",async()=>{
    mocks.model.mockImplementation(async function*(){yield {type:"tool_calls",toolCalls:[{...call,function:{...call.function,arguments:"{"}}]};});
    const result=await events(await POST(request()));expect(mocks.tool).not.toHaveBeenCalled();expect(result.at(-1).type).toBe("error");
  });
});
