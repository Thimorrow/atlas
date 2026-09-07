import { expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({model:vi.fn(),subject:vi.fn()}));
vi.mock("@/lib/subject-store",()=>({getSubject:mocks.subject,listNotes:async()=>[{title:"Test",content:"Material"}]}));
vi.mock("@/lib/lesson-notes",()=>({listSubjectLessonNotes:async()=>[]}));
vi.mock("@/lib/subject-file-store",()=>({listFiles:async()=>[]}));
vi.mock("@/lib/bot/files",()=>({readSubjectFile:vi.fn()}));
vi.mock("@/lib/bot/model",()=>({botEnabled:()=>true,streamChatWithFallback:mocks.model}));
vi.mock("@/lib/study-store",()=>({getCard:vi.fn(),getTopic:vi.fn()}));
import { generateCards } from "./lernen-generieren";
it("passes cancellation to the generator and does not return cards after cancellation",async()=>{
  const controller=new AbortController();
  mocks.subject.mockResolvedValue({id:"s",name:"Mathe",untisSubject:null,lernart:"aufgaben"});
  mocks.model.mockImplementation(async function*(_messages,_tools,signal:AbortSignal){
    controller.abort();
    expect(signal.aborted).toBe(true);
    yield {type:"text",delta:'[{"frage":"Test?","antwort":"Ja"}]'};
  });
  await expect(generateCards({subjectId:"s",quelle:"notizen"},controller.signal)).rejects.toThrow();
  expect(mocks.model).toHaveBeenCalledOnce();
});
